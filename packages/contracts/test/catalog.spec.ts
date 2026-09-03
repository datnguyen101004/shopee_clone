import { describe, expect, it } from 'vitest';

import { isCatalogProductsResponse, parseCatalogProductsResponse } from '../src';

const response = {
  query: {
    q: 'tai nghe',
    category: 'mobile-accessories',
    minPrice: 100_000,
    maxPrice: 500_000,
    rating: 4,
    location: 'TP. Hồ Chí Minh',
    availability: 'in-stock',
    promotion: 'discounted',
    sort: 'relevance',
  },
  pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1 },
  facets: {
    categories: [
      { slug: 'mobile-accessories', name: 'Điện thoại & Phụ kiện', parentSlug: 'electronics' },
    ],
    locations: ['TP. Hồ Chí Minh'],
    priceRange: { min: 179_000, max: 12_990_000 },
  },
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

  it('accepts matching scheduled pricing and rejects a divergent canonical price', () => {
    const scheduledPrice = {
      basePriceMinor: 499_000,
      effectivePriceMinor: 399_000,
      compareAtPriceMinor: 499_000,
      discountBasisPoints: 2_000,
      campaignId: 'campaign-1',
      evaluatedAt: '2026-08-31T00:00:00.000Z',
    };
    expect(
      isCatalogProductsResponse({
        ...response,
        items: [{ ...response.items[0], scheduledPrice }],
      }),
    ).toBe(true);
    expect(
      isCatalogProductsResponse({
        ...response,
        items: [{ ...response.items[0], priceMinor: 398_000, scheduledPrice }],
      }),
    ).toBe(false);
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

  it('rejects malformed discovery context and facets', () => {
    expect(
      isCatalogProductsResponse({
        ...response,
        query: { ...response.query, minPrice: 600_000, maxPrice: 500_000 },
      }),
    ).toBe(false);
    expect(
      isCatalogProductsResponse({
        ...response,
        query: { ...response.query, sort: 'popular' },
      }),
    ).toBe(false);
    expect(
      isCatalogProductsResponse({
        ...response,
        facets: { ...response.facets, priceRange: { min: 2, max: 1 } },
      }),
    ).toBe(false);
  });
});
