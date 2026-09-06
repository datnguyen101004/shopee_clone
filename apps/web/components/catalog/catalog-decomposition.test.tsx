import type { CatalogProductsResponse } from '@shopee-clone/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActiveFilters } from './catalog-active-filters';
import { CatalogFilterPanel } from './catalog-filter-panel';
import { CatalogSortBar } from './catalog-sort-bar';
import type { CatalogRouteContext } from './catalog-utils';

function mockContext(overrides: Partial<CatalogRouteContext> = {}): CatalogRouteContext {
  return {
    q: null,
    category: null,
    minPrice: null,
    maxPrice: null,
    rating: null,
    location: null,
    availability: null,
    promotion: null,
    sort: 'newest',
    pageSize: 12,
    ...overrides,
  };
}

function mockResponse(queryOverrides: Partial<CatalogRouteContext> = {}): CatalogProductsResponse {
  const query = mockContext(queryOverrides);
  return {
    query,
    pagination: { page: 1, pageSize: 12, totalItems: 42, totalPages: 4 },
    facets: {
      categories: [
        { slug: 'thoi-trang', name: 'Thời trang', parentSlug: null },
        { slug: 'dien-tu', name: 'Điện tử', parentSlug: null },
      ],
      locations: ['Hà Nội', 'TP. Hồ Chí Minh'],
      priceRange: { min: 50_000, max: 2_000_000 },
    },
    items: [],
  };
}

describe('Catalog Decomposed Components', () => {
  describe('CatalogFilterPanel', () => {
    it('synchronizes draft price inputs when query props change (back/forward navigation)', () => {
      const query = mockContext({ minPrice: 100_000, maxPrice: 500_000 });
      const initialResponse = mockResponse(query);
      const { rerender } = render(
        <CatalogFilterPanel response={initialResponse} context={query} />,
      );

      const minInput = screen.getByRole('textbox', { name: 'Giá thấp nhất' });
      const maxInput = screen.getByRole('textbox', { name: 'Giá cao nhất' });

      expect(minInput).toHaveValue('100.000');
      expect(maxInput).toHaveValue('500.000');

      // User presses browser Back button -> URL query changes to 50k - 200k
      const updatedQuery = mockContext({ minPrice: 50_000, maxPrice: 200_000 });
      const updatedResponse = mockResponse(updatedQuery);
      rerender(<CatalogFilterPanel response={updatedResponse} context={updatedQuery} />);

      expect(minInput).toHaveValue('50.000');
      expect(maxInput).toHaveValue('200.000');
    });

    it('renders search keyword, categories, locations, rating, and promotional checkboxes', () => {
      const query = mockContext({
        q: 'giày thể thao',
        category: 'thoi-trang',
        location: 'TP. Hồ Chí Minh',
        rating: 4,
        availability: 'in-stock',
        promotion: 'discounted',
      });
      const response = mockResponse(query);

      render(<CatalogFilterPanel response={response} context={query} />);

      expect(screen.getByRole('searchbox', { name: 'Từ khóa' })).toHaveValue('giày thể thao');
      expect(screen.getByRole('combobox', { name: 'Danh mục' })).toHaveValue('thoi-trang');
      expect(screen.getByRole('combobox', { name: 'Nơi bán' })).toHaveValue('TP. Hồ Chí Minh');
      expect(screen.getByRole('combobox', { name: 'Đánh giá' })).toHaveValue('4');
      expect(screen.getByRole('checkbox', { name: 'Còn hàng' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Đang giảm giá' })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Áp dụng' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Xóa lọc' })).toHaveAttribute('href', '/search');
    });
  });

  describe('CatalogSortBar', () => {
    it('renders sort options and highlights the active sort mode', () => {
      const query = mockContext({ sort: 'best-selling' });
      const response = mockResponse(query);
      render(<CatalogSortBar response={response} context={query} />);

      const bestSellingLink = screen.getByRole('link', { name: 'Bán chạy' });
      expect(bestSellingLink).toHaveClass('is-active');

      const newestLink = screen.getByRole('link', { name: 'Mới nhất' });
      expect(newestLink).not.toHaveClass('is-active');

      expect(screen.getByText('42 sản phẩm')).toBeInTheDocument();
    });
  });

  describe('ActiveFilters', () => {
    it('renders active filter tags with proper remove links and clear all', () => {
      const context = mockContext({
        q: 'áo khoác',
        category: 'thoi-trang',
        location: 'Hà Nội',
      });

      render(<ActiveFilters context={context} />);

      expect(screen.getByRole('link', { name: 'Bỏ Từ khóa áo khoác' })).toHaveAttribute(
        'href',
        expect.not.stringContaining('q='),
      );
      expect(screen.getByRole('link', { name: 'Bỏ Danh mục thoi-trang' })).toHaveAttribute(
        'href',
        expect.not.stringContaining('category='),
      );
      expect(screen.getByRole('link', { name: 'Xóa tất cả' })).toHaveAttribute('href', '/search');
    });

    it('returns null when no active filters are present', () => {
      const { container } = render(<ActiveFilters context={mockContext()} />);
      expect(container.firstChild).toBeNull();
    });
  });
});
