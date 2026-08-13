import {
  LEGACY_VIETNAM_PROVINCE_REGIONS,
  isPricingProblemDetails,
  isPricingQuoteRequest,
  isPricingQuoteResponse,
  normalizeVietnameseAdministrativeName,
  resolveLegacyVietnamProvince,
} from '../src';
import { describe, expect, it } from 'vitest';

const addressId = '00000000-0000-4000-8000-000000000101';
const shopA = '00000000-0000-4000-8000-000000000201';
const shopB = '00000000-0000-4000-8000-000000000202';

const quote = {
  pricingVersion: 'pricing-v1',
  shippingVersion: 'mock-v1',
  currency: 'VND',
  cartVersion: 7,
  address: { id: addressId, province: 'Thành phố Hồ Chí Minh', district: 'Quận 1' },
  shops: [
    {
      shop: { id: shopA, slug: 'shop-a', name: 'Shop A' },
      lines: [
        {
          lineId: '00000000-0000-4000-8000-000000000301',
          productId: '00000000-0000-4000-8000-000000000401',
          variantId: '00000000-0000-4000-8000-000000000501',
          quantity: 2,
          unitWeightGrams: 300,
          shipmentWeightGrams: 600,
          listUnitPriceMinor: 120_000,
          sellingUnitPriceMinor: 100_000,
          listSubtotalMinor: 240_000,
          productDiscountMinor: 40_000,
          merchandiseSubtotalMinor: 200_000,
        },
      ],
      shipping: {
        provider: 'MOCK',
        version: 'mock-v1',
        shopId: shopA,
        originProvince: 'Thành phố Hồ Chí Minh',
        destinationProvince: 'Thành phố Hồ Chí Minh',
        zone: 'SAME_PROVINCE',
        shipmentWeightGrams: 600,
        service: 'STANDARD',
        estimatedDaysMin: 2,
        estimatedDaysMax: 4,
        baseFeeMinor: 22_000,
        zoneSurchargeMinor: 0,
        weightSurchargeMinor: 4_000,
        shippingFeeMinor: 26_000,
      },
      listSubtotalMinor: 240_000,
      productDiscountMinor: 40_000,
      merchandiseSubtotalMinor: 200_000,
      payableTotalMinor: 226_000,
    },
    {
      shop: { id: shopB, slug: 'shop-b', name: 'Shop B' },
      lines: [
        {
          lineId: '00000000-0000-4000-8000-000000000302',
          productId: '00000000-0000-4000-8000-000000000402',
          variantId: '00000000-0000-4000-8000-000000000502',
          quantity: 1,
          unitWeightGrams: 1_000,
          shipmentWeightGrams: 1_000,
          listUnitPriceMinor: 50_000,
          sellingUnitPriceMinor: 50_000,
          listSubtotalMinor: 50_000,
          productDiscountMinor: 0,
          merchandiseSubtotalMinor: 50_000,
        },
      ],
      shipping: {
        provider: 'MOCK',
        version: 'mock-v1',
        shopId: shopB,
        originProvince: 'Thành phố Hà Nội',
        destinationProvince: 'Thành phố Hồ Chí Minh',
        zone: 'CROSS_REGION',
        shipmentWeightGrams: 1_000,
        service: 'ECONOMY',
        estimatedDaysMin: 4,
        estimatedDaysMax: 6,
        baseFeeMinor: 15_000,
        zoneSurchargeMinor: 12_000,
        weightSurchargeMinor: 3_000,
        shippingFeeMinor: 30_000,
      },
      listSubtotalMinor: 50_000,
      productDiscountMinor: 0,
      merchandiseSubtotalMinor: 50_000,
      payableTotalMinor: 80_000,
    },
  ],
  exclusions: [],
  summary: {
    selectedLineCount: 2,
    selectedQuantity: 3,
    listSubtotalMinor: 290_000,
    productDiscountMinor: 40_000,
    merchandiseSubtotalMinor: 250_000,
    shippingTotalMinor: 56_000,
    payableTotalMinor: 306_000,
  },
};

describe('pricing contracts', () => {
  it('accepts strict quote inputs and rejects money or duplicate shop selections', () => {
    expect(isPricingQuoteRequest({ shippingAddressId: addressId })).toBe(true);
    expect(
      isPricingQuoteRequest({
        shippingAddressId: addressId,
        services: [{ shopId: shopA, service: 'EXPRESS' }],
      }),
    ).toBe(true);
    expect(isPricingQuoteRequest({ shippingAddressId: addressId, totalMinor: 1 })).toBe(false);
    expect(
      isPricingQuoteRequest({
        shippingAddressId: addressId,
        services: [
          { shopId: shopA, service: 'STANDARD' },
          { shopId: shopA, service: 'EXPRESS' },
        ],
      }),
    ).toBe(false);
  });

  it('accepts zero and fully reconciled multi-shop quotes', () => {
    expect(isPricingQuoteResponse(quote)).toBe(true);
    expect(
      isPricingQuoteResponse({
        ...quote,
        cartVersion: 0,
        shops: [],
        exclusions: [],
        summary: {
          selectedLineCount: 0,
          selectedQuantity: 0,
          listSubtotalMinor: 0,
          productDiscountMinor: 0,
          merchandiseSubtotalMinor: 0,
          shippingTotalMinor: 0,
          payableTotalMinor: 0,
        },
      }),
    ).toBe(true);
  });

  it('rejects unknown fields, unsafe arithmetic, broken discounts and totals', () => {
    expect(isPricingQuoteResponse({ ...quote, totalMinor: 306_000 })).toBe(false);
    expect(
      isPricingQuoteResponse({
        ...quote,
        summary: { ...quote.summary, payableTotalMinor: 1 },
      }),
    ).toBe(false);
    expect(
      isPricingQuoteResponse({
        ...quote,
        shops: [
          {
            ...quote.shops[0],
            lines: [
              {
                ...quote.shops[0]!.lines[0],
                listUnitPriceMinor: Number.MAX_SAFE_INTEGER,
              },
            ],
          },
          quote.shops[1],
        ],
      }),
    ).toBe(false);
  });

  it('accepts only sanitized pricing Problem Details', () => {
    expect(
      isPricingProblemDetails({
        type: 'https://shopee-clone.local/problems/pricing-conflict',
        title: 'Cart changed',
        status: 409,
        detail: 'Reload the cart and request another quote.',
      }),
    ).toBe(true);
    expect(
      isPricingProblemDetails({
        type: 'about:blank',
        title: 'Error',
        status: 500,
        detail: 'stack',
      }),
    ).toBe(false);
  });
});

describe('legacy province region catalog', () => {
  it('pins 63 unique legacy provinces and resolves common address forms', () => {
    expect(LEGACY_VIETNAM_PROVINCE_REGIONS).toHaveLength(63);
    expect(new Set(LEGACY_VIETNAM_PROVINCE_REGIONS.map(({ code }) => code)).size).toBe(63);
    expect(resolveLegacyVietnamProvince('TP. Hồ Chí Minh')).toMatchObject({
      code: '79',
      region: 'SOUTH',
    });
    expect(resolveLegacyVietnamProvince('Ha Noi')).toMatchObject({ code: '01', region: 'NORTH' });
    expect(normalizeVietnameseAdministrativeName(' Tỉnh Bà Rịa - Vũng Tàu ')).toBe(
      'ba ria vung tau',
    );
  });
});
