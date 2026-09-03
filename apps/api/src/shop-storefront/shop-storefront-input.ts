import {
  isCanonicalShopId,
  isCanonicalShopSlug,
  parseFollowedShopPageQuery,
  parseShopCatalogQuery,
  parseShopFollowStatusIds,
  type FollowedShopPageQuery,
  type ShopCatalogQuery,
} from '@shopee-clone/contracts';

import { PublicShopNotFoundError, ShopStorefrontValidationError } from './shop-storefront.errors';

const shopCatalogKeys = new Set(['q', 'category', 'sort', 'page', 'pageSize']);
const followedShopPageKeys = new Set(['page', 'pageSize']);

export function parsePublicShopSlug(value: string): string {
  if (!isCanonicalShopSlug(value)) throw new PublicShopNotFoundError();
  return value;
}

export function parseShopId(value: string): string {
  if (!isCanonicalShopId(value)) throw new ShopStorefrontValidationError(['shopId']);
  return value;
}

export function parsePublicShopCatalogQuery(value: Record<string, unknown>): ShopCatalogQuery {
  const parsed = parseShopCatalogQuery(value);
  if (parsed) return parsed;
  const invalid = Object.keys(value).filter((key) => !shopCatalogKeys.has(key));
  throw new ShopStorefrontValidationError(
    invalid.length > 0 ? invalid.slice(0, 20) : ['q', 'category', 'sort', 'page', 'pageSize'],
  );
}

export function parseShopStatusIds(value: unknown): string[] {
  const parsed = parseShopFollowStatusIds(value);
  if (!parsed) throw new ShopStorefrontValidationError(['shopIds']);
  return parsed;
}

export function parseFollowedShopsQuery(value: Record<string, unknown>): FollowedShopPageQuery {
  const parsed = parseFollowedShopPageQuery(value);
  if (parsed) return parsed;
  const invalid = Object.keys(value).filter((key) => !followedShopPageKeys.has(key));
  throw new ShopStorefrontValidationError(
    invalid.length > 0 ? invalid.slice(0, 20) : ['page', 'pageSize'],
  );
}
