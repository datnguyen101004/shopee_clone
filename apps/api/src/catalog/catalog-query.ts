import {
  CATALOG_DEFAULT_PAGE,
  CATALOG_DEFAULT_PAGE_SIZE,
  CATALOG_MAX_PAGE_SIZE,
} from '@shopee-clone/contracts';

export interface NormalizedCatalogQuery {
  category: string | null;
  page: number;
  pageSize: number;
}

export interface InvalidCatalogParameter {
  name: 'category' | 'page' | 'pageSize';
  reason: string;
}

export class CatalogQueryValidationError extends Error {
  constructor(readonly invalidParameters: InvalidCatalogParameter[]) {
    super('Invalid catalogue query parameters.');
  }
}

function singleValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function positiveInteger(
  name: 'page' | 'pageSize',
  value: unknown,
  fallback: number,
  maximum?: number,
): { value: number; issue?: InvalidCatalogParameter } {
  if (value === undefined) return { value: fallback };
  const raw = singleValue(value);
  if (!raw || !/^[1-9]\d*$/.test(raw)) {
    return { value: fallback, issue: { name, reason: 'must be a positive integer' } };
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || (maximum !== undefined && parsed > maximum)) {
    return {
      value: fallback,
      issue: { name, reason: maximum ? `must not exceed ${maximum}` : 'is too large' },
    };
  }
  return { value: parsed };
}

export function parseCatalogQuery(query: Record<string, unknown>): NormalizedCatalogQuery {
  const issues: InvalidCatalogParameter[] = [];
  const page = positiveInteger('page', query.page, CATALOG_DEFAULT_PAGE);
  const pageSize = positiveInteger(
    'pageSize',
    query.pageSize,
    CATALOG_DEFAULT_PAGE_SIZE,
    CATALOG_MAX_PAGE_SIZE,
  );
  if (page.issue) issues.push(page.issue);
  if (pageSize.issue) issues.push(pageSize.issue);

  let category: string | null = null;
  if (query.category !== undefined) {
    const raw = singleValue(query.category)?.trim();
    if (!raw || raw.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw)) {
      issues.push({ name: 'category', reason: 'must be a valid category slug' });
    } else {
      category = raw;
    }
  }

  if (issues.length) throw new CatalogQueryValidationError(issues);
  return { category, page: page.value, pageSize: pageSize.value };
}
