export const CATALOG_DEFAULT_PAGE = 1;
export const CATALOG_DEFAULT_PAGE_SIZE = 12;
export const CATALOG_MAX_PAGE_SIZE = 48;

export const catalogSortValues = [
  'relevance',
  'newest',
  'best-selling',
  'price-asc',
  'price-desc',
] as const;
export type CatalogSort = (typeof catalogSortValues)[number];
export type CatalogAvailability = 'in-stock';
export type CatalogPromotion = 'discounted';

export interface CatalogQueryContext {
  q: string | null;
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  rating: number | null;
  location: string | null;
  availability: CatalogAvailability | null;
  promotion: CatalogPromotion | null;
  sort: CatalogSort;
}

export interface CatalogPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CatalogCategorySummary {
  slug: string;
  name: string;
}

export interface CatalogShopSummary {
  name: string;
  location: string;
}

export interface CatalogCategoryFacet {
  slug: string;
  name: string;
  parentSlug: string | null;
}

export interface CatalogPriceRangeFacet {
  min: number | null;
  max: number | null;
}

export interface CatalogFacets {
  categories: CatalogCategoryFacet[];
  locations: string[];
  priceRange: CatalogPriceRangeFacet;
}

export interface CatalogProductCard {
  id: string;
  name: string;
  href: string;
  imageUrl: string | null;
  imageAlt: string;
  priceMinor: number;
  compareAtPriceMinor?: number;
  discountPercent?: number;
  ratingAverageBasisPoints: number;
  ratingCount: number;
  soldCount: number;
  shop: CatalogShopSummary;
  category: CatalogCategorySummary;
}

export interface CatalogProductsResponse {
  query: CatalogQueryContext;
  pagination: CatalogPagination;
  facets: CatalogFacets;
  items: CatalogProductCard[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isSafeNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value);
const isNullableNonNegativeInteger = (value: unknown): value is number | null =>
  value === null || isSafeNonNegativeInteger(value);

const isSort = (value: unknown): value is CatalogSort =>
  isString(value) && (catalogSortValues as readonly string[]).includes(value);

const isCategoryFacet = (value: unknown): value is CatalogCategoryFacet =>
  isRecord(value) &&
  isString(value.slug) &&
  isString(value.name) &&
  isNullableString(value.parentSlug);

const isFacets = (value: unknown): value is CatalogFacets => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.categories) ||
    !value.categories.every(isCategoryFacet) ||
    !Array.isArray(value.locations) ||
    !value.locations.every(isString) ||
    !isRecord(value.priceRange) ||
    !isNullableNonNegativeInteger(value.priceRange.min) ||
    !isNullableNonNegativeInteger(value.priceRange.max)
  ) {
    return false;
  }
  return (
    value.priceRange.min === null ||
    value.priceRange.max === null ||
    value.priceRange.min <= value.priceRange.max
  );
};

const isCategory = (value: unknown): value is CatalogCategorySummary =>
  isRecord(value) && isString(value.slug) && isString(value.name);

const isShop = (value: unknown): value is CatalogShopSummary =>
  isRecord(value) && isString(value.name) && isString(value.location);

export const isCatalogProductCard = (value: unknown): value is CatalogProductCard => {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.name) ||
    !isString(value.href) ||
    !(value.imageUrl === null || isString(value.imageUrl)) ||
    !isString(value.imageAlt) ||
    !isSafeNonNegativeInteger(value.priceMinor) ||
    !isSafeNonNegativeInteger(value.ratingAverageBasisPoints) ||
    value.ratingAverageBasisPoints > 500 ||
    !isSafeNonNegativeInteger(value.ratingCount) ||
    !isSafeNonNegativeInteger(value.soldCount) ||
    !isShop(value.shop) ||
    !isCategory(value.category)
  ) {
    return false;
  }

  const hasCompareAt = value.compareAtPriceMinor !== undefined;
  const hasDiscount = value.discountPercent !== undefined;
  if (hasCompareAt !== hasDiscount) return false;
  if (!hasCompareAt) return true;

  return (
    isSafeNonNegativeInteger(value.compareAtPriceMinor) &&
    value.compareAtPriceMinor > value.priceMinor &&
    isPositiveInteger(value.discountPercent) &&
    value.discountPercent <= 100
  );
};

export function isCatalogProductsResponse(value: unknown): value is CatalogProductsResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.query) ||
    !isRecord(value.pagination) ||
    !isFacets(value.facets)
  )
    return false;
  const { pagination, query } = value;
  if (
    !isNullableString(query.q) ||
    !isNullableString(query.category) ||
    !isNullableNonNegativeInteger(query.minPrice) ||
    !isNullableNonNegativeInteger(query.maxPrice) ||
    (query.minPrice !== null && query.maxPrice !== null && query.minPrice > query.maxPrice) ||
    !(query.rating === null || (isPositiveInteger(query.rating) && query.rating <= 5)) ||
    !isNullableString(query.location) ||
    !(query.availability === null || query.availability === 'in-stock') ||
    !(query.promotion === null || query.promotion === 'discounted') ||
    !isSort(query.sort) ||
    !isPositiveInteger(pagination.page) ||
    !isPositiveInteger(pagination.pageSize) ||
    pagination.pageSize > CATALOG_MAX_PAGE_SIZE ||
    !isSafeNonNegativeInteger(pagination.totalItems) ||
    !isSafeNonNegativeInteger(pagination.totalPages) ||
    !Array.isArray(value.items) ||
    !value.items.every(isCatalogProductCard)
  ) {
    return false;
  }

  const expectedPages = Math.ceil(pagination.totalItems / pagination.pageSize);
  return pagination.totalPages === expectedPages && value.items.length <= pagination.pageSize;
}

export function parseCatalogProductsResponse(value: unknown): CatalogProductsResponse | null {
  return isCatalogProductsResponse(value) ? value : null;
}
