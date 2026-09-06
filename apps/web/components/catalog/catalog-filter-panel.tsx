'use client';

import type { CatalogProductsResponse } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  FaFilter,
  FaListUl,
  FaLocationDot,
  FaStar,
  FaTag,
} from './catalog-icons';
import { FormattedPriceInput } from './catalog-price-input';
import {
  PRICE_RANGE_PRESETS,
  formatPriceDisplay,
  type CatalogRouteContext,
} from './catalog-utils';

export function CatalogFilterPanel({
  response,
  context,
}: {
  response: CatalogProductsResponse;
  context: CatalogRouteContext;
}) {
  const { query, facets } = response;
  const [minPrice, setMinPrice] = useState<number | null>(query.minPrice);
  const [maxPrice, setMaxPrice] = useState<number | null>(query.maxPrice);

  // Synchronize state when URL/query changes (supports back/forward history)
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

  return (
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

      {/* Preserved sort and pageSize in form */}
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
  );
}
