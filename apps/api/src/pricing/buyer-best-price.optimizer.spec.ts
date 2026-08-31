import { isBuyerBestPricePreview } from '@shopee-clone/contracts';

import type { VoucherDefinitionSnapshot } from '../vouchers/voucher-pricing.calculator';
import {
  BuyerBestPriceOptimizer,
  type ProductVoucherPreviewFacts,
} from './buyer-best-price.optimizer';

const NOW = new Date('2026-08-31T04:00:00.000Z');
const SHOP_ID = '00000000-0000-4000-8000-000000000201';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000301';

function voucher(
  overrides: Partial<VoucherDefinitionSnapshot> &
    Pick<VoucherDefinitionSnapshot, 'id' | 'code' | 'name'>,
): VoucherDefinitionSnapshot {
  return {
    issuer: 'PLATFORM',
    shopId: null,
    benefitType: 'FIXED_AMOUNT',
    fixedAmountMinor: 1_000,
    percentageBasisPoints: null,
    maximumDiscountMinor: null,
    minimumSpendMinor: 0,
    startsAt: new Date('2026-08-01T00:00:00.000Z'),
    endsAt: new Date('2026-09-30T00:00:00.000Z'),
    isEnabled: true,
    usageLimit: 100,
    usedCount: 0,
    perBuyerLimit: 1,
    buyerUsedCount: 0,
    productIds: [],
    ...overrides,
  };
}

function facts(definitions: readonly VoucherDefinitionSnapshot[]): ProductVoucherPreviewFacts {
  return {
    productId: PRODUCT_ID,
    variantId: '00000000-0000-4000-8000-000000000401',
    shop: {
      id: SHOP_ID,
      ownerUserId: '00000000-0000-4000-8000-000000000501',
      slug: 'preview-shop',
      name: 'Preview Shop',
      location: 'Hồ Chí Minh',
    },
    effectivePriceMinor: 100_000,
    evaluatedAt: NOW,
    standardShippingFeeMinor: 25_000,
    voucherDefinitions: definitions,
  };
}

describe('BuyerBestPriceOptimizer', () => {
  const optimizer = new BuyerBestPriceOptimizer();

  it('applies shop first, then capped platform percentage, then shipping', () => {
    const preview = optimizer.optimize(
      facts([
        voucher({
          id: 'shop',
          code: 'SHOP10K',
          name: 'Shop 10K',
          issuer: 'SHOP',
          shopId: SHOP_ID,
          fixedAmountMinor: 10_000,
        }),
        voucher({
          id: 'platform',
          code: 'PLATFORM20',
          name: 'Platform 20%',
          benefitType: 'PERCENTAGE',
          fixedAmountMinor: null,
          percentageBasisPoints: 2_000,
          maximumDiscountMinor: 15_000,
        }),
        voucher({
          id: 'shipping',
          code: 'FREESHIP15K',
          name: 'Freeship 15K',
          benefitType: 'FREE_SHIPPING',
          fixedAmountMinor: null,
          maximumDiscountMinor: 15_000,
        }),
      ]),
    );

    expect(preview).toMatchObject({
      shopVoucherDiscountMinor: 10_000,
      platformVoucherDiscountMinor: 15_000,
      merchandisePayableMinor: 75_000,
      shipping: {
        shippingVoucherDiscountMinor: 15_000,
        shippingPayableMinor: 10_000,
        estimatedPayableMinor: 85_000,
      },
    });
    expect(isBuyerBestPricePreview(preview)).toBe(true);
  });

  it('omits shipping completely when there is no usable address quote', () => {
    const input = facts([
      voucher({
        id: 'shipping',
        code: 'FREESHIP',
        name: 'Freeship',
        benefitType: 'FREE_SHIPPING',
        fixedAmountMinor: null,
        maximumDiscountMinor: 25_000,
      }),
    ]);
    input.standardShippingFeeMinor = null;
    expect(optimizer.optimize(input)).toMatchObject({
      merchandisePayableMinor: 100_000,
      shipping: null,
    });
  });

  it('excludes wrong product, unmet minimum, disabled and exhausted vouchers', () => {
    const excluded = [
      voucher({ id: 'scope', code: 'SCOPE', name: 'Scope', productIds: ['other'] }),
      voucher({ id: 'minimum', code: 'MINIMUM', name: 'Minimum', minimumSpendMinor: 100_001 }),
      voucher({ id: 'disabled', code: 'DISABLED', name: 'Disabled', isEnabled: false }),
      voucher({ id: 'global', code: 'GLOBAL', name: 'Global', usedCount: 100 }),
      voucher({ id: 'buyer', code: 'BUYER', name: 'Buyer', buyerUsedCount: 1 }),
      voucher({
        id: 'future',
        code: 'FUTURE',
        name: 'Future',
        startsAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
      voucher({
        id: 'expired',
        code: 'EXPIRED',
        name: 'Expired',
        endsAt: new Date('2026-08-31T03:00:00.000Z'),
      }),
      voucher({
        id: 'wrong-shop',
        code: 'WRONGSHOP',
        name: 'Wrong shop',
        issuer: 'SHOP',
        shopId: 'different-shop',
      }),
    ];
    const preview = optimizer.optimize(facts(excluded));
    expect(preview.merchandiseDiscountMinor).toBe(0);
    expect(preview.shopVoucher).toBeNull();
    expect(preview.platformVoucher).toBeNull();
  });

  it('is independent of input order and uses canonical code as final tie-breaker', () => {
    const alpha = voucher({ id: 'a', code: 'ALPHA', name: 'Alpha', fixedAmountMinor: 5_000 });
    const beta = voucher({ id: 'b', code: 'BETA', name: 'Beta', fixedAmountMinor: 5_000 });
    expect(optimizer.optimize(facts([beta, alpha])).platformVoucher?.code).toBe('ALPHA');
    expect(optimizer.optimize(facts([alpha, beta])).platformVoucher?.code).toBe('ALPHA');
  });

  it('bounds candidates and combinations while retaining the no-voucher option', () => {
    const definitions = Array.from({ length: 20 }, (_, index) =>
      voucher({
        id: String(index),
        code: `CODE${String(index).padStart(2, '0')}`,
        name: `Voucher ${index}`,
        fixedAmountMinor: index + 1,
      }),
    );
    const preview = optimizer.optimize(facts(definitions), {
      maxCandidatesPerSlot: 2,
      maxCombinations: 2,
    });
    expect(preview.merchandisePayableMinor).toBeLessThanOrEqual(100_000);
  });

  it('does not mutate facts and cannot raise the effective price', () => {
    const input = facts([
      voucher({ id: 'one', code: 'ONE', name: 'One', fixedAmountMinor: 5_000 }),
    ]);
    const before = JSON.stringify(input);
    const preview = optimizer.optimize(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(preview.merchandisePayableMinor).toBeLessThanOrEqual(input.effectivePriceMinor);
  });
});
