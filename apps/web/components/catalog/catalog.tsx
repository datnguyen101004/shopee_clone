'use client';

import {
  buyerDisplayProductPriceMinor,
  isCatalogProductsResponse,
  parsePublicShopCatalogPage,
  type CatalogProductCard,
  type CatalogProductsResponse,
  type CatalogQueryContext,
} from '@shopee-clone/contracts';
import { Card } from '@shopee-clone/ui';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { MarketplaceProductImage } from '../marketplace-product-image';
import { FavoriteStateProvider } from '../engagement/favorite-state-provider';
import { useAuthSession } from '../auth-session-provider';
import {
  catalogSearchHref,
  replaceCatalogQuery,
  type CatalogQueryKey,
  type CatalogUrlQuery,
} from '../../lib/catalog-query';

export type CatalogRouteContext = CatalogQueryContext & { pageSize: number };

// Font Awesome SVG Icons
function FaFilter({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3.9 54.9C10.5 36.5 28 24 48 24l416 0c19.9 0 37.5 12.5 44.1 30.9s2.4 38.8-10.9 51.8L320 284.1 320 432c0 14.7-6.7 28.5-18.1 37.6l-64 51.2c-15.5 12.4-37.9 10-50.3-5.5s-10-37.9 5.5-50.3l42.9-34.3 0-146.6L3.9 106.7C-9.4 93.7-12.7 73.3 3.9 54.9z" />
    </svg>
  );
}

function FaListUl({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M64 144a48 48 0 1 0 0-96 48 48 0 1 0 0 96zM192 64c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L192 64zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-288 0zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-288 0zM64 304a48 48 0 1 0 0-96 48 48 0 1 0 0 96zm48 112a48 48 0 1 0 -96 0 48 48 0 1 0 96 0z" />
    </svg>
  );
}

function FaLocationDot({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 384 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z" />
    </svg>
  );
}

function FaTag({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 448 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M0 80L0 229.5c0 17 6.7 33.3 18.7 45.3l176 176c25 25 65.5 25 90.5 0L414.5 321.5c25-25 25-65.5 0-90.5l-176-176C226.5 42.7 210.2 36 193.2 36L44 36c-24.3 0-44 19.7-44 44zm112 56a32 32 0 1 1 0-64 32 32 0 1 1 0 64z" />
    </svg>
  );
}

function FaStar({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 576 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M316.9 18C311.6 7 300.4 0 288 0s-23.6 7-28.9 18L201 135.3 52.4 163.6c-12.1 2.3-21.7 11.6-24.8 23.6s1.5 24.6 11.6 32.1L149.9 313 118.8 459.8c-2.6 12 2.3 24.3 12.5 31.6s23.4 6.8 33.7 .8L288 418.7l123 73.5c10.3 6.1 23.5 6.5 33.7 .8s15.1-19.6 12.5-31.6L426.1 313l110.7-93.7c10.1-7.5 14.7-20.1 11.6-32.1s-12.7-21.3-24.8-23.6L375 135.3 316.9 18z" />
    </svg>
  );
}

function FaRotateLeft({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M125.7 160l50.3 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L48 224c-17.7 0-32-14.3-32-32L16 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 51.2L97.6 97.6c87.5-87.5 229.3-87.5 316.8 0s87.5 229.3 0 316.8s-229.3 87.5-316.8 0c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0c62.5 62.5 163.8 62.5 226.3 0s62.5-163.8 0-226.3s-163.8-62.5-226.3 0L125.7 160z" />
    </svg>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function formatPriceDisplay(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('vi-VN').format(Number(digits));
}

const PRICE_RANGE_PRESETS = [
  { label: 'Chọn khoảng giá', min: null, max: null, key: '' },
  { label: '0 – 100.000₫ (Dưới 100k)', min: 0, max: 100000, key: '0-100000' },
  { label: '100.000₫ – 500.000₫ (100k – 500k)', min: 100000, max: 500000, key: '100000-500000' },
  { label: '500.000₫ – 1.000.000₫ (500k – 1 triệu)', min: 500000, max: 1000000, key: '500000-1000000' },
  { label: '1.000.000₫ – 3.000.000₫ (1 triệu – 3 triệu)', min: 1000000, max: 3000000, key: '1000000-3000000' },
  { label: '3.000.000₫ – 10.000.000₫ (3 triệu – 10 triệu)', min: 3000000, max: 10000000, key: '3000000-10000000' },
  { label: 'Trên 10.000.000₫ (Trên 10 triệu)', min: 10000000, max: null, key: '10000000-' },
];

function FormattedPriceInput({
  name,
  ariaLabel,
  value,
  onChangeValue,
  placeholder,
}: {
  name: 'minPrice' | 'maxPrice';
  ariaLabel: string;
  value: number | null;
  onChangeValue: (val: number | null) => void;
  placeholder: string;
}) {
  const [displayValue, setDisplayValue] = useState(() => formatPriceDisplay(value));

  useEffect(() => {
    setDisplayValue(formatPriceDisplay(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, '');
    if (!rawDigits) {
      setDisplayValue('');
      onChangeValue(null);
      return;
    }
    const num = Number(rawDigits);
    if (!Number.isSafeInteger(num)) return;
    setDisplayValue(new Intl.NumberFormat('vi-VN').format(num));
    onChangeValue(num);
  };

  return (
    <div className="shopee-price-input-box">
      <span className="shopee-price-currency" aria-hidden="true">
        ₫
      </span>
      <input
        type="hidden"
        name={name}
        value={value !== null && value !== undefined ? String(value) : ''}
      />
      <input
        aria-label={ariaLabel}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="shopee-price-control"
      />
    </div>
  );
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
              fill
              sizes="(max-width: 599px) 50vw, (max-width: 899px) 33vw, 25vw"
            />
          ) : (
            <span role="img" aria-label={product.imageAlt} className="catalog-card__fallback">
              S
            </span>
          )}
          {product.discountPercent ? (
            <div className="shopee-discount-badge" aria-label={`Giảm ${product.discountPercent}%`}>
              <span className="shopee-discount-badge__percent">-{product.discountPercent}%</span>
              <span className="shopee-discount-badge__label">GIẢM</span>
            </div>
          ) : null}
        </div>
        <div className="catalog-card__body">
          <h2>{product.name}</h2>
          <p className="catalog-card__shop">{product.shop.name}</p>
          <div className="catalog-card__price">
            <strong>₫{formatNumber(buyerDisplayProductPriceMinor(product))}</strong>
            {product.compareAtPriceMinor ? (
              <del>₫{formatNumber(product.compareAtPriceMinor)}</del>
            ) : null}
          </div>
          {product.buyerBestPrice?.merchandiseDiscountMinor ? (
            <small>Giá tốt nhất dự kiến · Voucher đã áp dụng</small>
          ) : null}
          {product.scheduledPrice ? (
            <small
              className="shopee-scheduled-deal"
              aria-label={`Giảm giá sản phẩm ${Math.floor(product.scheduledPrice.discountBasisPoints / 100)} phần trăm`}
            >
              Đang giảm {Math.floor(product.scheduledPrice.discountBasisPoints / 100)}%
            </small>
          ) : null}
          <div className="catalog-card__facts">
            {product.ratingCount === 0 ? (
              <span aria-label="Chưa có đánh giá">Chưa có đánh giá</span>
            ) : (
              <span
                className="shopee-card-rating"
                aria-label={`${(product.ratingAverageBasisPoints / 100).toFixed(1)} trên 5 sao`}
              >
                <FaStar className="shopee-star-icon" />{' '}
                {(product.ratingAverageBasisPoints / 100).toFixed(1)} (
                {formatNumber(product.ratingCount)})
              </span>
            )}
            <span className="shopee-card-sold">Đã bán {formatNumber(product.soldCount)}</span>
          </div>
          <span className="catalog-card__location">{product.shop.location}</span>
        </div>
      </Link>
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
            {filterLabels[key]}: <strong>{display}</strong>
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

export function DiscoveryControls({
  response,
  context,
}: {
  response: CatalogProductsResponse;
  context: CatalogRouteContext;
}) {
  const { query, facets, pagination } = response;
  const [minPrice, setMinPrice] = useState<number | null>(query.minPrice);
  const [maxPrice, setMaxPrice] = useState<number | null>(query.maxPrice);

  useEffect(() => {
    setMinPrice(query.minPrice);
  }, [query.minPrice]);

  useEffect(() => {
    setMaxPrice(query.maxPrice);
  }, [query.maxPrice]);

  const activePresetKey = useMemo(() => {
    const matched = PRICE_RANGE_PRESETS.find(
      (p) => p.min === (minPrice ?? null) && p.max === (maxPrice ?? null),
    );
    return matched ? matched.key : '';
  }, [minPrice, maxPrice]);

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedKey = e.target.value;
    const matched = PRICE_RANGE_PRESETS.find((p) => p.key === selectedKey);
    if (matched) {
      setMinPrice(matched.min);
      setMaxPrice(matched.max);
    } else {
      setMinPrice(null);
      setMaxPrice(null);
    }
  };

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
        className="catalog-discovery shopee-filter-panel"
        action="/search"
        method="get"
        role="search"
        aria-label="Tìm và lọc sản phẩm"
      >
        {/* Filter Panel Header */}
        <div className="shopee-filter-heading">
          <div className="shopee-filter-heading__title">
            <FaFilter className="shopee-filter-icon" />
            <h2>BỘ LỌC TÌM KIẾM</h2>
          </div>
        </div>

        {/* Search Keyword */}
        <div className="catalog-field catalog-field--keyword shopee-filter-group">
          <label htmlFor="catalog-q" className="shopee-group-title">
            Từ khóa
          </label>
          <input
            id="catalog-q"
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            maxLength={120}
            placeholder="Tìm trong Shopee Clone"
            className="shopee-form-input"
          />
        </div>

        {/* Category Filter */}
        <div className="catalog-field shopee-filter-group">
          <label htmlFor="catalog-category" className="shopee-group-title">
            <FaListUl className="shopee-group-icon" /> Danh mục
          </label>
          <select
            id="catalog-category"
            name="category"
            aria-label="Danh mục"
            defaultValue={query.category ?? ''}
            className="shopee-form-select"
          >
            <option value="">Tất cả danh mục</option>
            {facets.categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {/* Location Filter */}
        <div className="catalog-field shopee-filter-group">
          <label htmlFor="catalog-location" className="shopee-group-title">
            <FaLocationDot className="shopee-group-icon" /> Nơi bán
          </label>
          <select
            id="catalog-location"
            name="location"
            aria-label="Nơi bán"
            defaultValue={query.location ?? ''}
            className="shopee-form-select"
          >
            <option value="">Toàn quốc</option>
            {facets.locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>

        {/* Price Range Filter */}
        <fieldset className="catalog-price shopee-filter-group shopee-price-group">
          <legend className="shopee-group-title">
            <FaTag className="shopee-group-icon" /> Khoảng Giá (₫)
          </legend>
          <div className="shopee-price-preset-wrap">
            <select
              aria-label="Chọn khoảng giá"
              value={activePresetKey}
              onChange={handlePresetChange}
              className="shopee-form-select catalog-price-preset"
            >
              {PRICE_RANGE_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div className="shopee-price-inputs">
            <FormattedPriceInput
              ariaLabel="Giá thấp nhất"
              name="minPrice"
              value={minPrice}
              onChangeValue={setMinPrice}
              placeholder={
                facets.priceRange.min === null ? 'TỪ' : formatPriceDisplay(facets.priceRange.min)
              }
            />
            <span className="shopee-price-dash">–</span>
            <FormattedPriceInput
              ariaLabel="Giá cao nhất"
              name="maxPrice"
              value={maxPrice}
              onChangeValue={setMaxPrice}
              placeholder={
                facets.priceRange.max === null ? 'ĐẾN' : formatPriceDisplay(facets.priceRange.max)
              }
            />
          </div>
        </fieldset>

        {/* Rating Filter */}
        <div className="catalog-field shopee-filter-group">
          <label htmlFor="catalog-rating" className="shopee-group-title">
            <FaStar className="shopee-group-icon" /> Đánh giá
          </label>
          <select
            id="catalog-rating"
            name="rating"
            aria-label="Đánh giá"
            defaultValue={query.rating ?? ''}
            className="shopee-form-select"
          >
            <option value="">Tất cả đánh giá</option>
            {[5, 4, 3, 2, 1].map((rating) => (
              <option key={rating} value={rating}>
                {rating} sao trở lên
              </option>
            ))}
          </select>
        </div>

        {/* Availability & Promotion Checks */}
        <div className="catalog-checks shopee-filter-group shopee-checks-group">
          <div className="shopee-group-title">Dịch Vụ & Khuyến Mãi</div>
          <label className="shopee-checkbox-label">
            <input
              name="availability"
              type="checkbox"
              value="in-stock"
              defaultChecked={query.availability === 'in-stock'}
              className="shopee-checkbox"
            />
            <span>Còn hàng</span>
          </label>
          <label className="shopee-checkbox-label">
            <input
              name="promotion"
              type="checkbox"
              value="discounted"
              defaultChecked={query.promotion === 'discounted'}
              className="shopee-checkbox"
            />
            <span>Đang giảm giá</span>
          </label>
        </div>

        {/* Preserved sort in form */}
        <input type="hidden" name="sort" value={query.sort} />

        {context.pageSize !== 12 ? (
          <input type="hidden" name="pageSize" value={context.pageSize} />
        ) : null}

        {/* Actions */}
        <div className="catalog-discovery__actions shopee-filter-actions">
          <button type="submit" className="shopee-btn-apply">
            Áp dụng
          </button>
          <Link href="/search" className="shopee-btn-clear">
            Xóa lọc
          </Link>
        </div>
      </form>

      {/* Result Status Summary with Sorting Controls */}
      <div className="catalog-result-summary" role="status" aria-live="polite">
        <div className="catalog-result-summary__left">
          <span className="catalog-sort-title">Sắp xếp theo:</span>
          <div className="catalog-sort-options">
            <Link
              href={catalogSearchHref(replaceCatalogQuery(contextQuery(context), { sort: 'relevance', page: 1 }))}
              className={`catalog-sort-btn${query.sort === 'relevance' ? ' is-active' : ''}`}
            >
              Liên quan nhất
            </Link>
            <Link
              href={catalogSearchHref(replaceCatalogQuery(contextQuery(context), { sort: 'newest', page: 1 }))}
              className={`catalog-sort-btn${query.sort === 'newest' ? ' is-active' : ''}`}
            >
              Mới nhất
            </Link>
            <Link
              href={catalogSearchHref(replaceCatalogQuery(contextQuery(context), { sort: 'best-selling', page: 1 }))}
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
              onChange={(e) => {
                if (e.target.value) {
                  window.location.href = catalogSearchHref(
                    replaceCatalogQuery(contextQuery(context), {
                      sort: e.target.value as 'price-asc' | 'price-desc',
                      page: 1,
                    }),
                  );
                }
              }}
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
          <strong>{formatNumber(pagination.totalItems)} sản phẩm</strong>
        </div>
      </div>

      <ActiveFilters context={context} />
    </FavoriteStateProvider>
  );
}

export function CatalogContent({
  response,
  context,
  pageHrefBuilder,
  personalizedPath,
}: {
  response: Pick<CatalogProductsResponse, 'items' | 'pagination'>;
  context?: CatalogRouteContext;
  pageHrefBuilder?: (page: number) => string;
  personalizedPath?: string;
}) {
  const { state: authState, authenticatedFetch } = useAuthSession();
  const [personalizedResponse, setPersonalizedResponse] = useState<{
    path: string;
    response: Pick<CatalogProductsResponse, 'items' | 'pagination'>;
  } | null>(null);
  const catalogPath = useMemo(() => {
    if (personalizedPath) return personalizedPath;
    if (!context) return null;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({
      q: context.q,
      category: context.category,
      minPrice: context.minPrice,
      maxPrice: context.maxPrice,
      rating: context.rating,
      location: context.location,
      availability: context.availability,
      promotion: context.promotion,
      sort: context.sort,
      page: response.pagination.page,
      pageSize: context.pageSize,
    })) {
      if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
    }
    return `/api/v1/catalog/products?${params.toString()}`;
  }, [context, personalizedPath, response.pagination.page]);

  const displayResponse =
    personalizedResponse?.path === catalogPath ? personalizedResponse.response : response;
  useEffect(() => {
    if (authState.status !== 'authenticated' || !catalogPath) return;
    const controller = new AbortController();
    const endpoint = new URL(
      catalogPath,
      process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
    );
    void authenticatedFetch(endpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) return;
        const body: unknown = await result.json();
        const personalized = isCatalogProductsResponse(body)
          ? body
          : parsePublicShopCatalogPage(body);
        if (personalized) setPersonalizedResponse({ path: catalogPath, response: personalized });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [authState.status, authenticatedFetch, catalogPath]);

  return (
    <FavoriteStateProvider productIds={displayResponse.items.map(({ id }) => id)}>
      <div className="shopee-catalog-content">
        <div className="catalog-grid" aria-label="Danh sách sản phẩm">
          {displayResponse.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        <CatalogPagination
          response={displayResponse}
          context={context}
          pageHrefBuilder={pageHrefBuilder}
        />
      </div>
    </FavoriteStateProvider>
  );
}
