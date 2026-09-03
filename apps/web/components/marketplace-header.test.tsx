import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StorefrontShell } from './storefront-shell';
import { MarketplaceHeader } from './marketplace-header';
import { marketplaceCategories } from './marketplace-navigation';
import { fetchCatalogSuggestions } from '../lib/catalog-suggestions-api';

const router = {
  refresh: vi.fn(),
  replace: vi.fn(),
};

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => router,
}));

vi.mock('../lib/catalog-suggestions-api', () => ({
  fetchCatalogSuggestions: vi.fn(),
}));

function renderShell() {
  return render(
    <StorefrontShell>
      <h1>Trang người mua</h1>
    </StorefrontShell>,
  );
}

describe('StorefrontShell', () => {
  it('renders stable buyer landmarks, category links, and explicit anonymous states', () => {
    renderShell();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shopee Clone - Trang chủ' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Đăng nhập · Chưa đăng nhập' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Giỏ hàng, 0 sản phẩm' })).toHaveAttribute(
      'href',
      '/cart',
    );
    expect(document.querySelector('.market-cart .market-cart-icon')).not.toBeNull();
    expect(marketplaceCategories).toHaveLength(6);
    expect(marketplaceCategories.map(({ slug }) => slug)).toEqual([
      ...new Set(marketplaceCategories.map(({ slug }) => slug)),
    ]);
    for (const category of marketplaceCategories)
      expect(screen.getAllByRole('link', { name: category.label, hidden: true })).toHaveLength(2);
  });

  it('keeps a progressive GET form and validates whitespace-only searches', () => {
    renderShell();
    const search = screen.getByRole('search');
    const input = screen.getByRole('searchbox', { name: 'Tìm kiếm sản phẩm' });
    expect(search).toHaveAttribute('method', 'get');
    expect(search).toHaveAttribute('action', '/search');
    expect(input).toHaveAttribute('name', 'q');

    fireEvent.input(input, { target: { value: '   ' } });
    expect(fireEvent.submit(search)).toBe(false);
    expect(input).toHaveValue('   ');
    expect(input).toHaveAccessibleDescription('Vui lòng nhập từ khoá cần tìm.');
    expect(input).toHaveFocus();

    fireEvent.input(input, { target: { value: '  tai nghe bluetooth  ' } });
    expect(fireEvent.submit(search)).toBe(true);
    expect(input).toHaveValue('tai nghe bluetooth');
    expect(screen.queryByText('Vui lòng nhập từ khoá cần tìm.')).not.toBeInTheDocument();
  });

  it('automatically clears search error after 3 seconds', () => {
    vi.useFakeTimers();
    try {
      renderShell();
      const search = screen.getByRole('search');

      fireEvent.submit(search);
      expect(screen.getByText('Vui lòng nhập từ khoá cần tìm.')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByText('Vui lòng nhập từ khoá cần tìm.')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('loads search suggestions after 500ms of idle typing', async () => {
    vi.useFakeTimers();
    const fetchSuggestions = vi.mocked(fetchCatalogSuggestions);
    fetchSuggestions.mockResolvedValue([{ text: 'Quần Jean Nam' }]);
    try {
      renderShell();
      const input = screen.getByRole('searchbox', { name: 'Tìm kiếm sản phẩm' });
      fireEvent.input(input, { target: { value: 'quần jea' } });

      expect(fetchSuggestions).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(499);
      });
      expect(fetchSuggestions).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
      });

      expect(fetchSuggestions).toHaveBeenCalledWith(
        'quần jea',
        fetch,
        undefined,
        undefined,
        expect.any(AbortSignal),
      );
      expect(screen.getByRole('option')).toHaveTextContent('Quần Jean Nam');
      expect(screen.getByRole('link', { name: /Quần Jean Nam/ })).toHaveAttribute(
        'href',
        '/search?q=Qu%E1%BA%A7n%20Jean%20Nam',
      );
    } finally {
      fetchSuggestions.mockReset();
      vi.useRealTimers();
    }
  });

  it('requests suggestions after the first character when typing pauses', async () => {
    vi.useFakeTimers();
    const fetchSuggestions = vi.mocked(fetchCatalogSuggestions);
    fetchSuggestions.mockResolvedValue([{ text: 'Quần' }]);
    try {
      renderShell();
      const input = screen.getByRole('searchbox', { name: 'Tìm kiếm sản phẩm' });
      fireEvent.input(input, { target: { value: 'q' } });
      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });
      expect(fetchSuggestions).toHaveBeenCalledWith(
        'q',
        fetch,
        undefined,
        undefined,
        expect.any(AbortSignal),
      );
      expect(screen.getByRole('option')).toHaveTextContent('Quần');
    } finally {
      fetchSuggestions.mockReset();
      vi.useRealTimers();
    }
  });

  it('clears suggestions from the previous query while the next one is debounced', async () => {
    vi.useFakeTimers();
    const fetchSuggestions = vi.mocked(fetchCatalogSuggestions);
    fetchSuggestions.mockResolvedValue([{ text: 'iPhone 13 Pro Max' }]);
    try {
      renderShell();
      const input = screen.getByRole('searchbox', { name: 'Tìm kiếm sản phẩm' });
      fireEvent.input(input, { target: { value: 'iphone' } });
      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });
      expect(screen.getByRole('option')).toHaveTextContent('iPhone 13 Pro Max');

      fireEvent.input(input, { target: { value: 'iphone 6' } });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    } finally {
      fetchSuggestions.mockReset();
      vi.useRealTimers();
    }
  });

  it('opens mobile categories and restores trigger focus after Escape', async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Danh mục' });
    const mobilePanel = document.querySelector('#marketplace-mobile-categories');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(mobilePanel).toHaveAttribute('hidden');
    expect(
      within(mobilePanel as HTMLElement).getByRole('link', { name: 'Thời trang', hidden: true }),
    ).not.toBeVisible();

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(mobilePanel).not.toHaveAttribute('hidden');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(mobilePanel).toHaveAttribute('hidden');
    expect(trigger).toHaveFocus();
  });

  it('shows the safe authenticated name and supports explicit logout', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <MarketplaceHeader
        categoriesOpen={false}
        onCategoriesToggle={vi.fn()}
        menuButtonRef={{ current: null }}
        account={{
          status: 'authenticated',
          user: {
            id: '00000000-0000-4000-8000-000000000001',
            email: 'buyer@example.com',
            displayName: 'Buyer Example',
            status: 'active',
            roles: ['buyer'],
          },
        }}
        onLogout={onLogout}
      />,
    );
    const accountTrigger = screen.getByLabelText('Tài khoản Buyer Example');
    expect(accountTrigger).toBeInTheDocument();
    expect(accountTrigger.tagName).toBe('BUTTON');
    expect(screen.getByRole('link', { name: 'Đăng ký thành shop' })).toHaveAttribute(
      'href',
      '/account/shop-registration',
    );
    expect(screen.queryByRole('link', { name: 'Địa chỉ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Yêu thích' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Shop đang theo dõi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đơn mua' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Giỏ hàng, 0 sản phẩm' })).not.toHaveTextContent(
      'Giỏ hàng',
    );
    await user.hover(accountTrigger);
    expect(screen.getByRole('menuitem', { name: 'Tài khoản của tôi' })).toHaveAttribute(
      'href',
      '/account/profile',
    );
    expect(screen.getByRole('menuitem', { name: 'Tài khoản của tôi' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('shows only links backed by the corresponding validated roles', () => {
    const account = {
      status: 'authenticated' as const,
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'seller@example.com',
        displayName: 'Seller Example',
        status: 'active' as const,
        roles: ['buyer', 'seller'] as ['buyer', 'seller'],
      },
    };
    const { rerender } = render(
      <MarketplaceHeader
        categoriesOpen={false}
        onCategoriesToggle={vi.fn()}
        menuButtonRef={{ current: null }}
        account={account}
      />,
    );
    expect(screen.getByRole('link', { name: 'Kênh người bán' })).toHaveAttribute('href', '/seller');
    expect(screen.getByRole('menuitem', { name: 'Kênh người bán' })).toHaveAttribute(
      'href',
      '/seller',
    );
    expect(screen.queryByRole('link', { name: 'Đăng ký thành shop' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Quản trị' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Quản trị' })).not.toBeInTheDocument();

    rerender(
      <MarketplaceHeader
        categoriesOpen={false}
        onCategoriesToggle={vi.fn()}
        menuButtonRef={{ current: null }}
        account={{
          ...account,
          user: { ...account.user, roles: ['buyer', 'admin'] },
        }}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Kênh người bán' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Kênh người bán' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đăng ký thành shop' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quản trị' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('menuitem', { name: 'Quản trị' })).toHaveAttribute('href', '/admin');
  });
});
