import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';

import { SellerProductMediaStorage } from './seller-product-media.storage';

jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));

describe('SellerProductMediaStorage', () => {
  const environmentKeys = ['SELLER_PRODUCT_MEDIA_ROOT', 'AWS_S3_BUCKET', 'AWS_S3_REGION', 'AWS_S3_PREFIX', 'AWS_S3_PUBLIC_BASE_URL', 'AWS_S3_UPLOAD_URL_TTL_SECONDS', 'AWS_CLOUDFRONT_BASE_URL'] as const;
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  let root = '';
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'seller-product-media-'));
    process.env.SELLER_PRODUCT_MEDIA_ROOT = root;
    for (const key of environmentKeys.slice(1)) delete process.env[key];
    jest.restoreAllMocks();
    (getS3SignedUrl as jest.Mock).mockReset();
  });
  afterEach(async () => {
    for (const key of environmentKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });

  it('stores opaque image keys and refuses traversal reads/removals', async () => {
    const storage = new SellerProductMediaStorage();
    const key = await storage.write('image/png', Buffer.from('safe-image'));
    expect(key).toMatch(/^[0-9a-f-]{36}\.png$/);
    await expect(storage.read(key)).resolves.toEqual(Buffer.from('safe-image'));
    await expect(storage.read('../../.env')).resolves.toBeNull();
    await storage.remove('../../.env');
    await storage.remove(key);
    await expect(storage.read(key)).resolves.toBeNull();
  });

  it('writes S3 objects with immutable caching and returns a public CDN target', async () => {
    process.env.AWS_S3_BUCKET = 'private-media-bucket';
    process.env.AWS_S3_REGION = 'ap-southeast-1';
    process.env.AWS_S3_PREFIX = 'seller-product-media';
    process.env.AWS_CLOUDFRONT_BASE_URL = 'https://cdn.videod.me';
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

    const storage = new SellerProductMediaStorage();
    const key = await storage.write('image/png', Buffer.from('safe-image'));
    expect(key).toMatch(/^seller-product-media\/[0-9a-f-]{36}\.png$/);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ CacheControl: 'public, max-age=31536000, immutable' }) }));

    const target = await storage.readTarget(key);
    expect(target?.kind).toBe('cloudfront');
    if (target?.kind !== 'cloudfront') throw new Error('Expected CloudFront target');
    const url = new URL(target.url);
    expect(url.hostname).toBe('cdn.videod.me');
    expect(url.pathname).toBe(`/${key}`);
    expect(url.search).toBe('');
    expect(target.expiresAt).toBeNull();
  });

  it('creates a single-object S3 PUT URL with the fixed five-minute expiry and signed headers', async () => {
    process.env.AWS_S3_BUCKET = 'private-media-bucket';
    process.env.AWS_S3_REGION = 'ap-southeast-1';
    process.env.AWS_S3_PREFIX = 'seller-product-media';
    process.env.AWS_S3_UPLOAD_URL_TTL_SECONDS = '300';
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    (getS3SignedUrl as jest.Mock).mockResolvedValue('https://s3.example.test/upload?X-Amz-Signature=redacted');
    const storage = new SellerProductMediaStorage();
    const result = await storage.createUploadUrl('seller-product-media/00000000-0000-4000-8000-000000000001.png', 'image/png', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    expect(result.url).toContain('X-Amz-Signature');
    expect(result.expiresAt.getTime() - Date.now()).toBeGreaterThanOrEqual(299_000);
    expect(result.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(301_000);
    expect(getS3SignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ input: expect.objectContaining({ Key: 'seller-product-media/00000000-0000-4000-8000-000000000001.png', ContentType: 'image/png', ChecksumSHA256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }) }),
      { expiresIn: 300, unhoistableHeaders: new Set(['x-amz-checksum-sha256']), signableHeaders: new Set(['content-type']) },
    );
  });

  it('builds attached product URLs from the configured CDN and never from the S3 origin', async () => {
    process.env.AWS_S3_BUCKET = 'private-media-bucket';
    process.env.AWS_S3_REGION = 'ap-southeast-1';
    process.env.AWS_S3_PREFIX = 'seller-product-media';
    process.env.AWS_S3_PUBLIC_BASE_URL = 'https://cdn.videod.me/';
    const storage = new SellerProductMediaStorage();
    expect(storage.publicUrl('seller-product-media/00000000-0000-4000-8000-000000000001.png')).toBe('https://cdn.videod.me/seller-product-media/00000000-0000-4000-8000-000000000001.png');
    expect(storage.publicUrl('seller-product-media/../../secrets.png')).toBeNull();
  });

  it('returns an unsigned CDN target for an existing S3 object', async () => {
    process.env.AWS_S3_BUCKET = 'private-media-bucket';
    process.env.AWS_S3_REGION = 'ap-southeast-1';
    process.env.AWS_S3_PREFIX = 'seller-product-media';
    process.env.AWS_S3_PUBLIC_BASE_URL = 'https://cdn.videod.me';
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const storage = new SellerProductMediaStorage();
    await expect(storage.readTarget('seller-product-media/00000000-0000-4000-8000-000000000001.png')).resolves.toEqual({
      kind: 'cloudfront',
      url: 'https://cdn.videod.me/seller-product-media/00000000-0000-4000-8000-000000000001.png',
      expiresAt: null,
    });
  });

  it('does not return a CDN target for a missing object', async () => {
    process.env.AWS_S3_BUCKET = 'private-media-bucket';
    jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('NotFound') as never);
    const storage = new SellerProductMediaStorage();
    await expect(storage.readTarget('seller-product-media/00000000-0000-4000-8000-000000000001.png')).resolves.toBeNull();
  });

  it('keeps local reads discriminated', async () => {
    const storage = new SellerProductMediaStorage();
    const key = await storage.write('image/png', Buffer.from('local-image'));
    await expect(storage.readTarget(key)).resolves.toEqual({ kind: 'local', data: Buffer.from('local-image') });
  });

  it('starts in production without CloudFront signing credentials', async () => {
    process.env.AWS_S3_BUCKET = 'private-media-bucket';
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const storage = new SellerProductMediaStorage();
    await expect(storage.readTarget('seller-product-media/00000000-0000-4000-8000-000000000001.png')).resolves.toEqual({
      kind: 'cloudfront',
      url: 'https://cdn.videod.me/seller-product-media/00000000-0000-4000-8000-000000000001.png',
      expiresAt: null,
    });
  });
});
