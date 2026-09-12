import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

import {
  assertPrivacySafe,
  snapshotDigest,
  validateSourceDate,
  validateSnapshotManifest,
  type SnapshotDataset,
  type SnapshotManifest,
  type SnapshotPartMetadata,
} from './contracts';

export interface SnapshotObjectStore {
  putIfAbsent(key: string, body: Buffer, metadata?: Record<string, string>): Promise<'created' | 'existing'>;
  get(key: string): Promise<Buffer>;
  head(key: string): Promise<{ metadata: Record<string, string>; byteCount: number } | null>;
}

function statusCode(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && '$metadata' in error
    ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    : undefined;
}

function metadataValue(metadata: Record<string, string> | undefined, key: string): string | undefined {
  return metadata?.[key] ?? metadata?.[`x-amz-meta-${key}`];
}

export class S3SnapshotObjectStore implements SnapshotObjectStore {
  constructor(private readonly s3: S3Client, private readonly bucket: string) {}

  async putIfAbsent(
    key: string,
    body: Buffer,
    metadata: Record<string, string> = {},
  ): Promise<'created' | 'existing'> {
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: key.endsWith('.json') ? 'application/json' : 'application/x-ndjson',
          ContentEncoding: key.endsWith('.gz') ? 'gzip' : undefined,
          Metadata: metadata,
          IfNoneMatch: '*',
          ServerSideEncryption: 'AES256',
        }),
      );
      return 'created';
    } catch (error) {
      if (
        statusCode(error) === 409 ||
        statusCode(error) === 412 ||
        (error instanceof Error && /precondition|already exists/i.test(error.message))
      ) {
        return 'existing';
      }
      throw error;
    }
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!response.Body) throw new Error(`Snapshot object has no body: ${key}`);
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async head(key: string): Promise<{ metadata: Record<string, string>; byteCount: number } | null> {
    try {
      const response = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { metadata: response.Metadata ?? {}, byteCount: Number(response.ContentLength ?? 0) };
    } catch (error) {
      if (statusCode(error) === 404 || (error instanceof Error && /not found|nosuchkey/i.test(error.message))) {
        return null;
      }
      throw error;
    }
  }
}

export class MemorySnapshotObjectStore implements SnapshotObjectStore {
  readonly objects = new Map<string, { body: Buffer; metadata: Record<string, string> }>();

  async putIfAbsent(
    key: string,
    body: Buffer,
    metadata: Record<string, string> = {},
  ): Promise<'created' | 'existing'> {
    if (this.objects.has(key)) return 'existing';
    this.objects.set(key, { body: Buffer.from(body), metadata: { ...metadata } });
    return 'created';
  }

  async get(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`Snapshot object not found: ${key}`);
    return Buffer.from(object.body);
  }

  async head(key: string): Promise<{ metadata: Record<string, string>; byteCount: number } | null> {
    const object = this.objects.get(key);
    return object
      ? { metadata: { ...object.metadata }, byteCount: object.body.byteLength }
      : null;
  }
}

export interface SnapshotWriterOptions<T> {
  store: SnapshotObjectStore;
  dataset: SnapshotDataset;
  rootPrefix: string;
  runId: string;
  snapshotAt: string;
  sourceDate: string;
  cutoff: string;
  schemaVersion: number;
  featureSchemaVersion: number;
  productProjectionVersion?: number;
  profileVersion?: number;
  pseudonymKeyId?: string;
  maxRowsPerPart: number;
  maxPartBytes: number;
  rows: AsyncIterable<T> | Iterable<T>;
  rowMapper: (row: T) => unknown;
}

function partKey(options: SnapshotWriterOptions<unknown>, index: number): string {
  return `${options.rootPrefix}/${options.dataset}/schema_version=${options.schemaVersion}/source_date=${options.sourceDate}/run_id=${options.runId}/parts/part-${String(index).padStart(5, '0')}.json.gz`;
}

async function* asAsync<T>(rows: AsyncIterable<T> | Iterable<T>): AsyncIterable<T> {
  if (Symbol.asyncIterator in Object(rows)) {
    for await (const row of rows as AsyncIterable<T>) yield row;
    return;
  }
  for (const row of rows as Iterable<T>) yield row;
}

export async function writeSnapshot<T>(options: SnapshotWriterOptions<T>): Promise<SnapshotManifest> {
  if (options.maxRowsPerPart < 1 || options.maxPartBytes < 1024) {
    throw new Error('Invalid snapshot part limits.');
  }
  validateSourceDate(options.sourceDate);
  const parts: SnapshotPartMetadata[] = [];
  let rowCount = 0;
  let partIndex = 0;
  let lines: string[] = [];
  let estimatedBytes = 0;

  const flush = async (): Promise<void> => {
    if (lines.length === 0) return;
    const body = gzipSync(Buffer.from(lines.join(''), 'utf8'), { level: 6 });
    const sha256 = createHash('sha256').update(body).digest('hex');
    const key = partKey(options as SnapshotWriterOptions<unknown>, partIndex);
    const result = await options.store.putIfAbsent(key, body, {
      sha256,
      rowcount: String(lines.length),
    });
    if (result === 'existing') {
      const existing = await options.store.head(key);
      if (
        !existing ||
        metadataValue(existing.metadata, 'sha256')?.toLowerCase() !== sha256 ||
        Number(metadataValue(existing.metadata, 'rowcount')) !== lines.length
      ) {
        throw new Error(`Snapshot part content conflict: ${key}`);
      }
    }
    parts.push({ key, rowCount: lines.length, byteCount: body.byteLength, sha256 });
    rowCount += lines.length;
    lines = [];
    estimatedBytes = 0;
    partIndex += 1;
  };

  for await (const input of asAsync(options.rows)) {
    const row = options.rowMapper(input);
    assertPrivacySafe(row);
    const line = `${JSON.stringify(row)}\n`;
    const bytes = Buffer.byteLength(line, 'utf8');
    if (lines.length > 0 && (lines.length >= options.maxRowsPerPart || estimatedBytes + bytes > options.maxPartBytes)) {
      await flush();
    }
    lines.push(line);
    estimatedBytes += bytes;
  }
  await flush();

  const manifest: SnapshotManifest = {
    manifestVersion: 1,
    dataset: options.dataset,
    runId: options.runId,
    snapshotAt: options.snapshotAt,
    sourceDate: options.sourceDate,
    cutoff: options.cutoff,
    schemaVersion: options.schemaVersion,
    featureSchemaVersion: options.featureSchemaVersion,
    ...(options.productProjectionVersion === undefined ? {} : { productProjectionVersion: options.productProjectionVersion }),
    ...(options.profileVersion === undefined ? {} : { profileVersion: options.profileVersion }),
    ...(options.pseudonymKeyId === undefined ? {} : { pseudonymKeyId: options.pseudonymKeyId }),
    rowCount,
    parts,
    // A deterministic marker makes a retry produce identical manifest bytes.
    createdAt: options.snapshotAt,
  };
  validateSnapshotManifest(manifest);
  const manifestKey = `${options.rootPrefix}/${options.dataset}/schema_version=${options.schemaVersion}/source_date=${options.sourceDate}/run_id=${options.runId}/manifest.json`;
  const result = await options.store.putIfAbsent(
    manifestKey,
    Buffer.from(JSON.stringify(manifest), 'utf8'),
    { sha256: snapshotDigest(manifest), rowcount: String(manifest.rowCount) },
  );
  if (result === 'existing') {
    const existing = validateSnapshotManifest(
      JSON.parse((await options.store.get(manifestKey)).toString('utf8')) as SnapshotManifest,
    );
    if (snapshotDigest(existing) !== snapshotDigest(manifest)) {
      throw new Error(`Snapshot manifest content conflict: ${manifestKey}`);
    }
    return existing;
  }
  return manifest;
}
