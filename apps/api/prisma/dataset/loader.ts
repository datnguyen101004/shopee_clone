import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalDatasetManifest } from './manifest';
import { sha256 } from './identifiers';
import type {
  DatasetManifestEntry,
  JsonObject,
  JsonValue,
  LoadedDatasetSource,
  RawDatasetRecord,
} from './types';

export const DEFAULT_DATASET_DIRECTORY = path.resolve(__dirname, '../../../../asserts');

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value) && Object.values(value).every(isJsonValue);
}

function assertOptionalString(
  record: RawDatasetRecord,
  key: keyof RawDatasetRecord,
  label: string,
): void {
  const value = record[key];
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new Error(`${label}.${String(key)} must be a string or null.`);
  }
}

function assertOptionalNumber(
  record: RawDatasetRecord,
  key: keyof RawDatasetRecord,
  label: string,
): void {
  const value = record[key];
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw new Error(`${label}.${String(key)} must be a finite number or null.`);
  }
}

function assertHttpUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} must be an absolute HTTP(S) URL.`);
  }
}

function validateRecord(record: RawDatasetRecord, label: string): void {
  for (const key of ['name', 'notes', 'image_url', 'product_url', 'source_page'] as const) {
    assertOptionalString(record, key, label);
  }
  for (const key of ['price', 'rating'] as const) assertOptionalNumber(record, key, label);

  if (
    record.id !== undefined &&
    record.id !== null &&
    !['number', 'string'].includes(typeof record.id)
  ) {
    throw new Error(`${label}.id must be a string, number, or null.`);
  }
  if (
    record.product_id !== undefined &&
    record.product_id !== null &&
    !['number', 'string'].includes(typeof record.product_id)
  ) {
    throw new Error(`${label}.product_id must be a string, number, or null.`);
  }
  if (
    typeof record.price === 'number' &&
    (!Number.isSafeInteger(record.price) || record.price <= 0)
  ) {
    throw new Error(`${label}.price must be a positive safe integer.`);
  }
  if (typeof record.rating === 'number' && (record.rating < 0 || record.rating > 5)) {
    throw new Error(`${label}.rating must be between zero and five.`);
  }
  for (const key of ['image_url', 'product_url', 'source_page'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) assertHttpUrl(value.trim(), `${label}.${key}`);
  }
}

function parseRoot(bytes: Buffer, manifest: DatasetManifestEntry): LoadedDatasetSource {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`Dataset file ${manifest.fileName} is not valid JSON.`);
  }
  if (!isJsonObject(parsed) || !isJsonValue(parsed)) {
    throw new Error(`Dataset file ${manifest.fileName} must contain a JSON object.`);
  }
  const recordsValue = parsed.records;
  if (!Array.isArray(recordsValue) || !recordsValue.every(isJsonObject)) {
    throw new Error(`Dataset file ${manifest.fileName} must contain a records array.`);
  }
  const declaredCount = parsed.record_count;
  if (!Number.isSafeInteger(declaredCount) || (declaredCount as number) < 0) {
    throw new Error(`Dataset file ${manifest.fileName} has an invalid record_count.`);
  }
  if (declaredCount !== recordsValue.length) {
    throw new Error(
      `Dataset file ${manifest.fileName} declares ${String(declaredCount)} records but contains ${recordsValue.length}.`,
    );
  }
  if (recordsValue.length !== manifest.expectedCount) {
    throw new Error(
      `Dataset file ${manifest.fileName} expected ${manifest.expectedCount} records but contains ${recordsValue.length}.`,
    );
  }
  if (typeof parsed.source !== 'string' || !parsed.source.trim()) {
    throw new Error(`Dataset file ${manifest.fileName} must declare a source URL.`);
  }
  assertHttpUrl(parsed.source.trim(), `${manifest.fileName}.source`);

  const records = recordsValue as RawDatasetRecord[];
  records.forEach((record, index) =>
    validateRecord(record, `${manifest.fileName}.records[${index}]`),
  );
  const rootMetadata = { ...parsed };
  delete rootMetadata.records;
  return {
    manifest,
    checksum: sha256(bytes),
    sourceUrl: parsed.source.trim(),
    rootMetadata,
    records,
  };
}

export async function loadCanonicalDataset(options?: {
  directory?: string;
  manifest?: readonly DatasetManifestEntry[];
}): Promise<LoadedDatasetSource[]> {
  const directory = options?.directory ?? DEFAULT_DATASET_DIRECTORY;
  const manifest = options?.manifest ?? canonicalDatasetManifest;
  return Promise.all(
    manifest.map(async (entry) => {
      const filePath = path.resolve(directory, entry.fileName);
      let bytes: Buffer;
      try {
        bytes = await readFile(filePath);
      } catch {
        throw new Error(`Required dataset file ${entry.fileName} could not be read.`);
      }
      return parseRoot(bytes, entry);
    }),
  );
}
