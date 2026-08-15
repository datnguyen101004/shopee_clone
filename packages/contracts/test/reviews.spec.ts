import { describe, expect, it } from 'vitest';

import {
  formatReviewVersionEtag,
  normalizeReviewText,
  parseCreateProductReviewRequest,
  isAuthorProductReview,
  isPublicProductReviewPage,
  isReviewEligibility,
  isReviewMediaStageResponse,
  parseProductReviewQuery,
  parseReviewIdempotencyKey,
  parseReviewVersionEtag,
} from '../src';

describe('verified product review contracts', () => {
  it('normalizes a strict review mutation and rejects unsafe fields', () => {
    expect(parseCreateProductReviewRequest({ rating: 5, text: '  Rất   tốt  ' })).toEqual({ rating: 5, text: 'Rất tốt' });
    expect(parseCreateProductReviewRequest({ rating: 0 })).toBeNull();
    expect(parseCreateProductReviewRequest({ rating: 5, url: 'https://untrusted.example/image' })).toBeNull();
    expect(normalizeReviewText('a\u0000b')).toBeNull();
  });

  it('validates bounded public filters and concurrency headers', () => {
    expect(parseProductReviewQuery({ rating: '5', limit: '30', cursor: 'cursor_1' })).toEqual({ rating: 5, limit: 30, cursor: 'cursor_1' });
    expect(parseProductReviewQuery({ rating: '6' })).toBeNull();
    expect(parseProductReviewQuery({ limit: '31' })).toBeNull();
    expect(formatReviewVersionEtag(2)).toBe('"review-2"');
    expect(parseReviewVersionEtag('"review-2"')).toBe(2);
    expect(parseReviewVersionEtag('review-2')).toBeNull();
    expect(parseReviewIdempotencyKey('8b63c715-a17c-4da3-8cab-3ec56cf45964')).toBeTruthy();
  });

  it('accepts privacy-safe public resources and rejects private fields', () => {
    const media = {
      id: '00000000-0000-4000-8000-000000000001',
      url: '/api/v1/review-media/00000000-0000-4000-8000-000000000001',
      mimeType: 'image/png' as const, width: 12, height: 12, sortOrder: 0,
    };
    const page = {
      reviewVersion: 'review-v1' as const,
      summary: { ratingAverageBasisPoints: 500, ratingCount: 1 },
      items: [{ id: '00000000-0000-4000-8000-000000000002', rating: 5 as const, text: 'Tốt', authorName: 'Ngọc', verifiedPurchase: true as const, media: [media], updatedAt: '2026-08-15T00:00:00.000Z' }],
      page: { limit: 10, nextCursor: null, rating: null },
    };
    const item = page.items[0]!;
    expect(isPublicProductReviewPage(page)).toBe(true);
    expect(isPublicProductReviewPage({ ...page, items: [{ ...item, email: 'private@example.com' }] })).toBe(false);
    expect(isAuthorProductReview({ ...item, orderLineId: '00000000-0000-4000-8000-000000000003', visibility: 'HIDDEN', version: 1 })).toBe(true);
    expect(isReviewEligibility({ state: 'REVIEWED', reviewId: item.id })).toBe(true);
    expect(isReviewEligibility({ state: 'ELIGIBLE', reviewId: item.id })).toBe(false);
    expect(isReviewMediaStageResponse({ id: media.id, mimeType: media.mimeType, width: 12, height: 12, expiresAt: '2026-08-16T00:00:00.000Z' })).toBe(true);
  });
});
