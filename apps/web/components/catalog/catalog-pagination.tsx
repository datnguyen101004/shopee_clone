import type { CatalogProductsResponse } from '@shopee-clone/contracts';
import Link from 'next/link';

import {
  catalogPageHref,
  pageNumbers,
  type CatalogRouteContext,
} from './catalog-utils';

export function CatalogPagination({
  response,
  context,
  pageHrefBuilder,
}: {
  response: Pick<CatalogProductsResponse, 'pagination'>;
  context?: CatalogRouteContext;
  pageHrefBuilder?: (page: number) => string;
}) {
  const { page, totalPages } = response.pagination;
  if (totalPages <= 1) return null;

  return (
    <nav className="catalog-pagination" aria-label="Phân trang sản phẩm">
      {page > 1 ? (
        <Link
          href={pageHrefBuilder ? pageHrefBuilder(page - 1) : catalogPageHref(context!, page - 1)}
          aria-label="Trang trước"
          className="shopee-pagination-btn"
        >
          ‹
        </Link>
      ) : (
        <span
          aria-disabled="true"
          aria-label="Trang trước"
          className="shopee-pagination-btn disabled"
        >
          ‹
        </span>
      )}
      {pageNumbers(page, totalPages).map((number) =>
        number === page ? (
          <span
            key={number}
            aria-current="page"
            aria-label={`Trang ${number}`}
            className="shopee-pagination-page active"
          >
            {number}
          </span>
        ) : (
          <Link
            key={number}
            href={pageHrefBuilder ? pageHrefBuilder(number) : catalogPageHref(context!, number)}
            aria-label={`Trang ${number}`}
            className="shopee-pagination-page"
          >
            {number}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link
          href={pageHrefBuilder ? pageHrefBuilder(page + 1) : catalogPageHref(context!, page + 1)}
          aria-label="Trang sau"
          className="shopee-pagination-btn"
        >
          ›
        </Link>
      ) : (
        <span
          aria-disabled="true"
          aria-label="Trang sau"
          className="shopee-pagination-btn disabled"
        >
          ›
        </span>
      )}
    </nav>
  );
}
