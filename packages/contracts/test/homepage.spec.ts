import { describe, expect, it } from 'vitest';

import { isHomepageResponse, parseHomepageResponse } from '../src';

const response = {
  evaluatedAt: '2026-08-12T00:00:00.000Z',
  modules: [
    {
      id: 'module-1',
      key: 'categories',
      type: 'category-shortcuts',
      title: 'Danh mục',
      sortOrder: 1,
      categories: [
        { id: 'cat-1', label: 'Điện tử', icon: '⚡', href: '/search?category=electronics' },
      ],
    },
  ],
};

describe('homepage contract', () => {
  it('accepts a valid discriminated response', () => {
    expect(isHomepageResponse(response)).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isHomepageResponse({ ...response, evaluatedAt: 'today' })).toBe(false);
    expect(
      isHomepageResponse({ ...response, modules: [{ type: 'flash-sale', products: 'no' }] }),
    ).toBe(false);
  });

  it('filters unknown future module types while retaining known modules', () => {
    expect(
      parseHomepageResponse({ ...response, modules: [...response.modules, { type: 'future' }] }),
    ).toEqual(response);
  });

  it('requires homepage scheduled pricing to match the displayed price', () => {
    const product = {
      id: 'product-1',
      name: 'Product',
      shopName: 'Shop',
      href: '/products/product-1',
      imageUrl: null,
      imageAlt: 'Product',
      priceMinor: 80_000,
      compareAtPriceMinor: 100_000,
      scheduledPrice: {
        basePriceMinor: 100_000,
        effectivePriceMinor: 80_000,
        compareAtPriceMinor: 100_000,
        discountBasisPoints: 2_000,
        campaignId: 'campaign-1',
        evaluatedAt: response.evaluatedAt,
      },
    };
    const withProduct = {
      ...response,
      modules: [
        {
          id: 'module-2',
          key: 'daily',
          type: 'daily-recommendations',
          title: 'Daily',
          sortOrder: 2,
          products: [product],
        },
      ],
    };
    expect(isHomepageResponse(withProduct)).toBe(true);
    expect(
      isHomepageResponse({
        ...withProduct,
        modules: [{ ...withProduct.modules[0], products: [{ ...product, priceMinor: 79_000 }] }],
      }),
    ).toBe(false);
  });
});
