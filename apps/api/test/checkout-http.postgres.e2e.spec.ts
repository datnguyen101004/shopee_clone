import {
  isCheckoutConfirmationResponse,
  isCheckoutPreviewResponse,
  isPurchaseResult,
  isOnlinePaymentCheckoutResponse,
  isPaymentStatusResponse,
  parseCheckoutConfirmationRequest,
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
import { CheckoutService } from '../src/checkout/checkout.service';
import { CheckoutUnavailableError } from '../src/checkout/checkout.errors';
import {
  FAKE_NOTIFICATION_SIGNATURE,
  FakePaymentProvider,
} from '../src/payments/fake-payment-provider';
import { OnlinePaymentService } from '../src/payments/online-payment.service';
import { PAYMENT_PROVIDER, VNPAY_PROVIDER } from '../src/payments/payment-provider.port';
import { VNPAY_CONFIG } from '../src/payments/vnpay.config';
import { ProviderTimeoutError } from '../src/payments/payment-result';
import { PaymentObservationService } from '../src/payments/payment-observation.service';
import { PaymentReconciliationService } from '../src/payments/payment-reconciliation.service';
import { RefundReconciliationService } from '../src/payments/refund-reconciliation.service';
import { InventoryService } from '../src/inventory/inventory.service';

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
  let checkoutService: CheckoutService;
  let inventoryService: InventoryService;
  let onlinePaymentService: OnlinePaymentService;
  let paymentObservationService: PaymentObservationService;
  let paymentReconciliationService: PaymentReconciliationService;
  let refundReconciliationService: RefundReconciliationService;
  const fakePaymentProvider = new FakePaymentProvider();
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
    const reservations = await prisma.inventoryReservation.findMany({
      where: {
        OR: [{ purchaseId: { in: purchaseIds } }, { buyerId: { in: [buyerId, foreignBuyerId] } }],
      },
      select: { id: true, status: true },
    });
    for (const reservation of reservations) {
      if (reservation.status === 'ACTIVE')
        await inventoryService.release(reservation.id, 'released', reservation.id);
    }
    if (reservations.length > 0) {
      const reservationIds = reservations.map(({ id }) => id);
      await prisma.inventoryReservationLine.deleteMany({
        where: { reservationId: { in: reservationIds } },
      });
      await prisma.inventoryReservation.deleteMany({ where: { id: { in: reservationIds } } });
    }
    if (purchaseIds.length > 0) {
      await prisma.paymentRefund.deleteMany({
        where: { attempt: { purchaseId: { in: purchaseIds } } },
      });
      await prisma.paymentEvent.deleteMany({
        where: { attempt: { purchaseId: { in: purchaseIds } } },
      });
      await prisma.paymentAttempt.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
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
      await prisma.orderTimelineEvent.deleteMany({
        where: { order: { purchaseId: { in: purchaseIds } } },
      });
      await prisma.sellerOrderFulfillmentEvent.deleteMany({
        where: { fulfillment: { order: { purchaseId: { in: purchaseIds } } } },
      });
      await prisma.sellerOrderFulfillment.deleteMany({
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
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(fakePaymentProvider)
      .overrideProvider(VNPAY_CONFIG)
      .useValue({
        enabled: true,
        environment: 'SANDBOX',
        tmnCode: 'TEST_TMN',
        hashSecret: 'test-secret',
        payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
        returnUrl: 'http://localhost:3000/payment/callback',
        ipnUrl: 'https://payments.example.test/api/v1/payment-providers/vnpay/ipn',
        apiUrl: 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
        paymentTtlSeconds: 900,
        httpTimeoutMs: 30_000,
      })
      .overrideProvider(VNPAY_PROVIDER)
      .useValue(fakePaymentProvider)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test' }));
    await app.init();
    prisma = app.get(PrismaService);
    orderWriter = app.get(OrderWriter);
    checkoutService = app.get(CheckoutService);
    inventoryService = app.get(InventoryService);
    onlinePaymentService = app.get(OnlinePaymentService);
    paymentObservationService = app.get(PaymentObservationService);
    paymentReconciliationService = app.get(PaymentReconciliationService);
    refundReconciliationService = app.get(RefundReconciliationService);

    await cleanupPurchases();
    await prisma.shippingAddress.deleteMany({
      where: { id: { in: [addressId, foreignAddressId] } },
    });
    await prisma.cart.deleteMany({ where: { id: cartId } });
    await prisma.voucherUserUsage.deleteMany({
      where: { userId: { in: [buyerId, foreignBuyerId] } },
    });
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
  afterEach(() => {
    jest.restoreAllMocks();
    fakePaymentProvider.createCalls.length = 0;
    fakePaymentProvider.queryCalls.length = 0;
    fakePaymentProvider.refundCalls.length = 0;
    fakePaymentProvider.refundQueryCalls.length = 0;
  });

  afterAll(async () => {
    if (prisma) {
      await cleanupPurchases();
      await prisma.cartLine.deleteMany({ where: { cartId } });
      await prisma.cart.deleteMany({ where: { id: cartId } });
      await prisma.voucherUserUsage.deleteMany({
        where: { userId: { in: [buyerId, foreignBuyerId] } },
      });
      await prisma.voucher.deleteMany({ where: { id: voucherId } });
      await prisma.shippingAddress.deleteMany({
        where: { id: { in: [addressId, foreignAddressId] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [buyerId, foreignBuyerId] } } });
    }
    await app?.close();
  }, 30_000);

  function previewBody() {
    return {
      shippingAddressId: addressId,
      services: variants.map((variant) => ({
        shopId: variant.product.shop.id,
        service: 'STANDARD' as const,
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
    expect(
      await prisma.orderTimelineEvent.count({ where: { order: { purchase: { buyerId } } } }),
    ).toBe(2);
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
    expect(await prisma.voucherRedemption.count({ where: { userId: buyerId } })).toBe(
      created.body.purchase.vouchers.filter(
        (voucher: { status: string }) => voucher.status === 'APPLIED',
      ).length,
    );
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

  it('creates and replays one pending MoMo intent while keeping inventory and voucher held', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');

    const created = await checkoutService.createMomoPendingIntent(
      buyerId,
      2,
      idempotencyKey,
      confirmation,
      600,
    );
    expect(created).toMatchObject({
      replayed: false,
      purchase: { paymentMethod: 'MOMO', paymentStatus: 'PENDING' },
      attempt: { amountMinor: BigInt(created.purchase.summary.payableTotalMinor) },
    });
    expect(created.purchase.orders.every(({ paymentStatus }) => paymentStatus === 'PENDING')).toBe(
      true,
    );
    expect(
      created.purchase.orders.every(({ inventoryHold }) => inventoryHold?.status === 'ACTIVE'),
    ).toBe(true);
    expect(
      await prisma.paymentAttempt.count({
        where: { purchaseId: created.purchase.purchaseReference },
      }),
    ).toBe(1);
    const paymentGraph = await prisma.purchase.findUniqueOrThrow({
      where: { id: created.purchase.purchaseReference },
      include: { paymentAttempts: true, orders: true },
    });
    expect(paymentGraph.paymentAttempts[0]?.amountMinor).toBe(paymentGraph.payableTotalMinor);
    expect(paymentGraph.orders.reduce((total, order) => total + order.payableTotalMinor, 0n)).toBe(
      paymentGraph.payableTotalMinor,
    );
    expect(await prisma.voucherConsumption.count({ where: { userId: buyerId } })).toBe(0);
    expect(await prisma.voucherRedemption.count({ where: { userId: buyerId } })).toBe(0);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: voucherId } })).usedCount).toBe(
      0,
    );
    expect(fakePaymentProvider.createCalls).toHaveLength(0);

    const replayed = await checkoutService.createMomoPendingIntent(
      buyerId,
      2,
      idempotencyKey,
      confirmation,
      600,
    );
    expect(replayed.replayed).toBe(true);
    expect(replayed.purchase.purchaseReference).toBe(created.purchase.purchaseReference);
    expect(replayed.attempt.id).toBe(created.attempt.id);
    expect(await prisma.purchase.count({ where: { buyerId } })).toBe(1);
    expect(await prisma.cartLine.count({ where: { cartId } })).toBe(0);
  });

  it('rolls back the entire MoMo intent before any provider call when order writing fails', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    jest.spyOn(orderWriter, 'write').mockRejectedValueOnce(new Error('forced write failure'));
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');

    await expect(
      checkoutService.createMomoPendingIntent(buyerId, 2, idempotencyKey, confirmation, 600),
    ).rejects.toBeInstanceOf(CheckoutUnavailableError);
    expect(await prisma.purchase.count({ where: { buyerId } })).toBe(0);
    expect(await prisma.paymentAttempt.count({ where: { purchase: { buyerId } } })).toBe(0);
    expect(await prisma.inventoryReservation.count({ where: { buyerId } })).toBe(0);
    expect(await prisma.cartLine.count({ where: { cartId } })).toBe(2);
    expect(fakePaymentProvider.createCalls).toHaveLength(0);
  });

  it('calls MoMo only after the pending purchase commits and returns transient instructions', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');

    const originalCreate = fakePaymentProvider.createPayment.bind(fakePaymentProvider);
    jest.spyOn(fakePaymentProvider, 'createPayment').mockImplementationOnce(async (command) => {
      expect(await prisma.purchase.count({ where: { buyerId } })).toBe(1);
      expect(
        await prisma.paymentAttempt.count({
          where: { orderId: command.orderId, status: 'PENDING' },
        }),
      ).toBe(1);
      return originalCreate(command);
    });

    const result = await onlinePaymentService.checkoutWithMomo(buyerId, 2, idempotencyKey, {
      ...confirmation,
      provider: 'MOMO',
    });

    expect(result).toMatchObject({
      replayed: false,
      purchase: { paymentMethod: 'MOMO', paymentStatus: 'PENDING' },
      payment: {
        provider: 'MOMO',
        status: 'PENDING',
        nextAction: 'OPEN_MOMO',
        instructions: {
          payUrl: expect.stringContaining('test-payment.momo.vn'),
          deeplink: expect.stringContaining('momo://'),
        },
      },
    });
    expect(fakePaymentProvider.createCalls).toHaveLength(1);
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { purchaseId: result.purchase.purchaseReference },
    });
    expect(attempt.createRequestedAt).not.toBeNull();
    expect(attempt.instructionsIssuedAt).not.toBeNull();
    expect(attempt.nextReconcileAt).toBeNull();
  });

  it('moves a timed-out MoMo create into reconciliation without issuing instructions', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');
    jest
      .spyOn(fakePaymentProvider, 'createPayment')
      .mockRejectedValueOnce(new ProviderTimeoutError('forced timeout'));

    const result = await onlinePaymentService.checkoutWithMomo(buyerId, 2, idempotencyKey, {
      ...confirmation,
      provider: 'MOMO',
    });

    expect(result).toMatchObject({
      purchase: { paymentStatus: 'PENDING_RECONCILIATION' },
      payment: {
        status: 'PENDING_RECONCILIATION',
        nextAction: 'WAIT',
        instructions: null,
      },
    });
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { purchaseId: result.purchase.purchaseReference },
    });
    expect(attempt).toMatchObject({
      status: 'PENDING_RECONCILIATION',
      lastResultClass: 'PROVIDER_TIMEOUT',
      instructionsIssuedAt: null,
    });
    expect(attempt.nextReconcileAt).not.toBeNull();
    expect(
      await prisma.shopOrder.count({
        where: {
          purchaseId: result.purchase.purchaseReference,
          paymentStatus: 'PENDING_RECONCILIATION',
        },
      }),
    ).toBe(2);
  });

  it('does not let a late create response downgrade an already paid purchase', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');
    const originalCreate = fakePaymentProvider.createPayment.bind(fakePaymentProvider);
    jest.spyOn(fakePaymentProvider, 'createPayment').mockImplementationOnce(async (command) => {
      const attempt = await prisma.paymentAttempt.findUniqueOrThrow({
        where: { provider_orderId: { provider: 'MOMO', orderId: command.orderId } },
      });
      await prisma.$transaction([
        prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: 'PAID', version: { increment: 1 } },
        }),
        prisma.purchase.update({
          where: { id: attempt.purchaseId },
          data: { paymentStatus: 'PAID' },
        }),
        prisma.shopOrder.updateMany({
          where: { purchaseId: attempt.purchaseId },
          data: { paymentStatus: 'PAID' },
        }),
      ]);
      return originalCreate(command);
    });

    const result = await onlinePaymentService.checkoutWithMomo(buyerId, 2, idempotencyKey, {
      ...confirmation,
      provider: 'MOMO',
    });

    expect(result).toMatchObject({
      purchase: { paymentStatus: 'PAID' },
      payment: { status: 'PAID', nextAction: 'DONE', instructions: null },
    });
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { purchaseId: result.purchase.purchaseReference },
    });
    expect(attempt.status).toBe('PAID');
    expect(attempt.instructionsIssuedAt).toBeNull();
  });

  it('reuses one purchase and stable merchant IDs for concurrent MoMo retries', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');
    const onlineRequest = { ...confirmation, provider: 'MOMO' as const };

    const results = await Promise.all([
      onlinePaymentService.checkoutWithMomo(buyerId, 2, idempotencyKey, onlineRequest),
      onlinePaymentService.checkoutWithMomo(buyerId, 2, idempotencyKey, onlineRequest),
    ]);

    expect(results.map(({ replayed }) => replayed).sort()).toEqual([false, true]);
    expect(new Set(results.map(({ purchase }) => purchase.purchaseReference)).size).toBe(1);
    expect(new Set(results.map(({ payment }) => payment.paymentReference)).size).toBe(1);
    expect(await prisma.purchase.count({ where: { buyerId } })).toBe(1);
    expect(await prisma.paymentAttempt.count({ where: { purchase: { buyerId } } })).toBe(1);
    expect(fakePaymentProvider.createCalls).toHaveLength(2);
    expect(new Set(fakePaymentProvider.createCalls.map(({ orderId }) => orderId)).size).toBe(1);
    expect(new Set(fakePaymentProvider.createCalls.map(({ requestId }) => requestId)).size).toBe(1);
    expect(
      new Set(fakePaymentProvider.createCalls.map(({ amountMinor }) => amountMinor)).size,
    ).toBe(1);
  });

  it('applies, deduplicates, and prevents regression for provider observations', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');
    const intent = await checkoutService.createMomoPendingIntent(
      buyerId,
      2,
      idempotencyKey,
      confirmation,
      600,
    );
    const paidObservation = {
      provider: 'MOMO' as const,
      environment: 'SANDBOX' as const,
      orderId: intent.attempt.orderId,
      requestId: intent.attempt.requestId,
      amountMinor: intent.attempt.amountMinor,
      currency: 'VND' as const,
      resultCode: 0,
      message: 'success',
      providerTransactionId: 8_000_001n,
      observedAt: new Date(),
    };

    const applied = await paymentObservationService.applyProviderObservation({
      source: 'IPN',
      observation: paidObservation,
      sanitizedMetadata: { resultCode: 0, transId: '8000001' },
    });
    expect(applied).toMatchObject({ decision: 'APPLIED', status: 'PAID', duplicate: false });
    const duplicate = await paymentObservationService.applyProviderObservation({
      source: 'IPN',
      observation: paidObservation,
      sanitizedMetadata: { resultCode: 0, transId: '8000001' },
    });
    expect(duplicate).toMatchObject({
      eventId: applied.eventId,
      decision: 'DUPLICATE',
      status: 'PAID',
      duplicate: true,
    });
    const stale = await paymentObservationService.applyProviderObservation({
      source: 'IPN',
      observation: { ...paidObservation, resultCode: 1000, observedAt: new Date() },
    });
    expect(stale).toMatchObject({ decision: 'IGNORED', status: 'PAID' });
    expect(await prisma.paymentEvent.count({ where: { attemptId: intent.attempt.id } })).toBe(2);
    expect(
      await prisma.shopOrder.count({
        where: { purchaseId: intent.purchase.purchaseReference, paymentStatus: 'PAID' },
      }),
    ).toBe(2);
    expect(
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: { purchaseId: intent.purchase.purchaseReference },
      }),
    ).toMatchObject({
      status: 'CONSUMED',
      terminalReason: 'checkout-completed',
      terminalIdempotencyKey: intent.attempt.id,
    });
    expect(
      await prisma.voucherConsumption.count({
        where: { purchaseReference: intent.purchase.purchaseReference },
      }),
    ).toBe(1);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: voucherId } })).usedCount).toBe(
      1,
    );
    expect(
      await prisma.orderTimelineEvent.count({
        where: {
          order: { purchaseId: intent.purchase.purchaseReference },
          reasonCode: 'MOMO_PAYMENT_CONFIRMED',
        },
      }),
    ).toBe(2);
    expect(
      await prisma.notification.count({
        where: { deduplicationKey: `payment:${intent.attempt.id}:paid:buyer` },
      }),
    ).toBe(1);
    expect(
      await prisma.notificationDeliveryAttempt.count({
        where: { notification: { deduplicationKey: `payment:${intent.attempt.id}:paid:buyer` } },
      }),
    ).toBe(1);
  });

  it('records correlation mismatch and moves an uncertain payment to reconciliation', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');
    const intent = await checkoutService.createMomoPendingIntent(
      buyerId,
      2,
      idempotencyKey,
      confirmation,
      600,
    );

    const mismatch = await paymentObservationService.applyProviderObservation({
      source: 'QUERY',
      observation: {
        provider: 'MOMO',
        environment: 'SANDBOX',
        orderId: intent.attempt.orderId,
        requestId: 'req_mismatched',
        amountMinor: intent.attempt.amountMinor,
        currency: 'VND',
        resultCode: 0,
        message: null,
        providerTransactionId: 8_000_002n,
        observedAt: new Date(),
      },
    });

    expect(mismatch).toMatchObject({
      decision: 'MISMATCH',
      status: 'PENDING_RECONCILIATION',
      duplicate: false,
    });
    expect(
      await prisma.purchase.findUniqueOrThrow({
        where: { id: intent.purchase.purchaseReference },
        select: { paymentStatus: true },
      }),
    ).toEqual({ paymentStatus: 'PENDING_RECONCILIATION' });
  });

  it('terminalizes a cancelled MoMo purchase and releases its holds exactly once', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');
    const intent = await checkoutService.createMomoPendingIntent(
      buyerId,
      2,
      idempotencyKey,
      confirmation,
      600,
    );
    const cancelledObservation = {
      provider: 'MOMO' as const,
      environment: 'SANDBOX' as const,
      orderId: intent.attempt.orderId,
      requestId: intent.attempt.requestId,
      amountMinor: intent.attempt.amountMinor,
      currency: 'VND' as const,
      resultCode: 1017,
      message: 'cancelled',
      providerTransactionId: 8_000_003n,
      observedAt: new Date(),
    };

    const cancelled = await paymentObservationService.applyProviderObservation({
      source: 'QUERY',
      observation: cancelledObservation,
    });
    const duplicate = await paymentObservationService.applyProviderObservation({
      source: 'QUERY',
      observation: cancelledObservation,
    });
    await request(app.getHttpServer())
      .post('/api/v1/payment-providers/momo/ipn')
      .send({
        partnerCode: 'FAKE',
        orderId: intent.attempt.orderId,
        requestId: intent.attempt.requestId,
        amount: Number(intent.attempt.amountMinor),
        orderInfo: 'Sandbox purchase',
        orderType: 'momo_wallet',
        transId: '8000003',
        resultCode: 99,
        message: 'Failure after cancellation.',
        payType: 'qr',
        responseTime: Date.now(),
        extraData: '',
        signature: FAKE_NOTIFICATION_SIGNATURE,
      })
      .expect(204);

    expect(cancelled).toMatchObject({ decision: 'APPLIED', status: 'CANCELLED' });
    expect(duplicate).toMatchObject({ decision: 'DUPLICATE', status: 'CANCELLED' });
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: intent.attempt.id },
        select: { status: true },
      }),
    ).toEqual({ status: 'CANCELLED' });
    expect(
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: { purchaseId: intent.purchase.purchaseReference },
      }),
    ).toMatchObject({
      status: 'RELEASED',
      terminalReason: 'payment-failed',
      terminalIdempotencyKey: intent.attempt.id,
    });
    expect(
      await prisma.shopOrder.count({
        where: {
          purchaseId: intent.purchase.purchaseReference,
          status: 'CANCELLED',
          paymentStatus: 'CANCELLED',
          fulfillment: { state: 'CANCELLED' },
        },
      }),
    ).toBe(2);
    expect(
      await prisma.voucherConsumption.count({
        where: { purchaseReference: intent.purchase.purchaseReference },
      }),
    ).toBe(0);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: voucherId } })).usedCount).toBe(
      0,
    );

    const lateSuccess = await paymentObservationService.applyProviderObservation({
      source: 'IPN',
      observation: {
        ...cancelledObservation,
        resultCode: 0,
        message: 'late success',
        observedAt: new Date(),
      },
    });
    expect(lateSuccess).toMatchObject({ decision: 'APPLIED', status: 'REFUND_PENDING' });
    expect(
      await prisma.paymentRefund.findFirstOrThrow({
        where: { attemptId: intent.attempt.id },
      }),
    ).toMatchObject({
      amountMinor: intent.attempt.amountMinor,
      status: 'PENDING',
    });
    expect(
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: { purchaseId: intent.purchase.purchaseReference },
      }),
    ).toMatchObject({ status: 'RELEASED' });
    expect(
      await prisma.shopOrder.count({
        where: {
          purchaseId: intent.purchase.purchaseReference,
          status: 'CANCELLED',
          paymentStatus: 'REFUND_PENDING',
        },
      }),
    ).toBe(2);
    const originalRefund = fakePaymentProvider.refundPayment.bind(fakePaymentProvider);
    const timedOutRefund = jest
      .spyOn(fakePaymentProvider, 'refundPayment')
      .mockImplementationOnce(async (command) => {
        await originalRefund(command);
        throw new ProviderTimeoutError('response lost after provider accepted refund');
      });
    expect(await refundReconciliationService.reconcileDue(1)).toBe(1);
    expect(fakePaymentProvider.refundCalls).toHaveLength(1);
    expect(
      await prisma.paymentRefund.findFirstOrThrow({ where: { attemptId: intent.attempt.id } }),
    ).toMatchObject({ status: 'PENDING_RECONCILIATION' });
    await prisma.paymentRefund.updateMany({
      where: { attemptId: intent.attempt.id },
      data: { nextReconcileAt: new Date(0) },
    });
    timedOutRefund.mockRestore();
    expect(await refundReconciliationService.reconcileDue(1)).toBe(1);
    expect(fakePaymentProvider.refundCalls).toHaveLength(1);
    expect(fakePaymentProvider.refundQueryCalls).toHaveLength(1);
    expect(
      await prisma.paymentRefund.findFirstOrThrow({ where: { attemptId: intent.attempt.id } }),
    ).toMatchObject({ status: 'SUCCEEDED' });
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: intent.attempt.id } }),
    ).toMatchObject({ status: 'REFUNDED' });
    expect(
      await prisma.notification.count({
        where: { deduplicationKey: `payment:${intent.attempt.id}:refunded:buyer` },
      }),
    ).toBe(1);
  });

  it('accepts a public signed MoMo IPN with idempotent HTTP 204 handling', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');
    const intent = await checkoutService.createMomoPendingIntent(
      buyerId,
      2,
      idempotencyKey,
      confirmation,
      600,
    );
    const ipn = {
      partnerCode: 'FAKE',
      orderId: intent.attempt.orderId,
      requestId: intent.attempt.requestId,
      amount: Number(intent.attempt.amountMinor),
      orderInfo: 'Sandbox purchase',
      orderType: 'momo_wallet',
      transId: '8000004',
      resultCode: 0,
      message: 'Successful.',
      payType: 'qr',
      responseTime: Date.now(),
      extraData: '',
      signature: FAKE_NOTIFICATION_SIGNATURE,
    };

    await request(app.getHttpServer())
      .post('/api/v1/payment-providers/momo/ipn')
      .send(ipn)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/payment-providers/momo/ipn')
      .send({ ...ipn, resultCode: 1000, responseTime: Date.now() + 1 })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/payment-providers/momo/ipn')
      .send(ipn)
      .expect(204);

    expect(
      await prisma.purchase.findUniqueOrThrow({
        where: { id: intent.purchase.purchaseReference },
        select: { paymentStatus: true },
      }),
    ).toEqual({ paymentStatus: 'PAID' });
    expect(await prisma.paymentEvent.count({ where: { attemptId: intent.attempt.id } })).toBe(2);
  });

  it('rejects an invalid IPN signature without mutating payment state', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');
    const intent = await checkoutService.createMomoPendingIntent(
      buyerId,
      2,
      idempotencyKey,
      confirmation,
      600,
    );

    await request(app.getHttpServer())
      .post('/api/v1/payment-providers/momo/ipn')
      .send({
        partnerCode: 'FAKE',
        orderId: intent.attempt.orderId,
        requestId: intent.attempt.requestId,
        amount: Number(intent.attempt.amountMinor),
        orderInfo: 'Sandbox purchase',
        orderType: 'momo_wallet',
        transId: '8000005',
        resultCode: 0,
        message: 'Successful.',
        payType: 'qr',
        responseTime: Date.now(),
        extraData: '',
        signature: 'b'.repeat(64),
      })
      .expect(400);
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: intent.attempt.id },
        select: { status: true },
      }),
    ).toEqual({ status: 'PENDING' });
    expect(await prisma.paymentEvent.count({ where: { attemptId: intent.attempt.id } })).toBe(0);
  });

  it('accepts signed IPN correlation mismatches without marking the purchase paid', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');
    const intent = await checkoutService.createMomoPendingIntent(
      buyerId,
      2,
      idempotencyKey,
      confirmation,
      600,
    );
    const ipn = {
      partnerCode: 'FAKE',
      orderId: intent.attempt.orderId,
      requestId: intent.attempt.requestId,
      amount: Number(intent.attempt.amountMinor),
      orderInfo: 'Sandbox purchase',
      orderType: 'momo_wallet',
      transId: '8000006',
      resultCode: 0,
      message: 'Successful.',
      payType: 'qr',
      responseTime: Date.now(),
      extraData: '',
      signature: FAKE_NOTIFICATION_SIGNATURE,
    };

    await request(app.getHttpServer())
      .post('/api/v1/payment-providers/momo/ipn')
      .send({ ...ipn, amount: ipn.amount + 1 })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/payment-providers/momo/ipn')
      .send({ ...ipn, requestId: 'req_mismatched', responseTime: Date.now() + 1 })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/payment-providers/momo/ipn')
      .send({ ...ipn, orderId: 'momo_unknown_order', responseTime: Date.now() + 2 })
      .expect(204);

    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: intent.attempt.id },
        select: { status: true },
      }),
    ).toEqual({ status: 'PENDING_RECONCILIATION' });
    expect(
      await prisma.paymentEvent.count({
        where: { attemptId: intent.attempt.id, decision: 'MISMATCH' },
      }),
    ).toBe(2);
  });

  it('leases reconciliation work once and finalizes a payment through provider query', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const confirmation = parseCheckoutConfirmationRequest({
      ...previewBody(),
      checkoutFingerprint: previewResponse.body.checkoutFingerprint as string,
    });
    if (!confirmation) throw new Error('Expected a valid normalized confirmation');
    const checkout = await onlinePaymentService.checkoutWithMomo(buyerId, 2, idempotencyKey, {
      ...confirmation,
      provider: 'MOMO',
    });
    const attemptForReconcile = await prisma.paymentAttempt.findFirstOrThrow({
      where: { purchaseId: checkout.purchase.purchaseReference },
    });
    await prisma.paymentAttempt.update({
      where: { id: attemptForReconcile.id },
      data: { nextReconcileAt: new Date(0) },
    });

    const claimed = await Promise.all([
      paymentReconciliationService.reconcileDue(1),
      paymentReconciliationService.reconcileDue(1),
    ]);

    expect(claimed.reduce((total, value) => total + value, 0)).toBe(1);
    expect(fakePaymentProvider.queryCalls).toHaveLength(1);
    expect(
      await prisma.paymentAttempt.findFirstOrThrow({
        where: { purchaseId: checkout.purchase.purchaseReference },
      }),
    ).toMatchObject({
      status: 'PAID',
      leaseExpiresAt: null,
    });
  });

  it('exposes online checkout and owner-scoped payment polling without client mutation', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const created = await request(app.getHttpServer())
      .post('/api/v1/checkout/online-payments')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        ...previewBody(),
        checkoutFingerprint: previewResponse.body.checkoutFingerprint,
        provider: 'MOMO',
      })
      .expect(201);
    expect(isOnlinePaymentCheckoutResponse(created.body)).toBe(true);

    const status = await request(app.getHttpServer())
      .get(`/api/v1/payments/${created.body.payment.paymentReference}`)
      .set('Authorization', buyerBearer)
      .expect(200);
    expect(isPaymentStatusResponse(status.body)).toBe(true);
    expect(status.body).toMatchObject({
      purchaseReference: created.body.purchase.purchaseReference,
      status: 'PENDING',
      instructions: null,
      nextAction: 'WAIT',
    });
    await request(app.getHttpServer())
      .get(`/api/v1/payments/${created.body.payment.paymentReference}`)
      .set('Authorization', foreignBearer)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/checkout/purchases/${created.body.purchase.purchaseReference}/payment-failed`)
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .expect(200, { released: false });
    expect(
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: { purchaseId: created.body.purchase.purchaseReference },
        select: { status: true },
      }),
    ).toEqual({ status: 'ACTIVE' });
  });

  it('creates VNPAY orders with a contract-valid pending-payment timeline', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);

    const created = await request(app.getHttpServer())
      .post('/api/v1/checkout/online-payments')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        ...previewBody(),
        checkoutFingerprint: previewResponse.body.checkoutFingerprint,
        provider: 'VNPAY',
      })
      .expect(201);

    expect(isOnlinePaymentCheckoutResponse(created.body)).toBe(true);
    expect(created.body.payment).toMatchObject({
      provider: 'VNPAY',
      status: 'PENDING',
      nextAction: 'OPEN_VNPAY',
    });

    const orders = await prisma.shopOrder.findMany({
      where: { purchaseId: created.body.purchase.purchaseReference },
      orderBy: { id: 'asc' },
      include: { timelineEvents: { orderBy: { orderVersion: 'asc' } } },
    });
    expect(orders).toHaveLength(2);
    for (const order of orders) {
      expect(order.status).toBe('PENDING_PAYMENT');
      expect(order.version).toBe(1);
      expect(order.timelineEvents.map((event) => [event.orderVersion, event.status])).toEqual([
        [0, 'PENDING_CONFIRMATION'],
        [1, 'PENDING_PAYMENT'],
      ]);
      expect(order.timelineEvents[1]).toMatchObject({
        previousStatus: 'PENDING_CONFIRMATION',
        reasonCode: 'VNPAY_PAYMENT_PENDING',
      });
    }
  });

  it('cancels every VNPAY shop order immediately after a signed cancellation IPN', async () => {
    const previewResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .send(previewBody())
      .expect(200);
    const created = await request(app.getHttpServer())
      .post('/api/v1/checkout/online-payments')
      .set('Authorization', buyerBearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        ...previewBody(),
        checkoutFingerprint: previewResponse.body.checkoutFingerprint,
        provider: 'VNPAY',
      })
      .expect(201);
    const createCall = fakePaymentProvider.createCalls.at(-1);
    if (!createCall) throw new Error('Expected a VNPAY create call.');
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { purchaseId: created.body.purchase.purchaseReference },
      select: { providerTransactionId: true },
    });

    const startedAt = Date.now();
    const ipnFields = {
      vnp_TmnCode: 'TEST_TMN',
      vnp_TxnRef: createCall.orderId,
      vnp_Amount: String(createCall.amountMinor * 100n),
      vnp_ResponseCode: '24',
      vnp_TransactionStatus: '02',
      vnp_TransactionNo: String(attempt.providerTransactionId ?? 123456n),
      vnp_SecureHash: FAKE_NOTIFICATION_SIGNATURE,
    };
    const ipn = await request(app.getHttpServer())
      .get('/api/v1/payment-providers/vnpay/ipn')
      .query(ipnFields)
      .expect(200);
    const elapsedMs = Date.now() - startedAt;
    console.log(`VNPAY cancellation IPN finalized in ${elapsedMs} ms`);
    expect(elapsedMs).toBeLessThan(2_000);
    expect(ipn.body).toEqual({ RspCode: '00', Message: 'Confirm Success' });

    const orders = await prisma.shopOrder.findMany({
      where: { purchaseId: created.body.purchase.purchaseReference },
      select: { status: true, paymentStatus: true, version: true },
    });
    expect(orders).toHaveLength(2);
    expect(orders).toEqual([
      { status: 'CANCELLED', paymentStatus: 'CANCELLED', version: 2 },
      { status: 'CANCELLED', paymentStatus: 'CANCELLED', version: 2 },
    ]);

    const paymentStatus = await request(app.getHttpServer())
      .get(`/api/v1/payments/${created.body.payment.paymentReference}`)
      .set('Authorization', buyerBearer)
      .expect(200);
    expect(paymentStatus.body).toMatchObject({
      status: 'CANCELLED',
      navigation: { kind: 'ORDERS', orderReference: null },
      orderStatuses: [
        { status: 'CANCELLED', paymentStatus: 'CANCELLED' },
        { status: 'CANCELLED', paymentStatus: 'CANCELLED' },
      ],
    });
  });

  it('rejects auth, Origin, foreign address, stale cart, and different idempotent intent', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/checkout/preview')
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-2"')
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
    expect(await prisma.voucherRedemption.count({ where: { userId: buyerId } })).toBe(
      responses[0].body.purchase.vouchers.filter(
        (voucher: { status: string }) => voucher.status === 'APPLIED',
      ).length,
    );
    expect(await prisma.cartLine.count({ where: { cartId } })).toBe(0);
  });
});
