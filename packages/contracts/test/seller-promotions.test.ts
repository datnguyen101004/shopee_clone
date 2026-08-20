import { describe, expect, it } from 'vitest';
import { formatSellerPromotionVersionEtag, inspectSellerVoucherCreateRequest, parseSellerDiscountCreateRequest, parseSellerPromotionActionRequest, parseSellerPromotionIdempotencyKey, parseSellerVoucherCreateRequest, parseSellerVoucherUpdateRequest, parseSellerPromotionVersionEtag } from '../src/seller-promotions';

const productId = '00000000-0000-4000-8000-000000000001';
const dates = { startsAt: '2026-08-19T00:00:00.000Z', endsAt: '2026-08-26T00:00:00.000Z' };

describe('seller promotion contracts', () => {
  it('accepts fixed voucher and normalizes code', () => {
    expect(parseSellerVoucherCreateRequest({ code: ' shop-10 ', name: 'Shop ten', benefitType: 'FIXED_AMOUNT', fixedAmountMinor: 10000, percentageBasisPoints: null, maximumDiscountMinor: null, minimumSpendMinor: 100000, ...dates, usageLimit: 10, perBuyerLimit: 1, productIds: [productId] })).toMatchObject({ code: 'SHOP-10', productIds: [productId] });
  });
  it('rejects unknown keys, invalid rate and malformed UUID idempotency', () => {
    expect(parseSellerVoucherCreateRequest({ code: 'SHOP10', name: 'x', benefitType: 'PERCENTAGE', fixedAmountMinor: null, percentageBasisPoints: 9500, maximumDiscountMinor: null, minimumSpendMinor: 0, ...dates, usageLimit: 1, perBuyerLimit: 1, productIds: [], extra: true })).toBeNull();
    expect(parseSellerDiscountCreateRequest({ name: 'Sale', ...dates, products: [{ productId, discountBasisPoints: 0 }] })).toBeNull();
    expect(parseSellerPromotionIdempotencyKey('not-a-uuid')).toBeNull();
  });
  it('reports short voucher codes with a specific code field error', () => {
    const inspected = inspectSellerVoucherCreateRequest({
      code: 'ABC',
      name: 'Giảm 20k',
      benefitType: 'FIXED_AMOUNT',
      fixedAmountMinor: 20000,
      percentageBasisPoints: null,
      maximumDiscountMinor: null,
      minimumSpendMinor: 300000,
      ...dates,
      usageLimit: 100,
      perBuyerLimit: 1,
      productIds: [],
    });
    expect(inspected).toMatchObject({
      ok: false,
      invalidParameters: ['code'],
      detail: 'Voucher code must be 4-32 characters using A-Z, 0-9, and optional hyphens.',
    });
  });
  it('supports partial update, actions and strong ETags', () => {
    expect(parseSellerVoucherUpdateRequest({ name: 'Updated' })).toEqual({ name: 'Updated' });
    expect(parseSellerPromotionActionRequest({ action: 'PAUSE' })).toEqual({ action: 'PAUSE' });
    expect(parseSellerPromotionVersionEtag(formatSellerPromotionVersionEtag(12))).toBe(12);
    expect(parseSellerPromotionVersionEtag('W/"seller-promotion-12"')).toBeNull();
  });
});
