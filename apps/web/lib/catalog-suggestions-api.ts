import {
  CATALOG_DEFAULT_SUGGESTION_LIMIT,
  parseCatalogSearchSuggestionsResponse,
  type CatalogSearchSuggestion,
} from '@shopee-clone/contracts';

export type CatalogSuggestionsApiErrorKind = 'timeout' | 'transport' | 'status' | 'contract';

export class CatalogSuggestionsApiError extends Error {
  constructor(public readonly kind: CatalogSuggestionsApiErrorKind) {
    super(`Catalog suggestions API ${kind} error`);
    this.name = 'CatalogSuggestionsApiError';
  }
}

function suggestionsEndpoint(query: string, limit: number): URL {
  const baseUrl =
    process.env.CATALOG_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://127.0.0.1:3001';
  const url = new URL('/api/v1/catalog/products/suggestions', baseUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  return url;
}

export async function fetchCatalogSuggestions(
  query: string,
  fetcher: typeof fetch = fetch,
  limit = CATALOG_DEFAULT_SUGGESTION_LIMIT,
  timeoutMs = 3_000,
  signal?: AbortSignal,
): Promise<CatalogSearchSuggestion[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  if (!normalizedQuery) return [];
  const url = suggestionsEndpoint(normalizedQuery, limit);
  const controller = new AbortController();
  const abortExternal = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abortExternal, { once: true });
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
      const kind =
        error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'transport';
      throw new CatalogSuggestionsApiError(kind);
    }
    if (!response.ok) throw new CatalogSuggestionsApiError('status');
    const parsed = parseCatalogSearchSuggestionsResponse(await response.json());
    if (!parsed) throw new CatalogSuggestionsApiError('contract');
    return parsed.suggestions;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortExternal);
  }
}
