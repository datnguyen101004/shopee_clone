import type { CreatePaymentCommand, PaymentCorrelation } from './payment-provider.port';
import {
  ProviderMalformedResponseError,
  ProviderMismatchError,
  ProviderTimeoutError,
} from './payment-result';
import { FAKE_NOTIFICATION_SIGNATURE, FakePaymentProvider } from './fake-payment-provider';

const correlation: PaymentCorrelation = {
  provider: 'MOMO',
  environment: 'SANDBOX',
  orderId: 'order-1',
  requestId: 'request-1',
  amountMinor: 10_000n,
  currency: 'VND',
};

const createCommand: CreatePaymentCommand = {
  ...correlation,
  orderInfo: 'Sandbox order',
  redirectUrl: 'https://shop.example.test/payment/order-1',
  ipnUrl: 'https://api.example.test/api/v1/payment-providers/momo/ipn',
  expiresAt: new Date('2026-08-29T00:00:00.000Z'),
};

describe('FakePaymentProvider', () => {
  it('returns deterministic safe instructions and records create calls', async () => {
    const provider = new FakePaymentProvider();
    await expect(provider.createPayment(createCommand)).resolves.toMatchObject({
      orderId: 'order-1',
      requestId: 'request-1',
      resultCode: 0,
      instructions: {
        payUrl: 'https://test-payment.momo.vn/fake/order-1',
        deeplink: 'momo://fake/order-1',
      },
    });
    expect(provider.createCalls).toEqual([createCommand]);
  });

  it.each([
    ['FAILURE', 99],
    ['CANCELLED', 1017],
    ['EXPIRED', 1005],
    ['PENDING', 1000],
  ] as const)('configures %s responses', async (outcome, resultCode) => {
    const provider = new FakePaymentProvider({ create: { outcome } });
    await expect(provider.createPayment(createCommand)).resolves.toMatchObject({ resultCode });
  });

  it('can delay a response', async () => {
    const provider = new FakePaymentProvider({ create: { outcome: 'SUCCESS', delayMs: 5 } });
    const startedAt = Date.now();
    await provider.createPayment(createCommand);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(4);
  });

  it('models timeout and malformed responses as typed unknown outcomes', async () => {
    await expect(
      new FakePaymentProvider({ create: { outcome: 'TIMEOUT' } }).createPayment(createCommand),
    ).rejects.toBeInstanceOf(ProviderTimeoutError);
    await expect(
      new FakePaymentProvider({ create: { outcome: 'MALFORMED' } }).createPayment(createCommand),
    ).rejects.toBeInstanceOf(ProviderMalformedResponseError);
  });

  it('requires query correlation with a known create attempt', async () => {
    const provider = new FakePaymentProvider();
    await expect(
      provider.queryPayment({
        provider: 'MOMO',
        environment: 'SANDBOX',
        orderId: 'unknown',
        requestId: 'unknown',
      }),
    ).rejects.toBeInstanceOf(ProviderMismatchError);
    await provider.createPayment(createCommand);
    await expect(
      provider.queryPayment({
        provider: 'MOMO',
        environment: 'SANDBOX',
        orderId: correlation.orderId,
        requestId: correlation.requestId,
      }),
    ).resolves.toMatchObject(correlation);
  });

  it('returns a stable transaction id per correlation without reusing it for another payment', async () => {
    const provider = new FakePaymentProvider();
    const created = await provider.createPayment(createCommand);
    const queried = await provider.queryPayment({
      provider: correlation.provider,
      environment: correlation.environment,
      orderId: correlation.orderId,
      requestId: correlation.requestId,
    });
    const anotherPayment = await provider.createPayment({
      ...createCommand,
      orderId: 'order-2',
      requestId: 'request-2',
    });

    expect(created.providerTransactionId).toBeGreaterThan(0n);
    expect(queried.providerTransactionId).toBe(created.providerTransactionId);
    expect(anotherPayment.providerTransactionId).not.toBe(created.providerTransactionId);
  });

  it('verifies fake notifications without exposing their raw fields', () => {
    const provider = new FakePaymentProvider();
    expect(
      provider.verifyNotification({
        fields: {
          orderId: correlation.orderId,
          requestId: correlation.requestId,
          amount: correlation.amountMinor.toString(),
          resultCode: 0,
          transId: '7000001',
          ignoredSecretLikeField: 'not-returned',
        },
        signature: FAKE_NOTIFICATION_SIGNATURE,
        receivedAt: new Date('2026-08-28T00:00:00.000Z'),
      }),
    ).toMatchObject({
      valid: true,
      observation: correlation,
      sanitizedMetadata: { resultCode: 0, transId: '7000001' },
    });
  });

  it('rejects invalid signatures and malformed notification fields', () => {
    const provider = new FakePaymentProvider();
    expect(
      provider.verifyNotification({ fields: {}, signature: 'invalid', receivedAt: new Date() }),
    ).toEqual({ valid: false, reason: 'INVALID_SIGNATURE' });
    expect(
      provider.verifyNotification({
        fields: {},
        signature: FAKE_NOTIFICATION_SIGNATURE,
        receivedAt: new Date(),
      }),
    ).toEqual({ valid: false, reason: 'MALFORMED' });
  });

  it('expands duplicates and orders callbacks by delivery time to simulate reordered/late IPNs', () => {
    const provider = new FakePaymentProvider({
      notifications: [
        { outcome: 'FAILURE', deliverAfterMs: 200 },
        { outcome: 'SUCCESS', deliverAfterMs: 10, duplicateCount: 2 },
      ],
    });
    const schedule = provider.buildNotificationSchedule(correlation);
    expect(schedule.map(({ deliverAfterMs }) => deliverAfterMs)).toEqual([10, 10, 200]);
    expect(schedule.map(({ envelope }) => envelope.fields.resultCode)).toEqual([0, 0, 99]);
    expect(new Set(schedule.map(({ envelope }) => envelope.fields.transId)).size).toBe(1);
  });

  it('preserves an explicitly configured provider transaction id', async () => {
    const provider = new FakePaymentProvider({
      create: { outcome: 'SUCCESS', providerTransactionId: 42n },
      notifications: [
        { outcome: 'SUCCESS', deliverAfterMs: 0, providerTransactionId: 42n },
      ],
    });

    await expect(provider.createPayment(createCommand)).resolves.toMatchObject({
      providerTransactionId: 42n,
    });
    expect(provider.buildNotificationSchedule(correlation)[0]?.envelope.fields.transId).toBe('42');
  });

  it('returns stable refund correlation for safe retries', async () => {
    const provider = new FakePaymentProvider();
    await expect(
      provider.refundPayment({
        ...correlation,
        orderId: 'refund-order-1',
        requestId: 'refund-request-1',
        providerTransactionId: 7_000_001n,
        description: 'Late success refund',
      }),
    ).resolves.toMatchObject({
      orderId: 'refund-order-1',
      requestId: 'refund-request-1',
      originalProviderTransactionId: 7_000_001n,
    });
  });
});
