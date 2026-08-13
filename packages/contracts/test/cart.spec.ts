import { isCartMutationResponse, isCartProblemDetails, isCartResponse } from '../src';
import { describe, expect, it } from 'vitest';

const shopId = '00000000-0000-4000-8000-000000000010';
const productId = '00000000-0000-4000-8000-000000000020';
const variantId = '00000000-0000-4000-8000-000000000030';
const lineId = '00000000-0000-4000-8000-000000000040';

const line = {
  id: lineId,
  product: {
    id: productId,
    name: 'Sample product',
    href: `/products/${productId}`,
    imageUrl: null,
    imageAlt: 'Sample product',
  },
  variant: { id: variantId, name: 'Default' },
  unitPriceMinor: 100_000,
  previousUnitPriceMinor: null,
  availableQuantity: 10,
  maxPurchaseQuantity: 10,
  quantity: 2,
  selected: true,
  effectivelySelected: true,
  eligible: true,
  lineSubtotalMinor: 200_000,
  issues: [],
};

const cart = {
  owner: 'authenticated',
  version: 1,
  groups: [
    {
      shop: {
        id: shopId,
        slug: 'sample-shop',
        name: 'Sample shop',
        href: '/shops/sample-shop',
      },
      lines: [line],
      selectedEligibleLineCount: 1,
      eligibleLineCount: 1,
    },
  ],
  summary: {
    distinctLineCount: 1,
    selectedValidLineCount: 1,
    selectedValidQuantity: 2,
    selectedMerchandiseSubtotalMinor: 200_000,
  },
};

describe('cart contracts', () => {
  it('accepts canonical empty and populated multi-shop projections', () => {
    expect(
      isCartResponse({
        owner: 'authenticated',
        version: 0,
        groups: [],
        summary: {
          distinctLineCount: 0,
          selectedValidLineCount: 0,
          selectedValidQuantity: 0,
          selectedMerchandiseSubtotalMinor: 0,
        },
      }),
    ).toBe(true);
    expect(isCartResponse(cart)).toBe(true);
  });

  it('accepts typed price, stock and unavailable reconciliation states', () => {
    const unavailableLine = {
      ...line,
      product: { ...line.product, href: null },
      selected: true,
      effectivelySelected: false,
      eligible: false,
      issues: [
        {
          code: 'unavailable',
          message: 'Sản phẩm hiện không còn khả dụng.',
          previousUnitPriceMinor: null,
          currentUnitPriceMinor: 100_000,
          availableQuantity: 0,
        },
      ],
    };
    expect(
      isCartResponse({
        ...cart,
        groups: [
          {
            ...cart.groups[0],
            lines: [unavailableLine],
            selectedEligibleLineCount: 0,
            eligibleLineCount: 0,
          },
        ],
        summary: {
          distinctLineCount: 1,
          selectedValidLineCount: 0,
          selectedValidQuantity: 0,
          selectedMerchandiseSubtotalMinor: 0,
        },
      }),
    ).toBe(true);

    expect(
      isCartResponse({
        ...cart,
        groups: [
          {
            ...cart.groups[0],
            lines: [
              {
                ...line,
                previousUnitPriceMinor: 90_000,
                issues: [
                  {
                    code: 'price-changed',
                    message: 'Giá sản phẩm đã thay đổi.',
                    previousUnitPriceMinor: 90_000,
                    currentUnitPriceMinor: 100_000,
                    availableQuantity: null,
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it('accepts authenticated mutation adjustments', () => {
    expect(
      isCartMutationResponse({
        cart,
        adjustments: [
          {
            code: 'quantity-capped',
            variantId,
            lineId,
            requestedQuantity: 20,
            acceptedQuantity: 10,
            message: 'Số lượng được điều chỉnh theo tồn kho.',
          },
        ],
      }),
    ).toBe(true);
  });

  it('rejects unknown fields, inconsistent totals and unsafe money', () => {
    expect(isCartResponse({ ...cart, owner: 'guest' })).toBe(false);
    expect(isCartResponse({ ...cart, extra: true })).toBe(false);
    expect(
      isCartResponse({
        ...cart,
        summary: { ...cart.summary, selectedMerchandiseSubtotalMinor: 1 },
      }),
    ).toBe(false);
    expect(
      isCartResponse({
        ...cart,
        groups: [
          {
            ...cart.groups[0],
            lines: [{ ...line, unitPriceMinor: Number.MAX_SAFE_INTEGER }],
          },
        ],
      }),
    ).toBe(false);
  });

  it('accepts sanitized cart Problem Details only', () => {
    expect(
      isCartProblemDetails({
        type: 'https://shopee-clone.local/problems/cart-conflict',
        title: 'Cart changed',
        status: 409,
        detail: 'Reload the cart and try again.',
      }),
    ).toBe(true);
    expect(
      isCartProblemDetails({
        type: 'about:blank',
        title: 'Error',
        status: 500,
        detail: 'stack trace',
      }),
    ).toBe(false);
  });
});
