import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthService } from '../src/auth/auth.service';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';
import { SystemReturnClock } from '../src/returns/return-clock';
import { ReturnEvidenceStorage } from '../src/returns/return-evidence.storage';
import { ReturnRepository } from '../src/returns/return-repository';
import { ReturnService } from '../src/returns/return.service';

const databaseTest = process.env.RUN_RETURNS_DATABASE_TESTS === '1' ? describe : describe.skip;

const buyerId = '00000000-0000-4000-8000-000000040001';
const foreignBuyerId = '00000000-0000-4000-8000-000000040002';
const adminId = '00000000-0000-4000-8000-000000040003';
const purchaseId = '00000000-0000-4000-8000-000000040004';
const orderId = '00000000-0000-4000-8000-000000040005';
const lineId = '00000000-0000-4000-8000-000000040006';
const publicLineId = '00000000-0000-4000-8000-000000040007';
const secondLineId = '00000000-0000-4000-8000-000000040008';
const secondPublicLineId = '00000000-0000-4000-8000-000000040009';
const keys = {
  create: '00000000-0000-4000-8000-000000040010',
  createConflict: '00000000-0000-4000-8000-000000040011',
  cancel: '00000000-0000-4000-8000-000000040012',
  accept: '00000000-0000-4000-8000-000000040013',
  ship: '00000000-0000-4000-8000-000000040014',
  receipt: '00000000-0000-4000-8000-000000040015',
  escalate: '00000000-0000-4000-8000-000000040016',
  admin: '00000000-0000-4000-8000-000000040017',
  raceA: '00000000-0000-4000-8000-000000040018',
  raceB: '00000000-0000-4000-8000-000000040019',
} as const;

const buyerBearer = 'Bearer valid.return.buyer';
const foreignBearer = 'Bearer valid.return.foreign';
const sellerBearer = 'Bearer valid.return.seller';
const foreignSellerBearer = 'Bearer valid.return.foreign.seller';
const adminBearer = 'Bearer valid.return.admin';
const origin = 'http://localhost:3000';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const description = 'Sản phẩm bị hư hỏng khi nhận hàng, cần trả lại';

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('returns HTTP and PostgreSQL lifecycle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let returns: ReturnService;
  let storage: ReturnEvidenceStorage;
  let repository: ReturnRepository;
  let mediaRoot = '';
  let sellerId = '';
  let foreignSellerId = '';
  let shopId = '';
  let product: {
    id: string;
    name: string;
    shop: { id: string; slug: string; name: string; ownerId: string };
    variants: Array<{ id: string; sku: string; name: string }>;
  };
  let clockNow = new Date('2026-08-20T00:00:00.000Z');
  const clock = { now: () => clockNow };

  async function cleanup(): Promise<void> {
    const returnIds = (
      await prisma.returnRequest.findMany({ where: { orderId }, select: { id: true } })
    ).map((row) => row.id);
    if (returnIds.length) {
      await prisma.privilegedAuditEvent.deleteMany({
        where: { OR: [{ targetId: { in: returnIds } }, { returnDecision: { returnRequestId: { in: returnIds } } }] },
      });
      await prisma.refundLedgerEntry.deleteMany({ where: { returnRequestId: { in: returnIds } } });
      await prisma.returnDecision.deleteMany({ where: { returnRequestId: { in: returnIds } } });
      await prisma.returnEvent.deleteMany({ where: { returnRequestId: { in: returnIds } } });
      await prisma.returnShipment.deleteMany({ where: { returnRequestId: { in: returnIds } } });
      await prisma.returnRequestItem.deleteMany({ where: { returnRequestId: { in: returnIds } } });
      await prisma.returnEvidenceAsset.deleteMany({ where: { returnRequestId: { in: returnIds } } });
      await prisma.returnRequest.deleteMany({ where: { id: { in: returnIds } } });
    }
    await prisma.returnEvidenceAsset.deleteMany({
      where: { uploaderId: { in: [buyerId, foreignBuyerId] } },
    });
    await prisma.orderTimelineEvent.deleteMany({ where: { orderId } });
    await prisma.orderLine.deleteMany({ where: { orderId } });
    await prisma.shopOrder.deleteMany({ where: { id: orderId } });
    await prisma.purchase.deleteMany({ where: { id: purchaseId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, foreignBuyerId, adminId] } } });
  }

  async function fixture(options?: { deliveredAt?: Date; quantity?: number; version?: number }): Promise<void> {
    await cleanup();
    clockNow = new Date('2026-08-20T00:00:00.000Z');
    const deliveredAt = options?.deliveredAt ?? new Date('2026-08-18T00:00:00.000Z');
    const quantity = options?.quantity ?? 2;
    const version = options?.version ?? 3;
    await prisma.user.createMany({
      data: [
        { id: buyerId, email: 't29-buyer@example.test', displayName: 'T29 Buyer' },
        { id: foreignBuyerId, email: 't29-foreign@example.test', displayName: 'T29 Foreign' },
        { id: adminId, email: 't29-admin@example.test', displayName: 'T29 Admin' },
      ],
    });
    await prisma.purchase.create({
      data: {
        id: purchaseId,
        buyerId,
        idempotencyKey: '00000000-0000-4000-8000-000000040020',
        requestDigest: 'a'.repeat(64),
        checkoutFingerprint: 'b'.repeat(64),
        sourceCartVersion: 1,
        addressSnapshot: {
          id: '00000000-0000-4000-8000-000000040021',
          recipientName: 'Buyer',
          phoneNumber: '0900000000',
          province: 'Hà Nội',
          district: 'Ba Đình',
          ward: 'Điện Biên',
          addressLine: '1 Test',
          label: null,
        },
        listSubtotalMinor: 200_000n,
        productDiscountMinor: 0n,
        merchandiseSubtotalMinor: 200_000n,
        shippingTotalMinor: 0n,
        shopVoucherDiscountMinor: 0n,
        platformVoucherDiscountMinor: 0n,
        merchandiseVoucherDiscountMinor: 0n,
        shippingVoucherDiscountMinor: 0n,
        voucherDiscountMinor: 0n,
        shippingPayableMinor: 0n,
        payableTotalMinor: 200_000n,
      },
    });
    await prisma.shopOrder.create({
      data: {
        id: orderId,
        purchaseId,
        shopId,
        status: 'DELIVERED',
        version,
        shopSnapshot: { id: product.shop.id, slug: product.shop.slug, name: product.shop.name },
        shippingSnapshot: {
          provider: 'MOCK',
          version: 'mock-v1',
          shopId,
          originProvince: 'Hà Nội',
          destinationProvince: 'Hà Nội',
          zone: 'SAME_PROVINCE',
          shipmentWeightGrams: 200,
          service: 'STANDARD',
          estimatedDaysMin: 1,
          estimatedDaysMax: 2,
          baseFeeMinor: 0,
          zoneSurchargeMinor: 0,
          weightSurchargeMinor: 0,
          shippingFeeMinor: 0,
        },
        listSubtotalMinor: 200_000n,
        productDiscountMinor: 0n,
        merchandiseSubtotalMinor: 200_000n,
        shopVoucherDiscountMinor: 0n,
        platformVoucherDiscountMinor: 0n,
        merchandiseVoucherDiscountMinor: 0n,
        shippingVoucherDiscountMinor: 0n,
        voucherDiscountMinor: 0n,
        shippingPayableMinor: 0n,
        payableTotalMinor: 200_000n,
      },
    });
    const variant = product.variants[0]!;
    const linePayable = 100_000n * BigInt(quantity);
    await prisma.orderLine.createMany({
      data: [
        {
          id: lineId,
          orderId,
          sourceCartLineId: publicLineId,
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          variantSku: variant.sku,
          quantity,
          unitWeightGrams: 100,
          shipmentWeightGrams: 100 * quantity,
          listUnitPriceMinor: 100_000n,
          sellingUnitPriceMinor: 100_000n,
          listSubtotalMinor: linePayable,
          productDiscountMinor: 0n,
          merchandiseSubtotalMinor: linePayable,
          shopVoucherDiscountMinor: 0n,
          platformVoucherDiscountMinor: 0n,
          merchandiseVoucherDiscountMinor: 0n,
          payableMerchandiseMinor: linePayable,
        },
        {
          id: secondLineId,
          orderId,
          sourceCartLineId: secondPublicLineId,
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          variantSku: variant.sku,
          quantity: 1,
          unitWeightGrams: 100,
          shipmentWeightGrams: 100,
          listUnitPriceMinor: 100_000n,
          sellingUnitPriceMinor: 100_000n,
          listSubtotalMinor: 100_000n,
          productDiscountMinor: 0n,
          merchandiseSubtotalMinor: 100_000n,
          shopVoucherDiscountMinor: 0n,
          platformVoucherDiscountMinor: 0n,
          merchandiseVoucherDiscountMinor: 0n,
          payableMerchandiseMinor: 100_000n,
        },
      ],
    });
    await prisma.orderTimelineEvent.createMany({
      data: [
        {
          id: '00000000-0000-4000-8000-000000040030',
          orderId,
          previousStatus: null,
          status: 'PENDING_CONFIRMATION',
          orderVersion: 0,
          actorType: 'SYSTEM',
          reasonCode: 'ORDER_CREATED',
          occurredAt: new Date(deliveredAt.getTime() - 3 * 86_400_000),
        },
        {
          id: '00000000-0000-4000-8000-000000040031',
          orderId,
          previousStatus: 'SHIPPING',
          status: 'DELIVERED',
          orderVersion: version,
          actorType: 'SYSTEM',
          reasonCode: 'DELIVERED',
          occurredAt: deliveredAt,
        },
      ],
    });
  }

  async function stageEvidence(bearer = buyerBearer): Promise<string> {
    const staged = await request(app.getHttpServer())
      .post('/api/v1/account/return-evidence')
      .set('Authorization', bearer)
      .set('Origin', origin)
      .attach('file', png, { filename: 'proof.png', contentType: 'image/png' })
      .expect(201);
    return staged.body.evidenceId as string;
  }

  async function createReturn(options?: {
    quantity?: number;
    key?: string;
    etag?: string;
    evidenceId?: string;
    status?: number;
  }) {
    const evidenceId = options?.evidenceId ?? (await stageEvidence());
    const req = request(app.getHttpServer())
      .post(`/api/v1/account/orders/${orderId}/returns`)
      .set('Authorization', buyerBearer)
      .set('Origin', origin)
      .set('If-Match', options?.etag ?? '"order-3"')
      .set('Idempotency-Key', options?.key ?? keys.create)
      .send({
        reasonCode: 'DAMAGED',
        description,
        items: [{ lineReference: publicLineId, quantity: options?.quantity ?? 1 }],
        evidenceIds: [evidenceId],
      });
    return options?.status === undefined ? req : req.expect(options.status);
  }

  beforeAll(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 't29-return-evidence-'));
    process.env.RETURN_EVIDENCE_ROOT = mediaRoot;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthTokenService)
      .useValue({
        verifyAccess(token: string) {
          if (token === 'valid.return.buyer') return { sub: buyerId, sid: keys.create };
          if (token === 'valid.return.foreign') return { sub: foreignBuyerId, sid: keys.cancel };
          if (token === 'valid.return.seller') return { sub: sellerId, sid: keys.accept };
          if (token === 'valid.return.foreign.seller')
            return { sub: foreignSellerId, sid: keys.escalate };
          if (token === 'valid.return.admin') return { sub: adminId, sid: keys.admin };
          throw new Error('invalid');
        },
      })
      .overrideProvider(AuthService)
      .useValue({
        authenticateAccess: jest.fn(async (claims: { sub: string }) => {
          const roles =
            claims.sub === adminId
              ? (['admin'] as const)
              : claims.sub === sellerId || claims.sub === foreignSellerId
                ? (['seller'] as const)
                : (['buyer'] as const);
          return {
            id: claims.sub,
            email: `${claims.sub}@example.test`,
            displayName: 'T29 Actor',
            status: 'active',
            roles: [...roles],
          };
        }),
      })
      .overrideProvider(SystemReturnClock)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test' }));
    await app.init();
    prisma = app.get(PrismaService);
    returns = app.get(ReturnService);
    storage = app.get(ReturnEvidenceStorage);
    repository = app.get(ReturnRepository);
    product = await prisma.product.findFirstOrThrow({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        shop: { status: 'ACTIVE', deletedAt: null, onboardingStatus: 'APPROVED' },
        variants: { some: { status: 'ACTIVE', deletedAt: null } },
      },
      select: {
        id: true,
        name: true,
        shop: { select: { id: true, slug: true, name: true, ownerId: true } },
        variants: {
          take: 1,
          where: { status: 'ACTIVE', deletedAt: null },
          select: { id: true, sku: true, name: true },
        },
      },
    });
    shopId = product.shop.id;
    sellerId = product.shop.ownerId;
    const otherShop = await prisma.shop.findFirstOrThrow({
      where: {
        id: { not: shopId },
        status: 'ACTIVE',
        deletedAt: null,
        onboardingStatus: 'APPROVED',
        ownerId: { not: sellerId },
      },
      select: { ownerId: true },
    });
    foreignSellerId = otherShop.ownerId;
  });

  beforeEach(async () => {
    await fixture();
  });

  afterAll(async () => {
    if (prisma) await cleanup();
    await app?.close();
    if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true });
    delete process.env.RETURN_EVIDENCE_ROOT;
  });

  it('stages private evidence, rejects spoofed MIME/traversal, and cleans expired orphans', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/account/return-evidence')
      .set('Authorization', buyerBearer)
      .set('Origin', origin)
      .attach('file', Buffer.from('spoof'), { filename: 'proof.png', contentType: 'image/png' })
      .expect(400);
    const staged = await stageEvidence();
    await request(app.getHttpServer())
      .get(`/api/v1/return-evidence/${staged}`)
      .set('Authorization', buyerBearer)
      .expect(404);
    const traversal = await request(app.getHttpServer())
      .get('/api/v1/return-evidence/../secret')
      .set('Authorization', buyerBearer);
    expect([400, 404]).toContain(traversal.status);
    const expiredKey = await storage.write('image/png', png);
    const expired = await prisma.returnEvidenceAsset.create({
      data: {
        uploaderId: buyerId,
        storageKey: expiredKey,
        mimeType: 'image/png',
        byteSize: png.length,
        width: 1,
        height: 1,
        state: 'STAGED',
        expiresAt: new Date(clockNow.getTime() - 1_000),
      },
    });
    const activeKey = await storage.write('image/png', png);
    const active = await prisma.returnEvidenceAsset.create({
      data: {
        uploaderId: buyerId,
        storageKey: activeKey,
        mimeType: 'image/png',
        byteSize: png.length,
        width: 1,
        height: 1,
        state: 'STAGED',
        expiresAt: new Date(clockNow.getTime() + 60_000),
      },
    });
    await expect(returns.cleanupExpiredEvidence(storage, 100)).resolves.toBeGreaterThanOrEqual(1);
    expect(await prisma.returnEvidenceAsset.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.returnEvidenceAsset.findUnique({ where: { id: active.id } })).not.toBeNull();
  });

  it('creates buyer returns with partial quantity, replay, isolation, cancel, and shipment', async () => {
    await request(app.getHttpServer()).get('/api/v1/account/returns').expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/account/orders/${orderId}/returns`)
      .set('Authorization', buyerBearer)
      .set('Origin', 'https://evil.example')
      .expect(403);

    const foreignEvidence = await stageEvidence(foreignBearer);
    await createReturn({ evidenceId: foreignEvidence, status: 409 });

    const evidenceId = await stageEvidence();
    const created = await createReturn({ quantity: 1, evidenceId, status: 201 });
    expect(created.headers['cache-control']).toBe('private, no-store');
    expect(created.body.return.refundAmountMinor).toBe(100_000);
    expect(created.body.return.lines[0]?.requestedQuantity).toBe(1);
    expect(JSON.stringify(created.body)).not.toMatch(/storageKey|internalNote/i);
    expect((await prisma.shopOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'RETURN_REQUESTED',
    );

    const replay = await createReturn({ quantity: 1, evidenceId, status: 201 });
    expect(replay.body.return.returnReference).toBe(created.body.return.returnReference);
    await createReturn({ quantity: 2, key: keys.create, evidenceId, status: 409 });
    await createReturn({
      quantity: 1,
      key: keys.createConflict,
      etag: '"order-3"',
      evidenceId: await stageEvidence(),
      status: 409,
    });

    await request(app.getHttpServer())
      .get(`/api/v1/account/returns/${created.body.return.returnReference}`)
      .set('Authorization', foreignBearer)
      .expect(404);
    const list = await request(app.getHttpServer())
      .get('/api/v1/account/returns?status=REQUESTED&limit=10')
      .set('Authorization', buyerBearer)
      .expect(200);
    expect(list.body.items).toHaveLength(1);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/account/returns/${created.body.return.returnReference}`)
      .set('Authorization', buyerBearer)
      .expect(200);
    await request(app.getHttpServer())
      .get(detail.body.return.evidence[0].url)
      .set('Authorization', buyerBearer)
      .expect('Content-Type', /image\/png/)
      .expect(200);
    await request(app.getHttpServer())
      .get(detail.body.return.evidence[0].url)
      .set('Authorization', foreignBearer)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/account/returns/${created.body.return.returnReference}/actions`)
      .set('Authorization', buyerBearer)
      .set('Origin', origin)
      .set('If-Match', '"return-0"')
      .set('Idempotency-Key', keys.cancel)
      .send({ action: 'CANCEL' })
      .expect(200);
    expect((await prisma.shopOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'DELIVERED',
    );
  });

  it('supports seller accept → buyer ship → seller receipt with unique refund ledger', async () => {
    const created = await createReturn({ quantity: 1, status: 201 });
    const returnReference = created.body.return.returnReference as string;

    await request(app.getHttpServer())
      .get('/api/v1/seller/returns')
      .set('Authorization', buyerBearer)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/seller/returns/${returnReference}`)
      .set('Authorization', foreignSellerBearer)
      .expect(404);
    const sellerQueue = await request(app.getHttpServer())
      .get('/api/v1/seller/returns?status=REQUESTED')
      .set('Authorization', sellerBearer)
      .expect(200);
    expect(sellerQueue.body.items).toHaveLength(1);
    expect(JSON.stringify(sellerQueue.body)).not.toMatch(/internalNote|storageKey|phoneNumber/i);

    const accepted = await request(app.getHttpServer())
      .post(`/api/v1/seller/returns/${returnReference}/actions`)
      .set('Authorization', sellerBearer)
      .set('Origin', origin)
      .set('If-Match', '"return-0"')
      .set('Idempotency-Key', keys.accept)
      .send({ action: 'ACCEPT_RETURN' })
      .expect(200);
    expect(accepted.body.return.status).toBe('AWAITING_RETURN');
    const acceptReplay = await request(app.getHttpServer())
      .post(`/api/v1/seller/returns/${returnReference}/actions`)
      .set('Authorization', sellerBearer)
      .set('Origin', origin)
      .set('If-Match', '"return-0"')
      .set('Idempotency-Key', keys.accept)
      .send({ action: 'ACCEPT_RETURN' })
      .expect(200);
    expect(acceptReplay.body.return.version).toBe(accepted.body.return.version);

    const shipped = await request(app.getHttpServer())
      .post(`/api/v1/account/returns/${returnReference}/actions`)
      .set('Authorization', buyerBearer)
      .set('Origin', origin)
      .set('If-Match', `"return-${accepted.body.return.version}"`)
      .set('Idempotency-Key', keys.ship)
      .send({ action: 'SUBMIT_SHIPMENT' })
      .expect(200);
    expect(shipped.body.return.status).toBe('IN_TRANSIT');
    expect(shipped.body.return.shipment?.trackingCode).toMatch(/^MOCK-/);

    const refunded = await request(app.getHttpServer())
      .post(`/api/v1/seller/returns/${returnReference}/actions`)
      .set('Authorization', sellerBearer)
      .set('Origin', origin)
      .set('If-Match', `"return-${shipped.body.return.version}"`)
      .set('Idempotency-Key', keys.receipt)
      .send({ action: 'CONFIRM_RECEIPT' })
      .expect(200);
    expect(refunded.body.return.status).toBe('REFUNDED');
    expect(refunded.body.return.refund?.kind).toBe('MOCK_CREDIT');
    expect(await prisma.refundLedgerEntry.count({ where: { returnRequestId: returnReference } })).toBe(
      1,
    );
    expect((await prisma.shopOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'REFUNDED',
    );
  });

  it('supports seller escalation, admin decisions, audit correlation, and note privacy', async () => {
    const created = await createReturn({ quantity: 1, status: 201 });
    const returnReference = created.body.return.returnReference as string;
    await request(app.getHttpServer())
      .post(`/api/v1/seller/returns/${returnReference}/actions`)
      .set('Authorization', sellerBearer)
      .set('Origin', origin)
      .set('If-Match', '"return-0"')
      .set('Idempotency-Key', keys.escalate)
      .send({
        action: 'REJECT_AND_ESCALATE',
        publicReason: 'Không đủ điều kiện đổi trả theo chính sách',
      })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/admin/returns')
      .set('Authorization', sellerBearer)
      .expect(403);
    const queue = await request(app.getHttpServer())
      .get(`/api/v1/admin/returns?status=ESCALATED&reference=${returnReference}`)
      .set('Authorization', adminBearer)
      .expect(200);
    expect(queue.body.items).toHaveLength(1);

    const adminDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/returns/${returnReference}`)
      .set('Authorization', adminBearer)
      .expect(200);
    expect(adminDetail.body.return).toHaveProperty('decisions');
    expect(JSON.stringify(adminDetail.body)).not.toMatch(/storageKey/i);

    const decided = await request(app.getHttpServer())
      .post(`/api/v1/admin/returns/${returnReference}/decisions`)
      .set('Authorization', adminBearer)
      .set('Origin', origin)
      .set('If-Match', `"return-${adminDetail.body.return.version}"`)
      .set('Idempotency-Key', keys.admin)
      .send({
        decision: 'APPROVE_REFUND',
        publicReason: 'Bằng chứng đủ để hoàn tiền cho người mua',
        internalNote: 'Ghi chú nội bộ chỉ dành cho admin',
      })
      .expect(200);
    expect(decided.body.return.status).toBe('REFUNDED');
    expect(decided.body.return.decisions[0]?.internalNote).toBe(
      'Ghi chú nội bộ chỉ dành cho admin',
    );

    const buyerView = await request(app.getHttpServer())
      .get(`/api/v1/account/returns/${returnReference}`)
      .set('Authorization', buyerBearer)
      .expect(200);
    expect(JSON.stringify(buyerView.body)).not.toMatch(/Ghi chú nội bộ|internalNote/i);

    const audits = await prisma.privilegedAuditEvent.findMany({
      where: { targetId: returnReference, targetType: 'RETURN_REQUEST' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0])).not.toMatch(/Ghi chú nội bộ|storageKey|description/i);
  });

  it('enforces eligibility boundaries, stale versions, races, and deadline processing', async () => {
    await fixture({ deliveredAt: new Date('2026-08-01T00:00:00.000Z') });
    await createReturn({ quantity: 1, status: 409 });

    await fixture();
    const created = await createReturn({ quantity: 1, status: 201 });
    const returnReference = created.body.return.returnReference as string;

    await request(app.getHttpServer())
      .post(`/api/v1/seller/returns/${returnReference}/actions`)
      .set('Authorization', sellerBearer)
      .set('Origin', origin)
      .set('If-Match', '"return-99"')
      .set('Idempotency-Key', keys.raceA)
      .send({ action: 'ACCEPT_RETURN' })
      .expect(409);

    const racing = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/seller/returns/${returnReference}/actions`)
        .set('Authorization', sellerBearer)
        .set('Origin', origin)
        .set('If-Match', '"return-0"')
        .set('Idempotency-Key', keys.raceA)
        .send({ action: 'ACCEPT_RETURN' }),
      request(app.getHttpServer())
        .post(`/api/v1/seller/returns/${returnReference}/actions`)
        .set('Authorization', sellerBearer)
        .set('Origin', origin)
        .set('If-Match', '"return-0"')
        .set('Idempotency-Key', keys.raceB)
        .send({
          action: 'REJECT_AND_ESCALATE',
          publicReason: 'Từ chối vì hàng không đủ điều kiện',
        }),
    ]);
    expect(racing.map((item) => item.status).sort()).toEqual([200, 409]);

    await fixture();
    const second = await createReturn({ quantity: 1, status: 201 });
    const secondRef = second.body.return.returnReference as string;
    clockNow = new Date('2026-08-25T00:00:00.000Z');
    await expect(returns.processDeadlines(10)).resolves.toBeGreaterThanOrEqual(1);
    const escalated = await prisma.returnRequest.findUniqueOrThrow({ where: { id: secondRef } });
    expect(escalated.status).toBe('ESCALATED');

    const graphs = await repository.listBuyer(
      buyerId,
      {
        status: 'ESCALATED',
        deadline: 'ALL',
        from: null,
        to: null,
        reference: null,
        limit: 10,
        cursor: null,
      },
      null,
      clockNow,
    );
    expect(graphs.every((item) => item.buyerId === buyerId)).toBe(true);
    const foreignGraphs = await repository.listBuyer(
      foreignBuyerId,
      {
        status: 'ALL',
        deadline: 'ALL',
        from: null,
        to: null,
        reference: null,
        limit: 10,
        cursor: null,
      },
      null,
      clockNow,
    );
    expect(foreignGraphs).toHaveLength(0);
  });
});
