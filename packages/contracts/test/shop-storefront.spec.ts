import {
  SHOP_CATALOG_MAX_PAGE_SIZE,
  SHOP_FOLLOW_MAX_STATUS_IDS,
  isCanonicalShopSlug,
  isPublicShopCatalogPage,
  isPublicShopProfile,
  isShopFollowMutationResponse,
  isShopFollowStateList,
  parseShopCatalogQuery,
  parseShopFollowStatusIds,
} from '../src';
import { describe, expect, it } from 'vitest';

const shopId = '00000000-0000-4000-8000-000000000201';
const secondShopId = '00000000-0000-4000-8000-000000000202';
const productId = '00000000-0000-4000-8000-000000000301';
const timestamp = '2026-08-14T01:00:00.000Z';

const category = {
  slug: 'thiet-bi-dien-tu',
  name: 'Thiết bị điện tử',
  parentSlug: null,
  productCount: 1,
};

const product = {
  id: productId,
  name: 'Sản phẩm mẫu',
  href: `/products/${productId}`,
  imageUrl: null,
  imageAlt: 'Sản phẩm mẫu',
  priceMinor: 120_000,
  ratingAverageBasisPoints: 450,
  ratingCount: 10,
  soldCount: 20,
  shop: { name: 'Shop mẫu', location: 'TP. Hồ Chí Minh' },
  category: { slug: category.slug, name: category.name },
};

const profile = {
  id: shopId,
  slug: 'shop-mau',
  name: 'Shop mẫu',
  location: 'TP. Hồ Chí Minh',
  joinedAt: timestamp,
  activeProductCount: 1,
  ratingAverageBasisPoints: 450,
  ratingCount: 10,
  soldCount: 20,
  followerCount: 2,
  responseMetadata: {
    responseRateBasisPoints: null,
    responseTimeLabel: null,
    message: 'Chưa có dữ liệu phản hồi.',
  },
  categories: [category],
};

describe('public shop storefront contracts', () => {
  it('validates canonical shop slugs and rejects noncanonical forms', () => {
    expect(isCanonicalShopSlug('shop-mau-101')).toBe(true);
    expect(isCanonicalShopSlug('Shop-Mau')).toBe(false);
    expect(isCanonicalShopSlug('shop--mau')).toBe(false);
    expect(isCanonicalShopSlug('')).toBe(false);
  });

  it('parses strict shop catalog query defaults, normalization, and bounds', () => {
    expect(parseShopCatalogQuery({})).toEqual({
      q: null,
      category: null,
      sort: 'newest',
      page: 1,
      pageSize: 12,
    });
    expect(
      parseShopCatalogQuery({
        q: '  điện   thoại ',
        category: 'thiet-bi-dien-tu',
        page: '2',
        pageSize: String(SHOP_CATALOG_MAX_PAGE_SIZE),
      }),
    ).toEqual({
      q: 'điện thoại',
      category: 'thiet-bi-dien-tu',
      sort: 'relevance',
      page: 2,
      pageSize: SHOP_CATALOG_MAX_PAGE_SIZE,
    });
    expect(parseShopCatalogQuery({ page: ['2'] })).toBeNull();
    expect(parseShopCatalogQuery({ sort: 'unknown' })).toBeNull();
    expect(parseShopCatalogQuery({ extra: 'value' })).toBeNull();
  });

  it('validates an exact public profile and empty aggregate invariants', () => {
    expect(isPublicShopProfile(profile)).toBe(true);
    expect(isPublicShopProfile({ ...profile, ownerId: secondShopId })).toBe(false);
    expect(
      isPublicShopProfile({
        ...profile,
        activeProductCount: 0,
        ratingAverageBasisPoints: 0,
        ratingCount: 0,
        soldCount: 0,
        categories: [],
      }),
    ).toBe(true);
    expect(isPublicShopProfile({ ...profile, ratingCount: 0 })).toBe(false);
  });

  it('validates a strict shop catalog page using canonical product cards', () => {
    expect(
      isPublicShopCatalogPage({
        shopId,
        query: { q: null, category: null, sort: 'newest' },
        pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1 },
        categories: [category],
        items: [product],
      }),
    ).toBe(true);
    expect(
      isPublicShopCatalogPage({
        shopId,
        query: { q: null, category: null, sort: 'newest' },
        pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 2 },
        categories: [category],
        items: [product],
      }),
    ).toBe(false);
  });

  it('parses a bounded distinct follow status request in canonical order', () => {
    expect(parseShopFollowStatusIds(`${shopId},${secondShopId}`)).toEqual([shopId, secondShopId]);
    expect(parseShopFollowStatusIds(`${shopId},${shopId}`)).toBeNull();
    expect(parseShopFollowStatusIds('invalid')).toBeNull();
    expect(
      parseShopFollowStatusIds(
        Array.from(
          { length: SHOP_FOLLOW_MAX_STATUS_IDS + 1 },
          (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        ).join(','),
      ),
    ).toBeNull();
  });

  it('validates owner-scoped state and follow mutation invariants', () => {
    expect(
      isShopFollowStateList({
        items: [
          { shopId, isFollowing: true },
          { shopId: secondShopId, isFollowing: false },
        ],
      }),
    ).toBe(true);
    expect(
      isShopFollowStateList({
        items: [
          { shopId, isFollowing: true },
          { shopId, isFollowing: false },
        ],
      }),
    ).toBe(false);
    expect(
      isShopFollowMutationResponse({
        shopId,
        isFollowing: true,
        followedAt: timestamp,
        followerCount: 3,
      }),
    ).toBe(true);
    expect(
      isShopFollowMutationResponse({
        shopId,
        isFollowing: false,
        followedAt: null,
        followerCount: null,
      }),
    ).toBe(true);
    expect(
      isShopFollowMutationResponse({
        shopId,
        isFollowing: true,
        followedAt: null,
        followerCount: 3,
      }),
    ).toBe(false);
  });
});
