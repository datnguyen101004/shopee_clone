import type { CheckoutPreviewResponse, PurchaseResult } from '@shopee-clone/contracts';
import { describe, expect, it, vi } from 'vitest';

import { confirmCodCheckout, getCheckoutPurchase, previewCheckout } from './checkout-api';

const addressId = '00000000-0000-4000-8000-000000000101';
const shopId = '00000000-0000-4000-8000-000000000201';
const lineId = '00000000-0000-4000-8000-000000000301';
const productId = '00000000-0000-4000-8000-000000000401';
const variantId = '00000000-0000-4000-8000-000000000501';
const purchaseReference = '00000000-0000-4000-8000-000000000601';
const orderReference = '00000000-0000-4000-8000-000000000701';
const idempotencyKey = '00000000-0000-4000-8000-000000000801';
const fingerprint = 'a'.repeat(64);
const line = {
  lineId,
  productId,
  variantId,
  quantity: 1,
  unitWeightGrams: 500,
  shipmentWeightGrams: 500,
  listUnitPriceMinor: 100_000,
  sellingUnitPriceMinor: 80_000,
  listSubtotalMinor: 100_000,
  productDiscountMinor: 20_000,
  merchandiseSubtotalMinor: 80_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  payableMerchandiseMinor: 80_000,
  productName: 'Product',
  productImageUrl: null,
  variantName: 'Default',
  variantSku: 'SKU',
};
const shop = {
  shop: { id: shopId, slug: 'shop-a', name: 'Shop A' },
  note: '',
  lines: [line],
  shipping: {
    provider: 'MOCK' as const,
    version: 'mock-v1' as const,
    shopId,
    originProvince: 'Hà Nội',
    destinationProvince: 'Hà Nội',
    zone: 'SAME_PROVINCE' as const,
    shipmentWeightGrams: 500,
    service: 'STANDARD' as const,
    estimatedDaysMin: 2,
    estimatedDaysMax: 4,
    baseFeeMinor: 22_000,
    zoneSurchargeMinor: 0,
    weightSurchargeMinor: 0,
    shippingFeeMinor: 22_000,
  },
  listSubtotalMinor: 100_000,
  productDiscountMinor: 20_000,
  merchandiseSubtotalMinor: 80_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  shippingVoucherDiscountMinor: 0,
  voucherDiscountMinor: 0,
  shippingPayableMinor: 22_000,
  payableTotalMinor: 102_000,
};
const summary = {
  selectedLineCount: 1,
  selectedQuantity: 1,
  listSubtotalMinor: 100_000,
  productDiscountMinor: 20_000,
  merchandiseSubtotalMinor: 80_000,
  shippingTotalMinor: 22_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  shippingVoucherDiscountMinor: 0,
  voucherDiscountMinor: 0,
  shippingPayableMinor: 22_000,
  payableTotalMinor: 102_000,
};
const address = {
  id: addressId,
  recipientName: 'Buyer',
  phoneNumber: '0900000000',
  province: 'Hà Nội',
  district: 'Ba Đình',
  ward: 'Phúc Xá',
  addressLine: '1 Hồng Hà',
  label: null,
};
const preview: CheckoutPreviewResponse = {
  checkoutVersion: 'checkout-v1',
  pricingVersion: 'pricing-v2',
  voucherVersion: 'voucher-v1',
  shippingVersion: 'mock-v1',
  currency: 'VND',
  evaluatedAt: '2026-08-14T05:00:00.000Z',
  cartVersion: 7,
  ready: true,
  checkoutFingerprint: fingerprint,
  address,
  shops: [shop],
  vouchers: [],
  exclusions: [],
  blockers: [],
  summary,
};
const purchase: PurchaseResult = {
  checkoutVersion: 'checkout-v1',
  pricingVersion: 'pricing-v2',
  voucherVersion: 'voucher-v1',
  shippingVersion: 'mock-v1',
  currency: 'VND',
  purchaseReference,
  createdAt: '2026-08-14T05:01:00.000Z',
  sourceCartVersion: 7,
  paymentMethod: 'COD',
  paymentStatus: 'UNPAID',
  address,
  orders: [{ ...shop, orderReference, status: 'PENDING_CONFIRMATION', paymentStatus: 'UNPAID' }],
  vouchers: [],
  summary,
};

describe('checkout API client', () => {
  it('sends ETag and ID-only preview input without client money', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(preview)));
    await expect(
      previewCheckout(
        { shippingAddressId: addressId, services: [{ shopId, service: 'STANDARD' }] },
        7,
        fetcher,
      ),
    ).resolves.toEqual(preview);
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('If-Match')).toBe('"cart-7"');
    expect(String(init.body)).not.toContain('TotalMinor');
  });

  it('sends a stable idempotency key and validates confirmation and owner read', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ replayed: false, purchase }), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(purchase)));
    await confirmCodCheckout(
      {
        shippingAddressId: addressId,
        services: [{ shopId, service: 'STANDARD' }],
        checkoutFingerprint: fingerprint,
      },
      7,
      idempotencyKey,
      fetcher,
    );
    expect(
      new Headers((fetcher.mock.calls[0]![1] as RequestInit).headers).get('Idempotency-Key'),
    ).toBe(idempotencyKey);
    await expect(getCheckoutPurchase(purchaseReference, fetcher)).resolves.toEqual(purchase);
  });

  it('rejects malformed success and parses safe Problem Details', async () => {
    const malformed = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ...preview, total: 1 })));
    await expect(
      previewCheckout(
        { shippingAddressId: addressId, services: [{ shopId, service: 'STANDARD' }] },
        7,
        malformed,
      ),
    ).rejects.toMatchObject({ kind: 'contract' });
    const conflict = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            type: 'https://shopee-clone.local/problems/checkout-cart-conflict',
            title: 'Cart changed',
            status: 409,
            detail: 'Reload.',
          }),
          { status: 409 },
        ),
      );
    await expect(
      previewCheckout(
        { shippingAddressId: addressId, services: [{ shopId, service: 'STANDARD' }] },
        7,
        conflict,
      ),
    ).rejects.toMatchObject({ kind: 'status', status: 409 });
  });
});
