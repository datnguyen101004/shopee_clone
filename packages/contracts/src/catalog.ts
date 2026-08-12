export const CATALOG_DEFAULT_PAGE = 1;
export const CATALOG_DEFAULT_PAGE_SIZE = 12;
export const CATALOG_MAX_PAGE_SIZE = 48;

export interface CatalogQueryContext {
  category: string | null;
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
  items: CatalogProductCard[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isSafeNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;

const isCategory = (value: unknown): value is CatalogCategorySummary =>
  isRecord(value) && isString(value.slug) && isString(value.name);

const isShop = (value: unknown): value is CatalogShopSummary =>
  isRecord(value) && isString(value.name) && isString(value.location);

const isProduct = (value: unknown): value is CatalogProductCard => {
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
  if (!isRecord(value) || !isRecord(value.query) || !isRecord(value.pagination)) return false;
  const { pagination, query } = value;
  if (
    !(query.category === null || isString(query.category)) ||
    !isPositiveInteger(pagination.page) ||
    !isPositiveInteger(pagination.pageSize) ||
    pagination.pageSize > CATALOG_MAX_PAGE_SIZE ||
    !isSafeNonNegativeInteger(pagination.totalItems) ||
    !isSafeNonNegativeInteger(pagination.totalPages) ||
    !Array.isArray(value.items) ||
    !value.items.every(isProduct)
  ) {
    return false;
  }

  const expectedPages = Math.ceil(pagination.totalItems / pagination.pageSize);
  return pagination.totalPages === expectedPages && value.items.length <= pagination.pageSize;
}

export function parseCatalogProductsResponse(value: unknown): CatalogProductsResponse | null {
  return isCatalogProductsResponse(value) ? value : null;
}
