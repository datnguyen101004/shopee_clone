import { describe, expect, it } from 'vitest';

import { isCatalogProductsResponse, parseCatalogProductsResponse } from '../src';

const response = {
  query: { category: 'mobile-accessories' },
  pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1 },
  items: [
    {
      id: 'product-1',
      name: 'Tai nghe không dây',
      href: '/products/product-1',
      imageUrl: '/media/products/wireless-earbuds.svg',
      imageAlt: 'Tai nghe không dây',
      priceMinor: 399_000,
      compareAtPriceMinor: 499_000,
      discountPercent: 20,
      ratingAverageBasisPoints: 490,
      ratingCount: 128,
      soldCount: 941,
      shop: { name: 'Tech Zone', location: 'TP. Hồ Chí Minh' },
      category: { slug: 'mobile-accessories', name: 'Điện thoại & Phụ kiện' },
    },
  ],
};

describe('catalog contract', () => {
  it('accepts a valid paginated response', () => {
    expect(parseCatalogProductsResponse(response)).toEqual(response);
  });

  it('rejects malformed payloads and inconsistent pagination', () => {
    expect(isCatalogProductsResponse({ ...response, items: 'products' })).toBe(false);
    expect(
      isCatalogProductsResponse({
        ...response,
        pagination: { ...response.pagination, totalPages: 2 },
      }),
    ).toBe(false);
  });

  it('rejects invalid money and incomplete promotions', () => {
    expect(
      isCatalogProductsResponse({
        ...response,
        items: [{ ...response.items[0], priceMinor: 1.5 }],
      }),
    ).toBe(false);
    expect(
      isCatalogProductsResponse({
        ...response,
        items: [{ ...response.items[0], discountPercent: undefined }],
      }),
    ).toBe(false);
  });

  it('rejects invalid ratings and pagination bounds', () => {
    expect(
      isCatalogProductsResponse({
        ...response,
        items: [{ ...response.items[0], ratingAverageBasisPoints: 501 }],
      }),
    ).toBe(false);
    expect(
      isCatalogProductsResponse({
        ...response,
        pagination: { ...response.pagination, page: 0 },
      }),
    ).toBe(false);
    expect(
      isCatalogProductsResponse({
        ...response,
        pagination: { ...response.pagination, pageSize: 49 },
      }),
    ).toBe(false);
  });
});
