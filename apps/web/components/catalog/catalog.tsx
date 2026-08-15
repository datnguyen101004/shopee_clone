import type {
  CatalogProductCard,
  CatalogProductsResponse,
  CatalogQueryContext,
} from '@shopee-clone/contracts';
import { Badge, Card } from '@shopee-clone/ui';
import Link from 'next/link';

import { MarketplaceProductImage } from '../marketplace-product-image';
import { FavoriteButton } from '../engagement/favorite-button';
import { FavoriteStateProvider } from '../engagement/favorite-state-provider';
import {
  catalogSearchHref,
  replaceCatalogQuery,
  type CatalogQueryKey,
  type CatalogUrlQuery,
} from '../../lib/catalog-query';

export type CatalogRouteContext = CatalogQueryContext & { pageSize: number };

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

export function ProductCard({ product }: { product: CatalogProductCard }) {
  return (
    <Card className="catalog-card" data-testid="catalog-card">
      <Link href={product.href} className="catalog-card__link" aria-label={`Xem ${product.name}`}>
        <div className="catalog-card__media">
          {product.imageUrl ? (
            <MarketplaceProductImage
              src={product.imageUrl}
              alt={product.imageAlt}
              width={360}
              height={360}
            />
          ) : (
            <span role="img" aria-label={product.imageAlt} className="catalog-card__fallback">
              S
            </span>
          )}
          {product.discountPercent ? (
            <Badge variant="danger">-{product.discountPercent}%</Badge>
          ) : null}
        </div>
        <div className="catalog-card__body">
          <h2>{product.name}</h2>
          <p className="catalog-card__shop">{product.shop.name}</p>
          <div className="catalog-card__price">
            <strong>₫{formatNumber(product.priceMinor)}</strong>
            {product.compareAtPriceMinor ? (
              <del>₫{formatNumber(product.compareAtPriceMinor)}</del>
            ) : null}
          </div>
          <div className="catalog-card__facts">
            {product.ratingCount === 0 ? (
              <span aria-label="Chưa có đánh giá">Chưa có đánh giá</span>
            ) : (
              <span aria-label={`${(product.ratingAverageBasisPoints / 100).toFixed(1)} trên 5 sao`}>
                ★ {(product.ratingAverageBasisPoints / 100).toFixed(1)} (
                {formatNumber(product.ratingCount)})
              </span>
            )}
            <span>Đã bán {formatNumber(product.soldCount)}</span>
          </div>
          <span className="catalog-card__location">{product.shop.location}</span>
        </div>
      </Link>
      <FavoriteButton productId={product.id} compact />
    </Card>
  );
}

function contextQuery(context: CatalogRouteContext): CatalogUrlQuery {
  return {
    q: context.q,
    category: context.category,
    minPrice: context.minPrice,
    maxPrice: context.maxPrice,
    rating: context.rating,
    location: context.location,
    availability: context.availability,
    promotion: context.promotion,
    sort: context.sort,
    pageSize: context.pageSize,
  };
}

export function catalogPageHref(context: CatalogRouteContext, page: number): string {
  return catalogSearchHref({ ...contextQuery(context), page });
}

function pageNumbers(current: number, total: number): number[] {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

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
        >
          ‹
        </Link>
      ) : (
        <span aria-disabled="true" aria-label="Trang trước">
          ‹
        </span>
      )}
      {pageNumbers(page, totalPages).map((number) =>
        number === page ? (
          <span key={number} aria-current="page" aria-label={`Trang ${number}`}>
            {number}
          </span>
        ) : (
          <Link
            key={number}
            href={pageHrefBuilder ? pageHrefBuilder(number) : catalogPageHref(context!, number)}
            aria-label={`Trang ${number}`}
          >
            {number}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link
          href={pageHrefBuilder ? pageHrefBuilder(page + 1) : catalogPageHref(context!, page + 1)}
          aria-label="Trang sau"
        >
          ›
        </Link>
      ) : (
        <span aria-disabled="true" aria-label="Trang sau">
          ›
        </span>
      )}
    </nav>
  );
}

const filterLabels: Partial<Record<CatalogQueryKey, string>> = {
  q: 'Từ khóa',
  category: 'Danh mục',
  minPrice: 'Giá từ',
  maxPrice: 'Giá đến',
  rating: 'Đánh giá',
  location: 'Nơi bán',
  availability: 'Còn hàng',
  promotion: 'Đang giảm giá',
};

function ActiveFilters({ context }: { context: CatalogRouteContext }) {
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
      {entries.map(({ key, display }) => (
        <Link
          key={key}
          href={catalogSearchHref(replaceCatalogQuery(query, { [key]: undefined }))}
          aria-label={`Bỏ ${filterLabels[key]} ${display}`}
        >
          {filterLabels[key]}: {display} ×
        </Link>
      ))}
      <Link className="catalog-clear" href="/search">
        Xóa tất cả
      </Link>
    </div>
  );
}

export function DiscoveryControls({
  response,
  context,
}: {
  response: CatalogProductsResponse;
  context: CatalogRouteContext;
}) {
  const { query, facets, pagination } = response;
  const sortDescription =
    query.sort === 'relevance' && !query.q
      ? 'Mới nhất (thay cho độ liên quan)'
      : {
          relevance: 'Liên quan nhất',
          newest: 'Mới nhất',
          'best-selling': 'Bán chạy',
          'price-asc': 'Giá thấp đến cao',
          'price-desc': 'Giá cao đến thấp',
        }[query.sort];

  return (
    <FavoriteStateProvider productIds={response.items.map(({ id }) => id)}>
      <form
        className="catalog-discovery"
        action="/search"
        method="get"
        role="search"
        aria-label="Tìm và lọc sản phẩm"
      >
        <div className="catalog-field catalog-field--keyword">
          <label htmlFor="catalog-q">Từ khóa</label>
          <input
            id="catalog-q"
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            maxLength={120}
            placeholder="Tìm trong Shopee Clone"
          />
        </div>
        <div className="catalog-field">
          <label htmlFor="catalog-category">Danh mục</label>
          <select id="catalog-category" name="category" defaultValue={query.category ?? ''}>
            <option value="">Tất cả danh mục</option>
            {facets.categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="catalog-price">
          <legend>Khoảng giá (₫)</legend>
          <input
            aria-label="Giá thấp nhất"
            name="minPrice"
            type="number"
            min="0"
            step="1"
            defaultValue={query.minPrice ?? ''}
            placeholder={facets.priceRange.min === null ? 'Từ' : String(facets.priceRange.min)}
          />
          <span>–</span>
          <input
            aria-label="Giá cao nhất"
            name="maxPrice"
            type="number"
            min="0"
            step="1"
            defaultValue={query.maxPrice ?? ''}
            placeholder={facets.priceRange.max === null ? 'Đến' : String(facets.priceRange.max)}
          />
        </fieldset>
        <div className="catalog-field">
          <label htmlFor="catalog-rating">Đánh giá</label>
          <select id="catalog-rating" name="rating" defaultValue={query.rating ?? ''}>
            <option value="">Tất cả</option>
            {[5, 4, 3, 2, 1].map((rating) => (
              <option key={rating} value={rating}>
                {rating} sao trở lên
              </option>
            ))}
          </select>
        </div>
        <div className="catalog-field">
          <label htmlFor="catalog-location">Nơi bán</label>
          <select id="catalog-location" name="location" defaultValue={query.location ?? ''}>
            <option value="">Toàn quốc</option>
            {facets.locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>
        <div className="catalog-checks">
          <label>
            <input
              name="availability"
              type="checkbox"
              value="in-stock"
              defaultChecked={query.availability === 'in-stock'}
            />{' '}
            Còn hàng
          </label>
          <label>
            <input
              name="promotion"
              type="checkbox"
              value="discounted"
              defaultChecked={query.promotion === 'discounted'}
            />{' '}
            Đang giảm giá
          </label>
        </div>
        <div className="catalog-field">
          <label htmlFor="catalog-sort">Sắp xếp</label>
          <select id="catalog-sort" name="sort" defaultValue={query.sort}>
            <option value="relevance">Liên quan nhất</option>
            <option value="newest">Mới nhất</option>
            <option value="best-selling">Bán chạy</option>
            <option value="price-asc">Giá thấp đến cao</option>
            <option value="price-desc">Giá cao đến thấp</option>
          </select>
        </div>
        {context.pageSize !== 12 ? (
          <input type="hidden" name="pageSize" value={context.pageSize} />
        ) : null}
        <div className="catalog-discovery__actions">
          <button type="submit">Áp dụng</button>
          <Link href="/search">Xóa lọc</Link>
        </div>
      </form>
      <div className="catalog-result-summary" role="status" aria-live="polite">
        <strong>{formatNumber(pagination.totalItems)} sản phẩm</strong>
        <span>Sắp xếp: {sortDescription}</span>
      </div>
      <ActiveFilters context={context} />
    </FavoriteStateProvider>
  );
}

export function CatalogContent({
  response,
  context,
  pageHrefBuilder,
}: {
  response: Pick<CatalogProductsResponse, 'items' | 'pagination'>;
  context?: CatalogRouteContext;
  pageHrefBuilder?: (page: number) => string;
}) {
  return (
    <FavoriteStateProvider productIds={response.items.map(({ id }) => id)}>
      <div className="catalog-grid" aria-label="Danh sách sản phẩm">
        {response.items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      <CatalogPagination response={response} context={context} pageHrefBuilder={pageHrefBuilder} />
    </FavoriteStateProvider>
  );
}
