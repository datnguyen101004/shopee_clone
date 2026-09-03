import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import {
  PaymentEventDecision,
  PaymentEventSource,
  PaymentProvider,
  PaymentRefundStatus,
  PurchasePaymentMethod,
  PurchasePaymentStatus,
  UserStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest = process.env.RUN_PAYMENT_DATABASE_TESTS === '1' ? describe : describe.skip;

const buyerId = '00000000-0000-4000-8000-000000007001';
const purchaseId = '00000000-0000-4000-8000-000000007002';
const attemptId = '00000000-0000-4000-8000-000000007003';
const publicReference = '00000000-0000-4000-8000-000000007004';
const missingPurchaseId = '00000000-0000-4000-8000-000000007099';
const expiresAt = new Date('2999-01-01T00:00:00.000Z');

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('MoMo payment persistence with PostgreSQL', () => {
  let prisma: PrismaService;

  async function cleanup() {
    await prisma.paymentRefund.deleteMany({ where: { attempt: { purchaseId } } });
    await prisma.paymentEvent.deleteMany({ where: { attempt: { purchaseId } } });
    await prisma.paymentAttempt.deleteMany({ where: { purchaseId } });
    await prisma.purchase.deleteMany({ where: { id: purchaseId } });
    await prisma.user.deleteMany({ where: { id: buyerId } });
  }

  async function createAttempt() {
    return prisma.paymentAttempt.create({
      data: {
        id: attemptId,
        publicReference,
        purchaseId,
        provider: PaymentProvider.MOMO,
        orderId: 'momo-order-7003',
        requestId: 'momo-request-7003',
        amountMinor: 1000n,
        status: PurchasePaymentStatus.PENDING,
        expiresAt,
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.user.create({
      data: {
        id: buyerId,
        email: 'momo-persistence@example.test',
        displayName: 'MoMo Persistence',
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.purchase.create({
      data: {
        id: purchaseId,
        buyerId,
        idempotencyKey: purchaseId,
        requestDigest: '1'.repeat(64),
        checkoutFingerprint: '2'.repeat(64),
        sourceCartVersion: 1,
        paymentMethod: PurchasePaymentMethod.MOMO,
        paymentStatus: PurchasePaymentStatus.PENDING,
        addressSnapshot: { city: 'sandbox' },
        listSubtotalMinor: 1000n,
        productDiscountMinor: 0n,
        merchandiseSubtotalMinor: 1000n,
        shippingTotalMinor: 0n,
        shopVoucherDiscountMinor: 0n,
        platformVoucherDiscountMinor: 0n,
        merchandiseVoucherDiscountMinor: 0n,
        shippingVoucherDiscountMinor: 0n,
        voucherDiscountMinor: 0n,
        shippingPayableMinor: 0n,
        payableTotalMinor: 1000n,
      },
    });
  });

  afterAll(async () => {
    if (prisma) await cleanup();
    await prisma?.onModuleDestroy();
  });

  it('enforces purchase foreign keys and merchant identifier uniqueness', async () => {
    await expect(
      prisma.paymentAttempt.create({
        data: {
          id: '00000000-0000-4000-8000-000000007090',
          publicReference: '00000000-0000-4000-8000-000000007091',
          purchaseId: missingPurchaseId,
          orderId: 'missing-purchase-order',
          requestId: 'missing-purchase-request',
          amountMinor: 1000n,
          expiresAt,
        },
      }),
    ).rejects.toThrow();

    await createAttempt();
    await expect(
      prisma.paymentAttempt.create({
        data: {
          id: '00000000-0000-4000-8000-000000007092',
          publicReference: '00000000-0000-4000-8000-000000007093',
          purchaseId,
          orderId: 'different-order',
          requestId: 'different-request',
          amountMinor: 1000n,
          expiresAt,
        },
      }),
    ).rejects.toThrow();
  });

  it('deduplicates two concurrent observations with the same event key', async () => {
    await createAttempt();
    const insert = (id: string) =>
      prisma.paymentEvent.create({
        data: {
          id,
          attemptId,
          source: PaymentEventSource.IPN,
          dedupeKey: 'a'.repeat(64),
          fingerprint: 'b'.repeat(64),
          resultCode: 0,
          resultClass: 'success',
          observedStatus: PurchasePaymentStatus.PAID,
          sanitizedMetadata: { resultCode: 0 },
          decision: PaymentEventDecision.APPLIED,
        },
      });

    const results = await Promise.allSettled([
      insert('00000000-0000-4000-8000-000000007010'),
      insert('00000000-0000-4000-8000-000000007011'),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(await prisma.paymentEvent.count({ where: { dedupeKey: 'a'.repeat(64) } })).toBe(1);
  });

  it('allows exactly one conditional state update for a version', async () => {
    await createAttempt();
    const update = (
      status: typeof PurchasePaymentStatus.PAID | typeof PurchasePaymentStatus.FAILED,
    ) =>
      prisma.paymentAttempt.updateMany({
        where: { id: attemptId, version: 0, status: PurchasePaymentStatus.PENDING },
        data: { status, version: { increment: 1 } },
      });

    const results = await Promise.all([
      update(PurchasePaymentStatus.PAID),
      update(PurchasePaymentStatus.FAILED),
    ]);

    expect(results.map(({ count }) => count).sort()).toEqual([0, 1]);
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } }),
    ).toMatchObject({
      version: 1,
      status: expect.stringMatching(/^(PAID|FAILED)$/),
    });
  });

  it('keeps refund creation idempotent under concurrent retry', async () => {
    await createAttempt();
    const insert = (id: string, orderId: string) =>
      prisma.paymentRefund.create({
        data: {
          id,
          attemptId,
          provider: PaymentProvider.MOMO,
          orderId,
          requestId: 'stable-refund-request-7003',
          amountMinor: 1000n,
          status: PaymentRefundStatus.PENDING,
        },
      });

    const results = await Promise.allSettled([
      insert('00000000-0000-4000-8000-000000007020', 'refund-order-7003-a'),
      insert('00000000-0000-4000-8000-000000007021', 'refund-order-7003-b'),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(
      await prisma.paymentRefund.count({ where: { requestId: 'stable-refund-request-7003' } }),
    ).toBe(1);
  });
});
