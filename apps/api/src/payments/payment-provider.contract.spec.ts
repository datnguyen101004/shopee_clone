import { FakePaymentProvider } from './fake-payment-provider';
import type { MomoConfig } from './momo.config';
import { MomoPaymentProvider } from './momo-payment-provider';
import type { MomoHttpTransport } from './momo-payment-provider';
import type { CreatePaymentCommand, PaymentProvider } from './payment-provider.port';

const createCommand: CreatePaymentCommand = {
  provider: 'MOMO',
  environment: 'SANDBOX',
  orderId: 'contract-order-1',
  requestId: 'contract-request-1',
  amountMinor: 10_000n,
  currency: 'VND',
  orderInfo: 'Provider contract order',
  redirectUrl: 'https://shop.example.test/payment/result',
  ipnUrl: 'https://api.example.test/api/v1/payment-providers/momo/ipn',
  expiresAt: new Date('2026-08-29T00:00:00.000Z'),
};

class ContractMomoTransport implements MomoHttpTransport {
  readonly requests: Array<{ path: string; body: Readonly<Record<string, unknown>> }> = [];
  private readonly amounts = new Map<string, number>();

  async post(path: string, body: Readonly<Record<string, unknown>>): Promise<unknown> {
    this.requests.push({ path, body });
    const orderId = String(body.orderId);
    const requestId = String(body.requestId);
    if (path.endsWith('/create')) this.amounts.set(orderId, Number(body.amount));
    if (path.endsWith('/refund')) this.amounts.set(orderId, Number(body.amount));
    if (path.endsWith('/refund/query')) {
      return {
        partnerCode: body.partnerCode,
        orderId,
        requestId,
        resultCode: 0,
        message: 'Successful.',
        responseTime: 1_787_932_800_000,
        refundTrans: [
          {
            orderId,
            amount: this.amounts.get(orderId) ?? 10_000,
            resultCode: 0,
            transId: '7000002',
          },
        ],
      };
    }
    const amount = path.endsWith('/query')
      ? (this.amounts.get(orderId) ?? 10_000)
      : Number(body.amount);
    return {
      partnerCode: body.partnerCode,
      orderId,
      requestId,
      amount,
      responseTime: 1_787_932_800_000,
      resultCode: 0,
      message: 'Successful.',
      transId: '7000001',
      payUrl: `https://test-payment.momo.vn/pay/${orderId}`,
      deeplink: `momo://pay/${orderId}`,
      qrCodeUrl: `000201010212${orderId}`,
    };
  }
}

const momoConfig: MomoConfig = {
  enabled: true,
  environment: 'sandbox',
  baseUrl: 'https://test-payment.momo.vn',
  partnerCode: 'MOMO_CONTRACT',
  accessKey: 'contract-access-key',
  secretKey: 'contract-secret-key-at-least-sixteen',
  ipnUrl: createCommand.ipnUrl,
  redirectUrl: createCommand.redirectUrl,
  paymentTtlSeconds: 600,
  httpTimeoutMs: 30_000,
};

function definePaymentProviderContract(name: string, createProvider: () => PaymentProvider) {
  describe(`${name} payment provider contract`, () => {
    let provider: PaymentProvider;

    beforeEach(() => {
      provider = createProvider();
    });

    it('creates safe instructions with unchanged merchant correlation', async () => {
      await expect(provider.createPayment(createCommand)).resolves.toMatchObject({
        provider: 'MOMO',
        environment: 'SANDBOX',
        orderId: createCommand.orderId,
        requestId: createCommand.requestId,
        amountMinor: createCommand.amountMinor,
        currency: 'VND',
        resultCode: 0,
        instructions: {
          payUrl: expect.any(String),
          deeplink: expect.any(String),
          qrCodeUrl: expect.any(String),
        },
      });
    });

    it('keeps create identifiers stable across an idempotent retry', async () => {
      const first = await provider.createPayment(createCommand);
      const retry = await provider.createPayment(createCommand);
      expect({
        orderId: retry.orderId,
        requestId: retry.requestId,
        amountMinor: retry.amountMinor,
      }).toEqual({
        orderId: first.orderId,
        requestId: first.requestId,
        amountMinor: first.amountMinor,
      });
    });

    it('queries with the persisted order and request identifiers', async () => {
      await provider.createPayment(createCommand);
      await expect(
        provider.queryPayment({
          provider: 'MOMO',
          environment: 'SANDBOX',
          orderId: createCommand.orderId,
          requestId: createCommand.requestId,
        }),
      ).resolves.toMatchObject({
        orderId: createCommand.orderId,
        requestId: createCommand.requestId,
        amountMinor: createCommand.amountMinor,
      });
    });

    it('refunds with stable refund correlation and the original transaction id', async () => {
      const refundCommand = {
        provider: 'MOMO' as const,
        environment: 'SANDBOX' as const,
        orderId: 'contract-refund-order-1',
        requestId: 'contract-refund-request-1',
        amountMinor: createCommand.amountMinor,
        currency: 'VND' as const,
        providerTransactionId: 7_000_001n,
        description: 'Contract refund',
      };
      await expect(provider.refundPayment(refundCommand)).resolves.toMatchObject({
        orderId: 'contract-refund-order-1',
        requestId: 'contract-refund-request-1',
        amountMinor: createCommand.amountMinor,
        originalProviderTransactionId: 7_000_001n,
      });
      await expect(
        provider.queryRefund({
          provider: refundCommand.provider,
          environment: refundCommand.environment,
          orderId: refundCommand.orderId,
          requestId: refundCommand.requestId,
        }),
      ).resolves.toMatchObject({
        orderId: refundCommand.orderId,
        requestId: refundCommand.requestId,
        amountMinor: refundCommand.amountMinor,
        resultCode: 0,
      });
    });
  });
}

definePaymentProviderContract('fake', () => new FakePaymentProvider());
definePaymentProviderContract(
  'MoMo HTTP-mocked',
  () => new MomoPaymentProvider(momoConfig, new ContractMomoTransport()),
);
