import type {
  MarkSellerNoticeReadResponse,
  SellerModerationNoticeListQuery,
  SellerModerationNoticeListResponse,
} from '@shopee-clone/contracts';

const fallbackBaseUrl = 'http://localhost:3001';

export type AuthenticatedFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class SellerModerationApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem?: {
      title?: string;
      detail?: string;
      code?: string;
    },
  ) {
    super(`Seller Moderation API error (${status}): ${problem?.detail || problem?.title || 'Unknown'}`);
    this.name = 'SellerModerationApiError';
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function requestJson<T>(
  url: URL,
  fetcher: AuthenticatedFetcher,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let problem: Record<string, unknown> | undefined;
    try {
      problem = (await response.json()) as Record<string, unknown>;
    } catch {
      // Non JSON
    }
    throw new SellerModerationApiError(response.status, problem as SellerModerationApiError['problem']);
  }

  return (await response.json()) as T;
}

export async function listSellerModerationNotices(
  fetcher: AuthenticatedFetcher,
  query?: SellerModerationNoticeListQuery,
): Promise<SellerModerationNoticeListResponse> {
  const url = endpoint('/api/v1/seller/moderation-notices');
  if (query?.limit) url.searchParams.set('limit', String(query.limit));
  if (query?.cursor) url.searchParams.set('cursor', query.cursor);
  if (query?.unreadOnly !== undefined) url.searchParams.set('unreadOnly', String(query.unreadOnly));
  return requestJson<SellerModerationNoticeListResponse>(url, fetcher, { method: 'GET' });
}

export async function markSellerModerationNoticeRead(
  fetcher: AuthenticatedFetcher,
  noticeId: string,
): Promise<MarkSellerNoticeReadResponse> {
  const url = endpoint(`/api/v1/seller/moderation-notices/${noticeId}/read`);
  return requestJson<MarkSellerNoticeReadResponse>(url, fetcher, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
