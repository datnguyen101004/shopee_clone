import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StorefrontShell } from './storefront-shell';
import { MarketplaceHeader } from './marketplace-header';
import { marketplaceCategories } from './marketplace-navigation';

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
    expect(screen.queryByRole('link', { name: 'Địa chỉ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Yêu thích' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Shop đang theo dõi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đơn mua' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Giỏ hàng, 0 sản phẩm' })).not.toHaveTextContent('Giỏ hàng');
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
    expect(screen.queryByRole('link', { name: 'Quản trị' })).not.toBeInTheDocument();

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
    expect(screen.getByRole('link', { name: 'Quản trị' })).toHaveAttribute('href', '/admin');
  });
});
