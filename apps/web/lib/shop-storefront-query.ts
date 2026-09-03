import {
  isCanonicalShopSlug,
  parseShopCatalogQuery,
  type ShopCatalogQuery,
} from '@shopee-clone/contracts';

const keys = ['q', 'category', 'sort', 'page', 'pageSize'] as const;
type ShopQueryKey = (typeof keys)[number];
export type ShopUrlQuery = Partial<Record<ShopQueryKey, string | number | null | undefined>>;

export class ShopRouteQueryError extends Error {
  constructor() {
    super('Invalid shop storefront route query');
  }
}

export function pickShopCatalogQuery(
  raw: Record<string, string | string[] | undefined>,
): ShopCatalogQuery {
  if (Object.keys(raw).some((key) => !keys.includes(key as ShopQueryKey))) {
    throw new ShopRouteQueryError();
  }
  const selected: Record<string, unknown> = {};
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) throw new ShopRouteQueryError();
    if (value !== undefined) selected[key] = value;
  }
  const parsed = parseShopCatalogQuery(selected);
  if (!parsed) throw new ShopRouteQueryError();
  return parsed;
}

export function shopStorefrontHref(slug: string, query: ShopUrlQuery = {}): string {
  if (!isCanonicalShopSlug(slug)) throw new ShopRouteQueryError();
  const parameters = new URLSearchParams();
  for (const key of keys) {
    const value = query[key];
    if (value === undefined || value === null || value === '') continue;
    parameters.set(key, String(value));
  }
  const serialized = parameters.toString();
  const path = `/shops/${encodeURIComponent(slug)}`;
  return serialized ? `${path}?${serialized}` : path;
}

export function shopLoginHref(slug: string, query: ShopUrlQuery = {}): string {
  const returnTo = shopStorefrontHref(slug, query);
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}
