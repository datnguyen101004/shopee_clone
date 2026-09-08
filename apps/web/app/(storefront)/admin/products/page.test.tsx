import { fireEvent, render, screen } from '@testing-library/react';

import AdminProductsPage from './page';

const api = vi.hoisted(() => ({
  fetchAdminProducts: vi.fn(),
  applyAdminProductAction: vi.fn(),
  authenticatedFetch: vi.fn(),
}));

vi.mock('../../../../components/auth-session-provider', () => ({
  useAuthSession: () => ({ authenticatedFetch: api.authenticatedFetch }),
}));
vi.mock('../../../../lib/admin-api', () => ({
  fetchAdminProducts: (...args: unknown[]) => api.fetchAdminProducts(...args),
  applyAdminProductAction: (...args: unknown[]) => api.applyAdminProductAction(...args),
  adminErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const activeProduct = {
  id: '00000000-0000-4000-8000-000000000301',
  shopId: '00000000-0000-4000-8000-000000000101',
  categoryId: '00000000-0000-4000-8000-000000000201',
  shopName: 'Active Shop',
  shopSlug: 'active-shop',
  categoryName: 'Thời trang',
  categorySlug: 'thoi-trang',
  slug: 'active-product',
  name: 'Active Product',
  status: 'ACTIVE',
  moderationStatus: 'ACTIVE',
  primaryImageUrl: null,
  minPrice: 100_000,
  maxPrice: 120_000,
  stockQuantity: 12,
  variantCount: 2,
  soldCount: 3,
  updatedAt: '2026-08-25T00:00:00.000Z',
};

const productPage = (items: (typeof activeProduct)[], page = 1, totalItems = items.length) => ({
  items,
  page,
  pageSize: 10,
  totalItems,
  totalPages: Math.ceil(totalItems / 10),
});

describe('AdminProductsPage pagination and actions', () => {
  beforeEach(() => {
    api.fetchAdminProducts.mockReset();
    api.applyAdminProductAction.mockReset();
    api.fetchAdminProducts.mockResolvedValue(productPage([activeProduct]));
  });

  it('keeps product actions as icons and loads the selected page', async () => {
    const secondPageProduct = {
      ...activeProduct,
      id: '00000000-0000-4000-8000-000000000302',
      name: 'Second Page Product',
      slug: 'second-page-product',
    };
    api.fetchAdminProducts
      .mockResolvedValueOnce(productPage([activeProduct], 1, 200))
      .mockResolvedValueOnce(productPage([secondPageProduct], 2, 200));

    render(<AdminProductsPage />);
    await screen.findByText(activeProduct.name);
    expect(screen.queryByText(activeProduct.slug)).not.toBeInTheDocument();
    expect(screen.queryByText(activeProduct.shopSlug)).not.toBeInTheDocument();
    expect(screen.queryByText(activeProduct.categorySlug)).not.toBeInTheDocument();
    expect(screen.queryByText('12 tồn · 2 phân loại')).not.toBeInTheDocument();
    expect(screen.queryByText('Đang bán · 3 đã bán')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Xem sản phẩm ${activeProduct.name}` })).toHaveClass(
      'admin-icon-btn',
    );
    const lockAction = screen.getByRole('button', {
      name: `Khóa sản phẩm ${activeProduct.name}`,
    });
    expect(lockAction.querySelector('svg')).not.toBeNull();
    [1, 2, 3, 4, 5, 20].forEach((pageNumber) => {
      expect(screen.getByRole('button', { name: `Trang ${pageNumber}` })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Trang 2' }));
    await screen.findByText(secondPageProduct.name);
    expect(api.fetchAdminProducts).toHaveBeenLastCalledWith(
      api.authenticatedFetch,
      expect.objectContaining({ page: 2, status: 'ACTIVE' }),
    );
  });
});
