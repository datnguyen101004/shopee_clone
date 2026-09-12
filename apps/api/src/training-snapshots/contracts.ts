import { createHash } from 'node:crypto';

export const PRODUCT_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const BUYER_PROFILE_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const SNAPSHOT_FEATURE_SCHEMA_VERSION = 1 as const;
export const SNAPSHOT_PSEUDONYM_KEY_ID_ENV = 'CLICKSTREAM_PSEUDONYM_KEY_ID' as const;

export type SnapshotDataset = 'products' | 'buyer-profiles' | 'buyer-state';

export interface ProductSnapshotRow {
  snapshotSchemaVersion: typeof PRODUCT_SNAPSHOT_SCHEMA_VERSION;
  runId: string;
  snapshotAt: string;
  productProjectionVersion: number;
  featureSchemaVersion: number;
  productId: string;
  categoryId: string;
  shopId: string;
  effectivePriceMinor: number;
  compareAtPriceMinor: number | null;
  discountBasisPoints: number;
  ratingAverageBasisPoints: number;
  ratingCount: number;
  soldCount: number;
  promotionActive: boolean;
  inventoryAvailable: number;
  productCreatedAt: string;
  productUpdatedAt: string;
  searchableText: string;
  nameNormalized: string;
  categoryNameNormalized: string;
  shopNameNormalized: string;
}

export interface BuyerProfileSnapshotRow {
  snapshotSchemaVersion: typeof BUYER_PROFILE_SNAPSHOT_SCHEMA_VERSION;
  runId: string;
  snapshotAt: string;
  sourceDate: string;
  profileGeneratedAt: string;
  profileVersion: number;
  featureSchemaVersion: number;
  pseudonymKeyId: string;
  buyerPseudonym: string;
  eligibilityScore: number;
  eligible: boolean;
  viewCount30d: number;
  favoriteCount90d: number;
  followedShopCount: number;
  orderCount90d: number;
  categoryAffinities: readonly { id: string; weight: number }[];
  shopAffinities: readonly { id: string; weight: number }[];
  preferredPriceMinMinor: number | null;
  preferredPriceMaxMinor: number | null;
  preferredPriceMeanMinor: number | null;
  recentProductIds: readonly string[];
}

export interface SnapshotPartMetadata {
  key: string;
  rowCount: number;
  byteCount: number;
  /** Server-side Spark copies may expose this only through S3 checksum headers. */
  sha256?: string;
}

export interface SnapshotManifest {
  manifestVersion: 1;
  dataset: SnapshotDataset;
  runId: string;
  snapshotAt: string;
  sourceDate: string;
  cutoff: string;
  schemaVersion: number;
  featureSchemaVersion: number;
  productProjectionVersion?: number;
  profileVersion?: number;
  pseudonymKeyId?: string;
  rowCount: number;
  parts: readonly SnapshotPartMetadata[];
  createdAt: string;
}

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const FORBIDDEN =
  /(?:userId|user_id|email|address|postalAddress|accessToken|token|password|credential|payment|cardNumber|secret)/iu;

export function validateRunId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !RUN_ID.test(value)) throw new Error('Invalid snapshot run id.');
}

export function validateUtc(value: unknown, name = 'timestamp'): asserts value is string {
  if (typeof value !== 'string' || !ISO_UTC.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid UTC ${name}.`);
  }
}

export function validateSourceDate(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error('Invalid snapshot source date.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid snapshot source date.');
  }
}

export function assertPrivacySafe(value: unknown): void {
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    for (const [key, nested] of Object.entries(candidate)) {
      if (FORBIDDEN.test(key)) throw new Error(`Snapshot contains forbidden field: ${key}`);
      visit(nested);
    }
  };
  visit(value);
}

export function validateSnapshotManifest(manifest: SnapshotManifest): SnapshotManifest {
  if (!manifest || manifest.manifestVersion !== 1) throw new Error('Unsupported snapshot manifest.');
  if (!['products', 'buyer-profiles', 'buyer-state'].includes(manifest.dataset)) {
    throw new Error('Invalid snapshot dataset.');
  }
  validateRunId(manifest.runId);
  validateUtc(manifest.snapshotAt, 'snapshot time');
  validateSourceDate(manifest.sourceDate);
  validateUtc(manifest.cutoff, 'cutoff');
  if (!Number.isSafeInteger(manifest.rowCount) || manifest.rowCount < 0) {
    throw new Error('Invalid snapshot row count.');
  }
  if (
    !Array.isArray(manifest.parts) ||
    manifest.parts.some(
      (part) =>
        !part ||
        typeof part.key !== 'string' ||
        !Number.isSafeInteger(part.rowCount) ||
        part.rowCount < 0 ||
        !Number.isSafeInteger(part.byteCount) ||
        part.byteCount < 0 ||
        (part.sha256 !== undefined && !/^[0-9a-f]{64}$/iu.test(part.sha256)),
    )
  ) {
    throw new Error('Invalid snapshot part metadata.');
  }
  const sum = manifest.parts.reduce((total, part) => total + part.rowCount, 0);
  if (sum !== manifest.rowCount) throw new Error('Snapshot row count does not match part metadata.');
  if (
    (manifest.dataset === 'buyer-profiles' || manifest.dataset === 'buyer-state') &&
    (!manifest.pseudonymKeyId ||
      /(?:local-disabled|change[-_]?me|replace[-_]?me|example)/iu.test(manifest.pseudonymKeyId))
  ) {
    throw new Error('Buyer snapshot requires a non-placeholder pseudonym key id.');
  }
  assertPrivacySafe(manifest);
  return manifest;
}

export function snapshotDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}
