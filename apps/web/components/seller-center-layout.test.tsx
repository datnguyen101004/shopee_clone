import { render, screen, waitFor } from '@testing-library/react';
import { fetchSellerShopWorkspace } from '../lib/seller-shop-api';
import { SellerCenterLayout } from './seller-center-layout';

vi.mock('next/navigation', () => ({ usePathname: () => '/seller/products/new' }));
vi.mock('../lib/seller-shop-api', () => ({ fetchSellerShopWorkspace: vi.fn() }));
const authenticatedFetch = vi.fn();
let accountRoles = ['buyer', 'seller'];
vi.mock('./auth-session-provider', () => ({
  useAuthSession: () => ({
    state: { status: 'authenticated', user: { roles: accountRoles } },
    authenticatedFetch,
  }),
}));

describe('SellerCenterLayout', () => {
  beforeEach(() => {
    vi.mocked(fetchSellerShopWorkspace).mockReset();
    accountRoles = ['buyer', 'seller'];
  });

  it('shows the active seller destination and live management links', async () => {
    vi.mocked(fetchSellerShopWorkspace).mockResolvedValue({ shop: { canSell: true } } as never);
    render(
      <SellerCenterLayout>
        <p>Editor</p>
      </SellerCenterLayout>,
    );
    expect(screen.getByRole('link', { name: /Sản phẩm/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Hồ sơ shop/ })).toHaveAttribute(
      'href',
      '/seller/shop',
    );
    expect(screen.getByRole('link', { name: /Thông báo/ })).toHaveAttribute(
      'href',
      '/seller/notifications',
    );
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('href', '/seller/chat');
    expect(screen.getByRole('link', { name: /Đơn hàng/ })).toHaveAttribute(
      'href',
      '/seller/orders',
    );
    expect(screen.getByRole('link', { name: /Đánh giá/ })).toHaveAttribute(
      'href',
      '/seller/reviews',
    );
    await waitFor(() => expect(screen.getByText('Editor')).toBeInTheDocument());
  });
  it('does not mount operational pages before a seller has an approved shop', async () => {
    vi.mocked(fetchSellerShopWorkspace).mockResolvedValue({ shop: null } as never);
    render(
      <SellerCenterLayout>
        <p>Editor</p>
      </SellerCenterLayout>,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Chưa có shop/ })).toBeInTheDocument(),
    );
    expect(screen.queryByText('Editor')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Xem hồ sơ đăng ký/ })).toHaveAttribute(
      'href',
      '/account/shop-registration',
    );
  });
  it('keeps buyer-only accounts outside the Seller Center shell', () => {
    accountRoles = ['buyer'];
    render(
      <SellerCenterLayout>
        <p>Editor</p>
      </SellerCenterLayout>,
    );
    expect(screen.getByRole('heading', { name: 'Bạn chưa phải người bán' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng ký thành shop' })).toHaveAttribute(
      'href',
      '/account/shop-registration',
    );
    expect(screen.queryByText('Editor')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quản lý shop')).not.toBeInTheDocument();
  });
});
