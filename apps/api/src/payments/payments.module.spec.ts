import { Test } from '@nestjs/testing';

import { FakePaymentProvider } from './fake-payment-provider';
import { MomoPaymentProvider } from './momo-payment-provider';
import { PAYMENT_PROVIDER } from './payment-provider.port';
import { PaymentsModule } from './payments.module';

const momoEnvironmentKeys = [
  'MOMO_ENABLED',
  'MOMO_ENV',
  'MOMO_PARTNER_CODE',
  'MOMO_ACCESS_KEY',
  'MOMO_SECRET_KEY',
  'MOMO_IPN_URL',
  'MOMO_REDIRECT_URL',
  'NODE_ENV',
] as const;

describe('PaymentsModule provider selection', () => {
  const original = Object.fromEntries(momoEnvironmentKeys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of momoEnvironmentKeys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uses the network-free fake provider when MoMo is disabled by default', async () => {
    delete process.env.MOMO_ENABLED;
    const moduleRef = await Test.createTestingModule({ imports: [PaymentsModule] }).compile();
    expect(moduleRef.get(PAYMENT_PROVIDER)).toBeInstanceOf(FakePaymentProvider);
    await moduleRef.close();
  });

  it('selects the MoMo adapter only for an explicitly enabled valid sandbox config', async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      MOMO_ENABLED: 'true',
      MOMO_ENV: 'sandbox',
      MOMO_PARTNER_CODE: 'MOMO_TEST',
      MOMO_ACCESS_KEY: 'test-access-key',
      MOMO_SECRET_KEY: 'test-secret-key-at-least-sixteen',
      MOMO_IPN_URL: 'https://api.example.test/api/v1/payment-providers/momo/ipn',
      MOMO_REDIRECT_URL: 'https://shop.example.test/checkout/payment/result',
    });
    const moduleRef = await Test.createTestingModule({ imports: [PaymentsModule] }).compile();
    expect(moduleRef.get(PAYMENT_PROVIDER)).toBeInstanceOf(MomoPaymentProvider);
    await moduleRef.close();
  });
});
