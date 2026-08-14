import {
  isCheckoutConfirmationResponse,
  isCheckoutPreviewResponse,
  isPurchaseResult,
} from '@shopee-clone/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthService } from '../src/auth/auth.service';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { configureApplication } from '../src/configure-application';
import {
  ProductStatus,
  ShopStatus,
  UserStatus,
  VariantStatus,
  VoucherBenefitType,
  VoucherIssuer,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrderWriter } from '../src/checkout/order-writer';

const databaseTest = process.env.RUN_CART_DATABASE_TESTS === '1' ? describe : describe.skip;
const buyerId = '00000000-0000-4000-8000-000000009950';
const foreignBuyerId = '00000000-0000-4000-8000-000000009951';
const addressId = '00000000-0000-4000-8000-000000009952';
const foreignAddressId = '00000000-0000-4000-8000-000000009953';
const cartId = '00000000-0000-4000-8000-000000009954';
const firstLineId = '00000000-0000-4000-8000-000000009955';
const secondLineId = '00000000-0000-4000-8000-000000009956';
const voucherId = '00000000-0000-4000-8000-000000009957';
const voucherCode = 'T19-PLATFORM-10K';
const idempotencyKey = '00000000-0000-4000-8000-000000009958';
const buyerBearer = 'Bearer valid.checkout.buyer';
const foreignBearer = 'Bearer valid.checkout.foreign';

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('authenticated COD checkout HTTP with PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orderWriter: OrderWriter;
  let variants: {
    id: string;
    priceMinor: bigint;
    product: { shop: { id: string } };
  }[];

  async function cleanupPurchases(): Promise<void> {
    const purchases = await prisma.purchase.findMany({
      where: { buyerId: { in: [buyerId, foreignBuyerId] } },
      select: { id: true },
    });
    const purchaseIds = purchases.map(({ id }) => id);
    if (purchaseIds.length > 0) {
      await prisma.purchaseVoucherAllocation.deleteMany({
        where: { purchaseVoucher: { purchaseId: { in: purchaseIds } } },
      });
      await prisma.purchaseVoucher.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
      await prisma.voucherRedemption.deleteMany({
        where: { consumption: { purchaseReference: { in: purchaseIds } } },
      });
      await prisma.voucherConsumption.deleteMany({
        where: { purchaseReference: { in: purchaseIds } },
      });
      await prisma.orderLine.deleteMany({
        where: { order: { purchaseId: { in: purchaseIds } } },
      });
      await prisma.shopOrder.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
      await prisma.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
    }
  }

  async function resetCart(): Promise<void> {
    await cleanupPurchases();
    await prisma.voucherUserUsage.deleteMany({ where: { voucherId, userId: buyerId } });
    await prisma.voucher.update({
      where: { id: voucherId },
      data: { usedCount: 0, endsAt: new Date('2999-01-01T00:00:00.000Z') },
    });
    await prisma.cartLine.deleteMany({ where: { cartId } });
    await prisma.cart.deleteMany({ where: { id: cartId } });
    await prisma.cart.create({
      data: {
        id: cartId,
        userId: buyerId,
        version: 2,
        lines: {
          create: [
            {
              id: firstLineId,
              variantId: variants[0]!.id,
              quantity: 1,
              isSelected: true,
              lastObservedUnitPriceMinor: variants[0]!.priceMinor,
            },
            {
              id: secondLineId,
              variantId: variants[1]!.id,
              quantity: 1,
              isSelected: true,
              lastObservedUnitPriceMinor: variants[1]!.priceMinor,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthTokenService)
      .useValue({
        verifyAccess(token: string) {
          if (token === 'valid.checkout.buyer') return { sub: buyerId, sid: cartId };
          if (token === 'valid.checkout.foreign') return { sub: foreignBuyerId, sid: cartId };
          throw new Error('invalid token');
        },
      })
      .overrideProvider(AuthService)
      .useValue({
        authenticateAccess: jest.fn(async (claims: { sub: string }) => ({
          id: claims.sub,
          email: `${claims.sub}@example.test`,
          displayName: 'Checkout Buyer',
          status: 'active',
          roles: ['buyer'],
        })),
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test' }));
    await app.init();
    prisma = app.get(PrismaService);
    orderWriter = app.get(OrderWriter);

    await cleanupPurchases();
    await prisma.shippingAddress.deleteMany({
      where: { id: { in: [addressId, foreignAddressId] } },
    });
    await prisma.cart.deleteMany({ where: { id: cartId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, foreignBuyerId] } } });
    await prisma.user.createMany({
      data: [
        {
          id: buyerId,
          email: 't19-buyer@example.test',
          displayName: 'T19 Buyer',
          status: UserStatus.ACTIVE,
        },
        {
          id: foreignBuyerId,
          email: 't19-foreign@example.test',
          displayName: 'T19 Foreign',
          status: UserStatus.ACTIVE,
        },
      ],
    });
    await prisma.shippingAddress.createMany({
      data: [
        {
          id: addressId,
          userId: buyerId,
          recipientName: 'T19 Buyer',
          phoneNumber: '0900000000',
          province: 'Thành phố Hồ Chí Minh',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          addressLine: '1 Nguyễn Huệ',
          isDefault: true,
        },
        {
          id: foreignAddressId,
          userId: foreignBuyerId,
          recipientName: 'Foreign Buyer',
          phoneNumber: '0910000000',
          province: 'Hà Nội',
          district: 'Ba Đình',
          ward: 'Phúc Xá',
          addressLine: '1 Hồng Hà',
          isDefault: true,
        },
      ],
    });
    const candidates = await prisma.productVariant.findMany({
      take: 100,
      orderBy: { id: 'asc' },
      where: {
        status: VariantStatus.ACTIVE,
        deletedAt: null,
        inventory: { quantityOnHand: { gt: 0 } },
        product: {
          status: ProductStatus.ACTIVE,
          deletedAt: null,
          category: { isActive: true, deletedAt: null },
          shop: { status: ShopStatus.ACTIVE, deletedAt: null },
        },
      },
      select: {
        id: true,
        priceMinor: true,
        product: { select: { shop: { select: { id: true } } } },
      },
    });
    const first = candidates[0];
    const second = candidates.find(
      (candidate) => candidate.product.shop.id !== first?.product.shop.id,
    );
    if (!first || !second) throw new Error('T19 requires products from two active shops.');
    variants = [first, second];
    await prisma.voucherUserUsage.deleteMany({ where: { voucherId } });
    await prisma.voucher.deleteMany({ where: { id: voucherId } });
    await prisma.voucher.create({
      data: {
        id: voucherId,
        code: voucherCode,
        name: 'T19 platform 10K',
        issuer: VoucherIssuer.PLATFORM,
        benefitType: VoucherBenefitType.FIXED_AMOUNT,
        fixedAmountMinor: 10_000n,
        minimumSpendMinor: 0n,
        startsAt: new Date('2020-01-01T00:00:00.000Z'),
        endsAt: new Date('2999-01-01T00:00:00.000Z'),
        usageLimit: 100,
        perBuyerLimit: 10,
      },
    });
  });

  beforeEach(resetCart);

  afterAll(async () => {
    if (prisma) {
      await cleanupPurchases();
      await prisma.cartLine.deleteMany({ where: { cartId } });
      await prisma.cart.deleteMany({ where: { id: cartId } });
      await prisma.voucherUserUsage.deleteMany({ where: { voucherId } });
      await prisma.voucher.deleteMany({ where: { id: voucherId } });
      await prisma.shippingAddress.deleteMany({
        where: { id: { in: [addressId, foreignAddressId] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [buyerId, foreignBuyerId] } } });
    }
    await app?.close();
  });

  function previewBody() {
    return {
      shippingAddressId: addressId,
      services: variants.map((variant) => ({
        shopId: variant.product.shop.id,
        service: 'STANDARD',
      })),
      vouchers: { platformCode: voucherCode },
      notes: [{ shopId: variants[0]!.product.shop.id, note: '  Giao giờ hành chính  ' }],
    };
  }

  it('creates one atomic purchase with one order per shop and replays safely', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    expect(isCheckoutPreviewResponse(previewResponse.body)).toBe(true);
    expect(previewResponse.body).toMatchObject({ ready: true, cartVersion: 2 });

    const body = {
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint,
    };
    const created = await request(app.getHttpServer())
      .post('/api/v1/checkout/cod')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);
    expect(isCheckoutConfirmationResponse(created.body)).toBe(true);
    expect(created.body.replayed).toBe(false);
    expect(created.body.purchase.orders).toHaveLength(2);
    expect(
      created.body.purchase.orders.flatMap((order: { lines: unknown[] }) => order.lines),
    ).toHaveLength(2);
    expect(await prisma.purchase.count({ where: { buyerId } })).toBe(1);
    expect(await prisma.voucherConsumption.count({ where: { userId: buyerId } })).toBe(1);
    expect(
      await prisma.cart.findUniqueOrThrow({ where: { id: cartId }, select: { version: true } }),
    ).toEqual({ version: 3 });
    expect(await prisma.cartLine.count({ where: { cartId } })).toBe(0);

    const replayed = await request(app.getHttpServer())
      .post('/api/v1/checkout/cod')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(200);
    expect(replayed.body).toMatchObject({ replayed: true });
    expect(replayed.body.purchase.purchaseReference).toBe(created.body.purchase.purchaseReference);
    expect(await prisma.purchase.count({ where: { buyerId } })).toBe(1);
    expect(await prisma.voucherRedemption.count({ where: { userId: buyerId } })).toBe(1);
    const linkedVoucher = await prisma.purchaseVoucher.findFirstOrThrow({
      where: { purchaseId: created.body.purchase.purchaseReference },
      include: { redemption: true, allocations: true },
    });
    expect(linkedVoucher.redemption?.voucherId).toBe(linkedVoucher.voucherId);
    expect(linkedVoucher.allocations.length).toBeGreaterThan(0);

    const fetched = await request(app.getHttpServer())
      .get(`/api/v1/checkout/purchases/${created.body.purchase.purchaseReference}`)
      .set('Authorization', buyerBearer)
      .expect(200);
    expect(isPurchaseResult(fetched.body)).toBe(true);
    expect(fetched.body).toEqual(created.body.purchase);
    await request(app.getHttpServer())
      .get(`/api/v1/checkout/purchases/${created.body.purchase.purchaseReference}`)
      .set('Authorization', foreignBearer)
      .expect(404);
  });

  it('rejects auth, Origin, foreign address, stale cart, and different idempotent intent', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Origin', 'http://localhost:3000')
      .send(previewBody())
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'https://evil.example')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send({ ...previewBody(), shippingAddressId: foreignAddressId })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-1"')
      .send(previewBody())
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .send(previewBody())
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send({ ...previewBody(), payableTotalMinor: 1 })
      .expect(400);

    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const body = {
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint,
    };
    await request(app.getHttpServer())
      .post('/api/v1/checkout/cod')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/checkout/cod')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...body, notes: [] })
      .expect(409);
  });

  it('returns a blocked preview for an empty selection and no confirmable fingerprint', async () => {
    await prisma.cartLine.deleteMany({ where: { cartId } });
    const response = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send({ shippingAddressId: addressId, services: [] })
      .expect(200);
    expect(isCheckoutPreviewResponse(response.body)).toBe(true);
    expect(response.body).toMatchObject({ ready: false, checkoutFingerprint: null });
    expect(response.body.blockers).toEqual([expect.objectContaining({ code: 'EMPTY_SELECTION' })]);
  });

  it('retains unselected cart lines and blocks a voucher that expires after preview', async () => {
    await prisma.cartLine.update({ where: { id: secondLineId }, data: { isSelected: false } });
    const oneShopBody = {
      shippingAddressId: addressId,
      services: [{ shopId: variants[0]!.product.shop.id, service: 'STANDARD' }],
      vouchers: { platformCode: voucherCode },
    };
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(oneShopBody)
      .expect(200);
    await prisma.voucher.update({
      where: { id: voucherId },
      data: { endsAt: new Date('2020-01-02T00:00:00.000Z') },
    });
    await request(app.getHttpServer())
      .post('/api/v1/checkout/cod')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...oneShopBody, checkoutFingerprint: previewResponse.body.checkoutFingerprint })
      .expect(409);
    expect(await prisma.purchase.count({ where: { buyerId } })).toBe(0);
    expect(await prisma.cartLine.count({ where: { cartId } })).toBe(2);

    await prisma.voucher.update({
      where: { id: voucherId },
      data: { endsAt: new Date('2999-01-01T00:00:00.000Z') },
    });
    const currentPreview = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(oneShopBody)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/checkout/cod')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...oneShopBody, checkoutFingerprint: currentPreview.body.checkoutFingerprint })
      .expect(201);
    expect(await prisma.cartLine.findMany({ where: { cartId }, select: { id: true } })).toEqual([
      { id: secondLineId },
    ]);
  });

  it('rolls the complete graph back when the injectable writer fails', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const originalWrite = orderWriter.write.bind(orderWriter);
    const fault = jest.spyOn(orderWriter, 'write').mockImplementationOnce(async (...arguments_) => {
      await originalWrite(...arguments_);
      throw new Error('T19 forced rollback after purchase graph write');
    });
    await request(app.getHttpServer())
      .post('/api/v1/checkout/cod')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...previewBody(), checkoutFingerprint: previewResponse.body.checkoutFingerprint })
      .expect(503);
    fault.mockRestore();
    expect(await prisma.purchase.count({ where: { buyerId } })).toBe(0);
    expect(await prisma.voucherConsumption.count({ where: { userId: buyerId } })).toBe(0);
    expect(await prisma.cartLine.count({ where: { cartId } })).toBe(2);
    expect(await prisma.cart.findUniqueOrThrow({ where: { id: cartId } })).toMatchObject({
      version: 2,
    });
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: voucherId } })).usedCount).toBe(
      0,
    );
  });

  it('commits one graph for simultaneous equivalent idempotent requests', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = () =>
      request(app.getHttpServer())
        .post('/api/v1/checkout/cod')
        .set('Authorization', buyerBearer)
        .set('Origin', 'http://localhost:3000')
        .set('If-Match', '"cart-2"')
        .set('Idempotency-Key', idempotencyKey)
        .send({ ...previewBody(), checkoutFingerprint: previewResponse.body.checkoutFingerprint });
    const responses = await Promise.all([confirmation(), confirmation()]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
    expect(responses[0].body.purchase.purchaseReference).toBe(
      responses[1].body.purchase.purchaseReference,
    );
    expect(await prisma.purchase.count({ where: { buyerId } })).toBe(1);
    expect(await prisma.shopOrder.count({ where: { purchase: { buyerId } } })).toBe(2);
    expect(await prisma.orderLine.count({ where: { order: { purchase: { buyerId } } } })).toBe(2);
    expect(await prisma.voucherConsumption.count({ where: { userId: buyerId } })).toBe(1);
    expect(await prisma.voucherRedemption.count({ where: { userId: buyerId } })).toBe(1);
    expect(await prisma.cartLine.count({ where: { cartId } })).toBe(0);
  });
});
