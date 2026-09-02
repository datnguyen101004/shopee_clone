import type { PaymentProvider, PaymentProviderName } from './payment-provider.port';

export const PAYMENT_PROVIDER_REGISTRY = Symbol('PAYMENT_PROVIDER_REGISTRY');

export interface PaymentProviderRegistration {
  name: PaymentProviderName;
  provider: PaymentProvider;
  enabled: boolean;
}

export class DuplicatePaymentProviderError extends Error {}
export class MissingPaymentProviderError extends Error {}
export class DisabledPaymentProviderError extends Error {}

/** Resolves provider behavior without leaking provider-specific fields into the domain service. */
export class PaymentProviderRegistry {
  private readonly providers = new Map<PaymentProviderName, PaymentProviderRegistration>();

  constructor(registrations: readonly PaymentProviderRegistration[] = []) {
    for (const registration of registrations) this.register(registration);
  }

  register(registration: PaymentProviderRegistration): void {
    if (this.providers.has(registration.name)) {
      throw new DuplicatePaymentProviderError(
        `Payment provider ${registration.name} is already registered.`,
      );
    }
    this.providers.set(registration.name, registration);
  }

  resolve(name: PaymentProviderName): PaymentProvider {
    const registration = this.providers.get(name);
    if (!registration)
      throw new MissingPaymentProviderError(`Payment provider ${name} is missing.`);
    if (!registration.enabled) {
      throw new DisabledPaymentProviderError(`Payment provider ${name} is disabled.`);
    }
    return registration.provider;
  }
}
