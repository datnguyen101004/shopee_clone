import type {
  CreateSellerReviewReportRequest,
  SellerReviewReportReceipt,
  SellerShopReviewListResponse,
} from '@shopee-clone/contracts';

import type { AuthenticatedFetch } from './account-api';

const base = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export class SellerReviewReportApiError extends Error {
  constructor(readonly status = 0, readonly code = 'seller-review-request-failed') {
    super(code);
  }
}

async function request<T>(
  path: string,
  authenticatedFetch: AuthenticatedFetch,
  init: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(new URL(path, base()), {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json, application/problem+json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { type?: string } | null;
    throw new SellerReviewReportApiError(response.status, problem?.type ?? 'seller-review-request-failed');
  }
  return response.json() as Promise<T>;
}

export function listSellerShopReviews(
  authenticatedFetch: AuthenticatedFetch,
  page = 1,
): Promise<SellerShopReviewListResponse> {
  return request(`/api/v1/seller/reviews?page=${page}`, authenticatedFetch, { method: 'GET' });
}

export function submitSellerReviewReport(
  reviewId: string,
  input: CreateSellerReviewReportRequest,
  idempotencyKey: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<SellerReviewReportReceipt> {
  return request(`/api/v1/seller/reviews/${reviewId}/reports`, authenticatedFetch, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}
