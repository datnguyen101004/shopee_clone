import type { CheckoutConfirmationRequest, CheckoutPreviewResponse } from '@shopee-clone/contracts';

import {
  advisoryLockKeys,
  checkoutFingerprint,
  confirmationRequestDigest,
  fingerprintsEqual,
} from './checkout-canonical';

const userId = '00000000-0000-4000-8000-000000000001';
const addressId = '00000000-0000-4000-8000-000000000002';
const shopId = '00000000-0000-4000-8000-000000000003';

const request: CheckoutConfirmationRequest = {
  shippingAddressId: addressId,
  services: [{ shopId, service: 'STANDARD' }],
  notes: [{ shopId, note: 'Giao giờ hành chính' }],
  checkoutFingerprint: 'a'.repeat(64),
};

const preview = {
  checkoutVersion: 'checkout-v1',
  pricingVersion: 'pricing-v2',
  voucherVersion: 'voucher-v1',
  shippingVersion: 'mock-v1',
  currency: 'VND',
  evaluatedAt: '2026-08-14T05:00:00.000Z',
  cartVersion: 2,
  ready: true,
  checkoutFingerprint: null,
  address: {
    id: addressId,
    recipientName: 'Buyer',
    phoneNumber: '0900000000',
    province: 'Hà Nội',
    district: 'Ba Đình',
    ward: 'Phúc Xá',
    addressLine: '1 Hồng Hà',
    label: null,
  },
  shops: [],
  vouchers: [],
  exclusions: [],
  blockers: [],
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
} satisfies CheckoutPreviewResponse;

describe('checkout canonicalization', () => {
  it('keeps request digests stable across equivalent shop ordering', () => {
    const otherShop = '00000000-0000-4000-8000-000000000004';
    const left = {
      ...request,
      services: [{ shopId: otherShop, service: 'EXPRESS' as const }, ...request.services],
    };
    const right = { ...left, services: [...left.services].reverse() };
    expect(confirmationRequestDigest(userId, 2, left)).toBe(
      confirmationRequestDigest(userId, 2, right),
    );
  });

  it('changes request digests for any materially different confirmation', () => {
    expect(confirmationRequestDigest(userId, 2, request)).not.toBe(
      confirmationRequestDigest(userId, 3, request),
    );
    expect(confirmationRequestDigest(userId, 2, request)).not.toBe(
      confirmationRequestDigest(userId, 2, { ...request, notes: [] }),
    );
  });

  it('excludes evaluation time but includes address and checkout facts in fingerprints', () => {
    const first = checkoutFingerprint(preview);
    expect(checkoutFingerprint({ ...preview, evaluatedAt: '2027-01-01T00:00:00.000Z' })).toBe(
      first,
    );
    expect(
      checkoutFingerprint({
        ...preview,
        address: { ...preview.address, ward: 'Phường khác' },
      }),
    ).not.toBe(first);
  });

  it('ignores campaign observation time but keeps campaign facts in fingerprints', () => {
    const withCampaign = {
      ...preview,
      shops: [
        {
          shop: { id: shopId, ownerUserId: userId, slug: 'shop', name: 'Shop' },
          note: '',
          lines: [
            {
              lineId: 'line-1',
              variantId: 'variant-1',
              productId: 'product-1',
              quantity: 1,
              campaignPrice: {
                sourceKind: 'MARKETPLACE',
                campaignId: 'campaign-1',
                campaignTypeCode: 'FLASH_SALE',
                policyVersion: 1,
                discountBasisPoints: 1500,
                evaluatedAt: '2026-08-14T05:00:00.000Z',
              },
            },
          ],
        },
      ],
    } as unknown as CheckoutPreviewResponse;
    const first = checkoutFingerprint(withCampaign);
    const changedTime = {
      ...withCampaign,
      shops: withCampaign.shops.map((shop) => ({
        ...shop,
        lines: shop.lines.map((line) => ({
          ...line,
          campaignPrice: {
            ...line.campaignPrice,
            evaluatedAt: '2027-01-01T00:00:00.000Z',
          },
        })),
      })),
    } as unknown as CheckoutPreviewResponse;
    expect(
      checkoutFingerprint(changedTime),
    ).toBe(first);
    const changedCampaign = {
      ...withCampaign,
      shops: withCampaign.shops.map((shop) => ({
        ...shop,
        lines: shop.lines.map((line) => ({
          ...line,
          campaignPrice: { ...line.campaignPrice, campaignId: 'campaign-2' },
        })),
      })),
    } as unknown as CheckoutPreviewResponse;
    expect(
      checkoutFingerprint(changedCampaign),
    ).not.toBe(first);
  });

  it('derives deterministic signed advisory keys and compares digests safely', () => {
    expect(advisoryLockKeys(userId, '00000000-0000-4000-8000-000000000005')).toEqual(
      advisoryLockKeys(userId, '00000000-0000-4000-8000-000000000005'),
    );
    expect(fingerprintsEqual('a'.repeat(64), 'a'.repeat(64))).toBe(true);
    expect(fingerprintsEqual('a'.repeat(64), 'b'.repeat(64))).toBe(false);
  });
});
