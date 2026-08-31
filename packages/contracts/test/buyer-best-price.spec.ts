import {
  buyerDisplayProductPriceMinor,
  isBuyerBestPricePreview,
  type BuyerBestPricePreview,
} from '../src';
import { describe, expect, it } from 'vitest';

const merchandiseOnly: BuyerBestPricePreview = {
  version: 'buyer-best-price-v1',
  quantity: 1,
  currency: 'VND',
  evaluatedAt: '2026-08-31T03:00:00.000Z',
  effectivePriceMinor: 100_000,
  shopVoucher: {
    code: 'SHOP10K',
    name: 'Shop giảm 10K',
    slot: 'SHOP',
    discountMinor: 10_000,
  },
  platformVoucher: {
    code: 'SALE10',
    name: 'Sàn giảm 10%',
    slot: 'PLATFORM',
    discountMinor: 9_000,
  },
  shopVoucherDiscountMinor: 10_000,
  platformVoucherDiscountMinor: 9_000,
  merchandiseDiscountMinor: 19_000,
  merchandisePayableMinor: 81_000,
  shipping: null,
};

describe('buyer best price contract', () => {
  it('uses effective product price for guests', () => {
    expect(
      buyerDisplayProductPriceMinor({
        priceMinor: 100_000,
        scheduledPrice: {
          basePriceMinor: 120_000,
          effectivePriceMinor: 100_000,
          compareAtPriceMinor: 120_000,
          discountBasisPoints: 1_667,
          campaignId: 'campaign-1',
          evaluatedAt: '2026-08-31T03:00:00.000Z',
        },
      }),
    ).toBe(100_000);
  });

  it('accepts a valid merchandise-only preview and selects its payable', () => {
    expect(isBuyerBestPricePreview(merchandiseOnly)).toBe(true);
    expect(
      buyerDisplayProductPriceMinor({ priceMinor: 100_000, buyerBestPrice: merchandiseOnly }),
    ).toBe(81_000);
  });

  it('accepts a reconciled address-aware shipping preview', () => {
    const preview: BuyerBestPricePreview = {
      ...merchandiseOnly,
      shipping: {
        service: 'STANDARD',
        shippingFeeMinor: 25_000,
        voucher: {
          code: 'FREESHIP15K',
          name: 'Miễn phí vận chuyển 15K',
          slot: 'FREE_SHIPPING',
          discountMinor: 15_000,
        },
        shippingVoucherDiscountMinor: 15_000,
        shippingPayableMinor: 10_000,
        estimatedPayableMinor: 91_000,
      },
    };
    expect(isBuyerBestPricePreview(preview)).toBe(true);
  });

  it.each([
    { ...merchandiseOnly, version: 'buyer-best-price-v2' },
    { ...merchandiseOnly, merchandisePayableMinor: 80_999 },
    { ...merchandiseOnly, merchandiseDiscountMinor: Number.MAX_SAFE_INTEGER + 1 },
    {
      ...merchandiseOnly,
      shopVoucher: { ...merchandiseOnly.shopVoucher!, slot: 'PLATFORM' },
    },
    {
      ...merchandiseOnly,
      shipping: {
        service: 'STANDARD',
        shippingFeeMinor: 10_000,
        voucher: null,
        shippingVoucherDiscountMinor: 1,
        shippingPayableMinor: 9_999,
        estimatedPayableMinor: 90_999,
      },
    },
  ])('rejects malformed or inconsistent preview %#', (preview) => {
    expect(isBuyerBestPricePreview(preview)).toBe(false);
    expect(
      buyerDisplayProductPriceMinor({
        priceMinor: 100_000,
        buyerBestPrice: preview as BuyerBestPricePreview,
      }),
    ).toBe(100_000);
  });

  it('rejects a preview evaluated for a different effective price', () => {
    expect(
      buyerDisplayProductPriceMinor({ priceMinor: 99_000, buyerBestPrice: merchandiseOnly }),
    ).toBe(99_000);
  });
});
