import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const localStorageKeyPattern = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

@Injectable()
export class SellerProductMediaStorage {
  private readonly root = process.env.SELLER_PRODUCT_MEDIA_ROOT ?? join(process.cwd(), '.runtime', 'seller-product-media');
  private readonly bucket = envValue('AWS_S3_BUCKET', 'AWS_S3_BUCKET_NAME', 'AWS_BUCKET_NAME');
  private readonly prefix = envValue('AWS_S3_PREFIX') ?? 'seller-product-media';
  private readonly region = envValue('AWS_S3_REGION', 'AWS_REGION') ?? 'us-east-1';
  private readonly client: S3Client | null;

  constructor() {
    const accessKeyId = envValue('AWS_S3_ACCESS_KEY_ID');
    const secretAccessKey = envValue('AWS_S3_SECRET_ACCESS_KEY');
    const credentialsProvided = Boolean(accessKeyId || secretAccessKey);
    if (credentialsProvided && (!accessKeyId || !secretAccessKey) && process.env.NODE_ENV !== 'test') {
      throw new Error('AWS_S3_ACCESS_KEY_ID and AWS_S3_SECRET_ACCESS_KEY must be provided together.');
    }
    if (credentialsProvided && !this.bucket && process.env.NODE_ENV !== 'test') {
      throw new Error('AWS_S3_BUCKET is required when S3 credentials are configured.');
    }

    if (!this.bucket) {
      this.client = null;
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

  publicUrl(key: string): string | null {
    const remoteKey = this.s3Key(key);
    if (!remoteKey || !this.bucket) return null;
    const publicBase = envValue('AWS_S3_PUBLIC_BASE_URL');
    const encodedKey = remoteKey.split('/').map((part) => encodeURIComponent(part)).join('/');
    if (publicBase) return `${publicBase.replace(/\/$/, '')}/${encodedKey}`;
    const host = this.region === 'us-east-1'
      ? `${this.bucket}.s3.amazonaws.com`
      : `${this.bucket}.s3.${this.region}.amazonaws.com`;
    return `https://${host}/${encodedKey}`;
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
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      return key;
    }

    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(join(this.root, filename), data, { flag: 'wx' });
    return filename;
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
