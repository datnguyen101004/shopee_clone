import { INVENTORY_RESERVATION_TTL_MS } from '../inventory/inventory.constants';
import { VNPAY_SANDBOX_API_URL, VNPAY_SANDBOX_PAY_URL, loadVnpayConfig } from './vnpay.config';

const enabledEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  VNPAY_ENABLED: 'true',
  VNPAY_ENV: 'sandbox',
  VNPAY_TMN_CODE: 'SANDBOXTMN',
  VNPAY_HASH_SECRET: 'sandbox-secret-key-long-enough',
  VNPAY_PAY_URL: VNPAY_SANDBOX_PAY_URL,
  VNPAY_RETURN_URL: 'http://localhost:3000/payment/callback',
  VNPAY_IPN_URL: 'https://payments.example.test/api/v1/payment-providers/vnpay/ipn',
  VNPAY_API_URL: VNPAY_SANDBOX_API_URL,
};

describe('VNPAY sandbox configuration', () => {
  it('is disabled and secret-free by default', () => {
    expect(loadVnpayConfig({ NODE_ENV: 'test' })).toEqual({
      enabled: false,
      environment: 'sandbox',
      tmnCode: null,
      hashSecret: null,
      payUrl: VNPAY_SANDBOX_PAY_URL,
      returnUrl: null,
      ipnUrl: null,
      apiUrl: VNPAY_SANDBOX_API_URL,
      paymentTtlSeconds: 600,
      httpTimeoutMs: 30_000,
    });
  });

  it.each(['/api/v1/payment-providers/vnpay/ipn', '/api/v1/callback/payment-callback'])(
    'accepts the configured public IPN path %s',
    (path) => {
      expect(
        loadVnpayConfig({
          ...enabledEnvironment,
          VNPAY_IPN_URL: `https://payments.example.test${path}`,
        }),
      ).toMatchObject({
        enabled: true,
        tmnCode: 'SANDBOXTMN',
        returnUrl: 'http://localhost:3000/payment/callback',
      });
    },
  );

  it.each(['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET'] as const)(
    'fails closed when %s is absent',
    (key) => {
      const environment = { ...enabledEnvironment };
      delete environment[key];
      expect(() => loadVnpayConfig(environment)).toThrow(key);
    },
  );

  it('rejects non-allowlisted URLs, invalid TTL and production sandbox enablement', () => {
    expect(() =>
      loadVnpayConfig({ ...enabledEnvironment, VNPAY_PAY_URL: 'https://example.test/pay' }),
    ).toThrow('VNPAY_PAY_URL');
    expect(() =>
      loadVnpayConfig({ ...enabledEnvironment, VNPAY_IPN_URL: 'http://localhost:3001/ipn' }),
    ).toThrow('VNPAY_IPN_URL');
    expect(() =>
      loadVnpayConfig({
        ...enabledEnvironment,
        VNPAY_PAYMENT_TTL_SECONDS: String(INVENTORY_RESERVATION_TTL_MS / 1_000 + 1),
      }),
    ).toThrow('VNPAY_PAYMENT_TTL_SECONDS');
    expect(() => loadVnpayConfig({ ...enabledEnvironment, NODE_ENV: 'production' })).toThrow(
      'cannot be enabled in production',
    );
  });
});
