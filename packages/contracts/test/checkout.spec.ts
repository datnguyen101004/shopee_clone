import {
  CHECKOUT_DRAFT_VERSION,
  isCheckoutConfirmationResponse,
  isCheckoutDraft,
  isCheckoutPreviewResponse,
  isCheckoutProblemDetails,
  isPurchaseResult,
  parseCheckoutConfirmationRequest,
  parseCheckoutPreviewRequest,
  type CheckoutPreviewResponse,
  type PurchaseResult,
} from '../src';
import { describe, expect, it } from 'vitest';

const addressId = '00000000-0000-4000-8000-000000000101';
const shopId = '00000000-0000-4000-8000-000000000201';
const lineId = '00000000-0000-4000-8000-000000000301';
const productId = '00000000-0000-4000-8000-000000000401';
const variantId = '00000000-0000-4000-8000-000000000501';
const purchaseReference = '00000000-0000-4000-8000-000000000601';
const orderReference = '00000000-0000-4000-8000-000000000701';
const fingerprint = 'a'.repeat(64);

const shop = {
  shop: { id: shopId, slug: 'shop-a', name: 'Shop A' },
  note: 'Giao giờ hành chính',
  lines: [
    {
      lineId,
      productId,
      variantId,
      quantity: 2,
      unitWeightGrams: 500,
      shipmentWeightGrams: 1_000,
      listUnitPriceMinor: 100_000,
      sellingUnitPriceMinor: 80_000,
      listSubtotalMinor: 200_000,
      productDiscountMinor: 40_000,
      merchandiseSubtotalMinor: 160_000,
      shopVoucherDiscountMinor: 0,
      platformVoucherDiscountMinor: 0,
      merchandiseVoucherDiscountMinor: 0,
      payableMerchandiseMinor: 160_000,
      productName: 'Sản phẩm A',
      productImageUrl: '/media/products/a.webp',
      variantName: 'Mặc định',
      variantSku: 'SKU-A',
    },
  ],
  shipping: {
    provider: 'MOCK' as const,
    version: 'mock-v1' as const,
    shopId,
    originProvince: 'Thành phố Hồ Chí Minh',
    destinationProvince: 'Thành phố Hồ Chí Minh',
    zone: 'SAME_PROVINCE' as const,
    shipmentWeightGrams: 1_000,
    service: 'STANDARD' as const,
    estimatedDaysMin: 2,
    estimatedDaysMax: 4,
    baseFeeMinor: 22_000,
    zoneSurchargeMinor: 0,
    weightSurchargeMinor: 4_000,
    shippingFeeMinor: 26_000,
  },
  listSubtotalMinor: 200_000,
  productDiscountMinor: 40_000,
  merchandiseSubtotalMinor: 160_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  shippingVoucherDiscountMinor: 0,
  voucherDiscountMinor: 0,
  shippingPayableMinor: 26_000,
  payableTotalMinor: 186_000,
};

const summary = {
  selectedLineCount: 1,
  selectedQuantity: 2,
  listSubtotalMinor: 200_000,
  productDiscountMinor: 40_000,
  merchandiseSubtotalMinor: 160_000,
  shippingTotalMinor: 26_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  shippingVoucherDiscountMinor: 0,
  voucherDiscountMinor: 0,
  shippingPayableMinor: 26_000,
  payableTotalMinor: 186_000,
};

const address = {
  id: addressId,
  recipientName: 'Nguyễn Văn A',
  phoneNumber: '0901234567',
  province: 'Thành phố Hồ Chí Minh',
  district: 'Quận 1',
  ward: 'Phường Bến Nghé',
  addressLine: '1 Nguyễn Huệ',
  label: 'Nhà riêng',
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
  orders: [
    {
      ...shop,
      orderReference,
      status: 'PENDING_CONFIRMATION',
      paymentStatus: 'UNPAID',
    },
  ],
  vouchers: [],
  summary,
};

describe('checkout contracts', () => {
  it('normalizes notes, voucher codes, and per-shop inputs deterministically', () => {
    const parsed = parseCheckoutPreviewRequest({
      shippingAddressId: addressId,
      services: [{ shopId, service: 'STANDARD' }],
      vouchers: { platformCode: ' platform-10 ' },
      notes: [{ shopId, note: '  Giao giờ hành chính  ' }],
    });
    expect(parsed).toEqual({
      shippingAddressId: addressId,
      services: [{ shopId, service: 'STANDARD' }],
      vouchers: { platformCode: 'PLATFORM-10' },
      notes: [{ shopId, note: 'Giao giờ hành chính' }],
    });
  });

  it('rejects unknown fields, duplicate shops, control characters, and browser money', () => {
    expect(
      parseCheckoutPreviewRequest({
        shippingAddressId: addressId,
        services: [{ shopId, service: 'STANDARD' }],
        payableTotalMinor: 1,
      }),
    ).toBeNull();
    expect(
      parseCheckoutPreviewRequest({
        shippingAddressId: addressId,
        services: [
          { shopId, service: 'STANDARD' },
          { shopId, service: 'EXPRESS' },
        ],
      }),
    ).toBeNull();
    expect(
      parseCheckoutPreviewRequest({
        shippingAddressId: addressId,
        services: [{ shopId, service: 'STANDARD' }],
        notes: [{ shopId, note: 'Không hợp lệ\n' }],
      }),
    ).toBeNull();
  });

  it('requires a canonical fingerprint for confirmation', () => {
    expect(
      parseCheckoutConfirmationRequest({
        shippingAddressId: addressId,
        services: [{ shopId, service: 'STANDARD' }],
        checkoutFingerprint: fingerprint,
      }),
    ).not.toBeNull();
    expect(
      parseCheckoutConfirmationRequest({
        shippingAddressId: addressId,
        services: [{ shopId, service: 'STANDARD' }],
        checkoutFingerprint: 'invalid',
      }),
    ).toBeNull();
  });

  it('accepts only versioned ID-only checkout drafts', () => {
    expect(
      isCheckoutDraft({
        version: CHECKOUT_DRAFT_VERSION,
        cartVersion: 7,
        shippingAddressId: addressId,
        services: [{ shopId, service: 'STANDARD' }],
      }),
    ).toBe(true);
    expect(
      isCheckoutDraft({
        version: CHECKOUT_DRAFT_VERSION,
        cartVersion: 7,
        shippingAddressId: addressId,
        services: [],
        recipientName: 'Không được lưu',
      }),
    ).toBe(false);
  });

  it('validates a ready preview and rejects inconsistent readiness or totals', () => {
    expect(isCheckoutPreviewResponse(preview)).toBe(true);
    expect(isCheckoutPreviewResponse({ ...preview, ready: false, checkoutFingerprint: null })).toBe(
      false,
    );
    expect(
      isCheckoutPreviewResponse({
        ...preview,
        summary: { ...preview.summary, payableTotalMinor: 1 },
      }),
    ).toBe(false);
  });

  it('accepts blocked previews only without a fingerprint', () => {
    const blocked = {
      ...preview,
      ready: false,
      checkoutFingerprint: null,
      blockers: [
        {
          code: 'LINE_UNAVAILABLE',
          message: 'Sản phẩm không còn khả dụng.',
          shopId,
          lineId,
          voucherCode: null,
        },
      ],
    };
    expect(isCheckoutPreviewResponse(blocked)).toBe(true);
    expect(isCheckoutPreviewResponse({ ...blocked, checkoutFingerprint: fingerprint })).toBe(false);
  });

  it('validates immutable purchase and replay responses', () => {
    expect(isPurchaseResult(purchase)).toBe(true);
    expect(isCheckoutConfirmationResponse({ replayed: false, purchase })).toBe(true);
    expect(isCheckoutConfirmationResponse({ replayed: true, purchase })).toBe(true);
    expect(
      isPurchaseResult({
        ...purchase,
        orders: [{ ...purchase.orders[0], payableTotalMinor: Number.MAX_SAFE_INTEGER }],
      }),
    ).toBe(false);
  });

  it('validates stable Problem Details extensions', () => {
    expect(
      isCheckoutProblemDetails({
        type: 'https://shopee-clone.local/problems/checkout-preview-changed',
        title: 'Checkout đã thay đổi',
        status: 409,
        detail: 'Vui lòng xác nhận lại tổng tiền mới.',
        currentCartVersion: 8,
        preview,
      }),
    ).toBe(true);
    expect(
      isCheckoutProblemDetails({
        type: 'about:blank',
        title: 'Sai',
        status: 422,
        detail: 'Sai',
      }),
    ).toBe(false);
  });
});
