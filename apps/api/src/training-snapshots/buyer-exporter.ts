import { Inject, Injectable } from '@nestjs/common';

import { isPlaceholderPseudonymConfig, pseudonymize } from '../clickstream/pseudonym';
import { BuyerProfileRepository } from '../recommendations/buyer-profile.repository';
import { buildBuyerSearchProfile } from '../recommendations/buyer-profile.builder';
import type { BuyerActivity } from '../recommendations/recommendation.types';
import { PROFILE_POLICY, type AffinityValue } from '../recommendations/recommendation.types';
import { BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION } from '../search/search.versions';
import {
  BUYER_PROFILE_SNAPSHOT_SCHEMA_VERSION,
  type BuyerProfileSnapshotRow,
  type SnapshotManifest,
} from './contracts';
import { TRAINING_SNAPSHOT_CONFIG, type TrainingSnapshotConfig } from './config';
import { writeSnapshot, type SnapshotObjectStore } from './snapshot-writer';

function jsonAffinities(value: unknown, limit: number): readonly AffinityValue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as { id?: unknown; weight?: unknown };
    return typeof candidate.id === 'string' && Number.isSafeInteger(candidate.weight) && Number(candidate.weight) > 0
      ? [{ id: candidate.id, weight: Number(candidate.weight) }]
      : [];
  }).slice(0, limit);
}

function jsonProductIds(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, PROFILE_POLICY.maxRecentProductIds)
    : [];
}

function safeMinor(value: bigint | number | null | undefined): number | null {
  if (value === null) return null;
  const candidate = Number(value);
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
}

function profileSemanticValue(profile: {
  profileVersion: number;
  featureSchemaVersion: number;
  eligibilityScore: number;
  eligible: boolean;
  viewCount30d: number;
  favoriteCount90d: number;
  followedShopCount: number;
  orderCount90d: number;
  categoryAffinities: unknown;
  shopAffinities: unknown;
  preferredPriceMinMinor: bigint | number | null | undefined;
  preferredPriceMaxMinor: bigint | number | null | undefined;
  preferredPriceMeanMinor: bigint | number | null | undefined;
  recentProductIds: unknown;
  source?: string;
}) {
  return JSON.stringify({
    profileVersion: profile.profileVersion,
    featureSchemaVersion: profile.featureSchemaVersion,
    eligibilityScore: profile.eligibilityScore,
    eligible: profile.eligible,
    viewCount30d: profile.viewCount30d,
    favoriteCount90d: profile.favoriteCount90d,
    followedShopCount: profile.followedShopCount,
    orderCount90d: profile.orderCount90d,
    categoryAffinities: profile.categoryAffinities,
    shopAffinities: profile.shopAffinities,
    preferredPriceMinMinor: safeMinor(profile.preferredPriceMinMinor),
    preferredPriceMaxMinor: safeMinor(profile.preferredPriceMaxMinor),
    preferredPriceMeanMinor: safeMinor(profile.preferredPriceMeanMinor),
    recentProductIds: profile.recentProductIds,
    source: profile.source,
  });
}

export interface BuyerProfileSnapshotExporterOptions {
  runId: string;
  sourceDate: string;
  since: Date;
  cutoff: Date;
  store: SnapshotObjectStore;
  bootstrap?: boolean;
}

@Injectable()
export class BuyerProfileSnapshotExporter {
  constructor(
    @Inject(BuyerProfileRepository) private readonly repository: BuyerProfileRepository,
    @Inject(TRAINING_SNAPSHOT_CONFIG) private readonly config: TrainingSnapshotConfig,
  ) {}

  async export(options: BuyerProfileSnapshotExporterOptions): Promise<SnapshotManifest> {
    if (isPlaceholderPseudonymConfig(this.config.pseudonymSecret, this.config.pseudonymKeyId)) {
      throw new Error('Buyer profile snapshot requires a non-placeholder pseudonym configuration.');
    }
    // Refresh only buyers whose source activity changed in this window. The
    // repository loads the four sources in four bounded batch queries per
    // user page; inactive buyers remain represented by yesterday's state.
    if (!options.bootstrap && 'listActivityUserIdsPage' in this.repository && 'loadActivitiesForUsers' in this.repository) {
      await this.refreshChangedProfiles(options.since, options.cutoff);
    }
    const snapshotAt = options.cutoff.toISOString();
    return writeSnapshot<BuyerProfileSnapshotRow>({
      store: options.store,
      dataset: 'buyer-profiles',
      rootPrefix: this.config.prefix,
      runId: options.runId,
      snapshotAt,
      cutoff: snapshotAt,
      schemaVersion: BUYER_PROFILE_SNAPSHOT_SCHEMA_VERSION,
      sourceDate: options.sourceDate,
      featureSchemaVersion: BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION,
      profileVersion: 1,
      pseudonymKeyId: this.config.pseudonymKeyId!,
      maxRowsPerPart: this.config.maxRowsPerPart,
      maxPartBytes: this.config.maxPartBytes,
      rows: this.rows(options.since, options.cutoff, options.sourceDate, options.runId, options.bootstrap ?? false),
      rowMapper: (row) => row,
    });
  }

  private async refreshChangedProfiles(since: Date, cutoff: Date): Promise<void> {
    let afterUserId: string | null = null;
    for (;;) {
      const userIds = await this.repository.listActivityUserIdsPage(since, cutoff, afterUserId, this.config.profilePageSize);
      if (userIds.length === 0) return;
      const activities = await this.repository.loadActivitiesForUsers(userIds, cutoff);
      const existingProfiles = new Map(
        (await ('findProfilesByUserIds' in this.repository
          ? this.repository.findProfilesByUserIds(userIds)
          : Promise.resolve([]))).map((profile) => [profile.userId, profile]),
      );
      for (const userId of userIds) {
        const profile = buildBuyerSearchProfile({
          userId,
          generatedAt: cutoff,
          activities: (activities.get(userId) ?? []) as readonly BuyerActivity[],
          featureSchemaVersion: BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION,
          source: 'offline-activity-builder',
        });
        const existing = existingProfiles.get(userId);
        if (existing && profileSemanticValue(profile) === profileSemanticValue(existing)) continue;
        await this.repository.upsertProfile(profile);
      }
      afterUserId = userIds[userIds.length - 1] ?? afterUserId;
      if (userIds.length < this.config.profilePageSize) return;
    }
  }

  private async *rows(
    since: Date,
    cutoff: Date,
    sourceDate: string,
    runId: string,
    bootstrap: boolean,
  ): AsyncIterable<BuyerProfileSnapshotRow> {
    const secret = this.config.pseudonymSecret!;
    const keyId = this.config.pseudonymKeyId!;
    let afterId: string | null = null;
    for (;;) {
      const profiles: Awaited<ReturnType<BuyerProfileRepository['listProfilesPage']>> = bootstrap
        ? await this.repository.listProfilesPage(afterId, this.config.profilePageSize)
        : await this.repository.listProfilesChangedPage(since, cutoff, afterId, this.config.profilePageSize);
      if (profiles.length === 0) return;
      for (const profile of profiles) {
        const buyerPseudonym = pseudonymize(secret, keyId, 'buyer', profile.userId).pseudonym;
        yield {
          snapshotSchemaVersion: BUYER_PROFILE_SNAPSHOT_SCHEMA_VERSION,
          runId,
          snapshotAt: cutoff.toISOString(),
          sourceDate,
          profileVersion: profile.profileVersion,
          featureSchemaVersion: profile.featureSchemaVersion,
          pseudonymKeyId: keyId,
          buyerPseudonym,
          profileGeneratedAt: profile.generatedAt.toISOString(),
          eligibilityScore: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, profile.eligibilityScore)),
          eligible: profile.eligible,
          viewCount30d: Math.max(0, Math.min(PROFILE_POLICY.maxActivityRowsPerSource, profile.viewCount30d)),
          favoriteCount90d: Math.max(0, Math.min(PROFILE_POLICY.maxActivityRowsPerSource, profile.favoriteCount90d)),
          followedShopCount: Math.max(0, Math.min(PROFILE_POLICY.maxActivityRowsPerSource, profile.followedShopCount)),
          orderCount90d: Math.max(0, Math.min(PROFILE_POLICY.maxActivityRowsPerSource, profile.orderCount90d)),
          categoryAffinities: jsonAffinities(profile.categoryAffinities, PROFILE_POLICY.maxCategoryAffinities),
          shopAffinities: jsonAffinities(profile.shopAffinities, PROFILE_POLICY.maxShopAffinities),
          preferredPriceMinMinor: safeMinor(profile.preferredPriceMinMinor),
          preferredPriceMaxMinor: safeMinor(profile.preferredPriceMaxMinor),
          preferredPriceMeanMinor: safeMinor(profile.preferredPriceMeanMinor),
          recentProductIds: jsonProductIds(profile.recentProductIds),
        };
      }
      afterId = profiles[profiles.length - 1]?.userId ?? afterId;
      if (profiles.length < this.config.profilePageSize) return;
    }
  }
}
