import type { CatalogProductCard, CatalogProductsResponse } from '@shopee-clone/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CatalogContent, CatalogPagination, DiscoveryControls, catalogPageHref } from './catalog';
import type { CatalogRouteContext } from './catalog';
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
    query: context(),
    pagination: { page, pageSize: 2, totalItems: totalPages * 2, totalPages },
    facets: { categories: [], locations: [], priceRange: { min: 399_000, max: 399_000 } },
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

function context(overrides: Partial<CatalogRouteContext> = {}): CatalogRouteContext {
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
    pageSize: 2,
    ...overrides,
  };
}

describe('catalog components', () => {
  it('renders products in response order with complete metadata and media fallback', () => {
    render(<CatalogContent response={response()} context={context({ q: 'tai nghe' })} />);
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
    expect(catalogPageHref(context({ category: 'electronics', q: 'phone' }), 3)).toBe(
      '/search?q=phone&category=electronics&sort=newest&pageSize=2&page=3',
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
        context={context({ category: 'electronics', q: 'phone' })}
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
    render(<CatalogPagination response={response(1, 1)} context={context()} />);
    expect(
      screen.queryByRole('navigation', { name: 'Phân trang sản phẩm' }),
    ).not.toBeInTheDocument();
  });

  it('renders API-backed controls, selected state, summary, and removable filters', () => {
    const discovery = response();
    discovery.query = {
      ...discovery.query,
      q: 'tai nghe',
      category: 'electronics',
      location: 'Hà Nội',
      promotion: 'discounted',
      sort: 'relevance',
    };
    discovery.facets = {
      categories: [{ slug: 'electronics', name: 'Điện tử', parentSlug: null }],
      locations: ['Hà Nội'],
      priceRange: { min: 100, max: 900 },
    };
    const selectedContext = context({ ...discovery.query });
    render(<DiscoveryControls response={discovery} context={selectedContext} />);

    expect(screen.getByRole('search', { name: 'Tìm và lọc sản phẩm' })).toHaveAttribute(
      'method',
      'get',
    );
    expect(screen.getByRole('searchbox', { name: 'Từ khóa' })).toHaveValue('tai nghe');
    expect(screen.getByRole('combobox', { name: 'Danh mục' })).toHaveValue('electronics');
    expect(screen.getByRole('combobox', { name: 'Nơi bán' })).toHaveValue('Hà Nội');
    expect(screen.getByRole('checkbox', { name: 'Đang giảm giá' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('6 sản phẩm');
    expect(screen.getByRole('link', { name: 'Bỏ Từ khóa tai nghe' })).toHaveAttribute(
      'href',
      expect.not.stringContaining('q='),
    );
  });

  it('renders actionable empty and recoverable failure states', () => {
    const { rerender } = render(<CatalogEmptyState filtered />);
    expect(screen.getByRole('heading', { name: 'Chưa tìm thấy sản phẩm phù hợp' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Xóa tất cả bộ lọc' })).toHaveAttribute(
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
