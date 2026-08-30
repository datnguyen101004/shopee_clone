import type { MomoConfig } from './momo.config';
import { MomoPaymentProvider, type MomoHttpTransport } from './momo-payment-provider';
import type { CreatePaymentCommand } from './payment-provider.port';
import {
  ProviderMalformedResponseError,
  ProviderMismatchError,
  ProviderRejectedError,
  ProviderTimeoutError,
} from './payment-result';

class RecordingTransport implements MomoHttpTransport {
  readonly calls: Array<{
    path: string;
    body: Readonly<Record<string, unknown>>;
    timeoutMs: number;
  }> = [];

  constructor(private readonly responseOverrides: Readonly<Record<string, unknown>> = {}) {}

  async post(
    path: string,
    body: Readonly<Record<string, unknown>>,
    timeoutMs: number,
  ): Promise<unknown> {
    this.calls.push({ path, body, timeoutMs });
    return {
      partnerCode: body.partnerCode,
      orderId: body.orderId,
      requestId: body.requestId,
      amount: body.amount,
      resultCode: 0,
      message: 'Successful.',
      responseTime: 1_787_932_800_000,
      transId: '7000001',
      payUrl: 'https://test-payment.momo.vn/pay/order-1',
      deeplink: 'momo://pay/order-1',
      qrCodeUrl: '000201010212ORDER1',
      ...this.responseOverrides,
    };
  }
}

class StaticTransport implements MomoHttpTransport {
  readonly calls: Array<{
    path: string;
    body: Readonly<Record<string, unknown>>;
    timeoutMs: number;
  }> = [];

  constructor(
    private readonly response: unknown,
    private readonly failure?: Error,
  ) {}

  async post(
    path: string,
    body: Readonly<Record<string, unknown>>,
    timeoutMs: number,
  ): Promise<unknown> {
    this.calls.push({ path, body, timeoutMs });
    if (this.failure) throw this.failure;
    return this.response;
  }
}

const config: MomoConfig = {
  enabled: true,
  environment: 'sandbox',
  baseUrl: 'https://test-payment.momo.vn',
  partnerCode: 'MOMO_TEST',
  accessKey: 'sandbox-access-key',
  secretKey: 'sandbox-secret-key-at-least-sixteen',
  ipnUrl: 'https://api.example.test/api/v1/payment-providers/momo/ipn',
  redirectUrl: 'https://shop.example.test/checkout/payment/result',
  paymentTtlSeconds: 600,
  httpTimeoutMs: 30_000,
};

const command: CreatePaymentCommand = {
  provider: 'MOMO',
  environment: 'SANDBOX',
  orderId: 'ord_01J6D4MOMO',
  requestId: 'req_01J6D4MOMO',
  amountMinor: 150_000n,
  currency: 'VND',
  orderInfo: 'Thanh toan don hang',
  redirectUrl: config.redirectUrl!,
  ipnUrl: config.ipnUrl!,
  expiresAt: new Date('2026-08-29T00:00:00.000Z'),
};

describe('MomoPaymentProvider create', () => {
  it('sends captureWallet auto-capture with correlated sandbox fields', async () => {
    const transport = new RecordingTransport();
    const provider = new MomoPaymentProvider(config, transport);
    const result = await provider.createPayment(command);

    expect(transport.calls).toEqual([
      {
        path: '/v2/gateway/api/create',
        timeoutMs: 30_000,
        body: expect.objectContaining({
          partnerCode: 'MOMO_TEST',
          requestId: command.requestId,
          orderId: command.orderId,
          amount: 150_000,
          requestType: 'captureWallet',
          autoCapture: true,
          ipnUrl: config.ipnUrl,
          redirectUrl: config.redirectUrl,
          signature: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      },
    ]);
    expect(result.paymentStatus).toBe('PENDING');
  });

  it('reuses exact merchant identifiers and signatures on retry', async () => {
    const transport = new RecordingTransport();
    const provider = new MomoPaymentProvider(config, transport);
    await provider.createPayment(command);
    await provider.createPayment(command);
    expect(transport.calls[1]?.body).toEqual(transport.calls[0]?.body);
  });

  it.each([999n, 50_000_001n])(
    'rejects out-of-range amount %s before network',
    async (amountMinor) => {
      const transport = new RecordingTransport();
      const provider = new MomoPaymentProvider(config, transport);
      await expect(provider.createPayment({ ...command, amountMinor })).rejects.toBeInstanceOf(
        ProviderRejectedError,
      );
      expect(transport.calls).toHaveLength(0);
    },
  );

  it.each([
    ['orderId', 'x'.repeat(64)],
    ['orderId', 'buyer@example.com'],
    ['requestId', 'x'.repeat(51)],
    ['requestId', 'request with spaces'],
  ] as const)('rejects non-opaque or oversized %s before network', async (field, value) => {
    const transport = new RecordingTransport();
    const provider = new MomoPaymentProvider(config, transport);
    await expect(provider.createPayment({ ...command, [field]: value })).rejects.toBeInstanceOf(
      ProviderRejectedError,
    );
    expect(transport.calls).toHaveLength(0);
  });

  it('rejects callback URLs that differ from validated configuration', async () => {
    const transport = new RecordingTransport();
    const provider = new MomoPaymentProvider(config, transport);
    await expect(
      provider.createPayment({ ...command, redirectUrl: 'https://attacker.example.test/result' }),
    ).rejects.toBeInstanceOf(ProviderRejectedError);
    expect(transport.calls).toHaveLength(0);
  });

  it.each([
    ['payUrl', 'https://attacker.example.test/pay'],
    ['deeplink', 'https://test-payment.momo.vn/not-a-deeplink'],
    ['qrCodeUrl', 'javascript:alert(1)'],
  ] as const)('rejects non-allowlisted response %s', async (field, value) => {
    const provider = new MomoPaymentProvider(config, new RecordingTransport({ [field]: value }));
    await expect(provider.createPayment(command)).rejects.toBeInstanceOf(
      ProviderMalformedResponseError,
    );
  });

  it('rejects an accepted response without instructions or required response fields', async () => {
    const noInstructions = new MomoPaymentProvider(
      config,
      new RecordingTransport({ payUrl: null, deeplink: null, qrCodeUrl: null }),
    );
    await expect(noInstructions.createPayment(command)).rejects.toBeInstanceOf(
      ProviderMalformedResponseError,
    );

    const missingResponseTime = new MomoPaymentProvider(
      config,
      new RecordingTransport({ responseTime: undefined }),
    );
    await expect(missingResponseTime.createPayment(command)).rejects.toBeInstanceOf(
      ProviderMalformedResponseError,
    );
  });

  it.each([
    ['partnerCode', 'OTHER_PARTNER'],
    ['orderId', 'other-order'],
    ['requestId', 'other-request'],
    ['amount', 151_000],
  ] as const)('rejects response correlation mismatch in %s', async (field, value) => {
    const provider = new MomoPaymentProvider(config, new RecordingTransport({ [field]: value }));
    await expect(provider.createPayment(command)).rejects.toBeInstanceOf(ProviderMismatchError);
  });

  it('verifies a create response signature when the provider supplies one', async () => {
    const provider = new MomoPaymentProvider(
      config,
      new RecordingTransport({ signature: '0'.repeat(64) }),
    );
    await expect(provider.createPayment(command)).rejects.toBeInstanceOf(ProviderMismatchError);
  });
});

describe('MomoPaymentProvider query', () => {
  const queryCommand = {
    provider: 'MOMO' as const,
    environment: 'SANDBOX' as const,
    orderId: command.orderId,
    requestId: command.requestId,
  };
  const response = {
    partnerCode: config.partnerCode,
    orderId: command.orderId,
    requestId: command.requestId,
    amount: 150_000,
    resultCode: 0,
    message: 'Successful.',
    transId: '7000001',
  };

  it('sends a signed query with the minimum safe timeout and validates the response', async () => {
    const transport = new StaticTransport(response);
    const provider = new MomoPaymentProvider(config, transport);
    await expect(provider.queryPayment(queryCommand)).resolves.toMatchObject({
      orderId: command.orderId,
      requestId: command.requestId,
      amountMinor: 150_000n,
      resultCode: 0,
    });
    expect(transport.calls).toEqual([
      {
        path: '/v2/gateway/api/query',
        timeoutMs: 30_000,
        body: {
          partnerCode: config.partnerCode,
          requestId: command.requestId,
          orderId: command.orderId,
          lang: 'vi',
          signature: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      },
    ]);
  });

  it.each([
    ['partnerCode', 'OTHER_PARTNER'],
    ['orderId', 'other-order'],
    ['requestId', 'other-request'],
  ] as const)('rejects query response correlation mismatch in %s', async (field, value) => {
    const provider = new MomoPaymentProvider(
      config,
      new StaticTransport({ ...response, [field]: value }),
    );
    await expect(provider.queryPayment(queryCommand)).rejects.toBeInstanceOf(ProviderMismatchError);
  });

  it('rejects malformed query response amount', async () => {
    const provider = new MomoPaymentProvider(
      config,
      new StaticTransport({ ...response, amount: 'not-an-amount' }),
    );
    await expect(provider.queryPayment(queryCommand)).rejects.toBeInstanceOf(
      ProviderMalformedResponseError,
    );
  });

  it('preserves timeout as a retryable unknown outcome', async () => {
    const timeout = new ProviderTimeoutError('query timed out');
    const provider = new MomoPaymentProvider(config, new StaticTransport(null, timeout));
    await expect(provider.queryPayment(queryCommand)).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      retryable: true,
      outcomeUnknown: true,
    });
  });
});

describe('MomoPaymentProvider refund', () => {
  const refundCommand = {
    provider: 'MOMO' as const,
    environment: 'SANDBOX' as const,
    orderId: 'refund_ord_01J6D4MOMO',
    requestId: 'refund_req_01J6D4MOMO',
    amountMinor: 150_000n,
    currency: 'VND' as const,
    providerTransactionId: 7_000_001n,
    description: 'Full late-success refund',
  };
  const refundResponse = {
    partnerCode: config.partnerCode,
    orderId: refundCommand.orderId,
    requestId: refundCommand.requestId,
    amount: 150_000,
    transId: '7000002',
    resultCode: 0,
    message: 'Successful.',
    responseTime: 1_787_932_800_000,
  };

  it('sends a signed full refund and reuses the exact request on retry', async () => {
    const transport = new StaticTransport(refundResponse);
    const provider = new MomoPaymentProvider(config, transport);
    await expect(provider.refundPayment(refundCommand)).resolves.toMatchObject({
      orderId: refundCommand.orderId,
      requestId: refundCommand.requestId,
      amountMinor: refundCommand.amountMinor,
      providerTransactionId: 7_000_002n,
      originalProviderTransactionId: 7_000_001n,
    });
    await provider.refundPayment(refundCommand);
    expect(transport.calls[0]).toEqual({
      path: '/v2/gateway/api/refund',
      timeoutMs: 30_000,
      body: {
        partnerCode: config.partnerCode,
        orderId: refundCommand.orderId,
        requestId: refundCommand.requestId,
        amount: 150_000,
        transId: '7000001',
        lang: 'vi',
        description: refundCommand.description,
        signature: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
    expect(transport.calls[1]?.body).toEqual(transport.calls[0]?.body);
  });

  it.each([
    ['partnerCode', 'OTHER_PARTNER'],
    ['orderId', 'other-order'],
    ['requestId', 'other-request'],
    ['amount', 151_000],
  ] as const)('rejects refund response correlation mismatch in %s', async (field, value) => {
    const provider = new MomoPaymentProvider(
      config,
      new StaticTransport({ ...refundResponse, [field]: value }),
    );
    await expect(provider.refundPayment(refundCommand)).rejects.toBeInstanceOf(
      ProviderMismatchError,
    );
  });

  it('queries the stable refund identifiers after an unknown timeout before retrying', async () => {
    const calls: string[] = [];
    const transport: MomoHttpTransport = {
      async post(path) {
        calls.push(path);
        if (path.endsWith('/refund')) throw new ProviderTimeoutError('refund timed out');
        return {
          partnerCode: config.partnerCode,
          orderId: refundCommand.orderId,
          requestId: refundCommand.requestId,
          resultCode: 0,
          message: 'Successful.',
          responseTime: 1_787_932_800_000,
          refundTrans: [
            {
              orderId: refundCommand.orderId,
              amount: 150_000,
              resultCode: 0,
              transId: '7000002',
            },
          ],
        };
      },
    };
    const provider = new MomoPaymentProvider(config, transport);
    await expect(provider.refundPayment(refundCommand)).rejects.toMatchObject({
      retryable: true,
      outcomeUnknown: true,
    });
    await expect(
      provider.queryRefund({
        provider: 'MOMO',
        environment: 'SANDBOX',
        orderId: refundCommand.orderId,
        requestId: refundCommand.requestId,
      }),
    ).resolves.toMatchObject({
      amountMinor: 150_000n,
      resultCode: 0,
      providerTransactionId: 7_000_002n,
    });
    expect(calls).toEqual(['/v2/gateway/api/refund', '/v2/gateway/api/refund/query']);
  });
});
