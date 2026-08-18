import { isBuyerOrderDetailResponse, isBuyerOrderListResponse } from '@shopee-clone/contracts';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthService } from '../src/auth/auth.service';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { configureApplication } from '../src/configure-application';
import {
  ProductStatus,
  ShopStatus,
  UserStatus,
  VariantStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrderLifecycleService } from '../src/order-history/order-lifecycle.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';

const databaseTest = process.env.RUN_CART_DATABASE_TESTS === '1' ? describe : describe.skip;
const buyerId = '00000000-0000-4000-8000-000000020001';
const foreignBuyerId = '00000000-0000-4000-8000-000000020002';
const purchaseId = '00000000-0000-4000-8000-000000020003';
const firstOrderId = '00000000-0000-4000-8000-000000020004';
const secondOrderId = '00000000-0000-4000-8000-000000020005';
const cancelKey = '00000000-0000-4000-8000-000000020006';
const buyerBearer = 'Bearer valid.order.buyer';
const foreignBearer = 'Bearer valid.order.foreign';

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('buyer order history HTTP with PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lifecycle: OrderLifecycleService;
  let products: Array<{
    id: string;
    name: string;
    shop: { id: string; slug: string; name: string };
    variants: Array<{ id: string; sku: string; name: string }>;
  }>;

  async function cleanup(): Promise<void> {
    await prisma.orderTimelineEvent.deleteMany({ where: { order: { purchaseId } } });
    await prisma.orderLine.deleteMany({ where: { order: { purchaseId } } });
    await prisma.shopOrder.deleteMany({ where: { purchaseId } });
    await prisma.purchase.deleteMany({ where: { id: purchaseId } });
  }

  async function createFixture(): Promise<void> {
    await cleanup();
    const createdAt = new Date('2026-08-14T03:00:00.000Z');
    await prisma.purchase.create({
      data: {
        id: purchaseId,
        buyerId,
        idempotencyKey: '00000000-0000-4000-8000-000000020007',
        requestDigest: 'a'.repeat(64),
        checkoutFingerprint: 'b'.repeat(64),
        sourceCartVersion: 1,
        addressSnapshot: {
          id: '00000000-0000-4000-8000-000000020008',
          recipientName: 'T20 Buyer',
          phoneNumber: '0900000000',
          province: 'Thành phố Hồ Chí Minh',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          addressLine: '1 Nguyễn Huệ',
          label: 'Nhà riêng',
        },
        listSubtotalMinor: 200_000n,
        productDiscountMinor: 0n,
        merchandiseSubtotalMinor: 200_000n,
        shippingTotalMinor: 40_000n,
        shopVoucherDiscountMinor: 0n,
        platformVoucherDiscountMinor: 0n,
        merchandiseVoucherDiscountMinor: 0n,
        shippingVoucherDiscountMinor: 0n,
        voucherDiscountMinor: 0n,
        shippingPayableMinor: 40_000n,
        payableTotalMinor: 240_000n,
        createdAt,
        updatedAt: createdAt,
      },
    });
    for (const [index, orderId] of [firstOrderId, secondOrderId].entries()) {
      const product = products[index]!;
      const variant = product.variants[0]!;
      const status = index === 0 ? 'PENDING_CONFIRMATION' : 'SHIPPING';
      const version = index === 0 ? 0 : 2;
      const orderCreatedAt = new Date(createdAt.getTime() + index * 1_000);
      await prisma.shopOrder.create({
        data: {
          id: orderId,
          purchaseId,
          shopId: product.shop.id,
          status,
          version,
          shopSnapshot: product.shop,
          shippingSnapshot: {
            provider: 'MOCK',
            version: 'mock-v1',
            shopId: product.shop.id,
            originProvince: index === 0 ? 'Hà Nội' : 'Đà Nẵng',
            destinationProvince: 'Thành phố Hồ Chí Minh',
            zone: 'CROSS_REGION',
            shipmentWeightGrams: 100,
            service: 'STANDARD',
            estimatedDaysMin: 2,
            estimatedDaysMax: 4,
            baseFeeMinor: 20_000,
            zoneSurchargeMinor: 0,
            weightSurchargeMinor: 0,
            shippingFeeMinor: 20_000,
          },
          listSubtotalMinor: 100_000n,
          productDiscountMinor: 0n,
          merchandiseSubtotalMinor: 100_000n,
          shopVoucherDiscountMinor: 0n,
          platformVoucherDiscountMinor: 0n,
          merchandiseVoucherDiscountMinor: 0n,
          shippingVoucherDiscountMinor: 0n,
          voucherDiscountMinor: 0n,
          shippingPayableMinor: 20_000n,
          payableTotalMinor: 120_000n,
          createdAt: orderCreatedAt,
          updatedAt: orderCreatedAt,
        },
      });
      await prisma.orderLine.create({
        data: {
          id: `00000000-0000-4000-8000-00000002001${index}`,
          orderId,
          sourceCartLineId: `00000000-0000-4000-8000-00000002002${index}`,
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
          createdAt: orderCreatedAt,
        },
      });
      await prisma.orderTimelineEvent.create({
        data: {
          id: `00000000-0000-4000-8000-00000002003${index}`,
          orderId,
          previousStatus: null,
          status: 'PENDING_CONFIRMATION',
          orderVersion: 0,
          actorType: 'SYSTEM',
          reasonCode: 'ORDER_CREATED',
          occurredAt: orderCreatedAt,
        },
      });
      if (index === 1) {
        await prisma.orderTimelineEvent.createMany({
          data: [
            {
              id: '00000000-0000-4000-8000-000000020040',
              orderId,
              previousStatus: 'PENDING_CONFIRMATION',
              status: 'AWAITING_PICKUP',
              orderVersion: 1,
              actorType: 'SELLER',
              actorUserId: foreignBuyerId,
              reasonCode: 'SELLER_CONFIRMED',
              occurredAt: new Date(orderCreatedAt.getTime() + 1_000),
            },
            {
              id: '00000000-0000-4000-8000-000000020041',
              orderId,
              previousStatus: 'AWAITING_PICKUP',
              status: 'SHIPPING',
              orderVersion: 2,
              actorType: 'SELLER',
              actorUserId: foreignBuyerId,
              reasonCode: 'HANDED_TO_CARRIER',
              occurredAt: new Date(orderCreatedAt.getTime() + 2_000),
            },
          ],
        });
      }
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthTokenService)
      .useValue({
        verifyAccess(token: string) {
          if (token === 'valid.order.buyer')
            return { sub: buyerId, sid: '00000000-0000-4000-8000-000000020050' };
          if (token === 'valid.order.foreign')
            return { sub: foreignBuyerId, sid: '00000000-0000-4000-8000-000000020051' };
          throw new Error('invalid token');
        },
      })
      .overrideProvider(AuthService)
      .useValue({
        authenticateAccess: jest.fn(async (claims: { sub: string }) => ({
          id: claims.sub,
          email: `${claims.sub}@example.test`,
          displayName: 'T20 Buyer',
          status: 'active',
          roles: ['buyer'],
        })),
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test' }));
    await app.init();
    prisma = app.get(PrismaService);
    lifecycle = app.get(OrderLifecycleService);
    await cleanup();
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, foreignBuyerId] } } });
    await prisma.user.createMany({
      data: [
        {
          id: buyerId,
          email: 't20-buyer@example.test',
          displayName: 'T20 Buyer',
          status: UserStatus.ACTIVE,
        },
        {
          id: foreignBuyerId,
          email: 't20-actor@example.test',
          displayName: 'T20 Actor',
          status: UserStatus.ACTIVE,
        },
      ],
    });
    const candidates = await prisma.product.findMany({
      take: 100,
      where: {
        status: ProductStatus.ACTIVE,
        deletedAt: null,
        shop: { status: ShopStatus.ACTIVE, deletedAt: null },
        variants: { some: { status: VariantStatus.ACTIVE, deletedAt: null } },
      },
      select: {
        id: true,
        name: true,
        shop: { select: { id: true, slug: true, name: true } },
        variants: {
          take: 1,
          where: { status: VariantStatus.ACTIVE, deletedAt: null },
          select: { id: true, sku: true, name: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    const first = candidates[0];
    const second = candidates.find((candidate) => candidate.shop.id !== first?.shop.id);
    if (!first || !second) throw new Error('T20 requires active products from two shops.');
    products = [first, second];
  });

  beforeEach(createFixture);

  afterAll(async () => {
    if (prisma) {
      await cleanup();
      await prisma.user.deleteMany({ where: { id: { in: [buyerId, foreignBuyerId] } } });
    }
    await app?.close();
  });

  it('lists owned orders with filters, stable cursor, detail, and non-enumerating ownership', async () => {
    const listed = await request(app.getHttpServer())
      .get('/api/v1/account/orders?limit=1')
      .set('Authorization', buyerBearer)
      .expect(200);
    expect(isBuyerOrderListResponse(listed.body)).toBe(true);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.page.nextCursor).toEqual(expect.any(String));
    const secondPage = await request(app.getHttpServer())
      .get(`/api/v1/account/orders?limit=1&cursor=${listed.body.page.nextCursor}`)
      .set('Authorization', buyerBearer)
      .expect(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items[0].orderReference).not.toBe(listed.body.items[0].orderReference);

    const shipping = await request(app.getHttpServer())
      .get('/api/v1/account/orders?filter=SHIPPING')
      .set('Authorization', buyerBearer)
      .expect(200);
    expect(shipping.body.items).toHaveLength(1);
    expect(shipping.body.items[0].status).toBe('SHIPPING');
    await request(app.getHttpServer())
      .get(`/api/v1/account/orders?filter=SHIPPING&cursor=${listed.body.page.nextCursor}`)
      .set('Authorization', buyerBearer)
      .expect(400);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/account/orders/${secondOrderId}`)
      .set('Authorization', buyerBearer)
      .expect('ETag', '"order-2"')
      .expect(200);
    expect(isBuyerOrderDetailResponse(detail.body)).toBe(true);
    expect(detail.body.timeline).toHaveLength(3);
    expect(detail.body.order.purchaseReference).toBe(purchaseId);
    await prisma.product.update({ where: { id: products[1]!.id }, data: { deletedAt: new Date() } });
    try {
      const deletedDetail = await request(app.getHttpServer())
        .get(`/api/v1/account/orders/${secondOrderId}`)
        .set('Authorization', buyerBearer)
        .expect(200);
      expect(deletedDetail.body.order.lines[0]).toMatchObject({
        productId: products[1]!.id,
        productAvailable: false,
      });
    } finally {
      await prisma.product.update({ where: { id: products[1]!.id }, data: { deletedAt: null } });
    }
    await request(app.getHttpServer())
      .get(`/api/v1/account/orders/${secondOrderId}`)
      .set('Authorization', foreignBearer)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/account/orders/00000000-0000-4000-8000-000000029999')
      .set('Authorization', buyerBearer)
      .expect(404);
  });

  it('cancels pending orders atomically and replays without a duplicate event', async () => {
    const cancel = () =>
      request(app.getHttpServer())
        .post(`/api/v1/account/orders/${firstOrderId}/cancel`)
        .set('Authorization', buyerBearer)
        .set('Origin', 'http://localhost:3000')
        .set('If-Match', '"order-0"')
        .set('Idempotency-Key', cancelKey)
        .send({ reasonCode: 'CHANGE_ADDRESS', reasonNote: '  Đổi   địa chỉ  ' });
    const first = await cancel().expect('ETag', '"order-1"').expect(200);
    expect(isBuyerOrderDetailResponse(first.body)).toBe(true);
    expect(first.body.order).toMatchObject({
      status: 'CANCELLED',
      version: 1,
      cancellation: { allowed: false },
    });
    expect(first.body.timeline).toHaveLength(2);
    const replay = await cancel().expect(200);
    expect(replay.body).toEqual(first.body);
    expect(await prisma.orderTimelineEvent.count({ where: { orderId: firstOrderId } })).toBe(2);
    await request(app.getHttpServer())
      .post(`/api/v1/account/orders/${firstOrderId}/cancel`)
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"order-0"')
      .set('Idempotency-Key', cancelKey)
      .send({ reasonCode: 'CHANGE_PRODUCT' })
      .expect(409);
  });

  it('rejects auth, untrusted Origin, stale version, foreign ownership, and non-cancellable states', async () => {
    await request(app.getHttpServer()).get('/api/v1/account/orders').expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/account/orders/${firstOrderId}/cancel`)
      .set('Authorization', buyerBearer)
      .set('Origin', 'https://evil.example')
      .set('If-Match', '"order-0"')
      .set('Idempotency-Key', cancelKey)
      .send({ reasonCode: 'CHANGE_ADDRESS' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/account/orders/${firstOrderId}/cancel`)
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"order-3"')
      .set('Idempotency-Key', cancelKey)
      .send({ reasonCode: 'CHANGE_ADDRESS' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/account/orders/${firstOrderId}/cancel`)
      .set('Authorization', foreignBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"order-0"')
      .set('Idempotency-Key', cancelKey)
      .send({ reasonCode: 'CHANGE_ADDRESS' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/account/orders/${secondOrderId}/cancel`)
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"order-2"')
      .set('Idempotency-Key', cancelKey)
      .send({ reasonCode: 'CHANGE_ADDRESS' })
      .expect(409);
    expect(await prisma.orderTimelineEvent.count({ where: { orderId: firstOrderId } })).toBe(1);
  });

  it('serializes competing cancellation keys so exactly one transition commits', async () => {
    const cancel = (key: string, reasonCode: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/account/orders/${firstOrderId}/cancel`)
        .set('Authorization', buyerBearer)
        .set('Origin', 'http://localhost:3000')
        .set('If-Match', '"order-0"')
        .set('Idempotency-Key', key)
        .send({ reasonCode });
    const responses = await Promise.all([
      cancel('00000000-0000-4000-8000-000000020060', 'CHANGE_ADDRESS'),
      cancel('00000000-0000-4000-8000-000000020061', 'CHANGE_PRODUCT'),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(
      await prisma.shopOrder.findUniqueOrThrow({
        where: { id: firstOrderId },
        select: { status: true, version: true },
      }),
    ).toEqual({ status: 'CANCELLED', version: 1 });
    expect(await prisma.orderTimelineEvent.count({ where: { orderId: firstOrderId } })).toBe(2);
  });

  it('rolls back the status update when audit-event persistence fails', async () => {
    await expect(
      prisma.$transaction((transaction) =>
        lifecycle.transition(transaction, {
          orderId: firstOrderId,
          currentStatus: 'PENDING_CONFIRMATION',
          targetStatus: 'CANCELLED',
          expectedVersion: 0,
          actorType: 'BUYER',
          actorUserId: buyerId,
          reasonCode: 'invalid reason code',
          reasonNote: null,
        }),
      ),
    ).rejects.toThrow();
    expect(
      await prisma.shopOrder.findUniqueOrThrow({
        where: { id: firstOrderId },
        select: { status: true, version: true },
      }),
    ).toEqual({ status: 'PENDING_CONFIRMATION', version: 0 });
    expect(await prisma.orderTimelineEvent.count({ where: { orderId: firstOrderId } })).toBe(1);
  });
});
