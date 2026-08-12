import type { CatalogProductCard, CatalogProductsResponse } from '@shopee-clone/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CatalogContent, CatalogPagination, catalogPageHref } from './catalog';
import { CatalogEmptyState, CatalogErrorState } from './catalog-states';
import CatalogLoading from '../../app/(storefront)/search/loading';

const product: CatalogProductCard = {
  id: 'product-1',
  name: 'Tai nghe không dây',
  href: '/products/product-1',
  imageUrl: '/media/products/wireless-earbuds.svg',
  imageAlt: 'Tai nghe không dây màu trắng',
  priceMinor: 399_000,
  compareAtPriceMinor: 499_000,
  discountPercent: 20,
  ratingAverageBasisPoints: 490,
  ratingCount: 128,
  soldCount: 941,
  shop: { name: 'Tech Zone', location: 'TP. Hồ Chí Minh' },
  category: { slug: 'mobile-accessories', name: 'Điện thoại & Phụ kiện' },
};

function response(page = 1, totalPages = 3): CatalogProductsResponse {
  return {
    query: { category: null },
    pagination: { page, pageSize: 2, totalItems: totalPages * 2, totalPages },
    items: [
      product,
      {
        ...product,
        id: 'product-2',
        name: 'Sạc dự phòng',
        href: '/products/product-2',
        imageUrl: null,
        imageAlt: 'Sạc dự phòng',
        compareAtPriceMinor: undefined,
        discountPercent: undefined,
      },
    ],
  };
}

describe('catalog components', () => {
  it('renders products in response order with complete metadata and media fallback', () => {
    render(<CatalogContent response={response()} context={{ q: 'tai nghe', pageSize: 2 }} />);
    const cards = screen.getAllByTestId('catalog-card');
    expect(within(cards[0]!).getByRole('heading', { name: 'Tai nghe không dây' })).toBeVisible();
    expect(within(cards[1]!).getByRole('heading', { name: 'Sạc dự phòng' })).toBeVisible();
    expect(screen.getByText('-20%')).toBeVisible();
    expect(screen.getAllByText('₫399.000')).toHaveLength(2);
    expect(screen.getAllByText('Đã bán 941')).toHaveLength(2);
    expect(screen.getAllByText('TP. Hồ Chí Minh')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Tai nghe không dây màu trắng' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Sạc dự phòng' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Xem Tai nghe không dây' })).toHaveAttribute(
      'href',
      '/products/product-1',
    );
  });

  it('builds allowlisted page links and drops unsupported parameters', () => {
    expect(catalogPageHref({ category: 'electronics', q: 'phone', pageSize: 2 }, 3)).toBe(
      '/search?category=electronics&q=phone&pageSize=2&page=3',
    );
  });

  it.each([
    [1, false, true],
    [2, true, true],
    [3, true, false],
  ])('renders pagination state for page %i', (page, hasPrevious, hasNext) => {
    render(
      <CatalogPagination
        response={response(page)}
        context={{ category: 'electronics', q: 'phone' }}
      />,
    );
    const previous = screen.getByLabelText('Trang trước');
    const next = screen.getByLabelText('Trang sau');
    expect(previous.tagName === 'A').toBe(hasPrevious);
    expect(next.tagName === 'A').toBe(hasNext);
    expect(screen.getByLabelText(`Trang ${page}`)).toHaveAttribute('aria-current', 'page');
    if (hasNext) expect(next).toHaveAttribute('href', expect.stringContaining('q=phone'));
  });

  it('omits pagination for a single page', () => {
    render(<CatalogPagination response={response(1, 1)} context={{}} />);
    expect(
      screen.queryByRole('navigation', { name: 'Phân trang sản phẩm' }),
    ).not.toBeInTheDocument();
  });

  it('renders actionable empty and recoverable failure states', () => {
    const { rerender } = render(<CatalogEmptyState filtered />);
    expect(screen.getByRole('heading', { name: 'Chưa tìm thấy sản phẩm phù hợp' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Xem tất cả sản phẩm' })).toHaveAttribute(
      'href',
      '/search',
    );
    rerender(<CatalogErrorState retryHref="/search?q=phone&page=2" />);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Thử lại' })).toHaveAttribute(
      'href',
      '/search?q=phone&page=2',
    );
  });

  it('renders a labelled, non-interactive loading composition', () => {
    render(<CatalogLoading />);
    const loading = screen.getByLabelText('Đang tải danh mục sản phẩm');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading.querySelectorAll('.catalog-skeleton--card')).toHaveLength(12);
    expect(within(loading).queryByRole('link')).not.toBeInTheDocument();
  });
});
