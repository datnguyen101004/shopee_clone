import {
  LEGACY_VIETNAM_PROVINCE_REGIONS,
  isPricingProblemDetails,
  isPricingQuoteRequest,
  isPricingQuoteResponse,
  normalizeVietnameseAdministrativeName,
  normalizeVoucherCode,
  parsePricingQuoteRequest,
  resolveLegacyVietnamProvince,
  type PricingQuoteResponse,
} from '../src';
import { describe, expect, it } from 'vitest';

const addressId = '00000000-0000-4000-8000-000000000101';
const shopA = '00000000-0000-4000-8000-000000000201';
const shopB = '00000000-0000-4000-8000-000000000202';
const lineA = '00000000-0000-4000-8000-000000000301';
const lineB = '00000000-0000-4000-8000-000000000302';

const quote: PricingQuoteResponse = {
  pricingVersion: 'pricing-v2',
  voucherVersion: 'voucher-v1',
  shippingVersion: 'mock-v1',
  currency: 'VND',
  evaluatedAt: '2026-08-14T05:00:00.000Z',
  cartVersion: 7,
  address: { id: addressId, province: 'Thành phố Hồ Chí Minh', district: 'Quận 1' },
  shops: [
    {
      shop: { id: shopA, slug: 'shop-a', name: 'Shop A' },
      lines: [
        {
          lineId: lineA,
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
          shopVoucherDiscountMinor: 20_000,
          platformVoucherDiscountMinor: 18_000,
          merchandiseVoucherDiscountMinor: 38_000,
          payableMerchandiseMinor: 162_000,
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
      shopVoucherDiscountMinor: 20_000,
      platformVoucherDiscountMinor: 18_000,
      merchandiseVoucherDiscountMinor: 38_000,
      shippingVoucherDiscountMinor: 9_286,
      voucherDiscountMinor: 47_286,
      shippingPayableMinor: 16_714,
      payableTotalMinor: 178_714,
    },
    {
      shop: { id: shopB, slug: 'shop-b', name: 'Shop B' },
      lines: [
        {
          lineId: lineB,
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
          shopVoucherDiscountMinor: 0,
          platformVoucherDiscountMinor: 5_000,
          merchandiseVoucherDiscountMinor: 5_000,
          payableMerchandiseMinor: 45_000,
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
      shopVoucherDiscountMinor: 0,
      platformVoucherDiscountMinor: 5_000,
      merchandiseVoucherDiscountMinor: 5_000,
      shippingVoucherDiscountMinor: 10_714,
      voucherDiscountMinor: 15_714,
      shippingPayableMinor: 19_286,
      payableTotalMinor: 64_286,
    },
  ],
  vouchers: [
    {
      code: 'SHOP-20K',
      slot: 'SHOP',
      shopId: shopA,
      status: 'APPLIED',
      name: 'Shop giảm 20K',
      issuer: 'SHOP',
      benefitType: 'FIXED_AMOUNT',
      rejectionReason: null,
      discountMinor: 20_000,
      merchandiseDiscountMinor: 20_000,
      shippingDiscountMinor: 0,
      allocations: [{ shopId: shopA, lineId: lineA, amountMinor: 20_000 }],
    },
    {
      code: 'PLATFORM-10',
      slot: 'PLATFORM',
      shopId: null,
      status: 'APPLIED',
      name: 'Sàn giảm 10%',
      issuer: 'PLATFORM',
      benefitType: 'PERCENTAGE',
      rejectionReason: null,
      discountMinor: 23_000,
      merchandiseDiscountMinor: 23_000,
      shippingDiscountMinor: 0,
      allocations: [
        { shopId: shopA, lineId: lineA, amountMinor: 18_000 },
        { shopId: shopB, lineId: lineB, amountMinor: 5_000 },
      ],
    },
    {
      code: 'FREESHIP-20K',
      slot: 'FREE_SHIPPING',
      shopId: null,
      status: 'APPLIED',
      name: 'Miễn phí vận chuyển 20K',
      issuer: 'PLATFORM',
      benefitType: 'FREE_SHIPPING',
      rejectionReason: null,
      discountMinor: 20_000,
      merchandiseDiscountMinor: 0,
      shippingDiscountMinor: 20_000,
      allocations: [
        { shopId: shopA, lineId: null, amountMinor: 9_286 },
        { shopId: shopB, lineId: null, amountMinor: 10_714 },
      ],
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
    shopVoucherDiscountMinor: 20_000,
    platformVoucherDiscountMinor: 23_000,
    merchandiseVoucherDiscountMinor: 43_000,
    shippingVoucherDiscountMinor: 20_000,
    voucherDiscountMinor: 63_000,
    shippingPayableMinor: 36_000,
    payableTotalMinor: 243_000,
  },
};

describe('pricing and voucher contracts', () => {
  it('normalizes canonical voucher codes and rejects malformed codes', () => {
    expect(normalizeVoucherCode('  platform-10  ')).toBe('PLATFORM-10');
    expect(normalizeVoucherCode('A--1')).toBe('A--1');
    expect(normalizeVoucherCode('abc')).toBeNull();
    expect(normalizeVoucherCode('-INVALID')).toBeNull();
    expect(normalizeVoucherCode('MÃ-UNICODE')).toBeNull();
  });

  it('accepts strict inputs, normalizes codes, and rejects duplicates or browser money', () => {
    const input = {
      shippingAddressId: addressId,
      services: [{ shopId: shopA, service: 'EXPRESS' }],
      vouchers: {
        platformCode: ' platform-10 ',
        shopCodes: [{ shopId: shopA, code: 'shop-20k' }],
        freeShippingCode: 'freeship-20k',
      },
    };
    expect(isPricingQuoteRequest(input)).toBe(true);
    expect(parsePricingQuoteRequest(input)?.vouchers).toEqual({
      platformCode: 'PLATFORM-10',
      shopCodes: [{ shopId: shopA, code: 'SHOP-20K' }],
      freeShippingCode: 'FREESHIP-20K',
    });
    expect(isPricingQuoteRequest({ shippingAddressId: addressId, discountMinor: 1 })).toBe(false);
    expect(
      isPricingQuoteRequest({
        shippingAddressId: addressId,
        vouchers: { platformCode: 'SAME-CODE', freeShippingCode: 'same-code' },
      }),
    ).toBe(false);
    expect(
      isPricingQuoteRequest({
        shippingAddressId: addressId,
        vouchers: {
          shopCodes: [
            { shopId: shopA, code: 'SHOP-ONE' },
            { shopId: shopA, code: 'SHOP-TWO' },
          ],
        },
      }),
    ).toBe(false);
  });

  it('accepts a fully reconciled promotion-aware multi-shop quote', () => {
    expect(isPricingQuoteResponse(quote)).toBe(true);
  });

  it('accepts a stable zero quote without vouchers', () => {
    const empty: PricingQuoteResponse = {
      ...quote,
      shops: [],
      vouchers: [],
      summary: {
        selectedLineCount: 0,
        selectedQuantity: 0,
        listSubtotalMinor: 0,
        productDiscountMinor: 0,
        merchandiseSubtotalMinor: 0,
        shippingTotalMinor: 0,
        shopVoucherDiscountMinor: 0,
        platformVoucherDiscountMinor: 0,
        merchandiseVoucherDiscountMinor: 0,
        shippingVoucherDiscountMinor: 0,
        voucherDiscountMinor: 0,
        shippingPayableMinor: 0,
        payableTotalMinor: 0,
      },
    };
    expect(isPricingQuoteResponse(empty)).toBe(true);
  });

  it('accepts safe rejection evidence without exposing metadata for unknown codes', () => {
    const rejected: PricingQuoteResponse = {
      ...quote,
      vouchers: [
        ...quote.vouchers,
        {
          code: 'UNKNOWN-CODE',
          slot: 'PLATFORM',
          shopId: null,
          status: 'REJECTED',
          name: null,
          issuer: null,
          benefitType: null,
          rejectionReason: 'NOT_FOUND',
          discountMinor: 0,
          merchandiseDiscountMinor: 0,
          shippingDiscountMinor: 0,
          allocations: [],
        },
      ],
    };
    // The fixture already contains a platform slot, so a second platform result is invalid.
    expect(isPricingQuoteResponse(rejected)).toBe(false);
    expect(
      isPricingQuoteResponse({
        ...quote,
        vouchers: [rejected.vouchers.at(-1)!],
        shops: quote.shops.map((shop) => ({
          ...shop,
          lines: shop.lines.map((line) => ({
            ...line,
            shopVoucherDiscountMinor: 0,
            platformVoucherDiscountMinor: 0,
            merchandiseVoucherDiscountMinor: 0,
            payableMerchandiseMinor: line.merchandiseSubtotalMinor,
          })),
          shopVoucherDiscountMinor: 0,
          platformVoucherDiscountMinor: 0,
          merchandiseVoucherDiscountMinor: 0,
          shippingVoucherDiscountMinor: 0,
          voucherDiscountMinor: 0,
          shippingPayableMinor: shop.shipping.shippingFeeMinor,
          payableTotalMinor: shop.merchandiseSubtotalMinor + shop.shipping.shippingFeeMinor,
        })),
        summary: {
          ...quote.summary,
          shopVoucherDiscountMinor: 0,
          platformVoucherDiscountMinor: 0,
          merchandiseVoucherDiscountMinor: 0,
          shippingVoucherDiscountMinor: 0,
          voucherDiscountMinor: 0,
          shippingPayableMinor: quote.summary.shippingTotalMinor,
          payableTotalMinor:
            quote.summary.merchandiseSubtotalMinor + quote.summary.shippingTotalMinor,
        },
      }),
    ).toBe(true);
  });

  it('rejects old versions, unknown fields, bad allocation references, and tampered totals', () => {
    expect(isPricingQuoteResponse({ ...quote, pricingVersion: 'pricing-v1' })).toBe(false);
    expect(isPricingQuoteResponse({ ...quote, totalMinor: 1 })).toBe(false);
    expect(
      isPricingQuoteResponse({
        ...quote,
        summary: { ...quote.summary, payableTotalMinor: quote.summary.payableTotalMinor + 1 },
      }),
    ).toBe(false);
    expect(
      isPricingQuoteResponse({
        ...quote,
        vouchers: quote.vouchers.map((voucher, index) =>
          index === 0
            ? {
                ...voucher,
                allocations: [
                  {
                    shopId: shopA,
                    lineId: '00000000-0000-4000-8000-000000000999',
                    amountMinor: 20_000,
                  },
                ],
              }
            : voucher,
        ),
      }),
    ).toBe(false);
  });

  it('keeps pricing Problem Details strict and sanitized', () => {
    expect(
      isPricingProblemDetails({
        type: 'https://shopee-clone.local/problems/pricing-input-invalid',
        title: 'Invalid pricing request',
        status: 400,
        detail: 'The pricing request is invalid.',
        invalidParameters: ['vouchers'],
      }),
    ).toBe(true);
    expect(
      isPricingProblemDetails({
        type: 'https://shopee-clone.local/problems/pricing-input-invalid',
        title: 'Invalid pricing request',
        status: 422,
        detail: 'The pricing request is invalid.',
      }),
    ).toBe(false);
  });
});

describe('legacy Vietnam province catalog', () => {
  it('resolves aliases, accents, prefixes, and every canonical entry', () => {
    expect(resolveLegacyVietnamProvince('TP. Hồ Chí Minh')?.code).toBe('79');
    expect(resolveLegacyVietnamProvince('Thanh pho Ho Chi Minh')?.code).toBe('79');
    expect(resolveLegacyVietnamProvince('Thành phố Huế')?.region).toBe('CENTRAL');
    expect(LEGACY_VIETNAM_PROVINCE_REGIONS).toHaveLength(63);
    expect(
      LEGACY_VIETNAM_PROVINCE_REGIONS.every(
        ({ name, code }) => resolveLegacyVietnamProvince(name)?.code === code,
      ),
    ).toBe(true);
  });

  it('normalizes administrative strings and returns null for unknown values', () => {
    expect(normalizeVietnameseAdministrativeName('  Thành phố   Đà Nẵng ')).toBe('da nang');
    expect(resolveLegacyVietnamProvince('Việt Nam')).toBeNull();
  });
});
