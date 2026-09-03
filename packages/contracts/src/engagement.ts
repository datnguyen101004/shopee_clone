import {
  isCatalogProductCard as isCatalogProductCardContract,
  type CatalogProductCard,
} from './catalog';

export const ENGAGEMENT_DEFAULT_PAGE = 1;
export const ENGAGEMENT_DEFAULT_PAGE_SIZE = 20;
export const ENGAGEMENT_MAX_PAGE_SIZE = 48;
export const ENGAGEMENT_MAX_STATUS_PRODUCT_IDS = 48;
export const RECENTLY_VIEWED_RETENTION_LIMIT = 100;

export interface EngagementPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface EngagementPageQuery {
  page: number;
  pageSize: number;
}

export interface FavoriteState {
  productId: string;
  isFavorite: boolean;
}

export interface FavoriteStateList {
  items: FavoriteState[];
}

export interface FavoriteMutationResponse extends FavoriteState {
  favoritedAt: string | null;
}

export interface AvailableFavoriteItem {
  availability: 'available';
  productId: string;
  favoritedAt: string;
  product: CatalogProductCard;
}

export interface UnavailableFavoriteProduct {
  id: string;
  name: string;
  href: null;
  imageUrl: string | null;
  imageAlt: string;
}

export interface UnavailableFavoriteItem {
  availability: 'unavailable';
  productId: string;
  favoritedAt: string;
  product: UnavailableFavoriteProduct;
}

export type FavoriteItem = AvailableFavoriteItem | UnavailableFavoriteItem;

export interface FavoritePage {
  items: FavoriteItem[];
  pagination: EngagementPagination;
}

export interface RecentlyViewedMutationResponse {
  productId: string;
  lastViewedAt: string;
}

export interface RecentlyViewedItem {
  productId: string;
  lastViewedAt: string;
  product: CatalogProductCard;
}

export interface RecentlyViewedPage {
  items: RecentlyViewedItem[];
  pagination: EngagementPagination;
}

export interface EngagementProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
}

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const problemType = /^https:\/\/shopee-clone\.local\/problems\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const problemStatuses = new Set([400, 401, 403, 404, 409, 503]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

export function isCanonicalEngagementProductId(value: unknown): value is string {
  return typeof value === 'string' && canonicalUuid.test(value);
}

function isCanonicalDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isCatalogProductCard(value: unknown): value is CatalogProductCard {
  return (
    isCatalogProductCardContract(value) &&
    isCanonicalEngagementProductId(value.id) &&
    value.href.startsWith('/products/')
  );
}

function isPagination(value: unknown): value is EngagementPagination {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['page', 'pageSize', 'totalItems', 'totalPages']) ||
    !isPositiveInteger(value.page) ||
    !isPositiveInteger(value.pageSize) ||
    value.pageSize > ENGAGEMENT_MAX_PAGE_SIZE ||
    !isNonNegativeInteger(value.totalItems) ||
    !isNonNegativeInteger(value.totalPages)
  ) {
    return false;
  }
  return value.totalPages === Math.ceil(value.totalItems / value.pageSize);
}

function isFavoriteState(value: unknown): value is FavoriteState {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['productId', 'isFavorite']) &&
    isCanonicalEngagementProductId(value.productId) &&
    typeof value.isFavorite === 'boolean'
  );
}

export function isFavoriteStateList(value: unknown): value is FavoriteStateList {
  if (!isRecord(value) || !hasExactKeys(value, ['items']) || !Array.isArray(value.items)) {
    return false;
  }
  return (
    value.items.length <= ENGAGEMENT_MAX_STATUS_PRODUCT_IDS &&
    value.items.every(isFavoriteState) &&
    new Set(value.items.map((item) => item.productId)).size === value.items.length
  );
}

export function isFavoriteMutationResponse(value: unknown): value is FavoriteMutationResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['productId', 'isFavorite', 'favoritedAt']) &&
    isCanonicalEngagementProductId(value.productId) &&
    typeof value.isFavorite === 'boolean' &&
    (value.favoritedAt === null || isCanonicalDateTime(value.favoritedAt)) &&
    (value.isFavorite ? value.favoritedAt !== null : value.favoritedAt === null)
  );
}

function isFavoriteItem(value: unknown): value is FavoriteItem {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['availability', 'productId', 'favoritedAt', 'product']) ||
    !isCanonicalEngagementProductId(value.productId) ||
    !isCanonicalDateTime(value.favoritedAt) ||
    !isRecord(value.product) ||
    value.product.id !== value.productId
  ) {
    return false;
  }
  if (value.availability === 'available') return isCatalogProductCard(value.product);
  return (
    value.availability === 'unavailable' &&
    hasExactKeys(value.product, ['id', 'name', 'href', 'imageUrl', 'imageAlt']) &&
    isCanonicalEngagementProductId(value.product.id) &&
    isString(value.product.name) &&
    value.product.href === null &&
    (value.product.imageUrl === null || isString(value.product.imageUrl)) &&
    isString(value.product.imageAlt)
  );
}

export function isFavoritePage(value: unknown): value is FavoritePage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['items', 'pagination']) &&
    Array.isArray(value.items) &&
    value.items.length <= ENGAGEMENT_MAX_PAGE_SIZE &&
    value.items.every(isFavoriteItem) &&
    new Set(value.items.map((item) => item.productId)).size === value.items.length &&
    isPagination(value.pagination)
  );
}

export function isRecentlyViewedMutationResponse(
  value: unknown,
): value is RecentlyViewedMutationResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['productId', 'lastViewedAt']) &&
    isCanonicalEngagementProductId(value.productId) &&
    isCanonicalDateTime(value.lastViewedAt)
  );
}

function isRecentlyViewedItem(value: unknown): value is RecentlyViewedItem {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['productId', 'lastViewedAt', 'product']) &&
    isCanonicalEngagementProductId(value.productId) &&
    isCanonicalDateTime(value.lastViewedAt) &&
    isRecord(value.product) &&
    value.product.id === value.productId &&
    isCatalogProductCard(value.product)
  );
}

export function isRecentlyViewedPage(value: unknown): value is RecentlyViewedPage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['items', 'pagination']) &&
    Array.isArray(value.items) &&
    value.items.length <= ENGAGEMENT_MAX_PAGE_SIZE &&
    value.items.every(isRecentlyViewedItem) &&
    new Set(value.items.map((item) => item.productId)).size === value.items.length &&
    isPagination(value.pagination)
  );
}

function oneQueryValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function canonicalPositiveInteger(
  value: unknown,
  fallback: number,
  maximum?: number,
): number | null {
  if (value === undefined) return fallback;
  const raw = oneQueryValue(value);
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && (maximum === undefined || parsed <= maximum)
    ? parsed
    : null;
}

export function parseEngagementPageQuery(value: unknown): EngagementPageQuery | null {
  if (!isRecord(value) || !hasExactKeys(value, [], ['page', 'pageSize'])) return null;
  const page = canonicalPositiveInteger(value.page, ENGAGEMENT_DEFAULT_PAGE);
  const pageSize = canonicalPositiveInteger(
    value.pageSize,
    ENGAGEMENT_DEFAULT_PAGE_SIZE,
    ENGAGEMENT_MAX_PAGE_SIZE,
  );
  return page === null || pageSize === null ? null : { page, pageSize };
}

export function parseFavoriteStatusProductIds(value: unknown): string[] | null {
  const values = typeof value === 'string' ? value.split(',') : null;
  if (
    !values ||
    values.length < 1 ||
    values.length > ENGAGEMENT_MAX_STATUS_PRODUCT_IDS ||
    !values.every(isCanonicalEngagementProductId) ||
    new Set(values).size !== values.length
  ) {
    return null;
  }
  return values;
}

export function isEngagementProblemDetails(value: unknown): value is EngagementProblemDetails {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['type', 'title', 'status', 'detail'], ['invalidParameters']) ||
    !isString(value.type) ||
    !problemType.test(value.type) ||
    !isString(value.title) ||
    value.title.length > 120 ||
    typeof value.status !== 'number' ||
    !problemStatuses.has(value.status) ||
    !isString(value.detail) ||
    value.detail.length > 500
  ) {
    return false;
  }
  if (value.invalidParameters === undefined) return true;
  return (
    Array.isArray(value.invalidParameters) &&
    value.invalidParameters.length >= 1 &&
    value.invalidParameters.length <= 20 &&
    value.invalidParameters.every(
      (parameter) => typeof parameter === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(parameter),
    ) &&
    new Set(value.invalidParameters).size === value.invalidParameters.length
  );
}

export const parseFavoriteStateList = (value: unknown): FavoriteStateList | null =>
  isFavoriteStateList(value) ? value : null;
export const parseFavoriteMutationResponse = (value: unknown): FavoriteMutationResponse | null =>
  isFavoriteMutationResponse(value) ? value : null;
export const parseFavoritePage = (value: unknown): FavoritePage | null =>
  isFavoritePage(value) ? value : null;
export const parseRecentlyViewedMutationResponse = (
  value: unknown,
): RecentlyViewedMutationResponse | null =>
  isRecentlyViewedMutationResponse(value) ? value : null;
export const parseRecentlyViewedPage = (value: unknown): RecentlyViewedPage | null =>
  isRecentlyViewedPage(value) ? value : null;
export const parseEngagementProblemDetails = (value: unknown): EngagementProblemDetails | null =>
  isEngagementProblemDetails(value) ? value : null;
