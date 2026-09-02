import { VnpayIpnController } from './vnpay-ipn.controller';
import type { PaymentProvider } from './payment-provider.port';
import type { VnpayConfig } from './vnpay.config';

describe('VNPAY IPN protocol boundary', () => {
  const provider = { verifyNotification: jest.fn() } as unknown as PaymentProvider;
  const observations = { applyProviderObservation: jest.fn() };
  let controller: VnpayIpnController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new VnpayIpnController(provider, observations as never);
  });

  it('fails closed when VNPAY is disabled', async () => {
    const disabled: VnpayConfig = {
      enabled: false,
      environment: 'sandbox',
      tmnCode: null,
      hashSecret: null,
      payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      returnUrl: null,
      ipnUrl: null,
      apiUrl: 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
      paymentTtlSeconds: 600,
      httpTimeoutMs: 30_000,
    };
    controller = new VnpayIpnController(provider, observations as never, disabled);
    await expect(
      controller.receive({
        vnp_TxnRef: 'opaque-reference',
        vnp_SecureHash: 'a'.repeat(128),
      }),
    ).resolves.toEqual({ RspCode: '99', Message: 'Invalid request' });
    expect(provider.verifyNotification).not.toHaveBeenCalled();
  });

  it('rejects duplicate query keys before signature verification', async () => {
    await expect(
      controller.receive({
        vnp_TxnRef: ['opaque-reference', 'tampered-reference'],
        vnp_SecureHash: 'a'.repeat(128),
      }),
    ).resolves.toEqual({ RspCode: '99', Message: 'Invalid request' });
    expect(provider.verifyNotification).not.toHaveBeenCalled();
  });

  it('rejects non-string query values and oversized fields without a database lookup', async () => {
    await expect(
      controller.receive({
        vnp_TxnRef: 'opaque-reference',
        vnp_Amount: '1',
        vnp_SecureHash: 123,
      }),
    ).resolves.toEqual({ RspCode: '99', Message: 'Invalid request' });
    await expect(
      controller.receive({
        vnp_TxnRef: 'opaque-reference',
        vnp_Amount: '1',
        vnp_SecureHash: 'a'.repeat(513),
      }),
    ).resolves.toEqual({ RspCode: '99', Message: 'Invalid request' });
    expect(provider.verifyNotification).not.toHaveBeenCalled();
  });
});
