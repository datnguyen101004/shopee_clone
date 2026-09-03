import {
  CATALOG_DEFAULT_PAGE,
  CATALOG_DEFAULT_PAGE_SIZE,
  CATALOG_MAX_PAGE_SIZE,
  catalogSortValues,
  type CatalogAvailability,
  type CatalogPromotion,
  type CatalogSort,
} from '@shopee-clone/contracts';

export interface NormalizedCatalogQuery {
  q: string | null;
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  rating: number | null;
  location: string | null;
  availability: CatalogAvailability | null;
  promotion: CatalogPromotion | null;
  sort: CatalogSort;
  page: number;
  pageSize: number;
  /** Internal ranking surface used by bounded recommendation feeds. */
  recommendationSurface?: 'daily-recommendations';
}

export type CatalogParameterName =
  | 'q'
  | 'category'
  | 'minPrice'
  | 'maxPrice'
  | 'rating'
  | 'location'
  | 'availability'
  | 'promotion'
  | 'sort'
  | 'page'
  | 'pageSize';

export interface InvalidCatalogParameter {
  name: CatalogParameterName;
  reason: string;
}

export class CatalogQueryValidationError extends Error {
  constructor(readonly invalidParameters: InvalidCatalogParameter[]) {
    super('Invalid catalogue query parameters.');
  }
}

function rawString(
  name: CatalogParameterName,
  value: unknown,
  issues: InvalidCatalogParameter[],
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    issues.push({ name, reason: 'must be provided once as a string' });
    return undefined;
  }
  return value;
}

function positiveInteger(
  name: 'page' | 'pageSize',
  value: unknown,
  fallback: number,
  issues: InvalidCatalogParameter[],
  maximum?: number,
): number {
  const raw = rawString(name, value, issues);
  if (raw === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(raw)) {
    issues.push({ name, reason: 'must be a positive integer' });
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || (maximum !== undefined && parsed > maximum)) {
    issues.push({ name, reason: maximum ? `must not exceed ${maximum}` : 'is too large' });
    return fallback;
  }
  return parsed;
}

function optionalNonNegativeInteger(
  name: 'minPrice' | 'maxPrice',
  value: unknown,
  issues: InvalidCatalogParameter[],
): number | null {
  const raw = rawString(name, value, issues);
  if (raw === undefined || raw === '') return null;
  const sanitized = raw.replace(/[.,]/g, '');
  if (!/^(?:0|[1-9]\d*)$/.test(sanitized)) {
    issues.push({ name, reason: 'must be a non-negative integer' });
    return null;
  }
  const parsed = Number(sanitized);
  if (!Number.isSafeInteger(parsed)) {
    issues.push({ name, reason: 'is too large' });
    return null;
  }
  return parsed;
}

function optionalEnum<T extends string>(
  name: 'availability' | 'promotion' | 'sort',
  value: unknown,
  accepted: readonly T[],
  issues: InvalidCatalogParameter[],
): T | null {
  const raw = rawString(name, value, issues);
  if (raw === undefined || raw === '') return null;
  if (!accepted.includes(raw as T)) {
    issues.push({ name, reason: `must be one of: ${accepted.join(', ')}` });
    return null;
  }
  return raw as T;
}

export function parseCatalogQuery(query: Record<string, unknown>): NormalizedCatalogQuery {
  const issues: InvalidCatalogParameter[] = [];
  const page = positiveInteger('page', query.page, CATALOG_DEFAULT_PAGE, issues);

  const rawQ = rawString('q', query.q, issues);
  const q = rawQ === undefined ? null : rawQ.trim().replace(/\s+/g, ' ') || null;
  if (q && q.length > 120) issues.push({ name: 'q', reason: 'must not exceed 120 characters' });

  const pageSize = positiveInteger(
    'pageSize',
    query.pageSize,
    CATALOG_DEFAULT_PAGE_SIZE,
    issues,
    CATALOG_MAX_PAGE_SIZE,
  );

  const rawCategory = rawString('category', query.category, issues);
  const category = rawCategory === undefined ? null : rawCategory.trim() || null;
  if (category && (category.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category))) {
    issues.push({ name: 'category', reason: 'must be a valid category slug' });
  }

  const rawLocation = rawString('location', query.location, issues);
  const location =
    rawLocation === undefined ? null : rawLocation.trim().replace(/\s+/g, ' ') || null;
  const locationHasUnsafeCharacters =
    location !== null &&
    [...location].some(
      (character) => character.charCodeAt(0) <= 31 || character === '<' || character === '>',
    );
  if (location && (location.length > 120 || locationHasUnsafeCharacters)) {
    issues.push({ name: 'location', reason: 'must be a valid location value' });
  }

  const minPrice = optionalNonNegativeInteger('minPrice', query.minPrice, issues);
  const maxPrice = optionalNonNegativeInteger('maxPrice', query.maxPrice, issues);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    issues.push({ name: 'minPrice', reason: 'must not exceed maxPrice' });
  }

  const rawRating = rawString('rating', query.rating, issues);
  const rating = rawRating === undefined || rawRating === '' ? null : Number(rawRating);
  if (rating !== null && (!/^[1-5]$/.test(rawRating ?? '') || !Number.isInteger(rating))) {
    issues.push({ name: 'rating', reason: 'must be a whole number from 1 to 5' });
  }

  const availability = optionalEnum(
    'availability',
    query.availability,
    ['in-stock'] as const,
    issues,
  );
  const promotion = optionalEnum('promotion', query.promotion, ['discounted'] as const, issues);
  const explicitSort = optionalEnum('sort', query.sort, catalogSortValues, issues);
  const sort = explicitSort ?? (q ? 'relevance' : 'newest');

  if (issues.length) throw new CatalogQueryValidationError(issues);
  return {
    q,
    category,
    minPrice,
    maxPrice,
    rating,
    location,
    availability,
    promotion,
    sort,
    page,
    pageSize,
  };
}
