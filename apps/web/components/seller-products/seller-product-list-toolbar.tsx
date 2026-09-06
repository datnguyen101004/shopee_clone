'use client';

import Link from 'next/link';
import type { SellerProductLifecycle } from '@shopee-clone/contracts';
import { ChevronDown, Plus, Search } from '@shopee-clone/ui';

interface ToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  lifecycle: SellerProductLifecycle | undefined;
  onLifecycleChange: (value: SellerProductLifecycle | undefined) => void;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  categories: string[];
}

export function SellerProductListToolbar({
  searchTerm,
  onSearchChange,
  lifecycle,
  onLifecycleChange,
  selectedCategory,
  onCategoryChange,
  categories,
}: ToolbarProps) {
  return (
    <section aria-label="Bộ lọc và thao tác sản phẩm">
      <div className="seller-pl-toolbar seller-pl-toolbar--labeled">
        <div className="seller-pl-toolbar__filters">
          {/* Search box */}
          <div className="seller-pl-search">
            <Search className="seller-pl-search__icon" size={16} aria-hidden="true" />
            <input
              type="text"
              aria-label="Tìm trong sản phẩm đã tải"
              placeholder="Tên hoặc mã sản phẩm"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          {/* Category Dropdown (Loaded only) */}
          <div className="seller-pl-field">
            <label htmlFor="seller-products-category">Danh mục</label>
            <div className="seller-pl-select-wrap">
              <select
                id="seller-products-category"
                className="seller-pl-select"
                value={selectedCategory}
                onChange={(e) => onCategoryChange(e.target.value)}
              >
                <option value="">Tất cả</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <ChevronDown className="seller-pl-select__arrow" size={14} aria-hidden="true" />
            </div>
          </div>

          {/* Lifecycle Status Dropdown */}
          <div className="seller-pl-field">
            <label htmlFor="seller-products-status">Trạng thái</label>
            <div className="seller-pl-select-wrap">
              <select
                id="seller-products-status"
                className="seller-pl-select"
                value={lifecycle ?? ''}
                onChange={(e) =>
                  onLifecycleChange((e.target.value || undefined) as SellerProductLifecycle | undefined)
                }
              >
                <option value="">Tất cả</option>
                <option value="draft">Bản nháp</option>
                <option value="published">Đang bán</option>
                <option value="hidden">Đã ẩn</option>
                <option value="archived">Đã lưu trữ</option>
              </select>
              <ChevronDown className="seller-pl-select__arrow" size={14} aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Primary CTA */}
        <Link className="seller-pl-btn-add" href="/seller/products/new">
          <Plus size={18} aria-hidden="true" />
          Thêm sản phẩm
        </Link>
      </div>
      <p className="seller-pl-filter-hint">
        Bộ lọc tên và danh mục chỉ áp dụng cho sản phẩm đã tải.
      </p>
    </section>
  );
}
