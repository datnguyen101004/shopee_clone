import { describe, expect, it } from 'vitest';

import {
  catalogSearchHref,
  pickCatalogQuery,
  replaceCatalogQuery,
  serializeCatalogQuery,
} from './catalog-query';

describe('catalog query utilities', () => {
  it('serializes every supported key deterministically and encodes Unicode', () => {
    expect(
      serializeCatalogQuery({
        page: 3,
        sort: 'price-desc',
        q: 'ốp lưng',
        location: 'Hà Nội',
        minPrice: 0,
        promotion: 'discounted',
      }),
    ).toBe(
      'q=%E1%BB%91p+l%C6%B0ng&minPrice=0&location=H%C3%A0+N%E1%BB%99i&promotion=discounted&sort=price-desc&page=3',
    );
  });

  it('drops unsupported URL state and retains repeated supported values for backend rejection', () => {
    expect(
      pickCatalogQuery({ q: 'phone', sort: ['newest', 'relevance'], evil: 'ignored' }),
    ).toEqual({
      q: 'phone',
      sort: ['newest', 'relevance'],
    });
  });

  it('resets the page when filters change and supports clear URLs', () => {
    const updated = replaceCatalogQuery({ q: 'phone', page: 4, pageSize: 6 }, { rating: 4 });
    expect(catalogSearchHref(updated)).toBe('/search?q=phone&rating=4&pageSize=6');
    expect(catalogSearchHref({})).toBe('/search');
  });
});
