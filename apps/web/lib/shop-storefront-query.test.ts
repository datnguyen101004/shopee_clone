import { describe, expect, it } from 'vitest';

import {
  pickShopCatalogQuery,
  ShopRouteQueryError,
  shopLoginHref,
  shopStorefrontHref,
} from './shop-storefront-query';

describe('shop storefront route query', () => {
  it('normalizes allowlisted values and builds canonical links', () => {
    expect(pickShopCatalogQuery({ q: '  dien   thoai ', page: '2' })).toEqual({
      q: 'dien thoai',
      category: null,
      sort: 'relevance',
      page: 2,
      pageSize: 12,
    });
    expect(shopStorefrontHref('demo-shop', { q: 'tai nghe', page: 2 })).toBe(
      '/shops/demo-shop?q=tai+nghe&page=2',
    );
    expect(shopLoginHref('demo-shop')).toBe('/login?returnTo=%2Fshops%2Fdemo-shop');
  });

  it('rejects repeated, unknown, unsafe, and out-of-bound inputs', () => {
    expect(() => pickShopCatalogQuery({ q: ['one', 'two'] })).toThrow(ShopRouteQueryError);
    expect(() => pickShopCatalogQuery({ ownerId: 'private' })).toThrow(ShopRouteQueryError);
    expect(() => pickShopCatalogQuery({ pageSize: '49' })).toThrow(ShopRouteQueryError);
    expect(() => shopStorefrontHref('../unsafe')).toThrow(ShopRouteQueryError);
  });
});
