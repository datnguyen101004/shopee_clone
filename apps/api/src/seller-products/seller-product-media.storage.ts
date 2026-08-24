import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { promises as fs, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const localStorageKeyPattern = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const cloudFrontDefaultBaseUrl = 'https://cdn.videod.me';

export type MediaReadTarget =
  | { kind: 'local'; data: Buffer }
  | { kind: 'cloudfront'; url: string; expiresAt: Date | null };

export type VerifiedUploadedObject = {
  byteSize: number;
  mimeType: string;
  checksumSha256: string;
  width: number;
  height: number;
};

export type CloudFrontSigningConfig = {
  baseUrl: string;
  keyPairId: string;
  privateKey: string;
  ttlSeconds: number;
};

export class SellerProductMediaDeliveryUnavailableError extends Error {
  constructor() { super('Private seller product media delivery is unavailable.'); }
}

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function readTtl(environment: NodeJS.ProcessEnv): number {
  const raw = environment.AWS_CLOUDFRONT_SIGNED_URL_TTL_SECONDS?.trim();
  if (!raw) return 300;
  if (!/^\d+$/.test(raw)) throw new Error('AWS_CLOUDFRONT_SIGNED_URL_TTL_SECONDS must be an integer from 60 to 300.');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 60 || value > 300) throw new Error('AWS_CLOUDFRONT_SIGNED_URL_TTL_SECONDS must be an integer from 60 to 300.');
  return value;
}

function readUploadTtl(environment: NodeJS.ProcessEnv): number {
  const raw = environment.AWS_S3_UPLOAD_URL_TTL_SECONDS?.trim();
  if (raw && raw !== '300') throw new Error('AWS_S3_UPLOAD_URL_TTL_SECONDS must be exactly 300.');
  return 300;
}

export function loadCloudFrontSigningConfig(environment: NodeJS.ProcessEnv = process.env, required = false): CloudFrontSigningConfig | null {
  const rawBaseUrl = environment.AWS_CLOUDFRONT_BASE_URL?.trim() || cloudFrontDefaultBaseUrl;
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error('AWS_CLOUDFRONT_BASE_URL must be a valid HTTPS URL.');
  }
  if (parsedBaseUrl.protocol !== 'https:' || parsedBaseUrl.hostname !== 'cdn.videod.me' || parsedBaseUrl.pathname !== '/' || parsedBaseUrl.search || parsedBaseUrl.hash) {
    throw new Error('AWS_CLOUDFRONT_BASE_URL must be exactly https://cdn.videod.me.');
  }
  const keyPairId = environment.AWS_CLOUDFRONT_KEY_PAIR_ID?.trim();
  const privateKeyPath = environment.AWS_CLOUDFRONT_PRIVATE_KEY_PATH?.trim();
  const ttlSeconds = readTtl(environment);
  if (!keyPairId && !privateKeyPath) return required ? (() => { throw new Error('AWS_CLOUDFRONT_KEY_PAIR_ID and AWS_CLOUDFRONT_PRIVATE_KEY_PATH are required for private S3 media delivery.'); })() : null;
  if (!keyPairId || !privateKeyPath) throw new Error('AWS_CLOUDFRONT_KEY_PAIR_ID and AWS_CLOUDFRONT_PRIVATE_KEY_PATH must be provided together.');
  try {
    return { baseUrl: parsedBaseUrl.toString().replace(/\/$/, ''), keyPairId, privateKey: readFileSync(privateKeyPath, 'utf8'), ttlSeconds };
  } catch {
    if (required || environment.NODE_ENV === 'production') throw new Error('AWS CloudFront private signing key could not be loaded.');
    return null;
  }
}

export function stableProductMediaUrl(mediaId: string): string {
  return `/api/v1/product-media/${encodeURIComponent(mediaId)}`;
}

function managedMediaKey(key: string): string | null {
  const prefix = `${envValue('AWS_S3_PREFIX') ?? 'seller-product-media'}/`;
  const filename = key.startsWith(prefix) ? key.slice(prefix.length) : '';
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(filename) ? key : null;
}

/**
 * Resolve a persisted S3 media key to the public CloudFront object URL.
 * This is intentionally independent of the storage client so read-only
 * seller projections (inventory/orders) can repair legacy image snapshots.
 */
export function publicSellerProductMediaUrl(key: string): string | null {
  const remoteKey = managedMediaKey(key);
  const publicBase = envValue('AWS_S3_PUBLIC_BASE_URL');
  if (!remoteKey || !publicBase) return null;
  return `${publicBase.replace(/\/$/, '')}/${remoteKey.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

@Injectable()
export class SellerProductMediaStorage {
  private readonly root = process.env.SELLER_PRODUCT_MEDIA_ROOT ?? join(process.cwd(), '.runtime', 'seller-product-media');
  private readonly bucket = envValue('AWS_S3_BUCKET', 'AWS_S3_BUCKET_NAME', 'AWS_BUCKET_NAME');
  private readonly prefix = envValue('AWS_S3_PREFIX') ?? 'seller-product-media';
  private readonly region = envValue('AWS_S3_REGION', 'AWS_REGION') ?? 'us-east-1';
  private readonly client: S3Client | null;
  private readonly cloudFront: CloudFrontSigningConfig | null;
  private readonly uploadTtlSeconds: number;

  constructor() {
    this.uploadTtlSeconds = readUploadTtl(process.env);
    const accessKeyId = envValue('AWS_S3_ACCESS_KEY_ID');
    const secretAccessKey = envValue('AWS_S3_SECRET_ACCESS_KEY');
    const credentialsProvided = Boolean(accessKeyId || secretAccessKey);
    if (credentialsProvided && process.env.NODE_ENV === 'production') {
      throw new Error('Static S3 credentials are not allowed in production; use the EC2/task role credential chain.');
    }
    if (credentialsProvided && (!accessKeyId || !secretAccessKey) && process.env.NODE_ENV !== 'test') {
      throw new Error('AWS_S3_ACCESS_KEY_ID and AWS_S3_SECRET_ACCESS_KEY must be provided together.');
    }
    if (credentialsProvided && !this.bucket && process.env.NODE_ENV !== 'test') {
      throw new Error('AWS_S3_BUCKET is required when S3 credentials are configured.');
    }

    if (!this.bucket) {
      this.client = null;
      this.cloudFront = null;
      return;
    }

    this.client = new S3Client({
      region: this.region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
      ...(envValue('AWS_S3_ENDPOINT') ? { endpoint: envValue('AWS_S3_ENDPOINT') } : {}),
      ...(process.env.AWS_S3_FORCE_PATH_STYLE === 'true' ? { forcePathStyle: true } : {}),
    });
    this.cloudFront = loadCloudFrontSigningConfig(process.env, process.env.NODE_ENV === 'production');
  }

  private get s3Enabled(): boolean {
    return this.client !== null && this.bucket !== undefined;
  }

  private s3Key(key: string): string | null {
    if (!this.s3Enabled) return null;
    const prefix = `${this.prefix}/`;
    const filename = key.startsWith(prefix) ? key.slice(prefix.length) : '';
    return /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(filename) ? key : null;
  }

  /**
   * Return the configured CDN object URL for persisted product references.
   * The API only uses this when the deployment explicitly provides a public
   * media base (the local environment points it at cdn.videod.me). Signed
   * CloudFront preview delivery remains separate in readTarget().
   */
  publicUrl(key: string): string | null {
    const remoteKey = this.s3Key(key);
    return remoteKey ? publicSellerProductMediaUrl(remoteKey) : null;
  }

  private cloudFrontUrl(remoteKey: string): string {
    if (!this.cloudFront) throw new Error('CloudFront signing is not configured for private S3 media delivery.');
    return `${this.cloudFront.baseUrl}/${remoteKey.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
  }

  private signedCloudFrontUrl(remoteKey: string): { url: string; expiresAt: Date } {
    if (!this.cloudFront) throw new Error('CloudFront signing is not configured for private S3 media delivery.');
    const expiresAt = new Date(Date.now() + this.cloudFront.ttlSeconds * 1000);
    return {
      url: getSignedUrl({ url: this.cloudFrontUrl(remoteKey), keyPairId: this.cloudFront.keyPairId, privateKey: this.cloudFront.privateKey, dateLessThan: expiresAt }),
      expiresAt,
    };
  }

  async write(mimeType: string, data: Buffer): Promise<string> {
    const extension = mimeExtensions[mimeType];
    if (!extension) throw new Error('Unsupported seller product media MIME type');
    const filename = `${randomUUID()}.${extension}`;

    if (this.s3Enabled) {
      const key = `${this.prefix}/${filename}`;
      await this.client!.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
        CacheControl: 'private, no-store',
      }));
      return key;
    }

    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(join(this.root, filename), data, { flag: 'wx' });
    return filename;
  }

  async createUploadUrl(key: string, mimeType: string, checksumSha256: string): Promise<{ url: string; expiresAt: Date }> {
    const remoteKey = this.s3Key(key);
    if (!remoteKey || !this.client || !this.bucket) throw new SellerProductMediaDeliveryUnavailableError();
    const expiresAt = new Date(Date.now() + this.uploadTtlSeconds * 1000);
    const url = await getS3SignedUrl(this.client as never, new PutObjectCommand({
      Bucket: this.bucket,
      Key: remoteKey,
      ContentType: mimeType,
      ChecksumSHA256: checksumSha256,
    }), {
      expiresIn: this.uploadTtlSeconds,
      // S3 hoists x-amz-* values into the query string by default. Keep the
      // checksum and content type as signed request headers because the
      // browser sends both headers during the direct PUT.
      unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
      signableHeaders: new Set(['content-type']),
    });
    return { url, expiresAt };
  }

  async verifyUploadedObject(key: string, expected: { mimeType: string; byteSize: number; checksumSha256: string }): Promise<VerifiedUploadedObject | null> {
    const remoteKey = this.s3Key(key);
    if (!remoteKey || !this.client || !this.bucket) return null;
    let head: { ContentLength?: number; ContentType?: string; ChecksumSHA256?: string };
    try {
      head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: remoteKey, ChecksumMode: 'ENABLED' }));
    } catch {
      return null;
    }
    if (head.ContentLength !== expected.byteSize || head.ContentType !== expected.mimeType || head.ChecksumSHA256 !== expected.checksumSha256 || head.ContentLength < 1 || head.ContentLength > 5 * 1024 * 1024) return null;
    let body: Buffer;
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: remoteKey, Range: `bytes=0-${5 * 1024 * 1024 - 1}` }));
      if (!response.Body) return null;
      body = Buffer.from(await response.Body.transformToByteArray());
    } catch {
      return null;
    }
    if (body.length !== expected.byteSize) return null;
    const checksum = createHash('sha256').update(body).digest('base64');
    if (checksum !== expected.checksumSha256) return null;
    const dimensions = imageDimensions(body, expected.mimeType);
    if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 5_000 || dimensions.height > 5_000) return null;
    return { byteSize: body.length, mimeType: expected.mimeType, checksumSha256: checksum, width: dimensions.width, height: dimensions.height };
  }

  async read(key: string): Promise<Buffer | null> {
    const remoteKey = this.s3Key(key);
    if (remoteKey) {
      try {
        const response = await this.client!.send(new GetObjectCommand({ Bucket: this.bucket, Key: remoteKey }));
        if (!response.Body) return null;
        return Buffer.from(await response.Body.transformToByteArray());
      } catch {
        return null;
      }
    }

    if (!localStorageKeyPattern.test(key)) return null;
    try {
      return await fs.readFile(join(this.root, key));
    } catch {
      return null;
    }
  }

  async readTarget(key: string, options: { allowPublic?: boolean } = {}): Promise<MediaReadTarget | null> {
    const remoteKey = this.s3Key(key);
    if (remoteKey) {
      try {
        await this.client!.send(new HeadObjectCommand({ Bucket: this.bucket, Key: remoteKey }));
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        const message = error instanceof Error ? error.message : '';
        const status = typeof error === 'object' && error !== null && '$metadata' in error
          ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode)
          : 0;
        if (status === 404 || name === 'NotFound' || name === 'NoSuchKey' || message === 'NotFound' || message === 'NoSuchKey') return null;
        throw new SellerProductMediaDeliveryUnavailableError();
      }
      if (options.allowPublic) {
        const publicUrl = this.publicUrl(remoteKey);
        if (publicUrl) return { kind: 'cloudfront', url: publicUrl, expiresAt: null };
      }
      return { kind: 'cloudfront', ...this.signedCloudFrontUrl(remoteKey) };
    }
    const data = await this.read(key);
    return data ? { kind: 'local', data } : null;
  }

  async remove(key: string): Promise<void> {
    const remoteKey = this.s3Key(key);
    if (remoteKey) {
      await this.client!.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: remoteKey }));
      return;
    }
    if (localStorageKeyPattern.test(key)) await fs.rm(join(this.root, key), { force: true });
  }
}

export function imageDimensions(data: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === 'image/png' && data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  if (mimeType === 'image/jpeg' && data[0] === 0xff && data[1] === 0xd8) {
    for (let index = 2; index + 9 < data.length;) {
      if (data[index] !== 0xff) { index += 1; continue; }
      const marker = data[index + 1]!;
      const length = data.readUInt16BE(index + 2);
      if ([0xc0, 0xc1, 0xc2].includes(marker) && index + 9 < data.length) return { height: data.readUInt16BE(index + 5), width: data.readUInt16BE(index + 7) };
      index += Math.max(length + 2, 2);
    }
  }
  if (mimeType === 'image/webp' && data.length >= 30 && data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP' && data.subarray(12, 16).toString() === 'VP8X') return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  return null;
}
