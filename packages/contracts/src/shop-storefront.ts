import {
  CATALOG_DEFAULT_PAGE,
  CATALOG_DEFAULT_PAGE_SIZE,
  CATALOG_MAX_PAGE_SIZE,
  catalogSortValues,
  isCatalogProductCard,
  type CatalogPagination,
  type CatalogProductCard,
  type CatalogSort,
} from './catalog';

export const SHOP_SLUG_MAX_LENGTH = 120;
export const SHOP_KEYWORD_MAX_LENGTH = 120;
export const SHOP_FOLLOW_MAX_STATUS_IDS = CATALOG_MAX_PAGE_SIZE;
export const SHOP_CATALOG_DEFAULT_PAGE = CATALOG_DEFAULT_PAGE;
export const SHOP_CATALOG_DEFAULT_PAGE_SIZE = CATALOG_DEFAULT_PAGE_SIZE;
export const SHOP_CATALOG_MAX_PAGE_SIZE = CATALOG_MAX_PAGE_SIZE;
export const FOLLOWED_SHOPS_DEFAULT_PAGE = 1;
export const FOLLOWED_SHOPS_DEFAULT_PAGE_SIZE = 20;
export const FOLLOWED_SHOPS_MAX_PAGE_SIZE = CATALOG_MAX_PAGE_SIZE;

export interface PublicShopResponseMetadata {
  responseRateBasisPoints: null;
  responseTimeLabel: null;
  message: string;
}

export interface PublicShopCategoryFacet {
  slug: string;
  name: string;
  parentSlug: string | null;
  productCount: number;
}

export interface PublicShopProfile {
  id: string;
  slug: string;
  name: string;
  location: string;
  joinedAt: string;
  activeProductCount: number;
  ratingAverageBasisPoints: number;
  ratingCount: number;
  soldCount: number;
  followerCount: number;
  responseMetadata: PublicShopResponseMetadata;
  categories: PublicShopCategoryFacet[];
}

export interface ShopCatalogQuery {
  q: string | null;
  category: string | null;
  sort: CatalogSort;
  page: number;
  pageSize: number;
}

export interface ShopCatalogQueryContext {
  q: string | null;
  category: string | null;
  sort: CatalogSort;
}

export interface PublicShopCatalogPage {
  shopId: string;
  query: ShopCatalogQueryContext;
  pagination: CatalogPagination;
  categories: PublicShopCategoryFacet[];
  items: CatalogProductCard[];
}

export interface ShopFollowState {
  shopId: string;
  isFollowing: boolean;
}

export interface ShopFollowStateList {
  items: ShopFollowState[];
}

export interface ShopFollowMutationResponse extends ShopFollowState {
  followedAt: string | null;
  followerCount: number | null;
}

export interface FollowedShopPageQuery {
  page: number;
  pageSize: number;
}

export interface FollowedShopPagination extends FollowedShopPageQuery {
  totalItems: number;
  totalPages: number;
}

export interface AvailableFollowedShopSummary {
  id: string;
  slug: string;
  name: string;
  href: string;
  location: string;
  followerCount: number;
}

export interface UnavailableFollowedShopSummary {
  id: string;
  name: string;
  href: null;
}

export interface AvailableFollowedShopItem {
  availability: 'available';
  shopId: string;
  followedAt: string;
  shop: AvailableFollowedShopSummary;
}

export interface UnavailableFollowedShopItem {
  availability: 'unavailable';
  shopId: string;
  followedAt: string;
  shop: UnavailableFollowedShopSummary;
}

export type FollowedShopItem = AvailableFollowedShopItem | UnavailableFollowedShopItem;

export interface FollowedShopPage {
  items: FollowedShopItem[];
  pagination: FollowedShopPagination;
}

export interface ShopStorefrontProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
}

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const canonicalSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isCanonicalDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function isCanonicalShopId(value: unknown): value is string {
  return typeof value === 'string' && canonicalUuid.test(value);
}

export function isCanonicalShopSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= SHOP_SLUG_MAX_LENGTH &&
    canonicalSlug.test(value)
  );
}

function isCategoryFacet(value: unknown): value is PublicShopCategoryFacet {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['slug', 'name', 'parentSlug', 'productCount']) &&
    isCanonicalShopSlug(value.slug) &&
    isString(value.name) &&
    (value.parentSlug === null || isCanonicalShopSlug(value.parentSlug)) &&
    isPositiveInteger(value.productCount)
  );
}

function isCategoryFacets(value: unknown): value is PublicShopCategoryFacet[] {
  return (
    Array.isArray(value) &&
    value.every(isCategoryFacet) &&
    new Set(value.map((category) => category.slug)).size === value.length
  );
}

export function isPublicShopProfile(value: unknown): value is PublicShopProfile {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'slug',
      'name',
      'location',
      'joinedAt',
      'activeProductCount',
      'ratingAverageBasisPoints',
      'ratingCount',
      'soldCount',
      'followerCount',
      'responseMetadata',
      'categories',
    ]) ||
    !isCanonicalShopId(value.id) ||
    !isCanonicalShopSlug(value.slug) ||
    !isString(value.name) ||
    !isString(value.location) ||
    !isCanonicalDateTime(value.joinedAt) ||
    !isNonNegativeInteger(value.activeProductCount) ||
    !isNonNegativeInteger(value.ratingAverageBasisPoints) ||
    value.ratingAverageBasisPoints > 500 ||
    !isNonNegativeInteger(value.ratingCount) ||
    !isNonNegativeInteger(value.soldCount) ||
    !isNonNegativeInteger(value.followerCount) ||
    !isRecord(value.responseMetadata) ||
    !hasExactKeys(value.responseMetadata, [
      'responseRateBasisPoints',
      'responseTimeLabel',
      'message',
    ]) ||
    value.responseMetadata.responseRateBasisPoints !== null ||
    value.responseMetadata.responseTimeLabel !== null ||
    !isString(value.responseMetadata.message) ||
    !isCategoryFacets(value.categories)
  ) {
    return false;
  }
  const activeProductCount = value.activeProductCount as number;
  return (
    (value.ratingCount > 0 || value.ratingAverageBasisPoints === 0) &&
    value.categories.every((category) => category.productCount <= activeProductCount)
  );
}

function isPagination(value: unknown): value is CatalogPagination {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['page', 'pageSize', 'totalItems', 'totalPages']) &&
    isPositiveInteger(value.page) &&
    isPositiveInteger(value.pageSize) &&
    value.pageSize <= SHOP_CATALOG_MAX_PAGE_SIZE &&
    isNonNegativeInteger(value.totalItems) &&
    isNonNegativeInteger(value.totalPages) &&
    value.totalPages === Math.ceil(value.totalItems / value.pageSize)
  );
}

function isCatalogSort(value: unknown): value is CatalogSort {
  return typeof value === 'string' && (catalogSortValues as readonly string[]).includes(value);
}

export function isPublicShopCatalogPage(value: unknown): value is PublicShopCatalogPage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['shopId', 'query', 'pagination', 'categories', 'items']) &&
    isCanonicalShopId(value.shopId) &&
    isRecord(value.query) &&
    hasExactKeys(value.query, ['q', 'category', 'sort']) &&
    (value.query.q === null ||
      (isString(value.query.q) && value.query.q.length <= SHOP_KEYWORD_MAX_LENGTH)) &&
    (value.query.category === null || isCanonicalShopSlug(value.query.category)) &&
    isCatalogSort(value.query.sort) &&
    isPagination(value.pagination) &&
    isCategoryFacets(value.categories) &&
    Array.isArray(value.items) &&
    value.items.length <= value.pagination.pageSize &&
    value.items.every(isCatalogProductCard) &&
    new Set(value.items.map((item) => item.id)).size === value.items.length
  );
}

function isFollowState(value: unknown): value is ShopFollowState {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['shopId', 'isFollowing']) &&
    isCanonicalShopId(value.shopId) &&
    typeof value.isFollowing === 'boolean'
  );
}

export function isShopFollowStateList(value: unknown): value is ShopFollowStateList {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['items']) &&
    Array.isArray(value.items) &&
    value.items.length <= SHOP_FOLLOW_MAX_STATUS_IDS &&
    value.items.every(isFollowState) &&
    new Set(value.items.map((item) => item.shopId)).size === value.items.length
  );
}

export function isShopFollowMutationResponse(value: unknown): value is ShopFollowMutationResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['shopId', 'isFollowing', 'followedAt', 'followerCount']) ||
    !isCanonicalShopId(value.shopId) ||
    typeof value.isFollowing !== 'boolean' ||
    !(value.followedAt === null || isCanonicalDateTime(value.followedAt)) ||
    !(value.followerCount === null || isNonNegativeInteger(value.followerCount))
  ) {
    return false;
  }
  return value.isFollowing
    ? value.followedAt !== null && value.followerCount !== null
    : value.followedAt === null;
}

function isFollowedShopPagination(value: unknown): value is FollowedShopPagination {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['page', 'pageSize', 'totalItems', 'totalPages']) &&
    isPositiveInteger(value.page) &&
    isPositiveInteger(value.pageSize) &&
    value.pageSize <= FOLLOWED_SHOPS_MAX_PAGE_SIZE &&
    isNonNegativeInteger(value.totalItems) &&
    isNonNegativeInteger(value.totalPages) &&
    value.totalPages === Math.ceil(value.totalItems / value.pageSize)
  );
}

function isFollowedShopItem(value: unknown): value is FollowedShopItem {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['availability', 'shopId', 'followedAt', 'shop']) ||
    !isCanonicalShopId(value.shopId) ||
    !isCanonicalDateTime(value.followedAt) ||
    !isRecord(value.shop) ||
    value.shop.id !== value.shopId
  ) {
    return false;
  }
  if (value.availability === 'available') {
    return (
      hasExactKeys(value.shop, ['id', 'slug', 'name', 'href', 'location', 'followerCount']) &&
      isCanonicalShopSlug(value.shop.slug) &&
      isString(value.shop.name) &&
      value.shop.href === `/shops/${value.shop.slug}` &&
      isString(value.shop.location) &&
      isNonNegativeInteger(value.shop.followerCount)
    );
  }
  return (
    value.availability === 'unavailable' &&
    hasExactKeys(value.shop, ['id', 'name', 'href']) &&
    isString(value.shop.name) &&
    value.shop.href === null
  );
}

function hasCanonicalFollowedShopOrder(items: FollowedShopItem[]): boolean {
  return items.every((item, index) => {
    const previous = items[index - 1];
    if (!previous) return true;
    if (previous.followedAt > item.followedAt) return true;
    return previous.followedAt === item.followedAt && previous.shopId < item.shopId;
  });
}

export function isFollowedShopPage(value: unknown): value is FollowedShopPage {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['items', 'pagination']) ||
    !Array.isArray(value.items) ||
    !value.items.every(isFollowedShopItem) ||
    !isFollowedShopPagination(value.pagination)
  ) {
    return false;
  }
  const items = value.items as FollowedShopItem[];
  const pagination = value.pagination as FollowedShopPagination;
  if (
    items.length > pagination.pageSize ||
    new Set(items.map((item) => item.shopId)).size !== items.length ||
    !hasCanonicalFollowedShopOrder(items)
  ) {
    return false;
  }
  const maximumItemsOnPage =
    pagination.page > pagination.totalPages
      ? 0
      : Math.min(
          pagination.pageSize,
          pagination.totalItems - (pagination.page - 1) * pagination.pageSize,
        );
  return items.length <= maximumItemsOnPage;
}

function canonicalPositiveInteger(
  value: unknown,
  fallback: number,
  maximum?: number,
): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && (maximum === undefined || parsed <= maximum)
    ? parsed
    : null;
}

export function parseShopCatalogQuery(value: unknown): ShopCatalogQuery | null {
  if (!isRecord(value) || !hasExactKeys(value, [], ['q', 'category', 'sort', 'page', 'pageSize'])) {
    return null;
  }
  if (
    (value.q !== undefined && typeof value.q !== 'string') ||
    (value.category !== undefined && typeof value.category !== 'string') ||
    (value.sort !== undefined && typeof value.sort !== 'string')
  ) {
    return null;
  }
  const q = typeof value.q === 'string' ? value.q.trim().replace(/\s+/g, ' ') || null : null;
  const category = typeof value.category === 'string' ? value.category.trim() || null : null;
  const explicitSort = value.sort === undefined || value.sort === '' ? null : value.sort;
  const page = canonicalPositiveInteger(value.page, SHOP_CATALOG_DEFAULT_PAGE);
  const pageSize = canonicalPositiveInteger(
    value.pageSize,
    SHOP_CATALOG_DEFAULT_PAGE_SIZE,
    SHOP_CATALOG_MAX_PAGE_SIZE,
  );
  if (
    (q !== null && q.length > SHOP_KEYWORD_MAX_LENGTH) ||
    (category !== null && !isCanonicalShopSlug(category)) ||
    (explicitSort !== null && !isCatalogSort(explicitSort)) ||
    page === null ||
    pageSize === null
  ) {
    return null;
  }
  return { q, category, sort: explicitSort ?? (q ? 'relevance' : 'newest'), page, pageSize };
}

export function parseShopFollowStatusIds(value: unknown): string[] | null {
  const values = typeof value === 'string' ? value.split(',') : null;
  if (
    !values ||
    values.length < 1 ||
    values.length > SHOP_FOLLOW_MAX_STATUS_IDS ||
    !values.every(isCanonicalShopId) ||
    new Set(values).size !== values.length
  ) {
    return null;
  }
  return values;
}

export function parseFollowedShopPageQuery(value: unknown): FollowedShopPageQuery | null {
  if (!isRecord(value) || !hasExactKeys(value, [], ['page', 'pageSize'])) return null;
  const page = canonicalPositiveInteger(value.page, FOLLOWED_SHOPS_DEFAULT_PAGE);
  const pageSize = canonicalPositiveInteger(
    value.pageSize,
    FOLLOWED_SHOPS_DEFAULT_PAGE_SIZE,
    FOLLOWED_SHOPS_MAX_PAGE_SIZE,
  );
  return page === null || pageSize === null || !Number.isSafeInteger((page - 1) * pageSize)
    ? null
    : { page, pageSize };
}

export function isShopStorefrontProblemDetails(
  value: unknown,
): value is ShopStorefrontProblemDetails {
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

export const parsePublicShopProfile = (value: unknown): PublicShopProfile | null =>
  isPublicShopProfile(value) ? value : null;
export const parsePublicShopCatalogPage = (value: unknown): PublicShopCatalogPage | null =>
  isPublicShopCatalogPage(value) ? value : null;
export const parseShopFollowStateList = (value: unknown): ShopFollowStateList | null =>
  isShopFollowStateList(value) ? value : null;
export const parseShopFollowMutationResponse = (
  value: unknown,
): ShopFollowMutationResponse | null => (isShopFollowMutationResponse(value) ? value : null);
export const parseFollowedShopPage = (value: unknown): FollowedShopPage | null =>
  isFollowedShopPage(value) ? value : null;
export const parseShopStorefrontProblemDetails = (
  value: unknown,
): ShopStorefrontProblemDetails | null => (isShopStorefrontProblemDetails(value) ? value : null);
