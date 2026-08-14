import {
  assertVoucherProductScopeConsistency,
  canonicalizeVoucherDefinition,
} from './voucher-definition';

const base = {
  code: ' platform-10 ',
  issuer: 'PLATFORM' as const,
  shopId: null,
  benefitType: 'PERCENTAGE' as const,
  fixedAmountMinor: null,
  percentageBasisPoints: 1_000,
  maximumDiscountMinor: 50_000n,
  minimumSpendMinor: 100_000n,
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  endsAt: new Date('2027-01-01T00:00:00.000Z'),
  usageLimit: 100,
  perBuyerLimit: 1,
};

describe('voucher definition validation', () => {
  it('canonicalizes a valid definition', () => {
    expect(canonicalizeVoucherDefinition(base).code).toBe('PLATFORM-10');
  });

  it('rejects inconsistent issuer, benefit, window, and usage combinations', () => {
    expect(() => canonicalizeVoucherDefinition({ ...base, shopId: 'shop' })).toThrow();
    expect(() => canonicalizeVoucherDefinition({ ...base, percentageBasisPoints: 0 })).toThrow();
    expect(() => canonicalizeVoucherDefinition({ ...base, endsAt: base.startsAt })).toThrow();
    expect(() => canonicalizeVoucherDefinition({ ...base, perBuyerLimit: 101 })).toThrow();
  });

  it('rejects duplicate or cross-shop product scopes', () => {
    expect(() =>
      assertVoucherProductScopeConsistency({ issuer: 'SHOP', shopId: 'shop-a' }, [
        { id: 'product', shopId: 'shop-b' },
      ]),
    ).toThrow();
    expect(() =>
      assertVoucherProductScopeConsistency({ issuer: 'PLATFORM', shopId: null }, [
        { id: 'product', shopId: 'shop-a' },
        { id: 'product', shopId: 'shop-a' },
      ]),
    ).toThrow();
  });
});
