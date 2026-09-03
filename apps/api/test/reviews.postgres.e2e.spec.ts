import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthService } from '../src/auth/auth.service';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReviewMediaStorage } from '../src/reviews/review-media.storage';
import { ReviewsService } from '../src/reviews/reviews.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';

const databaseTest = process.env.RUN_REVIEW_DATABASE_TESTS === '1' ? describe : describe.skip;
const buyerId = '00000000-0000-4000-8000-000000030001';
const foreignBuyerId = '00000000-0000-4000-8000-000000030002';
const purchaseId = '00000000-0000-4000-8000-000000030003';
const orderId = '00000000-0000-4000-8000-000000030004';
const lineIds = ['00000000-0000-4000-8000-000000030005', '00000000-0000-4000-8000-000000030006'] as const;
const publicLineIds = ['00000000-0000-4000-8000-000000030007', '00000000-0000-4000-8000-000000030008'] as const;
const keys = ['00000000-0000-4000-8000-000000030009', '00000000-0000-4000-8000-000000030010'] as const;
const buyerBearer = 'Bearer valid.review.buyer';
const foreignBearer = 'Bearer valid.review.foreign';
const origin = 'http://localhost:3000';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('verified reviews HTTP with PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reviews: ReviewsService;
  let storage: ReviewMediaStorage;
  let mediaRoot = '';
  let product: { id: string; name: string; shop: { id: string; slug: string; name: string }; variants: Array<{ id: string; sku: string; name: string }> };

  async function cleanup(): Promise<void> {
    await prisma.reviewModerationEvent.deleteMany({ where: { review: { orderLine: { orderId } } } });
    await prisma.reviewMedia.deleteMany({ where: { uploaderId: { in: [buyerId, foreignBuyerId] } } });
    await prisma.productReview.deleteMany({ where: { orderLine: { orderId } } });
    await prisma.orderTimelineEvent.deleteMany({ where: { orderId } });
    await prisma.orderLine.deleteMany({ where: { orderId } });
    await prisma.shopOrder.deleteMany({ where: { id: orderId } });
    await prisma.purchase.deleteMany({ where: { id: purchaseId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, foreignBuyerId] } } });
    if (product) {
      await prisma.product.update({ where: { id: product.id }, data: { ratingCount: 0, ratingAverageBasisPoints: 0 } });
      await prisma.shop.update({ where: { id: product.shop.id }, data: { ratingCount: 0, ratingAverageBasisPoints: 0 } });
    }
  }

  async function fixture(): Promise<void> {
    await cleanup();
    await prisma.user.createMany({ data: [
      { id: buyerId, email: 't21-buyer@example.test', displayName: 'T21 Buyer' },
      { id: foreignBuyerId, email: 't21-foreign@example.test', displayName: 'T21 Foreign' },
    ] });
    await prisma.purchase.create({ data: {
      id: purchaseId, buyerId, idempotencyKey: '00000000-0000-4000-8000-000000030011', requestDigest: 'a'.repeat(64), checkoutFingerprint: 'b'.repeat(64), sourceCartVersion: 1,
      addressSnapshot: { id: '00000000-0000-4000-8000-000000030012', recipientName: 'Buyer', phoneNumber: '0900000000', province: 'Hà Nội', district: 'Ba Đình', ward: 'Điện Biên', addressLine: '1 Test', label: null },
      listSubtotalMinor: 200_000n, productDiscountMinor: 0n, merchandiseSubtotalMinor: 200_000n, shippingTotalMinor: 0n, shopVoucherDiscountMinor: 0n, platformVoucherDiscountMinor: 0n, merchandiseVoucherDiscountMinor: 0n, shippingVoucherDiscountMinor: 0n, voucherDiscountMinor: 0n, shippingPayableMinor: 0n, payableTotalMinor: 200_000n,
    } });
    await prisma.shopOrder.create({ data: {
      id: orderId, purchaseId, shopId: product.shop.id, status: 'DELIVERED', version: 3, shopSnapshot: product.shop,
      shippingSnapshot: { provider: 'MOCK', version: 'mock-v1', shopId: product.shop.id, originProvince: 'Hà Nội', destinationProvince: 'Hà Nội', zone: 'SAME_PROVINCE', shipmentWeightGrams: 200, service: 'STANDARD', estimatedDaysMin: 1, estimatedDaysMax: 2, baseFeeMinor: 0, zoneSurchargeMinor: 0, weightSurchargeMinor: 0, shippingFeeMinor: 0 },
      listSubtotalMinor: 200_000n, productDiscountMinor: 0n, merchandiseSubtotalMinor: 200_000n, shopVoucherDiscountMinor: 0n, platformVoucherDiscountMinor: 0n, merchandiseVoucherDiscountMinor: 0n, shippingVoucherDiscountMinor: 0n, voucherDiscountMinor: 0n, shippingPayableMinor: 0n, payableTotalMinor: 200_000n,
    } });
    const variant = product.variants[0]!;
    await prisma.orderLine.createMany({ data: lineIds.map((id, index) => ({
      id, orderId, sourceCartLineId: publicLineIds[index]!, productId: product.id, variantId: variant.id, productName: product.name, variantName: variant.name, variantSku: variant.sku,
      quantity: 1, unitWeightGrams: 100, shipmentWeightGrams: 100, listUnitPriceMinor: 100_000n, sellingUnitPriceMinor: 100_000n, listSubtotalMinor: 100_000n, productDiscountMinor: 0n, merchandiseSubtotalMinor: 100_000n, shopVoucherDiscountMinor: 0n, platformVoucherDiscountMinor: 0n, merchandiseVoucherDiscountMinor: 0n, payableMerchandiseMinor: 100_000n,
    })) });
  }

  const createReview = (lineId: string, key: string, body: Record<string, unknown>, bearer = buyerBearer) => request(app.getHttpServer()).post(`/api/v1/account/orders/${orderId}/lines/${lineId}/review`).set('Authorization', bearer).set('Origin', origin).set('Idempotency-Key', key).send(body);

  beforeAll(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 't21-review-media-'));
    process.env.REVIEW_MEDIA_ROOT = mediaRoot;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthTokenService).useValue({ verifyAccess(token: string) { if (token === 'valid.review.buyer') return { sub: buyerId, sid: keys[0] }; if (token === 'valid.review.foreign') return { sub: foreignBuyerId, sid: keys[1] }; throw new Error('invalid'); } })
      .overrideProvider(AuthService).useValue({ authenticateAccess: jest.fn(async (claims: { sub: string }) => ({ id: claims.sub, email: `${claims.sub}@example.test`, displayName: claims.sub === buyerId ? 'T21 Buyer' : 'T21 Foreign', status: 'active', roles: ['buyer'] })) })
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test' }));
    await app.init();
    prisma = app.get(PrismaService); reviews = app.get(ReviewsService); storage = app.get(ReviewMediaStorage);
    product = await prisma.product.findFirstOrThrow({ where: { status: 'ACTIVE', deletedAt: null, variants: { some: { status: 'ACTIVE', deletedAt: null } } }, select: { id: true, name: true, shop: { select: { id: true, slug: true, name: true } }, variants: { take: 1, where: { status: 'ACTIVE', deletedAt: null }, select: { id: true, sku: true, name: true } } } });
  });
  beforeEach(fixture);
  afterAll(async () => { if (prisma) await cleanup(); await app?.close(); if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true }); delete process.env.REVIEW_MEDIA_ROOT; });

  it('validates staging, ownership, expiry, atomic attachment, private staging, serving, and cleanup scope', async () => {
    await request(app.getHttpServer()).post('/api/v1/account/review-media').set('Authorization', buyerBearer).set('Origin', origin).attach('file', Buffer.from('not-an-image'), { filename: 'bad.png', contentType: 'image/png' }).expect(400);
    const staged = await request(app.getHttpServer()).post('/api/v1/account/review-media').set('Authorization', buyerBearer).set('Origin', origin).attach('file', png, { filename: 'review.png', contentType: 'image/png' }).expect(201);
    await request(app.getHttpServer()).get(`/api/v1/review-media/${staged.body.id}`).expect(404);
    const foreign = await prisma.reviewMedia.create({ data: { uploaderId: foreignBuyerId, storageKey: '00000000-0000-4000-8000-000000030020.png', mimeType: 'image/png', byteSize: 1, width: 1, height: 1, expiresAt: new Date(Date.now() + 60_000) } });
    await createReview(publicLineIds[0], keys[0], { rating: 5, mediaIds: [staged.body.id, foreign.id] }).expect(400);
    expect((await prisma.reviewMedia.findUniqueOrThrow({ where: { id: staged.body.id } })).state).toBe('STAGED');
    const expired = await prisma.reviewMedia.create({ data: { uploaderId: buyerId, storageKey: '00000000-0000-4000-8000-000000030021.png', mimeType: 'image/png', byteSize: 1, width: 1, height: 1, expiresAt: new Date(Date.now() - 60_000) } });
    await createReview(publicLineIds[0], keys[0], { rating: 5, mediaIds: [expired.id] }).expect(400);
    const created = await createReview(publicLineIds[0], keys[0], { rating: 5, text: '  Rất   tốt  ', mediaIds: [staged.body.id] }).expect(201);
    expect(JSON.stringify(created.body)).not.toMatch(/storage|uploader|expires/i);
    await request(app.getHttpServer()).get(`/api/v1/review-media/${staged.body.id}`).expect('Content-Type', /image\/png/).expect(200);
    const activeKey = await storage.write('image/png', png); const expiredKey = await storage.write('image/png', png);
    const active = await prisma.reviewMedia.create({ data: { uploaderId: buyerId, storageKey: activeKey, mimeType: 'image/png', byteSize: png.length, width: 1, height: 1, expiresAt: new Date(Date.now() + 60_000) } });
    const cleanupTarget = await prisma.reviewMedia.create({ data: { uploaderId: buyerId, storageKey: expiredKey, mimeType: 'image/png', byteSize: png.length, width: 1, height: 1, expiresAt: new Date(Date.now() - 60_000) } });
    await expect(reviews.cleanupExpired(storage)).resolves.toBe(2);
    expect(await prisma.reviewMedia.findUnique({ where: { id: cleanupTarget.id } })).toBeNull();
    expect(await prisma.reviewMedia.findUnique({ where: { id: active.id } })).not.toBeNull();
    expect((await prisma.reviewMedia.findUniqueOrThrow({ where: { id: staged.body.id } })).state).toBe('ATTACHED');
  });

  it('enforces eligibility, idempotency, privacy, concurrency versions, public filtering, and aggregates', async () => {
    await createReview(publicLineIds[0], keys[0], { rating: 5 }, foreignBearer).expect(404);
    const first = await createReview(publicLineIds[0], keys[0], { rating: 5, text: 'Tuyệt vời' }).expect('ETag', '"review-0"').expect(201);
    const replay = await createReview(publicLineIds[0], keys[0], { rating: 5, text: 'Tuyệt vời' }).expect(201);
    expect(replay.body.id).toBe(first.body.id);
    await createReview(publicLineIds[0], keys[0], { rating: 4 }).expect(409);
    await createReview(publicLineIds[0], '00000000-0000-4000-8000-000000030013', { rating: 5 }).expect(409);
    await request(app.getHttpServer()).get(`/api/v1/account/reviews/${first.body.id}`).set('Authorization', foreignBearer).expect(404);
    await createReview(publicLineIds[1], keys[1], { rating: 4, text: 'Hài lòng' }).expect(201);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: product.id }, select: { ratingCount: true, ratingAverageBasisPoints: true } })).toEqual({ ratingCount: 2, ratingAverageBasisPoints: 450 });
    const page = await request(app.getHttpServer()).get(`/api/v1/catalog/products/${product.id}/reviews?limit=1`).expect(200);
    expect(page.body.items).toHaveLength(1); expect(page.body.page.nextCursor).toEqual(expect.any(String)); expect(JSON.stringify(page.body)).not.toMatch(/email|phone|orderReference|storageKey/i);
    const filtered = await request(app.getHttpServer()).get(`/api/v1/catalog/products/${product.id}/reviews?rating=5`).expect(200);
    expect(filtered.body.items).toHaveLength(1); expect(filtered.body.items[0].rating).toBe(5);
    await request(app.getHttpServer()).patch(`/api/v1/account/reviews/${first.body.id}`).set('Authorization', buyerBearer).set('Origin', origin).set('If-Match', '"review-0"').send({ rating: 3, text: 'Đã sửa' }).expect('ETag', '"review-1"').expect(200);
    await request(app.getHttpServer()).patch(`/api/v1/account/reviews/${first.body.id}`).set('Authorization', buyerBearer).set('Origin', origin).set('If-Match', '"review-0"').send({ rating: 1 }).expect(409);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: product.id }, select: { ratingCount: true, ratingAverageBasisPoints: true } })).toEqual({ ratingCount: 2, ratingAverageBasisPoints: 350 });
    await prisma.productReview.update({ where: { id: first.body.id }, data: { visibility: 'HIDDEN' } });
    await prisma.product.update({ where: { id: product.id }, data: { ratingCount: 1, ratingAverageBasisPoints: 400 } });
    const hiddenPublic = await request(app.getHttpServer()).get(`/api/v1/catalog/products/${product.id}/reviews?rating=3`).expect(200);
    expect(hiddenPublic.body.items).toEqual([]);
    const hiddenAuthor = await request(app.getHttpServer()).get(`/api/v1/account/reviews/${first.body.id}`).set('Authorization', buyerBearer).expect(200);
    expect(hiddenAuthor.body.visibility).toBe('HIDDEN');
  });

  it('serializes racing writes and rolls back review, media, and aggregates together', async () => {
    const competingCreates = await Promise.all([
      createReview(publicLineIds[0], keys[0], { rating: 5 }),
      createReview(publicLineIds[0], '00000000-0000-4000-8000-000000030014', { rating: 4 }),
    ]);
    expect(competingCreates.map(({ status }) => status).sort()).toEqual([201, 409]);
    const review = await prisma.productReview.findFirstOrThrow({ where: { orderLineId: lineIds[0] } });
    const competingEdits = await Promise.all([
      request(app.getHttpServer()).patch(`/api/v1/account/reviews/${review.id}`).set('Authorization', buyerBearer).set('Origin', origin).set('If-Match', '"review-0"').send({ rating: 3 }),
      request(app.getHttpServer()).patch(`/api/v1/account/reviews/${review.id}`).set('Authorization', buyerBearer).set('Origin', origin).set('If-Match', '"review-0"').send({ rating: 2 }),
    ]);
    expect(competingEdits.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect((await prisma.productReview.findUniqueOrThrow({ where: { id: review.id } })).version).toBe(1);

    await fixture();
    const staged = await request(app.getHttpServer()).post('/api/v1/account/review-media').set('Authorization', buyerBearer).set('Origin', origin).attach('file', png, { filename: 'rollback.png', contentType: 'image/png' }).expect(201);
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_t21_shop_rating_update() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced aggregate failure'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_t21_shop_rating_update BEFORE UPDATE OF rating_count, rating_average_basis_points ON shops FOR EACH ROW EXECUTE FUNCTION fail_t21_shop_rating_update()`);
    try {
      await createReview(publicLineIds[0], keys[0], { rating: 5, mediaIds: [staged.body.id] }).expect(503);
      expect(await prisma.productReview.count({ where: { orderLineId: lineIds[0] } })).toBe(0);
      expect(await prisma.reviewMedia.findUniqueOrThrow({ where: { id: staged.body.id } })).toMatchObject({ state: 'STAGED', reviewId: null });
      expect(await prisma.product.findUniqueOrThrow({ where: { id: product.id }, select: { ratingCount: true, ratingAverageBasisPoints: true } })).toEqual({ ratingCount: 0, ratingAverageBasisPoints: 0 });
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_t21_shop_rating_update ON shops');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_t21_shop_rating_update()');
    }
  });
});
