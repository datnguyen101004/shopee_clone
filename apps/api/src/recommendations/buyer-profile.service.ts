import { Inject, Injectable } from '@nestjs/common';

import { BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION } from '../search/search.versions';
import { buildBuyerSearchProfile } from './buyer-profile.builder';
import { BuyerProfileRepository } from './buyer-profile.repository';
import {
  PROFILE_POLICY,
  type AffinityValue,
  type BuyerSearchProfileSnapshot,
} from './recommendation.types';

function jsonAffinities(value: unknown, limit: number): readonly AffinityValue[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const candidate = entry as { id?: unknown; weight?: unknown };
      return typeof candidate.id === 'string' &&
        Number.isSafeInteger(candidate.weight) &&
        Number(candidate.weight) > 0
        ? [{ id: candidate.id, weight: Number(candidate.weight) }]
        : [];
    })
    .slice(0, limit);
}

function jsonProductIds(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .slice(0, PROFILE_POLICY.maxRecentProductIds)
    : [];
}

function safeMinor(value: bigint | null): number | null {
  if (value === null) return null;
  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

export function isEligibleBuyerProfile(
  profile: BuyerSearchProfileSnapshot,
  userId: string,
  now: Date,
): boolean {
  if (!userId || profile.userId !== userId) return false;
  if (profile.featureSchemaVersion !== BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION) return false;
  if (!profile.eligible || profile.eligibilityScore < PROFILE_POLICY.minimumEligibilityScore) {
    return false;
  }
  const ageMs = now.getTime() - profile.generatedAt.getTime();
  return ageMs >= 0 && ageMs <= PROFILE_POLICY.maximumAgeHours * 3_600_000;
}

@Injectable()
export class BuyerProfileService {
  constructor(
    @Inject(BuyerProfileRepository) private readonly repository: BuyerProfileRepository,
  ) {}

  async buildForBuyer(
    userId: string,
    generatedAt = new Date(),
  ): Promise<BuyerSearchProfileSnapshot> {
    if (!userId.trim())
      throw new Error('Buyer profile generation requires an authenticated buyer.');
    const activities = await this.repository.loadActivities(userId, generatedAt);
    const profile = buildBuyerSearchProfile({
      userId,
      generatedAt,
      activities,
      featureSchemaVersion: BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION,
    });
    await this.repository.upsertProfile(profile);
    return profile;
  }

  async buildForActiveUsers(
    generatedAt = new Date(),
  ): Promise<readonly BuyerSearchProfileSnapshot[]> {
    const userIds = await this.repository.listActiveUserIds();
    const profiles: BuyerSearchProfileSnapshot[] = [];
    for (const userId of userIds) profiles.push(await this.buildForBuyer(userId, generatedAt));
    return profiles;
  }

  async resolveEligibleProfile(
    userId: string | null | undefined,
    now = new Date(),
  ): Promise<BuyerSearchProfileSnapshot | null> {
    if (!userId?.trim()) return null;
    const row = await this.repository.findProfile(userId);
    if (!row) return null;
    const profile: BuyerSearchProfileSnapshot = {
      userId: row.userId,
      profileVersion: row.profileVersion,
      featureSchemaVersion: row.featureSchemaVersion,
      generatedAt: row.generatedAt,
      eligibilityScore: row.eligibilityScore,
      eligible: row.eligible,
      viewCount30d: row.viewCount30d,
      favoriteCount90d: row.favoriteCount90d,
      followedShopCount: row.followedShopCount,
      orderCount90d: row.orderCount90d,
      categoryAffinities: jsonAffinities(
        row.categoryAffinities,
        PROFILE_POLICY.maxCategoryAffinities,
      ),
      shopAffinities: jsonAffinities(row.shopAffinities, PROFILE_POLICY.maxShopAffinities),
      preferredPriceMinMinor: safeMinor(row.preferredPriceMinMinor),
      preferredPriceMaxMinor: safeMinor(row.preferredPriceMaxMinor),
      preferredPriceMeanMinor: safeMinor(row.preferredPriceMeanMinor),
      recentProductIds: jsonProductIds(row.recentProductIds),
      source: row.source,
    };
    return isEligibleBuyerProfile(profile, userId, now) ? profile : null;
  }
}
