import { parseHomepageResponse, type HomepageResponse } from '@shopee-clone/contracts';

export type HomepageApiErrorKind = 'timeout' | 'transport' | 'status' | 'contract';

export class HomepageApiError extends Error {
  constructor(public readonly kind: HomepageApiErrorKind) {
    super(`Homepage API ${kind} error`);
    this.name = 'HomepageApiError';
  }
}

export async function fetchHomepage(
  fetcher: typeof fetch = fetch,
  timeoutMs = 20_000,
): Promise<HomepageResponse> {
  const baseUrl =
    process.env.HOMEPAGE_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://127.0.0.1:3001';
  const url = new URL('/api/v1/homepage', baseUrl).toString();
  console.info('[storefront-api]', url);
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
      const kind =
        error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'transport';
      console.error('[storefront-api] failed', { url, kind });
      throw new HomepageApiError(kind);
    }
    if (!response.ok) {
      console.error('[storefront-api] failed', { url, kind: 'status', status: response.status });
      throw new HomepageApiError('status');
    }
    const parsed = parseHomepageResponse(await response.json());
    if (!parsed) throw new HomepageApiError('contract');
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}
