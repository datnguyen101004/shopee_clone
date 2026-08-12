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
  timeoutMs = 4_000,
): Promise<HomepageResponse> {
  const baseUrl = process.env.HOMEPAGE_API_BASE_URL ?? 'http://127.0.0.1:3001';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/api/v1/homepage`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      throw new HomepageApiError(
        error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'transport',
      );
    }
    if (!response.ok) throw new HomepageApiError('status');
    const parsed = parseHomepageResponse(await response.json());
    if (!parsed) throw new HomepageApiError('contract');
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}
