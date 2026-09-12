import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import {
  BUYER_PAIR_FEATURE_NAMES,
  CURRENT_RECOMMENDATION_VERSIONS,
  RECOMMENDATION_DATASET_VERSION,
  RECOMMENDATION_RANDOM_SEED,
  type BuyerPairFeatureName,
  type SeededTrainingExample,
} from './recommendation.types';

export const CLICKSTREAM_TRAINING_HEADERS = Object.freeze([
  'impressionId',
  'occurredAt',
  'sessionPseudonym',
  'buyerPseudonym',
  'shopId',
  'productId',
  'surface',
  'placement',
  'position',
  'requestId',
  'recommendationId',
  'projectionVersion',
  'profileVersion',
  'modelVersion',
  'scriptVersion',
  'labelClicked',
  'sourceDate',
  'runDate',
] as const);

export interface TrainingDatasetS3Location {
  uri: string;
  bucket: string;
  key: string;
  runDate: string;
}

export interface TrainingDatasetManifestS3Location {
  uri: string;
  bucket: string;
  key: 'exports/training/latest.json';
}

export interface TrainingDatasetManifest {
  manifestVersion: 1;
  dataset: 'recommendation-training';
  uris: readonly string[];
}

export const CLICKSTREAM_DATASET_VERSION_PREFIX = 'clickstream-training-v1';
export const CLICKSTREAM_LABEL_SOURCE = 'clickstream-attributed';

export const SNAPSHOT_TRAINING_BASE_HEADERS = Object.freeze([
  'example_id',
  'dataset_version',
  'random_seed',
  'model_version',
  'feature_schema_version',
  'split',
  'fold',
  'user_id',
  'product_id',
  'category_id',
  'shop_id',
  'impression_at',
  'label',
  'label_source',
  ...BUYER_PAIR_FEATURE_NAMES,
  'sample_weight',
] as const);

export const SNAPSHOT_TRAINING_HEADERS = Object.freeze([
  ...SNAPSHOT_TRAINING_BASE_HEADERS,
  'source_date',
  'run_date',
  'product_snapshot_at',
  'buyer_snapshot_at',
  'buyer_profile_generated_at',
  'product_snapshot_run_id',
  'buyer_snapshot_run_id',
  'pseudonym_key_id',
  'offline_lexical_version',
] as const);

function validDateOnly(value: string, name: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`Clickstream training dataset has invalid ${name}: ${value}.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Clickstream training dataset has invalid ${name}: ${value}.`);
  }
  return value;
}

export function parseTrainingDatasetS3Uri(uri: string): TrainingDatasetS3Location {
  const normalized = uri.trim();
  const match = /^s3:\/\/([^/?#]+)\/(.+)$/u.exec(normalized);
  if (!match) {
    throw new Error(
      'Training dataset URI must be an s3://bucket/exports/training/run_date=YYYY-MM-DD/training.csv URI.',
    );
  }

  const bucket = match[1]!;
  let key: string;
  try {
    key = decodeURIComponent(match[2]!);
  } catch {
    throw new Error('Training dataset URI contains an invalid URI escape.');
  }
  const keyMatch = /^exports\/training\/run_date=(\d{4}-\d{2}-\d{2})\/training\.csv$/u.exec(key);
  if (!keyMatch) {
    throw new Error(
      'Training dataset URI must select one exact versioned exports/training/run_date=<date>/training.csv object.',
    );
  }
  const runDate = validDateOnly(keyMatch[1]!, 'runDate');
  return { uri: normalized, bucket, key, runDate };
}

export function parseTrainingDatasetManifestS3Uri(uri: string): TrainingDatasetManifestS3Location {
  const normalized = uri.trim();
  const match = /^s3:\/\/([^/?#]+)\/(exports\/training\/latest\.json)$/u.exec(normalized);
  if (!match) {
    throw new Error(
      'RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI must be s3://bucket/exports/training/latest.json.',
    );
  }
  return { uri: normalized, bucket: match[1]!, key: 'exports/training/latest.json' };
}

export function parseTrainingDatasetManifest(value: unknown): TrainingDatasetManifest {
  if (!value || typeof value !== 'object') throw new Error('Training dataset manifest must be an object.');
  const candidate = value as { manifestVersion?: unknown; dataset?: unknown; uris?: unknown };
  if (candidate.manifestVersion !== 1 || candidate.dataset !== 'recommendation-training' || !Array.isArray(candidate.uris)) {
    throw new Error('Training dataset manifest has an invalid contract.');
  }
  if (candidate.uris.length < 1 || candidate.uris.length > 30) {
    throw new Error('Training dataset manifest must contain between one and thirty daily URIs.');
  }
  const uris = candidate.uris.map((item) => {
    if (typeof item !== 'string') throw new Error('Training dataset manifest contains a non-string URI.');
    return parseTrainingDatasetS3Uri(item).uri;
  });
  if (new Set(uris).size !== uris.length) throw new Error('Training dataset manifest contains duplicate URIs.');
  return { manifestVersion: 1, dataset: 'recommendation-training', uris };
}

export async function readTrainingDatasetManifestFromS3(
  uri: string,
  client: S3Client = new S3Client({}),
): Promise<TrainingDatasetManifest> {
  const location = parseTrainingDatasetManifestS3Uri(uri);
  const response = await client.send(new GetObjectCommand({ Bucket: location.bucket, Key: location.key }));
  const body = await bodyToUtf8(response.Body);
  return parseTrainingDatasetManifest(JSON.parse(body) as unknown);
}

const seededDatasetCandidates = [
  path.resolve(
    process.env.INIT_CWD ?? process.cwd(),
    'data/recommendations/mock/mock_training_examples.csv',
  ),
  path.resolve(process.cwd(), '../../data/recommendations/mock/mock_training_examples.csv'),
];
export const DEFAULT_SEEDED_DATASET_PATH =
  seededDatasetCandidates.find((candidate) => existsSync(candidate)) ?? seededDatasetCandidates[0]!;

export function parseCsv(text: string): readonly string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error('Recommendation training CSV contains an unterminated quoted field.');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.length > 0));
}

function exactHeader(headers: readonly string[], expected: readonly string[], name: string): void {
  const normalized = headers.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/u, '') : header,
  );
  if (
    normalized.length !== expected.length ||
    normalized.some((header, index) => header !== expected[index])
  ) {
    throw new Error(
      `${name} CSV header must be exactly: ${expected.join(',')}.`,
    );
  }
}

function strictHeader(headers: readonly string[]): void {
  exactHeader(headers, CLICKSTREAM_TRAINING_HEADERS, 'Clickstream training');
}

function cell(row: readonly string[], headers: readonly string[], name: string): string {
  const index = headers.indexOf(name);
  if (index < 0) throw new Error(`Clickstream training CSV is missing ${name}.`);
  return row[index]?.trim() ?? '';
}

function requiredCell(row: readonly string[], headers: readonly string[], name: string): string {
  const value = cell(row, headers, name);
  if (!value) throw new Error(`Clickstream training CSV has an empty ${name}.`);
  return value;
}

function binaryCell(row: readonly string[], headers: readonly string[], name: string): 0 | 1 {
  const value = requiredCell(row, headers, name);
  if (value !== '0' && value !== '1') {
    throw new Error(`Clickstream training CSV ${name} must be 0 or 1.`);
  }
  return value === '1' ? 1 : 0;
}

function clickstreamDatasetVersion(runDate: string): string {
  return `${CLICKSTREAM_DATASET_VERSION_PREFIX}-${runDate}`;
}

function deterministicHash(value: string, seed: number): number {
  let state = seed >>> 0;
  for (const character of value) {
    state = Math.imul(state ^ character.charCodeAt(0), 16_777_619) >>> 0;
  }
  return state >>> 0;
}

export function deterministicFold(value: string, seed = RECOMMENDATION_RANDOM_SEED): number {
  return deterministicHash(value, seed) % 5;
}

function assignClickstreamSplits(
  examples: readonly SeededTrainingExample[],
  seed: number,
): readonly SeededTrainingExample[] {
  const partition = deterministicPartition(examples, seed);
  const heldoutIds = new Set(partition.heldout.map((example) => example.exampleId));
  return examples
    .map((example) => ({
      ...example,
      split: heldoutIds.has(example.exampleId) ? ('heldout' as const) : ('train' as const),
    }))
    .sort((left, right) => left.exampleId.localeCompare(right.exampleId));
}

/**
 * Parse the exact Glue handoff contract. Clickstream has no compatible online
 * buyer/product features yet, so every serving feature is intentionally zero.
 */
export function parseClickstreamTrainingExamples(
  text: string,
  location: Pick<TrainingDatasetS3Location, 'runDate'> | string,
): readonly SeededTrainingExample[] {
  const expectedRunDate = typeof location === 'string' ? location : location.runDate;
  validDateOnly(expectedRunDate, 'runDate');
  const rows = parseCsv(text);
  const rawHeaders = rows[0];
  if (!rawHeaders) throw new Error('Clickstream training CSV is empty.');
  strictHeader(rawHeaders);
  const headers = rawHeaders.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/u, '') : header,
  );
  if (rows.length < 3) {
    throw new Error('Clickstream training CSV must contain at least two examples.');
  }

  const examples: SeededTrainingExample[] = [];
  const impressionIds = new Set<string>();
  for (const [rowIndex, row] of rows.slice(1).entries()) {
    if (row.length !== CLICKSTREAM_TRAINING_HEADERS.length) {
      throw new Error(
        `Clickstream training CSV row ${rowIndex + 2} has ${row.length} columns; expected ${CLICKSTREAM_TRAINING_HEADERS.length}.`,
      );
    }
    const impressionId = requiredCell(row, headers, 'impressionId');
    if (impressionIds.has(impressionId)) {
      throw new Error(`Clickstream training CSV contains duplicate impressionId: ${impressionId}.`);
    }
    impressionIds.add(impressionId);
    const occurredAt = new Date(requiredCell(row, headers, 'occurredAt'));
    if (Number.isNaN(occurredAt.getTime())) {
      throw new Error(`Clickstream training CSV has invalid occurredAt at row ${rowIndex + 2}.`);
    }
    const sourceDate = validDateOnly(requiredCell(row, headers, 'sourceDate'), 'sourceDate');
    const runDate = validDateOnly(requiredCell(row, headers, 'runDate'), 'runDate');
    if (runDate !== expectedRunDate) {
      throw new Error(
        `Clickstream training CSV row ${rowIndex + 2} runDate ${runDate} does not match selected object runDate ${expectedRunDate}.`,
      );
    }
    const buyerPseudonym = cell(row, headers, 'buyerPseudonym');
    const sessionPseudonym = cell(row, headers, 'sessionPseudonym');
    const userId = buyerPseudonym || sessionPseudonym;
    if (!userId) {
      throw new Error(
        `Clickstream training CSV row ${rowIndex + 2} requires buyerPseudonym or sessionPseudonym.`,
      );
    }
    const features = Object.fromEntries(
      BUYER_PAIR_FEATURE_NAMES.map((name) => [name, 0]),
    ) as Record<BuyerPairFeatureName, number>;
    examples.push({
      exampleId: impressionId,
      datasetVersion: clickstreamDatasetVersion(expectedRunDate),
      randomSeed: RECOMMENDATION_RANDOM_SEED,
      modelVersion: CURRENT_RECOMMENDATION_VERSIONS.modelVersion,
      featureSchemaVersion: CURRENT_RECOMMENDATION_VERSIONS.featureSchemaVersion,
      split: 'train',
      fold: deterministicFold(impressionId),
      userId,
      productId: requiredCell(row, headers, 'productId'),
      categoryId: '',
      shopId: requiredCell(row, headers, 'shopId'),
      impressionAt: occurredAt,
      label: binaryCell(row, headers, 'labelClicked'),
      labelSource: CLICKSTREAM_LABEL_SOURCE,
      features,
      sampleWeight: 1,
      sourceDate,
      runDate,
      featureVectorSource: 'legacy-clickstream',
    });
  }
  return assignClickstreamSplits(examples, RECOMMENDATION_RANDOM_SEED);
}

function snapshotFeatureCell(
  row: readonly string[],
  headers: readonly string[],
  name: BuyerPairFeatureName,
): number {
  const value = numberCell(row, headers, name);
  if (value < 0 || value > 1) {
    throw new Error(`Snapshot training CSV feature ${name} must be between 0 and 1.`);
  }
  return value;
}

/** Parse the enriched snapshot-backed Glue adapter. Values are final serving values. */
export function parseSnapshotTrainingExamples(
  text: string,
  location: Pick<TrainingDatasetS3Location, 'runDate'> | string,
): readonly SeededTrainingExample[] {
  const expectedRunDate = typeof location === 'string' ? location : location.runDate;
  validDateOnly(expectedRunDate, 'runDate');
  const rows = parseCsv(text);
  const rawHeaders = rows[0];
  if (!rawHeaders) throw new Error('Snapshot training CSV is empty.');
  const normalizedHeaders = rawHeaders.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/u, '') : header,
  );
  const isFull = normalizedHeaders.length === SNAPSHOT_TRAINING_HEADERS.length &&
    normalizedHeaders.every((header, index) => header === SNAPSHOT_TRAINING_HEADERS[index]);
  if (!isFull) {
    throw new Error(
      `Snapshot training CSV header must be exactly: ${SNAPSHOT_TRAINING_HEADERS.join(',')}.`,
    );
  }
  if (rows.length < 3) throw new Error('Snapshot training CSV must contain at least two examples.');
  const examples: SeededTrainingExample[] = [];
  const ids = new Set<string>();
  for (const [rowIndex, row] of rows.slice(1).entries()) {
    if (row.length !== SNAPSHOT_TRAINING_HEADERS.length) {
      throw new Error(`Snapshot training CSV row ${rowIndex + 2} has an invalid column count.`);
    }
    const exampleId = requiredCell(row, normalizedHeaders, 'example_id');
    if (ids.has(exampleId)) throw new Error(`Snapshot training CSV contains duplicate example_id: ${exampleId}.`);
    ids.add(exampleId);
    const datasetVersion = requiredCell(row, normalizedHeaders, 'dataset_version');
    const randomSeed = integerCell(row, normalizedHeaders, 'random_seed');
    if (datasetVersion !== 'personal-ranking-v1' || randomSeed !== RECOMMENDATION_RANDOM_SEED) {
      throw new Error('Snapshot training CSV has an unsupported dataset version or random seed.');
    }
    const split = requiredCell(row, normalizedHeaders, 'split');
    if (split !== 'train' && split !== 'heldout') throw new Error('Snapshot training CSV has an invalid split.');
    const fold = integerCell(row, normalizedHeaders, 'fold');
    if (fold < 0 || fold > 4) throw new Error('Snapshot training CSV has an invalid fold.');
    const label = integerCell(row, normalizedHeaders, 'label');
    if (label !== 0 && label !== 1) throw new Error('Snapshot training labels must be 0 or 1.');
    const impressionAt = new Date(requiredCell(row, normalizedHeaders, 'impression_at'));
    if (Number.isNaN(impressionAt.getTime())) throw new Error(`Snapshot training CSV has invalid impression_at at row ${rowIndex + 2}.`);
    const userId = requiredCell(row, normalizedHeaders, 'user_id');
    const productId = requiredCell(row, normalizedHeaders, 'product_id');
    const features = Object.fromEntries(
      BUYER_PAIR_FEATURE_NAMES.map((name) => [name, snapshotFeatureCell(row, normalizedHeaders, name)]),
    ) as Record<BuyerPairFeatureName, number>;
    const sampleWeight = numberCell(row, normalizedHeaders, 'sample_weight');
    if (sampleWeight < 0) throw new Error('Snapshot training sample_weight must be non-negative.');
    const runDate = validDateOnly(requiredCell(row, normalizedHeaders, 'run_date'), 'run_date');
    if (runDate !== expectedRunDate) throw new Error(`Snapshot training row ${rowIndex + 2} run_date does not match selected object runDate.`);
    const sourceDate = validDateOnly(requiredCell(row, normalizedHeaders, 'source_date'), 'source_date');
    const modelVersion = integerCell(row, normalizedHeaders, 'model_version');
    const featureSchemaVersion = integerCell(row, normalizedHeaders, 'feature_schema_version');
    if (modelVersion !== CURRENT_RECOMMENDATION_VERSIONS.modelVersion ||
      featureSchemaVersion !== CURRENT_RECOMMENDATION_VERSIONS.featureSchemaVersion) {
      throw new Error('Snapshot training CSV has incompatible model or feature schema versions.');
    }
    for (const name of [
      'product_snapshot_at',
      'buyer_snapshot_at',
      'buyer_profile_generated_at',
      'product_snapshot_run_id',
      'buyer_snapshot_run_id',
      'pseudonym_key_id',
      'offline_lexical_version',
    ]) {
      requiredCell(row, normalizedHeaders, name);
    }
    const productSnapshotAt = new Date(requiredCell(row, normalizedHeaders, 'product_snapshot_at'));
    const buyerSnapshotAt = new Date(requiredCell(row, normalizedHeaders, 'buyer_snapshot_at'));
    if (Number.isNaN(productSnapshotAt.getTime()) || productSnapshotAt.getTime() > impressionAt.getTime()) {
      throw new Error(`Snapshot training CSV product_snapshot_at must be at or before impression_at.`);
    }
    if (Number.isNaN(buyerSnapshotAt.getTime()) || buyerSnapshotAt.getTime() > impressionAt.getTime()) {
      throw new Error(`Snapshot training CSV buyer_snapshot_at must be at or before impression_at.`);
    }
    const profileGeneratedAt = new Date(requiredCell(row, normalizedHeaders, 'buyer_profile_generated_at'));
    if (Number.isNaN(profileGeneratedAt.getTime()) || profileGeneratedAt.getTime() > impressionAt.getTime()) {
      throw new Error(`Snapshot training CSV buyer_profile_generated_at must be at or before impression_at.`);
    }
    if (requiredCell(row, normalizedHeaders, 'offline_lexical_version') !== 'offline_lexical_v1') {
      throw new Error('Snapshot training CSV has an unsupported offline_lexical_version.');
    }
    examples.push({
      exampleId,
      datasetVersion,
      randomSeed,
      modelVersion,
      featureSchemaVersion,
      split,
      fold,
      userId,
      productId,
      categoryId: cell(row, normalizedHeaders, 'category_id'),
      shopId: cell(row, normalizedHeaders, 'shop_id'),
      impressionAt,
      label: label as 0 | 1,
      labelSource: requiredCell(row, normalizedHeaders, 'label_source'),
      features,
      sampleWeight,
      sourceDate,
      runDate,
      featureVectorSource: 'snapshot-backed',
    });
  }
  const partition = deterministicPartition(examples, RECOMMENDATION_RANDOM_SEED);
  const heldoutIds = new Set(partition.heldout.map((example) => example.exampleId));
  return examples
    .map((example) => ({ ...example, split: heldoutIds.has(example.exampleId) ? ('heldout' as const) : ('train' as const) }))
    .sort((left, right) => left.exampleId.localeCompare(right.exampleId));
}

async function bodyToUtf8(body: unknown): Promise<string> {
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (
    body &&
    typeof body === 'object' &&
    'transformToString' in body &&
    typeof (body as { transformToString?: unknown }).transformToString === 'function'
  ) {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }
  if (
    body &&
    typeof body === 'object' &&
    Symbol.asyncIterator in body &&
    typeof (body as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('S3 clickstream training object has no readable body.');
}

export async function readClickstreamTrainingExamplesFromS3(
  uri: string,
  client: S3Client = new S3Client({}),
): Promise<readonly SeededTrainingExample[]> {
  const location = parseTrainingDatasetS3Uri(uri);
  const response = await client.send(
    new GetObjectCommand({ Bucket: location.bucket, Key: location.key }),
  );
  const body = await bodyToUtf8(response.Body);
  if (!body.trim()) throw new Error('S3 clickstream training object is empty.');
  const firstHeader = parseCsv(body)[0]?.[0]?.replace(/^\uFEFF/u, '');
  return firstHeader === 'example_id'
    ? parseSnapshotTrainingExamples(body, location)
    : parseClickstreamTrainingExamples(body, location);
}

function requiredIndex(headers: readonly string[], name: string): number {
  const index = headers.indexOf(name);
  if (index < 0) throw new Error(`Seeded recommendation dataset is missing ${name}.`);
  return index;
}

function numberCell(row: readonly string[], headers: readonly string[], name: string): number {
  const value = Number(row[requiredIndex(headers, name)]);
  if (!Number.isFinite(value))
    throw new Error(`Seeded recommendation dataset has invalid ${name}.`);
  return value;
}

function integerCell(row: readonly string[], headers: readonly string[], name: string): number {
  const value = numberCell(row, headers, name);
  if (!Number.isSafeInteger(value))
    throw new Error(`Seeded recommendation dataset has invalid ${name}.`);
  return value;
}

function textCell(row: readonly string[], headers: readonly string[], name: string): string {
  return row[requiredIndex(headers, name)] ?? '';
}

function featureValues(
  row: readonly string[],
  headers: readonly string[],
): Record<BuyerPairFeatureName, number> {
  return Object.fromEntries(
    BUYER_PAIR_FEATURE_NAMES.map((name) => [name, numberCell(row, headers, name)]),
  ) as Record<BuyerPairFeatureName, number>;
}

export function parseSeededTrainingExamples(text: string): readonly SeededTrainingExample[] {
  const rows = parseCsv(text);
  const headers = rows[0];
  if (!headers) throw new Error('Seeded recommendation dataset is empty.');
  return rows.slice(1).map((row) => {
    const split = textCell(row, headers, 'split');
    if (split !== 'train' && split !== 'heldout') {
      throw new Error(`Seeded recommendation dataset has invalid split: ${split}.`);
    }
    const rawLabel = integerCell(row, headers, 'label');
    if (rawLabel !== 0 && rawLabel !== 1)
      throw new Error('Seeded recommendation labels must be 0 or 1.');
    return {
      exampleId: textCell(row, headers, 'example_id'),
      datasetVersion: textCell(row, headers, 'dataset_version'),
      randomSeed: integerCell(row, headers, 'random_seed'),
      modelVersion: integerCell(row, headers, 'model_version'),
      featureSchemaVersion: integerCell(row, headers, 'feature_schema_version'),
      split,
      fold: integerCell(row, headers, 'fold'),
      userId: textCell(row, headers, 'user_id'),
      productId: textCell(row, headers, 'product_id'),
      categoryId: textCell(row, headers, 'category_id'),
      shopId: textCell(row, headers, 'shop_id'),
      impressionAt: new Date(textCell(row, headers, 'impression_at')),
      label: rawLabel as 0 | 1,
      labelSource: textCell(row, headers, 'label_source'),
      features: featureValues(row, headers),
      sampleWeight: numberCell(row, headers, 'sample_weight'),
    } satisfies SeededTrainingExample;
  });
}

export async function readSeededTrainingExamples(
  filePath = DEFAULT_SEEDED_DATASET_PATH,
): Promise<readonly SeededTrainingExample[]> {
  const examples = parseSeededTrainingExamples(await readFile(filePath, 'utf8'));
  validateSeededTrainingExamples(examples);
  return examples;
}

export function validateSeededTrainingExamples(examples: readonly SeededTrainingExample[]): void {
  if (examples.length === 0)
    throw new Error('Seeded recommendation dataset must contain examples.');
  const versions = new Set(examples.map((example) => example.datasetVersion));
  if (versions.size !== 1 || !versions.has(RECOMMENDATION_DATASET_VERSION)) {
    throw new Error(`Seeded recommendation dataset must use ${RECOMMENDATION_DATASET_VERSION}.`);
  }
  if (examples.some((example) => example.randomSeed !== RECOMMENDATION_RANDOM_SEED)) {
    throw new Error(`Seeded recommendation dataset must use seed ${RECOMMENDATION_RANDOM_SEED}.`);
  }
  if (examples.some((example) => Number.isNaN(example.impressionAt.getTime()))) {
    throw new Error('Seeded recommendation dataset contains an invalid impression timestamp.');
  }
  const ids = new Set<string>();
  for (const example of examples) {
    if (ids.has(example.exampleId))
      throw new Error(`Duplicate seeded example: ${example.exampleId}.`);
    ids.add(example.exampleId);
  }
}

export function deterministicPartition(
  examples: readonly SeededTrainingExample[],
  seed = RECOMMENDATION_RANDOM_SEED,
): { train: readonly SeededTrainingExample[]; heldout: readonly SeededTrainingExample[] } {
  const sorted = [...examples].sort((left, right) => left.exampleId.localeCompare(right.exampleId));
  // The committed fixture carries the split produced by its fixed seed. Keep
  // that declaration when present; generated/ad-hoc examples use the same
  // stable hash rule below.
  if (
    sorted.length > 0 &&
    sorted.every(
      (example) =>
        example.datasetVersion === RECOMMENDATION_DATASET_VERSION && example.randomSeed === seed,
    )
  ) {
    return {
      train: sorted.filter((example) => example.split === 'train'),
      heldout: sorted.filter((example) => example.split === 'heldout'),
    };
  }
  if (sorted.length > 0 && sorted.every((example) => example.featureVectorSource === 'snapshot-backed')) {
    const train = sorted.filter((example) => example.split === 'train');
    const heldout = sorted.filter((example) => example.split === 'heldout');
    if (sorted.length >= 2 && heldout.length === 0) heldout.push(train.pop()!);
    else if (sorted.length >= 2 && train.length === 0) train.push(heldout.pop()!);
    return { train, heldout };
  }
  const hash = (value: string): number => {
    return deterministicHash(value, seed);
  };
  const train: SeededTrainingExample[] = [];
  const heldout: SeededTrainingExample[] = [];
  for (const example of sorted) {
    (hash(example.exampleId) % 5 === 0 ? heldout : train).push(example);
  }
  // A small operator-selected export can hash entirely into one side. Keep
  // the split deterministic while guaranteeing both partitions for training
  // inputs with at least two examples. The committed fixture's declared
  // partition above remains untouched.
  if (sorted.length >= 2 && heldout.length === 0) {
    heldout.push(train.pop()!);
  } else if (sorted.length >= 2 && train.length === 0) {
    train.push(heldout.pop()!);
  }
  return { train, heldout };
}
