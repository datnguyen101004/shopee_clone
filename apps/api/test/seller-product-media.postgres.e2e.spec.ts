import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { isSellerProductUpsertRequest } from '@shopee-clone/contracts';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { loadAuthConfig } from '../src/auth/auth.config';
import { configureApplication } from '../src/configure-application';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';
import { SellerProductMediaStorage } from '../src/seller-products/seller-product-media.storage';
import { SellerProductsService } from '../src/seller-products/seller-products.service';

const databaseTest = process.env.RUN_SELLER_PRODUCT_MEDIA_DATABASE_TESTS === '1' ? describe : describe.skip;

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// This integration suite owns a temporary filesystem fixture; do not let a developer's
// workspace S3 settings turn it into an external-cloud test.
for (const key of ['AWS_S3_ACCESS_KEY_ID', 'AWS_S3_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET', 'AWS_S3_BUCKET_NAME', 'AWS_BUCKET_NAME', 'AWS_S3_ENDPOINT']) delete process.env[key];

const ownerToken = 'valid.seller.product.media.owner';
const otherToken = 'valid.seller.product.media.other';
const ownerSession = randomUUID();
const otherSession = randomUUID();
const origin = 'http://localhost:3000';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

databaseTest('seller product media HTTP with PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mediaStorage: SellerProductMediaStorage;
  let products: SellerProductsService;
  let mediaRoot = '';
  let ownerId = '';
  let otherOwnerId = '';
  let categoryId = '';
  let ownerShopId = '';
  let otherShopId = '';
  const assetIds: string[] = [];
  const storageKeys: string[] = [];
  const productIds: string[] = [];

  function authClaims(token: string) {
    const userId = token === ownerToken ? ownerId : otherOwnerId;
    const sid = token === ownerToken ? ownerSession : otherSession;
    return { sub: userId, sid, iss: 'test', aud: 'test', iat: 1, exp: 2 };
  }

  function productInput(assetId: string, extra: Record<string, unknown> = {}) {
    return {
      name: `Media integration ${randomUUID().slice(0, 8)}`,
      description: 'PostgreSQL media integration test',
      categoryId,
      attributes: [],
      media: [{ assetId, altText: 'Ảnh kiểm thử', sortOrder: 0 }],
      packageLengthMm: 100,
      packageWidthMm: 100,
      packageHeightMm: 100,
      optionGroups: [],
      variants: [{ combination: [], priceMinor: 100_000, compareAtPriceMinor: null, stock: 5, weightGrams: 500, maxPurchaseQuantity: null, active: true }],
      ...extra,
    };
  }

  async function stage(token = ownerToken) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/seller/products/media')
      .set('Authorization', `Bearer ${token}`)
      .set('Origin', origin)
      .attach('file', png, { filename: 'product.png', contentType: 'image/png' })
      .expect(201);
    assetIds.push(response.body.id);
    return response.body as { id: string; previewUrl: string };
  }

  async function cleanup() {
    if (productIds.length) {
      const variants = await prisma.productVariant.findMany({ where: { productId: { in: productIds } }, select: { id: true } });
      if (variants.length) await prisma.inventoryAdjustment.deleteMany({ where: { variantId: { in: variants.map((variant) => variant.id) } } });
      await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    if (assetIds.length) await prisma.sellerProductMediaAsset.deleteMany({ where: { id: { in: assetIds } } });
    for (const key of storageKeys) await mediaStorage.remove(key);
  }

  beforeAll(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'seller-product-media-postgres-'));
    process.env.SELLER_PRODUCT_MEDIA_ROOT = mediaRoot;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthTokenService)
      .useValue({ verifyAccess: (token: string) => authClaims(token) })
      .overrideProvider(AuthService)
      .useValue({ authenticateAccess: jest.fn(async (claims: { sub: string }) => ({ id: claims.sub, email: `${claims.sub}@example.test`, displayName: 'Media integration seller', status: 'active', roles: ['buyer', 'seller'] })) })
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin }));
    await app.init();
    prisma = app.get(PrismaService);
    mediaStorage = app.get(SellerProductMediaStorage);
    products = app.get(SellerProductsService);
    const shops = await prisma.shop.findMany({ where: { deletedAt: null, onboardingStatus: 'APPROVED', status: 'ACTIVE' }, orderBy: { id: 'asc' }, select: { id: true, ownerId: true } });
    if (shops.length < 2) throw new Error('Seller product media PostgreSQL test requires two approved shops');
    ownerShopId = shops[0]!.id;
    ownerId = shops[0]!.ownerId;
    otherShopId = shops[1]!.id;
    otherOwnerId = shops[1]!.ownerId;
    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true, deletedAt: null, slug: { notIn: ['mobile-accessories', 'kitchen-appliances'] }, children: { none: {} } }, select: { id: true } })).id;
    void ownerShopId;
    void otherShopId;
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true });
    delete process.env.SELLER_PRODUCT_MEDIA_ROOT;
  });

  it('uploads privately, attaches atomically, serves publicly, and denies foreign access', async () => {
    const staged = await stage();
    await request(app.getHttpServer()).get(staged.previewUrl).set('Authorization', `Bearer ${ownerToken}`).expect('Content-Type', /image\/png/).expect('Cache-Control', /private, no-store/).expect(200);
    await request(app.getHttpServer()).get(staged.previewUrl).set('Authorization', `Bearer ${otherToken}`).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/product-media/${staged.id}`).expect(404);

    const createdRequest = productInput(staged.id);
    expect(isSellerProductUpsertRequest(createdRequest)).toBe(true);
    const created = await request(app.getHttpServer()).post('/api/v1/seller/products').set('Authorization', `Bearer ${ownerToken}`).set('Origin', origin).send(createdRequest);
    if (created.status !== 201) throw new Error(`create failed: ${created.status} ${JSON.stringify(created.body)}`);
    productIds.push(created.body.id);
    expect(created.body.media[0].url).toBe(`/api/v1/product-media/${staged.id}`);
    const persistedImage = await prisma.productImage.findFirstOrThrow({ where: { productId: created.body.id }, select: { url: true } });
    expect(persistedImage.url).toBe(`/api/v1/product-media/${staged.id}`);
    expect(persistedImage.url).not.toMatch(/(?:Expires|Signature|Key-Pair-Id|X-Amz-|seller-product-media\/)/i);
    await request(app.getHttpServer()).get(`/api/v1/product-media/${staged.id}`).expect('Content-Type', /image\/png/).expect('Cache-Control', /private, no-store/).expect('Pragma', 'no-cache').expect('Referrer-Policy', 'no-referrer').expect(200);
    expect((await prisma.sellerProductMediaAsset.findUniqueOrThrow({ where: { id: staged.id } })).state).toBe('ATTACHED');

    const foreignAsset = await stage();
    await request(app.getHttpServer()).post('/api/v1/seller/products').set('Authorization', `Bearer ${otherToken}`).set('Origin', origin).send(productInput(foreignAsset.id)).expect(400);
    expect((await prisma.sellerProductMediaAsset.findUniqueOrThrow({ where: { id: foreignAsset.id } })).state).toBe('STAGED');
  });

  it('rolls back attachment and rejects expired staged assets', async () => {
    const rollback = await stage();
    const rollbackRequest = productInput(rollback.id, {
      optionGroups: [{ name: 'Màu', values: ['Đỏ'] }],
      optionValueMedia: [{ groupIndex: 0, value: 'Không tồn tại', mediaRef: { assetId: rollback.id } }],
      variants: [{ combination: ['Đỏ'], priceMinor: 100_000, compareAtPriceMinor: null, stock: 5, weightGrams: 500, maxPurchaseQuantity: null, active: true }],
    });
    const failed = await request(app.getHttpServer()).post('/api/v1/seller/products').set('Authorization', `Bearer ${ownerToken}`).set('Origin', origin).send(rollbackRequest);
    expect(failed.status).toBe(400);
    expect(await prisma.product.count({ where: { name: rollbackRequest.name } })).toBe(0);
    expect((await prisma.sellerProductMediaAsset.findUniqueOrThrow({ where: { id: rollback.id } })).state).toBe('STAGED');

    const expiredKey = await mediaStorage.write('image/png', png);
    storageKeys.push(expiredKey);
    const expired = await prisma.sellerProductMediaAsset.create({ data: { uploaderId: ownerId, shopId: ownerShopId, storageKey: expiredKey, mimeType: 'image/png', byteSize: png.length, width: 1, height: 1, expiresAt: new Date(Date.now() - 60_000) } });
    assetIds.push(expired.id);
    await request(app.getHttpServer()).post('/api/v1/seller/products').set('Authorization', `Bearer ${ownerToken}`).set('Origin', origin).send(productInput(expired.id)).expect(400);
    expect((await prisma.sellerProductMediaAsset.findUniqueOrThrow({ where: { id: expired.id } })).state).toBe('STAGED');
    await expect(products.cleanupExpiredMedia(mediaStorage)).resolves.toBeGreaterThanOrEqual(1);
  });
});
