'use client';

import { parsePublicProductReviewPage, parseProductReviewProblemDetails, type AuthorProductReview, type CreateProductReviewRequest, type PublicProductReviewPage } from '@shopee-clone/contracts';
import type { AuthenticatedFetch } from './account-api';

const base = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
export class ReviewsApiError extends Error { constructor(readonly status = 0, readonly code = 'request-failed') { super(code); } }

export async function getProductReviews(productId: string, rating: number | null, cursor: string | null): Promise<PublicProductReviewPage> {
  const params = new URLSearchParams(); if (rating) params.set('rating', String(rating)); if (cursor) params.set('cursor', cursor);
  const response = await fetch(new URL(`/api/v1/catalog/products/${productId}/reviews?${params}`, base()), { cache: 'no-store' });
  if (!response.ok) throw new ReviewsApiError(response.status);
  const parsed = parsePublicProductReviewPage(await response.json()); if (!parsed) throw new ReviewsApiError(response.status, 'invalid-contract'); return parsed;
}

async function authenticated(path: string, init: RequestInit, authenticatedFetch: AuthenticatedFetch): Promise<Response> {
  const response = await authenticatedFetch(new URL(path, base()), { ...init, credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json, application/problem+json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  if (response.ok) return response;
  const problem = parseProductReviewProblemDetails(await response.json().catch(() => null));
  throw new ReviewsApiError(response.status, problem?.type ?? 'request-failed');
}

export async function createProductReview(orderId: string, lineId: string, input: CreateProductReviewRequest, key: string, authenticatedFetch: AuthenticatedFetch): Promise<{ review: AuthorProductReview; etag: string }> {
  const response = await authenticated(`/api/v1/account/orders/${orderId}/lines/${lineId}/review`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }, authenticatedFetch);
  return { review: await response.json() as AuthorProductReview, etag: response.headers.get('ETag') ?? '' };
}

export async function getAuthorProductReview(reviewId: string, authenticatedFetch: AuthenticatedFetch): Promise<{ review: AuthorProductReview; etag: string }> {
  const response = await authenticated(`/api/v1/account/reviews/${reviewId}`, { method: 'GET' }, authenticatedFetch);
  return { review: await response.json() as AuthorProductReview, etag: response.headers.get('ETag') ?? '' };
}

export async function stageReviewMedia(file: File, authenticatedFetch: AuthenticatedFetch): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) throw new ReviewsApiError(0, 'invalid-media');
  const form = new FormData(); form.append('file', file);
  const response = await authenticatedFetch(new URL('/api/v1/account/review-media', base()), { method: 'POST', body: form, credentials: 'include', headers: { Accept: 'application/json, application/problem+json' } });
  if (!response.ok) throw new ReviewsApiError(response.status, 'media-stage-failed');
  const body = await response.json() as { id?: unknown }; if (typeof body.id !== 'string') throw new ReviewsApiError(response.status, 'invalid-contract'); return body.id;
}

export async function updateProductReview(reviewId: string, input: CreateProductReviewRequest, etag: string, authenticatedFetch: AuthenticatedFetch): Promise<{ review: AuthorProductReview; etag: string }> {
  const response = await authenticated(`/api/v1/account/reviews/${reviewId}`, { method: 'PATCH', headers: { 'If-Match': etag }, body: JSON.stringify(input) }, authenticatedFetch);
  return { review: await response.json() as AuthorProductReview, etag: response.headers.get('ETag') ?? '' };
}
