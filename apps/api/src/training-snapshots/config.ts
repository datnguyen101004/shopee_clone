import {
  BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION,
  PRODUCT_SEARCH_PROJECTION_VERSION,
} from '../search/search.versions';

export const TRAINING_SNAPSHOT_CONFIG = Symbol('TRAINING_SNAPSHOT_CONFIG');

export interface TrainingSnapshotConfig {
  environment: 'development';
  region: string;
  processedBucket: string;
  prefix: string;
  productPageSize: number;
  profilePageSize: number;
  maxRowsPerPart: number;
  maxPartBytes: number;
  productProjectionVersion: number;
  featureSchemaVersion: number;
  pseudonymKeyId: string | null;
  pseudonymSecret: string | null;
}

function positiveInt(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`Invalid snapshot configuration: ${name}`);
  }
  return value;
}

export function loadTrainingSnapshotConfig(): TrainingSnapshotConfig {
  const environment = (process.env.SNAPSHOT_ENVIRONMENT ?? 'development') as 'development';
  if (environment !== 'development') throw new Error('Training snapshots are development-only.');
  const processedBucket =
    process.env.SNAPSHOT_PROCESSED_BUCKET?.trim() || process.env.CLICKSTREAM_PROCESSED_BUCKET?.trim() || '';
  if (!processedBucket) {
    throw new Error('Invalid snapshot configuration: CLICKSTREAM_PROCESSED_BUCKET');
  }
  const pseudonymKeyId = process.env.CLICKSTREAM_PSEUDONYM_KEY_ID?.trim() || null;
  const pseudonymSecret = process.env.CLICKSTREAM_PSEUDONYM_SECRET?.trim() || null;
  const productProjectionVersion = positiveInt(
    'SNAPSHOT_PRODUCT_PROJECTION_VERSION',
    PRODUCT_SEARCH_PROJECTION_VERSION,
    10_000,
  );
  const featureSchemaVersion = positiveInt(
    'SNAPSHOT_FEATURE_SCHEMA_VERSION',
    BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION,
    10_000,
  );
  if (productProjectionVersion !== PRODUCT_SEARCH_PROJECTION_VERSION) {
    throw new Error('Snapshot product projection version does not match the compiled projection.');
  }
  if (featureSchemaVersion !== BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION) {
    throw new Error('Snapshot feature schema version does not match the compiled buyer profile.');
  }
  return {
    environment,
    region: process.env.AWS_REGION?.trim() || process.env.CLICKSTREAM_AWS_REGION?.trim() || 'ap-southeast-1',
    processedBucket,
    prefix: process.env.SNAPSHOT_PREFIX?.trim() || 'snapshots',
    productPageSize: positiveInt('SNAPSHOT_PRODUCT_PAGE_SIZE', 250, 10_000),
    profilePageSize: positiveInt('SNAPSHOT_PROFILE_PAGE_SIZE', 250, 10_000),
    maxRowsPerPart: positiveInt('SNAPSHOT_MAX_ROWS_PER_PART', 10_000, 1_000_000),
    maxPartBytes: positiveInt(
      'SNAPSHOT_MAX_PART_BYTES',
      128 * 1024 * 1024,
      1024 * 1024 * 1024,
    ),
    productProjectionVersion,
    featureSchemaVersion,
    pseudonymKeyId,
    pseudonymSecret,
  };
}
