import { isPricingQuoteResponse, type VoucherCodeSelection } from '@shopee-clone/contracts';

import {
  CommercePricingCalculator,
  type AuthoritativePricingSnapshot,
} from '../pricing/commerce-pricing.calculator';
import { MockShippingCalculator } from '../pricing/mock-shipping.calculator';
import {
  VoucherPricingCalculator,
  allocateLargestRemainder,
  listAvailablePlatformVouchers,
  listAvailableShippingVouchers,
  listAvailableShopVouchers,
  type VoucherDefinitionSnapshot,
} from './voucher-pricing.calculator';

const evaluatedAt = new Date('2026-08-14T05:00:00.000Z');
const shopA = '00000000-0000-4000-8000-000000000401';
const shopB = '00000000-0000-4000-8000-000000000402';
const lineA = '00000000-0000-4000-8000-000000000101';
const lineB = '00000000-0000-4000-8000-000000000102';
const productA = '00000000-0000-4000-8000-000000000201';
const productB = '00000000-0000-4000-8000-000000000202';

const snapshot: AuthoritativePricingSnapshot = {
  cartVersion: 3,
  evaluatedAt,
  address: {
    id: '00000000-0000-4000-8000-000000000001',
    province: 'Thành phố Hồ Chí Minh',
    district: 'Quận 1',
  },
  lines: [
    {
      lineId: lineA,
      productId: productA,
      variantId: '00000000-0000-4000-8000-000000000301',
      quantity: 2,
      unitWeightGrams: 300,
      sellingUnitPriceMinor: 100_000n,
      compareAtUnitPriceMinor: 120_000n,
      shop: { id: shopA, slug: 'shop-a', name: 'Shop A', location: 'TP. Hồ Chí Minh' },
    },
    {
      lineId: lineB,
      productId: productB,
      variantId: '00000000-0000-4000-8000-000000000302',
      quantity: 1,
      unitWeightGrams: 1_200,
      sellingUnitPriceMinor: 50_000n,
      compareAtUnitPriceMinor: null,
      shop: { id: shopB, slug: 'shop-b', name: 'Shop B', location: 'Hà Nội' },
    },
  ],
  exclusions: [],
  services: [{ shopId: shopB, service: 'ECONOMY' }],
};

const baseCalculator = new CommercePricingCalculator(new MockShippingCalculator());
const calculator = new VoucherPricingCalculator();

function definition(
  overrides: Partial<VoucherDefinitionSnapshot> & Pick<VoucherDefinitionSnapshot, 'id' | 'code'>,
): VoucherDefinitionSnapshot {
  return {
    name: overrides.code,
    issuer: 'PLATFORM',
    shopId: null,
    benefitType: 'FIXED_AMOUNT',
    fixedAmountMinor: 10_000,
    percentageBasisPoints: null,
    maximumDiscountMinor: null,
    minimumSpendMinor: 0,
    startsAt: new Date('2020-01-01T00:00:00.000Z'),
    endsAt: new Date('2999-01-01T00:00:00.000Z'),
    isEnabled: true,
    usageLimit: 100,
    usedCount: 0,
    perBuyerLimit: 1,
    buyerUsedCount: 0,
    productIds: [],
    ...overrides,
  };
}

const definitions = [
  definition({
    id: '00000000-0000-4000-8000-000000000601',
    code: 'SHOP-20K',
    issuer: 'SHOP',
    shopId: shopA,
    fixedAmountMinor: 20_000,
    minimumSpendMinor: 100_000,
  }),
  definition({
    id: '00000000-0000-4000-8000-000000000602',
    code: 'PLATFORM-10',
    benefitType: 'PERCENTAGE',
    fixedAmountMinor: null,
    percentageBasisPoints: 1_000,
    maximumDiscountMinor: 100_000,
    minimumSpendMinor: 100_000,
  }),
  definition({
    id: '00000000-0000-4000-8000-000000000603',
    code: 'FREESHIP-20K',
    benefitType: 'FREE_SHIPPING',
    fixedAmountMinor: null,
    maximumDiscountMinor: 20_000,
    minimumSpendMinor: 100_000,
  }),
] as const;

const selection: VoucherCodeSelection = {
  shopCodes: [{ shopId: shopA, code: 'SHOP-20K' }],
  platformCode: 'PLATFORM-10',
  freeShippingCode: 'FREESHIP-20K',
};

describe('voucher pricing calculator', () => {
  it('stacks shop, platform, and shipping vouchers with exact reconciled totals', () => {
    const result = calculator.apply(
      baseCalculator.calculate(snapshot),
      selection,
      definitions,
      evaluatedAt,
    );
    expect(isPricingQuoteResponse(result.quote)).toBe(true);
    expect(result.quote.vouchers.map(({ code, status }) => [code, status])).toEqual([
      ['SHOP-20K', 'APPLIED'],
      ['PLATFORM-10', 'APPLIED'],
      ['FREESHIP-20K', 'APPLIED'],
    ]);
    expect(result.quote.summary).toMatchObject({
      merchandiseSubtotalMinor: 250_000,
      shippingTotalMinor: 59_000,
      shopVoucherDiscountMinor: 20_000,
      platformVoucherDiscountMinor: 23_000,
      merchandiseVoucherDiscountMinor: 43_000,
      shippingVoucherDiscountMinor: 20_000,
      voucherDiscountMinor: 63_000,
      shippingPayableMinor: 39_000,
      payableTotalMinor: 246_000,
    });
    expect(result.applied.map(({ voucherId }) => voucherId)).toEqual(
      definitions.map(({ id }) => id),
    );
  });

  it('lists shop vouchers that currently meet the merchandise minimum', () => {
    const quote = baseCalculator.calculate(snapshot);
    const offers = listAvailableShopVouchers(
      quote,
      [
        ...definitions,
        definition({
          id: '00000000-0000-4000-8000-000000000604',
          code: 'SHOP-HIGH',
          issuer: 'SHOP',
          shopId: shopA,
          fixedAmountMinor: 50_000,
          minimumSpendMinor: 500_000,
        }),
      ],
      evaluatedAt,
    );
    expect(listAvailableShippingVouchers(quote, definitions, evaluatedAt)).toEqual([
      {
        code: 'FREESHIP-20K',
        name: 'FREESHIP-20K',
        benefitType: 'FREE_SHIPPING',
        minimumSpendMinor: 100_000,
        estimatedDiscountMinor: 20_000,
        remainingCount: 1,
      },
    ]);
    expect(listAvailablePlatformVouchers(quote, definitions, evaluatedAt)).toEqual([
      {
        code: 'PLATFORM-10',
        name: 'PLATFORM-10',
        benefitType: 'PERCENTAGE',
        minimumSpendMinor: 100_000,
        estimatedDiscountMinor: 25_000,
        remainingCount: 1,
      },
    ]);
    expect(offers).toEqual([
      {
        shopId: shopA,
        code: 'SHOP-20K',
        name: 'SHOP-20K',
        benefitType: 'FIXED_AMOUNT',
        minimumSpendMinor: 100_000,
        estimatedDiscountMinor: 20_000,
        remainingCount: 1,
      },
    ]);
  });

  it.each([
    ['DISABLED', { isEnabled: false }],
    ['NOT_STARTED', { startsAt: new Date(evaluatedAt.getTime() + 1) }],
    ['EXPIRED', { endsAt: evaluatedAt }],
    ['GLOBAL_LIMIT_REACHED', { usedCount: 100 }],
    ['BUYER_LIMIT_REACHED', { buyerUsedCount: 1 }],
  ] as const)('returns stable %s eligibility evidence', (reason, overrides) => {
    const voucher = definition({
      id: '00000000-0000-4000-8000-000000000699',
      code: 'BOUNDARY-10K',
      ...overrides,
    });
    const result = calculator.apply(
      baseCalculator.calculate(snapshot),
      { platformCode: voucher.code },
      [voucher],
      evaluatedAt,
    );
    expect(result.quote.vouchers[0]).toMatchObject({
      status: 'REJECTED',
      rejectionReason: reason,
      discountMinor: 0,
    });
  });

  it('uses product scope and pre-voucher spend while later benefits use residual value', () => {
    const productScoped = definition({
      id: '00000000-0000-4000-8000-000000000604',
      code: 'PRODUCT-50',
      benefitType: 'PERCENTAGE',
      fixedAmountMinor: null,
      percentageBasisPoints: 5_000,
      maximumDiscountMinor: 200_000,
      minimumSpendMinor: 200_000,
      productIds: [productA],
    });
    const result = calculator.apply(
      baseCalculator.calculate(snapshot),
      {
        shopCodes: [{ shopId: shopA, code: 'SHOP-20K' }],
        platformCode: productScoped.code,
      },
      [definitions[0], productScoped],
      evaluatedAt,
    );
    expect(result.quote.vouchers[1]).toMatchObject({
      status: 'APPLIED',
      discountMinor: 90_000,
    });
    expect(result.quote.shops[1]?.platformVoucherDiscountMinor).toBe(0);
  });

  it('rejects type, scope, empty, and minimum-spend mismatches without failing the quote', () => {
    const wrongShop = { ...definitions[0], shopId: shopB };
    const minimum = definition({
      id: '00000000-0000-4000-8000-000000000605',
      code: 'MINIMUM-10K',
      minimumSpendMinor: 999_999,
    });
    const noItems = definition({
      id: '00000000-0000-4000-8000-000000000606',
      code: 'NO-ITEMS',
      productIds: ['00000000-0000-4000-8000-000000000999'],
    });
    expect(
      calculator.apply(
        baseCalculator.calculate(snapshot),
        { shopCodes: [{ shopId: shopA, code: wrongShop.code }] },
        [wrongShop],
        evaluatedAt,
      ).quote.vouchers[0]?.rejectionReason,
    ).toBe('SCOPE_MISMATCH');
    expect(
      calculator.apply(
        baseCalculator.calculate(snapshot),
        { freeShippingCode: definitions[1].code },
        [definitions[1]],
        evaluatedAt,
      ).quote.vouchers[0]?.rejectionReason,
    ).toBe('TYPE_MISMATCH');
    expect(
      calculator.apply(
        baseCalculator.calculate(snapshot),
        { platformCode: noItems.code },
        [noItems],
        evaluatedAt,
      ).quote.vouchers[0]?.rejectionReason,
    ).toBe('NO_ELIGIBLE_ITEMS');
    expect(
      calculator.apply(
        baseCalculator.calculate(snapshot),
        { platformCode: minimum.code },
        [minimum],
        evaluatedAt,
      ).quote.vouchers[0]?.rejectionReason,
    ).toBe('MINIMUM_SPEND_NOT_MET');
  });

  it('floors percentage VND and caps fixed and free-shipping benefits', () => {
    const tinySnapshot = {
      ...snapshot,
      lines: [{ ...snapshot.lines[1]!, sellingUnitPriceMinor: 101n }],
    };
    const percent = definition({
      id: '00000000-0000-4000-8000-000000000607',
      code: 'FLOOR-3333',
      benefitType: 'PERCENTAGE',
      fixedAmountMinor: null,
      percentageBasisPoints: 3_333,
      maximumDiscountMinor: 1_000,
    });
    const result = calculator.apply(
      baseCalculator.calculate(tinySnapshot),
      { platformCode: percent.code },
      [percent],
      evaluatedAt,
    );
    expect(result.quote.vouchers[0]?.discountMinor).toBe(33);
  });

  it('allocates every VND deterministically across input permutations and rejects overflow', () => {
    const targets = [
      { key: `${shopA}:${lineA}`, shopId: shopA, lineId: lineA, weightMinor: 1 },
      { key: `${shopB}:${lineB}`, shopId: shopB, lineId: lineB, weightMinor: 1 },
      {
        key: `${shopB}:00000000-0000-4000-8000-000000000103`,
        shopId: shopB,
        lineId: '00000000-0000-4000-8000-000000000103',
        weightMinor: 1,
      },
    ];
    expect(allocateLargestRemainder(2, targets)).toEqual(
      allocateLargestRemainder(2, [...targets].reverse()),
    );
    expect(allocateLargestRemainder(2, targets).map(({ amountMinor }) => amountMinor)).toEqual([
      1, 1,
    ]);
    expect(() =>
      allocateLargestRemainder(Number.MAX_SAFE_INTEGER, [
        { ...targets[0]!, weightMinor: Number.MAX_SAFE_INTEGER },
        { ...targets[1]!, weightMinor: Number.MAX_SAFE_INTEGER },
      ]),
    ).toThrow();
  });

  it('returns a valid zero quote and rejects requested vouchers without eligible items', () => {
    const result = calculator.apply(
      baseCalculator.calculate({ ...snapshot, lines: [] }),
      { platformCode: definitions[1].code },
      [definitions[1]],
      evaluatedAt,
    );
    expect(isPricingQuoteResponse(result.quote)).toBe(true);
    expect(result.quote.summary.payableTotalMinor).toBe(0);
    expect(result.quote.vouchers[0]?.rejectionReason).toBe('NO_ELIGIBLE_ITEMS');
  });
});
