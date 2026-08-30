import { INVENTORY_RESERVATION_TTL_MS } from '../inventory/inventory.constants';
import { MOMO_SANDBOX_ORIGIN, loadMomoConfig } from './momo.config';

const enabledEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  MOMO_ENABLED: 'true',
  MOMO_ENV: 'sandbox',
  MOMO_PARTNER_CODE: 'MOMOTEST',
  MOMO_ACCESS_KEY: 'sandbox-access-key',
  MOMO_SECRET_KEY: 'sandbox-secret-key-long-enough',
  MOMO_IPN_URL: 'https://payments.example.test/api/v1/payment-providers/momo/ipn',
  MOMO_REDIRECT_URL: 'https://shop.example.test/checkout/payment/return',
};

describe('MoMo sandbox configuration', () => {
  it('is disabled and secret-free by default', () => {
    expect(loadMomoConfig({ NODE_ENV: 'test' })).toEqual({
      enabled: false,
      environment: 'sandbox',
      baseUrl: MOMO_SANDBOX_ORIGIN,
      partnerCode: null,
      accessKey: null,
      secretKey: null,
      ipnUrl: null,
      redirectUrl: null,
      paymentTtlSeconds: 600,
      httpTimeoutMs: 30_000,
    });
  });

  it('loads an explicit, HTTPS-only sandbox configuration', () => {
    expect(loadMomoConfig(enabledEnvironment)).toMatchObject({
      enabled: true,
      environment: 'sandbox',
      baseUrl: MOMO_SANDBOX_ORIGIN,
      partnerCode: 'MOMOTEST',
      paymentTtlSeconds: 600,
      httpTimeoutMs: 30_000,
    });
  });

  it.each(['MOMO_PARTNER_CODE', 'MOMO_ACCESS_KEY', 'MOMO_SECRET_KEY'] as const)(
    'fails closed when %s is absent',
    (key) => {
      const environment = { ...enabledEnvironment };
      delete environment[key];
      expect(() => loadMomoConfig(environment)).toThrow(key);
    },
  );

  it('rejects non-HTTPS callbacks and unexpected IPN paths', () => {
    expect(() =>
      loadMomoConfig({ ...enabledEnvironment, MOMO_IPN_URL: 'http://localhost:3001/momo' }),
    ).toThrow('MOMO_IPN_URL');
    expect(() =>
      loadMomoConfig({
        ...enabledEnvironment,
        MOMO_IPN_URL: 'https://payments.example.test/not-the-ipn-path',
      }),
    ).toThrow('MOMO_IPN_URL');
    expect(() =>
      loadMomoConfig({ ...enabledEnvironment, MOMO_REDIRECT_URL: 'http://localhost:3000/return' }),
    ).toThrow('MOMO_REDIRECT_URL');
  });

  it('keeps payment TTL within the inventory hold and enforces provider timeout', () => {
    expect(() =>
      loadMomoConfig({
        ...enabledEnvironment,
        MOMO_PAYMENT_TTL_SECONDS: String(INVENTORY_RESERVATION_TTL_MS / 1_000 + 1),
      }),
    ).toThrow('MOMO_PAYMENT_TTL_SECONDS');
    expect(() => loadMomoConfig({ ...enabledEnvironment, MOMO_HTTP_TIMEOUT_MS: '29999' })).toThrow(
      'MOMO_HTTP_TIMEOUT_MS',
    );
  });

  it('cannot enable the sandbox adapter in production', () => {
    expect(() => loadMomoConfig({ ...enabledEnvironment, NODE_ENV: 'production' })).toThrow(
      'cannot be enabled in production',
    );
  });
});
