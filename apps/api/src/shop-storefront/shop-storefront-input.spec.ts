import { PublicShopNotFoundError, ShopStorefrontValidationError } from './shop-storefront.errors';
import {
  parseFollowedShopsQuery,
  parsePublicShopCatalogQuery,
  parsePublicShopSlug,
  parseShopId,
  parseShopStatusIds,
} from './shop-storefront-input';

const shopId = '00000000-0000-4000-8000-000000000101';

describe('shop storefront input', () => {
  it('normalizes the bounded public catalog query and applies catalog defaults', () => {
    expect(parsePublicShopCatalogQuery({ q: '  dien   thoai ', page: '2' })).toEqual({
      q: 'dien thoai',
      category: null,
      sort: 'relevance',
      page: 2,
      pageSize: 12,
    });
  });

  it('uses uniform not-found behavior for a non-canonical public slug', () => {
    expect(() => parsePublicShopSlug('INVALID')).toThrow(PublicShopNotFoundError);
  });

  it('rejects unsafe keys, identifiers, duplicate batches, and excessive page sizes', () => {
    expect(() => parsePublicShopCatalogQuery({ ownerId: 'private' })).toThrow(
      ShopStorefrontValidationError,
    );
    expect(() => parsePublicShopCatalogQuery({ pageSize: '49' })).toThrow(
      ShopStorefrontValidationError,
    );
    expect(() => parseShopId('not-a-uuid')).toThrow(ShopStorefrontValidationError);
    expect(() => parseShopStatusIds(`${shopId},${shopId}`)).toThrow(ShopStorefrontValidationError);
  });

  it('parses only bounded followed-shop pagination parameters', () => {
    expect(parseFollowedShopsQuery({})).toEqual({ page: 1, pageSize: 20 });
    expect(parseFollowedShopsQuery({ page: '2', pageSize: '48' })).toEqual({
      page: 2,
      pageSize: 48,
    });
    expect(() => parseFollowedShopsQuery({ page: ['2'] })).toThrow(ShopStorefrontValidationError);
    expect(() => parseFollowedShopsQuery({ ownerId: 'private' })).toThrow(
      ShopStorefrontValidationError,
    );
  });
});
