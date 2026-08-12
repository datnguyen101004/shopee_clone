import { render, screen } from '@testing-library/react';
import { ToastProvider } from '@shopee-clone/ui';

import DesignSystemPage from '../design-system/page';
import HealthPage from '../health/page';
import CartPlaceholderPage from './cart/page';
import StorefrontLayout from './layout';
import LoginPlaceholderPage from './login/page';
import SearchPage from './search/page';

vi.mock('../../lib/catalog-api', () => ({
  fetchCatalogProducts: vi.fn().mockResolvedValue({
    query: { category: null },
    pagination: { page: 1, pageSize: 12, totalItems: 0, totalPages: 0 },
    items: [],
  }),
}));

describe('storefront route boundary', () => {
  it.each([
    ['login', <LoginPlaceholderPage key="login" />],
    ['cart', <CartPlaceholderPage key="cart" />],
  ])('keeps the shared shell on the %s placeholder', (_name, page) => {
    const { container } = render(<StorefrontLayout>{page}</StorefrontLayout>);
    expect(screen.getByRole('link', { name: 'Shopee Clone - Trang chủ' })).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(container.querySelectorAll('main')).toHaveLength(1);
  });

  it('communicates a normalized search query inside the storefront shell', async () => {
    const page = await SearchPage({
      searchParams: Promise.resolve({ q: '  tai nghe bluetooth  ' }),
    });
    const { container } = render(<StorefrontLayout>{page}</StorefrontLayout>);
    expect(screen.getByText(/tai nghe bluetooth/)).toBeInTheDocument();
    expect(container.querySelectorAll('main')).toHaveLength(1);
  });

  it('does not add buyer chrome to operational or contributor pages', () => {
    const { unmount } = render(<HealthPage />);
    expect(
      screen.queryByRole('link', { name: 'Shopee Clone - Trang chủ' }),
    ).not.toBeInTheDocument();
    unmount();
    render(
      <ToastProvider>
        <DesignSystemPage />
      </ToastProvider>,
    );
    expect(
      screen.queryByRole('link', { name: 'Shopee Clone - Trang chủ' }),
    ).not.toBeInTheDocument();
  });
});
