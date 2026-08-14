import { isPricingQuoteResponse } from '@shopee-clone/contracts';

import {
  CommercePricingCalculator,
  type AuthoritativePricingSnapshot,
} from './commerce-pricing.calculator';
import { UnsafePricingArithmeticError } from './money';
import { MockShippingCalculator } from './mock-shipping.calculator';

const calculator = new CommercePricingCalculator(new MockShippingCalculator());
const snapshot: AuthoritativePricingSnapshot = {
  cartVersion: 3,
  evaluatedAt: new Date('2026-08-14T05:00:00.000Z'),
  address: {
    id: '00000000-0000-4000-8000-000000000001',
    province: 'Thành phố Hồ Chí Minh',
    district: 'Quận 1',
  },
  lines: [
    {
      lineId: '00000000-0000-4000-8000-000000000101',
      productId: '00000000-0000-4000-8000-000000000201',
      variantId: '00000000-0000-4000-8000-000000000301',
      quantity: 2,
      unitWeightGrams: 300,
      sellingUnitPriceMinor: 100_000n,
      compareAtUnitPriceMinor: 120_000n,
      shop: {
        id: '00000000-0000-4000-8000-000000000401',
        slug: 'shop-south',
        name: 'Shop South',
        location: 'TP. Hồ Chí Minh',
      },
    },
    {
      lineId: '00000000-0000-4000-8000-000000000102',
      productId: '00000000-0000-4000-8000-000000000202',
      variantId: '00000000-0000-4000-8000-000000000302',
      quantity: 1,
      unitWeightGrams: 1_200,
      sellingUnitPriceMinor: 50_000n,
      compareAtUnitPriceMinor: 40_000n,
      shop: {
        id: '00000000-0000-4000-8000-000000000402',
        slug: 'shop-north',
        name: 'Shop North',
        location: 'Hà Nội',
      },
    },
  ],
  exclusions: [
    {
      lineId: '00000000-0000-4000-8000-000000000103',
      code: 'insufficient-stock',
      message: 'Số lượng tồn kho không còn đủ.',
    },
  ],
  services: [{ shopId: '00000000-0000-4000-8000-000000000402', service: 'ECONOMY' }],
};

describe('commerce pricing calculator', () => {
  it('itemizes markdowns, defaults missing service, and reconciles multi-shop totals', () => {
    const quote = calculator.calculate(snapshot);
    expect(isPricingQuoteResponse(quote)).toBe(true);
    expect(quote.shops.map(({ shop }) => shop.slug)).toEqual(['shop-south', 'shop-north']);
    const discounted = quote.shops[0]!.lines[0]!;
    expect(discounted).toMatchObject({
      listSubtotalMinor: 240_000,
      productDiscountMinor: 40_000,
      merchandiseSubtotalMinor: 200_000,
      shipmentWeightGrams: 600,
    });
    expect(quote.shops[0]!.shipping.service).toBe('STANDARD');
    expect(quote.shops[1]!.shipping.service).toBe('ECONOMY');
    expect(quote.summary).toMatchObject({
      selectedLineCount: 2,
      selectedQuantity: 3,
      listSubtotalMinor: 290_000,
      productDiscountMinor: 40_000,
      merchandiseSubtotalMinor: 250_000,
      shippingTotalMinor: 59_000,
      payableTotalMinor: 309_000,
    });
  });

  it('is input-order independent and exposes one seam for cart and future checkout', () => {
    const cartQuote = calculator.calculate(snapshot);
    const checkoutQuote = calculator.calculate({
      ...snapshot,
      lines: [...snapshot.lines].reverse(),
      services: [...snapshot.services].reverse(),
    });
    expect(checkoutQuote).toEqual(cartQuote);
  });

  it('returns a canonical zero quote and sorted exclusions', () => {
    const quote = calculator.calculate({ ...snapshot, lines: [], services: [] });
    expect(isPricingQuoteResponse(quote)).toBe(true);
    expect(quote.shops).toEqual([]);
    expect(quote.summary.payableTotalMinor).toBe(0);
  });

  it('fails closed on unsafe money or duplicate shop services', () => {
    expect(() =>
      calculator.calculate({
        ...snapshot,
        lines: [
          {
            ...snapshot.lines[0]!,
            sellingUnitPriceMinor: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
          },
        ],
      }),
    ).toThrow(UnsafePricingArithmeticError);
    expect(() =>
      calculator.calculate({
        ...snapshot,
        services: [snapshot.services[0]!, { ...snapshot.services[0]!, service: 'EXPRESS' }],
      }),
    ).toThrow('Duplicate shop service choice');
  });
});
