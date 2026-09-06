import Link from 'next/link';

import { FaRotateLeft } from './catalog-icons';
import {
  contextQuery,
  filterLabels,
  type CatalogRouteContext,
} from './catalog-utils';
import {
  catalogSearchHref,
  replaceCatalogQuery,
  type CatalogQueryKey,
} from '../../lib/catalog-query';

export function ActiveFilters({ context }: { context: CatalogRouteContext }) {
  const query = contextQuery(context);
  const entries = (Object.keys(filterLabels) as CatalogQueryKey[]).flatMap((key) => {
    const value = query[key];
    if (value === null || value === undefined || value === '') return [];
    const display = key === 'rating' ? `${value} sao trở lên` : String(value);
    return [{ key, display }];
  });
  if (!entries.length) return null;

  return (
    <div className="catalog-active-filters" aria-label="Bộ lọc đang áp dụng">
      <span className="shopee-active-filter-label">Bộ lọc:</span>
      {entries.map(({ key, display }) => (
        <Link
          key={key}
          href={catalogSearchHref(replaceCatalogQuery(query, { [key]: undefined }))}
          aria-label={`Bỏ ${filterLabels[key]} ${display}`}
          className="shopee-active-filter-tag"
        >
          <span>
            {filterLabels[key]}: <span className="font-medium">{display}</span>
          </span>
          <span className="shopee-filter-remove" aria-hidden="true">
            ✕
          </span>
        </Link>
      ))}
      <Link className="catalog-clear shopee-active-clear" href="/search">
        <FaRotateLeft className="shopee-clear-icon" /> Xóa tất cả
      </Link>
    </div>
  );
}
