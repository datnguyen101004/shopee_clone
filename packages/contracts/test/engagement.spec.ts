import {
  ENGAGEMENT_DEFAULT_PAGE_SIZE,
  ENGAGEMENT_MAX_PAGE_SIZE,
  isFavoriteMutationResponse,
  isFavoritePage,
  isFavoriteStateList,
  isRecentlyViewedPage,
  parseEngagementPageQuery,
  parseFavoriteStatusProductIds,
} from '../src';
import { describe, expect, it } from 'vitest';

const productId = '00000000-0000-4000-8000-000000000101';
const secondProductId = '00000000-0000-4000-8000-000000000102';
const timestamp = '2026-08-13T01:00:00.000Z';
const product = {
  id: productId,
  name: 'Sample product',
  href: `/products/${productId}`,
  imageUrl: null,
  imageAlt: 'Sample product',
  priceMinor: 100000,
  ratingAverageBasisPoints: 450,
  ratingCount: 10,
  soldCount: 20,
  shop: { name: 'Sample shop', location: 'Hà Nội' },
  category: { slug: 'sample', name: 'Sample' },
};

describe('buyer engagement contracts', () => {
  it('parses strict page query defaults and bounds', () => {
    expect(parseEngagementPageQuery({})).toEqual({
      page: 1,
      pageSize: ENGAGEMENT_DEFAULT_PAGE_SIZE,
    });
    expect(
      parseEngagementPageQuery({ page: '2', pageSize: String(ENGAGEMENT_MAX_PAGE_SIZE) }),
    ).toEqual({
      page: 2,
      pageSize: ENGAGEMENT_MAX_PAGE_SIZE,
    });
    expect(parseEngagementPageQuery({ page: ['2'] })).toBeNull();
    expect(parseEngagementPageQuery({ pageSize: '49' })).toBeNull();
    expect(parseEngagementPageQuery({ extra: '1' })).toBeNull();
  });

  it('parses a bounded unique favorite status list', () => {
    expect(parseFavoriteStatusProductIds(`${productId},${secondProductId}`)).toEqual([
      productId,
      secondProductId,
    ]);
    expect(parseFavoriteStatusProductIds(`${productId},${productId}`)).toBeNull();
    expect(parseFavoriteStatusProductIds('invalid')).toBeNull();
  });

  it('validates canonical favorite state and mutations', () => {
    expect(isFavoriteStateList({ items: [{ productId, isFavorite: true }] })).toBe(true);
    expect(isFavoriteStateList({ items: [{ productId, isFavorite: true, extra: true }] })).toBe(
      false,
    );
    expect(
      isFavoriteMutationResponse({ productId, isFavorite: true, favoritedAt: timestamp }),
    ).toBe(true);
    expect(
      isFavoriteMutationResponse({ productId, isFavorite: false, favoritedAt: timestamp }),
    ).toBe(false);
  });

  it('validates available and unavailable favorites with canonical pagination', () => {
    expect(
      isFavoritePage({
        items: [{ availability: 'available', productId, favoritedAt: timestamp, product }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      }),
    ).toBe(true);
    expect(
      isFavoritePage({
        items: [
          {
            availability: 'unavailable',
            productId,
            favoritedAt: timestamp,
            product: {
              id: productId,
              name: 'Hidden',
              href: null,
              imageUrl: null,
              imageAlt: 'Hidden',
            },
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      }),
    ).toBe(true);
  });

  it('validates deduplicated recently viewed pages and canonical timestamps', () => {
    expect(
      isRecentlyViewedPage({
        items: [{ productId, lastViewedAt: timestamp, product }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      }),
    ).toBe(true);
    expect(
      isRecentlyViewedPage({
        items: [
          { productId, lastViewedAt: timestamp, product },
          { productId, lastViewedAt: timestamp, product },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
      }),
    ).toBe(false);
  });
});
