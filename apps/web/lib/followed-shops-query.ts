import { parseFollowedShopPageQuery, type FollowedShopPageQuery } from '@shopee-clone/contracts';

const keys = ['page', 'pageSize'] as const;
type FollowedShopsQueryKey = (typeof keys)[number];

export class FollowedShopsRouteQueryError extends Error {
  constructor() {
    super('Invalid followed-shops account route query');
  }
}

export function pickFollowedShopsQuery(
  raw: Record<string, string | string[] | undefined>,
): FollowedShopPageQuery {
  if (Object.keys(raw).some((key) => !keys.includes(key as FollowedShopsQueryKey))) {
    throw new FollowedShopsRouteQueryError();
  }
  const selected: Record<string, unknown> = {};
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) throw new FollowedShopsRouteQueryError();
    if (value !== undefined) selected[key] = value;
  }
  const parsed = parseFollowedShopPageQuery(selected);
  if (!parsed) throw new FollowedShopsRouteQueryError();
  return parsed;
}

export function followedShopsHref(query: Partial<FollowedShopPageQuery> = {}): string {
  const raw: Record<string, unknown> = {};
  if (query.page !== undefined) raw.page = String(query.page);
  if (query.pageSize !== undefined) raw.pageSize = String(query.pageSize);
  const parsed = parseFollowedShopPageQuery(raw);
  if (!parsed) throw new FollowedShopsRouteQueryError();
  const parameters = new URLSearchParams({
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
  });
  return `/account/followed-shops?${parameters}`;
}
