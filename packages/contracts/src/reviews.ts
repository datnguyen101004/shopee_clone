export const REVIEW_VERSION = 'review-v1' as const;
export const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;
export const REVIEW_TEXT_MAX_LENGTH = 1_000;
export const REVIEW_MEDIA_MAX_ITEMS = 6;
export const REVIEW_PAGE_DEFAULT_LIMIT = 10;
export const REVIEW_PAGE_MAX_LIMIT = 30;

export type ReviewVisibility = 'VISIBLE' | 'HIDDEN';
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

export interface ReviewMedia {
  id: string;
  url: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  sortOrder: number;
}

export interface PublicProductReview {
  id: string;
  rating: ReviewRating;
  text: string | null;
  authorName: string;
  verifiedPurchase: true;
  media: ReviewMedia[];
  updatedAt: string;
}

export interface ProductReviewSummary {
  ratingAverageBasisPoints: number;
  ratingCount: number;
}

export interface PublicProductReviewPage {
  reviewVersion: typeof REVIEW_VERSION;
  summary: ProductReviewSummary;
  items: PublicProductReview[];
  page: { limit: number; nextCursor: string | null; rating: ReviewRating | null };
}

export interface ReviewEligibility {
  state: 'ELIGIBLE' | 'REVIEWED' | 'INELIGIBLE';
  reviewId: string | null;
}

export interface AuthorProductReview extends PublicProductReview {
  orderLineId: string;
  visibility: ReviewVisibility;
  version: number;
}

export interface CreateProductReviewRequest {
  rating: ReviewRating;
  text?: string;
  mediaIds?: string[];
}

export type UpdateProductReviewRequest = CreateProductReviewRequest;

export interface ReviewMediaStageResponse {
  id: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  expiresAt: string;
}

export interface ProductReviewProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
  currentVersion?: number;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const opaque = /^[A-Za-z0-9_-]{1,2048}$/;
const etag = /^"review-(0|[1-9][0-9]*)"$/;
const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, required: string[], optional: string[] = []) => {
  const keys = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => keys.has(key));
};
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const isRating = (value: unknown): value is ReviewRating =>
  typeof value === 'number' && Number.isInteger(value) && REVIEW_RATINGS.includes(value as ReviewRating);
const hasControl = (value: string) => [...value].some((character) => {
  const point = character.codePointAt(0)!;
  return point < 32 || point === 127;
});
const isInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function normalizeReviewText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || hasControl(value)) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= REVIEW_TEXT_MAX_LENGTH ? normalized : null;
}

export function parseCreateProductReviewRequest(value: unknown): CreateProductReviewRequest | null {
  if (!isRecord(value) || !exact(value, ['rating'], ['text', 'mediaIds']) || !isRating(value.rating)) return null;
  const text = normalizeReviewText(value.text);
  if (text === null) return null;
  const mediaIds = value.mediaIds ?? [];
  if (!Array.isArray(mediaIds) || mediaIds.length > REVIEW_MEDIA_MAX_ITEMS || !mediaIds.every(isUuid) || new Set(mediaIds).size !== mediaIds.length) return null;
  return { rating: value.rating, ...(text ? { text } : {}), ...(mediaIds.length ? { mediaIds } : {}) };
}

export const parseUpdateProductReviewRequest = parseCreateProductReviewRequest;

export function parseReviewVersionEtag(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = etag.exec(value);
  return match ? Number(match[1]) : null;
}

export function formatReviewVersionEtag(version: number): string {
  if (!Number.isSafeInteger(version) || version < 0) throw new RangeError('Invalid review version');
  return `"review-${version}"`;
}

export function parseReviewIdempotencyKey(value: unknown): string | null {
  return isUuid(value) ? value : null;
}

export function parseProductReviewQuery(value: unknown): { rating: ReviewRating | null; limit: number; cursor: string | null } | null {
  if (!isRecord(value) || !exact(value, [], ['rating', 'limit', 'cursor'])) return null;
  const rating = value.rating === undefined ? null : Number(value.rating);
  const rawLimit = value.limit === undefined ? String(REVIEW_PAGE_DEFAULT_LIMIT) : value.limit;
  if ((rating !== null && !isRating(rating)) || typeof rawLimit !== 'string' || !/^[1-9][0-9]*$/.test(rawLimit)) return null;
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit > REVIEW_PAGE_MAX_LIMIT || !(value.cursor === undefined || (typeof value.cursor === 'string' && opaque.test(value.cursor)))) return null;
  return { rating: rating as ReviewRating | null, limit, cursor: (value.cursor as string | undefined) ?? null };
}

function isMedia(value: unknown): value is ReviewMedia {
  if (!isRecord(value) || !exact(value, ['id', 'url', 'mimeType', 'width', 'height', 'sortOrder'])) return false;
  const width = value.width; const height = value.height; const sortOrder = value.sortOrder;
  return isUuid(value.id) && typeof value.url === 'string' && value.url.startsWith('/api/v1/review-media/') && typeof value.mimeType === 'string' && allowedMime.has(value.mimeType) && typeof width === 'number' && Number.isInteger(width) && width > 0 && typeof height === 'number' && Number.isInteger(height) && height > 0 && typeof sortOrder === 'number' && Number.isInteger(sortOrder) && sortOrder >= 0;
}

function isSummary(value: unknown): value is ProductReviewSummary {
  if (!isRecord(value) || !exact(value, ['ratingAverageBasisPoints', 'ratingCount'])) return false;
  const average = value.ratingAverageBasisPoints; const count = value.ratingCount;
  return typeof average === 'number' && Number.isInteger(average) && average >= 0 && average <= 500 && typeof count === 'number' && Number.isInteger(count) && count >= 0;
}

export function isPublicProductReviewPage(value: unknown): value is PublicProductReviewPage {
  if (!isRecord(value) || !exact(value, ['reviewVersion', 'summary', 'items', 'page']) || value.reviewVersion !== REVIEW_VERSION || !isSummary(value.summary) || !Array.isArray(value.items) || !isRecord(value.page) || !exact(value.page, ['limit', 'nextCursor', 'rating'])) return false;
  const page = value.page;
  return value.items.every((item) => isRecord(item) && exact(item, ['id', 'rating', 'text', 'authorName', 'verifiedPurchase', 'media', 'updatedAt']) && isUuid(item.id) && isRating(item.rating) && (item.text === null || typeof item.text === 'string') && typeof item.authorName === 'string' && item.authorName.length > 0 && item.verifiedPurchase === true && Array.isArray(item.media) && item.media.every(isMedia) && isInstant(item.updatedAt)) && typeof page.limit === 'number' && Number.isInteger(page.limit) && page.limit > 0 && page.limit <= REVIEW_PAGE_MAX_LIMIT && (page.nextCursor === null || (typeof page.nextCursor === 'string' && opaque.test(page.nextCursor))) && (page.rating === null || isRating(page.rating));
}

export function parsePublicProductReviewPage(value: unknown): PublicProductReviewPage | null {
  return isPublicProductReviewPage(value) ? value : null;
}

export function isAuthorProductReview(value: unknown): value is AuthorProductReview {
  if (!isRecord(value) || !exact(value, ['id', 'rating', 'text', 'authorName', 'verifiedPurchase', 'media', 'updatedAt', 'orderLineId', 'visibility', 'version'])) return false;
  const version = value.version;
  return isUuid(value.id) && isUuid(value.orderLineId) && isRating(value.rating) && (value.text === null || typeof value.text === 'string') && typeof value.authorName === 'string' && value.verifiedPurchase === true && Array.isArray(value.media) && value.media.every(isMedia) && isInstant(value.updatedAt) && (value.visibility === 'VISIBLE' || value.visibility === 'HIDDEN') && typeof version === 'number' && Number.isInteger(version) && version >= 0;
}

export function parseAuthorProductReview(value: unknown): AuthorProductReview | null {
  return isAuthorProductReview(value) ? value : null;
}

export function isReviewEligibility(value: unknown): value is ReviewEligibility {
  return isRecord(value) && exact(value, ['state', 'reviewId']) &&
    (value.state === 'ELIGIBLE' || value.state === 'REVIEWED' || value.state === 'INELIGIBLE') &&
    (value.reviewId === null || isUuid(value.reviewId)) &&
    ((value.state === 'REVIEWED') === (value.reviewId !== null));
}

export function isReviewMediaStageResponse(value: unknown): value is ReviewMediaStageResponse {
  return isRecord(value) && exact(value, ['id', 'mimeType', 'width', 'height', 'expiresAt']) &&
    isUuid(value.id) && typeof value.mimeType === 'string' && allowedMime.has(value.mimeType) &&
    typeof value.width === 'number' && Number.isInteger(value.width) && value.width > 0 &&
    typeof value.height === 'number' && Number.isInteger(value.height) && value.height > 0 && isInstant(value.expiresAt);
}

export function parseProductReviewProblemDetails(value: unknown): ProductReviewProblemDetails | null {
  return isRecord(value) && exact(value, ['type', 'title', 'status', 'detail'], ['invalidParameters', 'currentVersion']) && typeof value.type === 'string' && typeof value.title === 'string' && Number.isInteger(value.status) && typeof value.detail === 'string' ? value as unknown as ProductReviewProblemDetails : null;
}
