import {
  parseCatalogProductsResponse,
  type CatalogProductsResponse,
} from '@shopee-clone/contracts';

export type CatalogApiErrorKind = 'timeout' | 'transport' | 'status' | 'contract';

export class CatalogApiError extends Error {
  constructor(public readonly kind: CatalogApiErrorKind) {
    super(`Catalog API ${kind} error`);
    this.name = 'CatalogApiError';
  }
}

export interface CatalogApiQuery {
  category?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchCatalogProducts(
  query: CatalogApiQuery,
  fetcher: typeof fetch = fetch,
  timeoutMs = 4_000,
): Promise<CatalogProductsResponse> {
  const baseUrl =
    process.env.CATALOG_API_BASE_URL ??
    process.env.HOMEPAGE_API_BASE_URL ??
    'http://127.0.0.1:3001';
  const url = new URL('/api/v1/catalog/products', baseUrl);
  if (query.category) url.searchParams.set('category', query.category);
  if (query.page !== undefined) url.searchParams.set('page', String(query.page));
  if (query.pageSize !== undefined) url.searchParams.set('pageSize', String(query.pageSize));
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
      throw new CatalogApiError(
        error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'transport',
      );
    }
    if (!response.ok) throw new CatalogApiError('status');
    const parsed = parseCatalogProductsResponse(await response.json());
    if (!parsed) throw new CatalogApiError('contract');
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}
