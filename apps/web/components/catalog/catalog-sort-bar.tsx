'use client';

import type { CatalogProductsResponse } from '@shopee-clone/contracts';
import Link from 'next/link';

import {
  contextQuery,
  formatNumber,
  type CatalogRouteContext,
} from './catalog-utils';
import { catalogSearchHref, replaceCatalogQuery } from '../../lib/catalog-query';

export function CatalogSortBar({
  response,
  context,
}: {
  response: CatalogProductsResponse;
  context: CatalogRouteContext;
}) {
  const { query, pagination } = response;

  const handlePriceSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value) {
      window.location.href = catalogSearchHref(
        replaceCatalogQuery(contextQuery(context), {
          sort: value as 'price-asc' | 'price-desc',
          page: 1,
        }),
      );
    }
  };

  return (
    <div className="catalog-result-summary" role="status" aria-live="polite">
      <div className="catalog-result-summary__left">
        <span className="catalog-sort-title">Sắp xếp theo:</span>
        <div className="catalog-sort-options">
          <Link
            href={catalogSearchHref(
              replaceCatalogQuery(contextQuery(context), { sort: 'relevance', page: 1 }),
            )}
            className={`catalog-sort-btn${query.sort === 'relevance' ? ' is-active' : ''}`}
          >
            Liên quan nhất
          </Link>
          <Link
            href={catalogSearchHref(
              replaceCatalogQuery(contextQuery(context), { sort: 'newest', page: 1 }),
            )}
            className={`catalog-sort-btn${query.sort === 'newest' ? ' is-active' : ''}`}
          >
            Mới nhất
          </Link>
          <Link
            href={catalogSearchHref(
              replaceCatalogQuery(contextQuery(context), { sort: 'best-selling', page: 1 }),
            )}
            className={`catalog-sort-btn${query.sort === 'best-selling' ? ' is-active' : ''}`}
          >
            Bán chạy
          </Link>
          <select
            id="catalog-sort"
            name="sort"
            value={query.sort === 'price-asc' || query.sort === 'price-desc' ? query.sort : ''}
            aria-label="Sắp xếp theo giá"
            className={`catalog-sort-select${query.sort.startsWith('price-') ? ' is-active' : ''}`}
            onChange={handlePriceSortChange}
          >
            <option value="" disabled hidden={query.sort.startsWith('price-')}>
              Giá
            </option>
            <option value="price-asc">Giá: Thấp đến Cao</option>
            <option value="price-desc">Giá: Cao đến Thấp</option>
          </select>
        </div>
      </div>

      <div className="catalog-result-summary__right">
        <span className="font-medium">{formatNumber(pagination.totalItems)} sản phẩm</span>
      </div>
    </div>
  );
}
