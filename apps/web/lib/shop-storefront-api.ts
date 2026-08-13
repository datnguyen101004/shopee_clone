import 'server-only';

import {
  parsePublicShopCatalogPage,
  parsePublicShopProfile,
  type PublicShopCatalogPage,
  type PublicShopProfile,
  type ShopCatalogQuery,
} from '@shopee-clone/contracts';

export type ShopStorefrontApiErrorKind =
  'not-found' | 'validation' | 'timeout' | 'transport' | 'status' | 'contract';

export class ShopStorefrontApiError extends Error {
  constructor(readonly kind: ShopStorefrontApiErrorKind) {
    super(`Shop storefront API ${kind} error`);
  }
}

function endpoint(path: string): URL {
  return new URL(
    path,
    process.env.SHOP_API_BASE_URL ??
      process.env.CATALOG_API_BASE_URL ??
      process.env.HOMEPAGE_API_BASE_URL ??
      'http://127.0.0.1:3001',
  );
}

async function getJson(url: URL, fetcher: typeof fetch, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetcher(url, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      throw new ShopStorefrontApiError(
        error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'transport',
      );
    }
    if (response.status === 404) throw new ShopStorefrontApiError('not-found');
    if (response.status === 400) throw new ShopStorefrontApiError('validation');
    if (!response.ok) throw new ShopStorefrontApiError('status');
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPublicShopProfile(
  shopSlug: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 4_000,
): Promise<PublicShopProfile> {
  const parsed = parsePublicShopProfile(
    await getJson(endpoint(`/api/v1/shops/${encodeURIComponent(shopSlug)}`), fetcher, timeoutMs),
  );
  if (!parsed) throw new ShopStorefrontApiError('contract');
  return parsed;
}

export async function fetchPublicShopCatalog(
  shopSlug: string,
  query: ShopCatalogQuery,
  fetcher: typeof fetch = fetch,
  timeoutMs = 4_000,
): Promise<PublicShopCatalogPage> {
  const url = endpoint(`/api/v1/shops/${encodeURIComponent(shopSlug)}/products`);
  if (query.q) url.searchParams.set('q', query.q);
  if (query.category) url.searchParams.set('category', query.category);
  url.searchParams.set('sort', query.sort);
  url.searchParams.set('page', String(query.page));
  url.searchParams.set('pageSize', String(query.pageSize));
  const parsed = parsePublicShopCatalogPage(await getJson(url, fetcher, timeoutMs));
  if (!parsed) throw new ShopStorefrontApiError('contract');
  return parsed;
}
