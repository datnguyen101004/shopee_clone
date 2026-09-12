import {
  BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION,
  PERSONALIZED_RANKING_MODEL_VERSION,
  PERSONALIZED_RANKING_SCRIPT_VERSION,
  PRODUCT_SEARCH_PROJECTION_VERSION,
} from '../search/search.versions';

export const RECOMMENDATION_DATASET_VERSION = 'mock-reco-v1';
export const RECOMMENDATION_RANDOM_SEED = 20260902;
export const CLICKSTREAM_TRAINING_SOURCE = 'clickstream-s3-demonstration';
export const CLICKSTREAM_SNAPSHOT_TRAINING_SOURCE = 'clickstream-s3-feature-snapshots';
export const SEEDED_TRAINING_SOURCE = 'seeded-fixture';

export const PROFILE_POLICY = Object.freeze({
  viewWeight: 1,
  favoriteWeight: 3,
  followedShopWeight: 3,
  orderWeight: 5,
  minimumEligibilityScore: 5,
  maximumAgeHours: 24 * 30,
  viewsLookbackDays: 30,
  favoritesLookbackDays: 90,
  ordersLookbackDays: 90,
  maxActivityRowsPerSource: 500,
  maxCategoryAffinities: 20,
  maxShopAffinities: 20,
  maxRecentProductIds: 50,
});

export const BUYER_PAIR_FEATURE_NAMES = [
  'category_affinity',
  'shop_affinity',
  'view_count_30d',
  'favorite_flag',
  'followed_shop_flag',
  'order_count_90d',
  'preferred_price_distance',
  'price_band_match',
  'rating_average_basis_points',
  'rating_confidence',
  'sold_count_log1p',
  'promotion_active',
  'freshness_score',
  'text_relevance',
  'inventory_available',
  'profile_score',
] as const;

export type BuyerPairFeatureName = (typeof BUYER_PAIR_FEATURE_NAMES)[number];

export type BuyerActivityType = 'view' | 'favorite' | 'follow' | 'order';

export interface BuyerActivity {
  type: BuyerActivityType;
  productId?: string;
  categoryId?: string;
  shopId?: string;
  priceMinor?: number;
  occurredAt: Date;
}

export interface AffinityValue {
  id: string;
  weight: number;
}

export interface BuyerSearchProfileSnapshot {
  userId: string;
  profileVersion: number;
  featureSchemaVersion: number;
  generatedAt: Date;
  eligibilityScore: number;
  eligible: boolean;
  viewCount30d: number;
  favoriteCount90d: number;
  followedShopCount: number;
  orderCount90d: number;
  categoryAffinities: readonly AffinityValue[];
  shopAffinities: readonly AffinityValue[];
  preferredPriceMinMinor: number | null;
  preferredPriceMaxMinor: number | null;
  preferredPriceMeanMinor: number | null;
  recentProductIds: readonly string[];
  source: string;
}

export interface SeededTrainingExample {
  exampleId: string;
  datasetVersion: string;
  randomSeed: number;
  modelVersion: number;
  featureSchemaVersion: number;
  split: 'train' | 'heldout';
  fold: number;
  userId: string;
  productId: string;
  categoryId: string;
  shopId: string;
  impressionAt: Date;
  label: 0 | 1;
  labelSource: string;
  features: Record<BuyerPairFeatureName, number>;
  sampleWeight: number;
  /** Clickstream handoff metadata; seeded fixture rows do not have these fields. */
  sourceDate?: string;
  runDate?: string;
  /** Snapshot-backed rows already contain normalized serving features. */
  featureVectorSource?: 'seeded-fixture' | 'legacy-clickstream' | 'snapshot-backed';
}

export interface OrderedFeatureWeight {
  name: BuyerPairFeatureName;
  weight: number;
}

export interface RankingMetrics {
  auc: number;
  logLoss: number;
  ndcgAt10: number;
  mrr: number;
  trainCount: number;
  heldoutCount: number;
  heldoutPositiveCount: number;
  demonstrationOnly: boolean;
  metricsLabel: 'demonstration-only' | 'production-candidate';
  trainingDatasetUri?: string;
  trainingManifestUri?: string;
  trainingMode?: 'daily' | 'full';
  trainingInputUris?: readonly string[];
  baseModelVersion?: number;
  baseModelTrainingDatasetUri?: string;
}

export interface TrainedRankingModel {
  modelVersion: number;
  productProjectionVersion: number;
  featureSchemaVersion: number;
  storedScriptVersion: number;
  datasetVersion: string;
  randomSeed: number;
  trainingSource: string;
  trainingDatasetUri?: string;
  intercept: number;
  featureWeights: readonly OrderedFeatureWeight[];
  metrics: RankingMetrics;
  trainedAt: Date;
}

export const CURRENT_RECOMMENDATION_VERSIONS = Object.freeze({
  productProjectionVersion: PRODUCT_SEARCH_PROJECTION_VERSION,
  featureSchemaVersion: BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION,
  modelVersion: PERSONALIZED_RANKING_MODEL_VERSION,
  storedScriptVersion: PERSONALIZED_RANKING_SCRIPT_VERSION,
});
