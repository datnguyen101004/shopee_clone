import { FakePaymentProvider } from './fake-payment-provider';
import {
  DisabledPaymentProviderError,
  DuplicatePaymentProviderError,
  MissingPaymentProviderError,
  PaymentProviderRegistry,
} from './payment-provider.registry';

describe('PaymentProviderRegistry', () => {
  it('rejects duplicate registrations deterministically', () => {
    const provider = new FakePaymentProvider();
    expect(
      () =>
        new PaymentProviderRegistry([
          { name: 'MOMO', provider, enabled: true },
          { name: 'MOMO', provider, enabled: true },
        ]),
    ).toThrow(DuplicatePaymentProviderError);
  });

  it('distinguishes missing and disabled providers', () => {
    const registry = new PaymentProviderRegistry([
      { name: 'VNPAY', provider: new FakePaymentProvider(), enabled: false },
    ]);
    expect(() => registry.resolve('MOMO')).toThrow(MissingPaymentProviderError);
    expect(() => registry.resolve('VNPAY')).toThrow(DisabledPaymentProviderError);
  });

  it('returns the registered enabled adapter', () => {
    const provider = new FakePaymentProvider();
    const registry = new PaymentProviderRegistry([{ name: 'MOMO', provider, enabled: true }]);
    expect(registry.resolve('MOMO')).toBe(provider);
  });
});
