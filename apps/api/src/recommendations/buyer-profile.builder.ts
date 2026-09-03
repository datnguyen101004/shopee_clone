import { BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION } from '../search/search.versions';
import {
  PROFILE_POLICY,
  type AffinityValue,
  type BuyerActivity,
  type BuyerSearchProfileSnapshot,
} from './recommendation.types';

function safePositiveInteger(value: number | undefined): number | null {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function boundedAffinities(
  values: ReadonlyMap<string, number>,
  limit: number,
): readonly AffinityValue[] {
  return [...values.entries()]
    .filter(([id, weight]) => id.length > 0 && Number.isSafeInteger(weight) && weight > 0)
    .sort(
      ([leftId, leftWeight], [rightId, rightWeight]) =>
        rightWeight - leftWeight || leftId.localeCompare(rightId),
    )
    .slice(0, limit)
    .map(([id, weight]) => ({ id, weight }));
}

function uniqueRecentProductIds(activities: readonly BuyerActivity[]): readonly string[] {
  const seen = new Set<string>();
  return [...activities]
    .filter((activity) => activity.productId !== undefined)
    .sort(
      (left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        (left.productId ?? '').localeCompare(right.productId ?? ''),
    )
    .flatMap((activity) => {
      const productId = activity.productId!;
      if (seen.has(productId)) return [];
      seen.add(productId);
      return [productId];
    })
    .slice(0, PROFILE_POLICY.maxRecentProductIds);
}

export function buildBuyerSearchProfile(input: {
  userId: string;
  generatedAt: Date;
  activities: readonly BuyerActivity[];
  profileVersion?: number;
  featureSchemaVersion?: number;
  source?: string;
}): BuyerSearchProfileSnapshot {
  if (!input.userId.trim()) throw new Error('Buyer profile requires an authenticated user id.');

  const categoryAffinities = new Map<string, number>();
  const shopAffinities = new Map<string, number>();
  const prices: number[] = [];
  let viewCount30d = 0;
  let favoriteCount90d = 0;
  let followedShopCount = 0;
  let orderCount90d = 0;
  let eligibilityScore = 0;

  for (const activity of input.activities) {
    const weight =
      activity.type === 'view'
        ? PROFILE_POLICY.viewWeight
        : activity.type === 'favorite'
          ? PROFILE_POLICY.favoriteWeight
          : activity.type === 'follow'
            ? PROFILE_POLICY.followedShopWeight
            : PROFILE_POLICY.orderWeight;
    eligibilityScore += weight;

    if (activity.type === 'view') viewCount30d += 1;
    if (activity.type === 'favorite') favoriteCount90d += 1;
    if (activity.type === 'follow') followedShopCount += 1;
    if (activity.type === 'order') orderCount90d += 1;

    if (activity.categoryId) {
      categoryAffinities.set(
        activity.categoryId,
        (categoryAffinities.get(activity.categoryId) ?? 0) + weight,
      );
    }
    if (activity.shopId) {
      shopAffinities.set(activity.shopId, (shopAffinities.get(activity.shopId) ?? 0) + weight);
    }
    const price = safePositiveInteger(activity.priceMinor);
    if (price !== null) prices.push(price);
  }

  const boundedScore = Math.min(Number.MAX_SAFE_INTEGER, eligibilityScore);
  const preferredPriceMinMinor = prices.length > 0 ? Math.min(...prices) : null;
  const preferredPriceMaxMinor = prices.length > 0 ? Math.max(...prices) : null;
  const preferredPriceMeanMinor =
    prices.length > 0
      ? Math.round(prices.reduce((total, value) => total + value, 0) / prices.length)
      : null;
  const featureSchemaVersion =
    input.featureSchemaVersion ?? BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION;

  return {
    userId: input.userId,
    profileVersion: input.profileVersion ?? 1,
    featureSchemaVersion,
    generatedAt: new Date(input.generatedAt),
    eligibilityScore: boundedScore,
    eligible: boundedScore >= PROFILE_POLICY.minimumEligibilityScore,
    viewCount30d,
    favoriteCount90d,
    followedShopCount,
    orderCount90d,
    categoryAffinities: boundedAffinities(categoryAffinities, PROFILE_POLICY.maxCategoryAffinities),
    shopAffinities: boundedAffinities(shopAffinities, PROFILE_POLICY.maxShopAffinities),
    preferredPriceMinMinor,
    preferredPriceMaxMinor,
    preferredPriceMeanMinor,
    recentProductIds: uniqueRecentProductIds(input.activities),
    source: input.source ?? 'offline-activity-builder',
  };
}
