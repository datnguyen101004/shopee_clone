const catalogQueryKeys = [
  'q',
  'category',
  'minPrice',
  'maxPrice',
  'rating',
  'location',
  'availability',
  'promotion',
  'sort',
  'pageSize',
  'page',
] as const;

export type CatalogQueryKey = (typeof catalogQueryKeys)[number];
export type CatalogQueryValue = string | number | readonly string[] | null | undefined;
export type CatalogUrlQuery = Partial<Record<CatalogQueryKey, CatalogQueryValue>>;

export function pickCatalogQuery(
  raw: Record<string, string | string[] | undefined>,
): CatalogUrlQuery {
  return Object.fromEntries(
    catalogQueryKeys.flatMap((key) => (raw[key] === undefined ? [] : [[key, raw[key]]])),
  );
}

export function serializeCatalogQuery(query: CatalogUrlQuery): string {
  const parameters = new URLSearchParams();
  for (const key of catalogQueryKeys) {
    const value = query[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) parameters.append(key, item);
    } else {
      parameters.set(key, String(value));
    }
  }
  return parameters.toString();
}

export function catalogSearchHref(query: CatalogUrlQuery): string {
  const serialized = serializeCatalogQuery(query);
  return serialized ? `/search?${serialized}` : '/search';
}

export function replaceCatalogQuery(
  query: CatalogUrlQuery,
  updates: CatalogUrlQuery,
): CatalogUrlQuery {
  return { ...query, ...updates, page: undefined };
}
