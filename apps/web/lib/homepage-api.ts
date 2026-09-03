import { parseHomepageResponse, type HomepageResponse } from '@shopee-clone/contracts';

export type HomepageApiErrorKind = 'timeout' | 'transport' | 'status' | 'contract';

export class HomepageApiError extends Error {
  constructor(public readonly kind: HomepageApiErrorKind) {
    super(`Homepage API ${kind} error`);
    this.name = 'HomepageApiError';
  }
}

const STARTUP_RETRY_DELAYS_MS = [150, 300] as const;

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
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
    let response: Response | undefined;
    let lastErrorKind: HomepageApiErrorKind = 'transport';
    for (let attempt = 0; attempt <= STARTUP_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        response = await fetcher(url, {
          cache: 'no-store',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        break;
      } catch (error) {
        lastErrorKind =
          error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'transport';
        if (lastErrorKind !== 'transport' || attempt === STARTUP_RETRY_DELAYS_MS.length) {
          console.error('[storefront-api] failed', { url, kind: lastErrorKind });
          throw new HomepageApiError(lastErrorKind);
        }
        const retryDelayMs = STARTUP_RETRY_DELAYS_MS[attempt];
        if (retryDelayMs === undefined) throw new HomepageApiError(lastErrorKind);
        await wait(retryDelayMs);
      }
    }
    if (!response) throw new HomepageApiError(lastErrorKind);
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
