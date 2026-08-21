import { render, screen } from '@testing-library/react';
import { SellerCenterLayout } from './seller-center-layout';

vi.mock('next/navigation', () => ({ usePathname: () => '/seller/products/new' }));
vi.mock('./auth-session-provider', () => ({ useAuthSession: () => ({ state: { status: 'authenticated', user: { roles: ['buyer', 'seller'] } } }) }));

describe('SellerCenterLayout', () => {
  it('shows the active seller destination and live management links', () => {
    render(<SellerCenterLayout><p>Editor</p></SellerCenterLayout>);
    expect(screen.getByRole('link', { name: /Sản phẩm/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Hồ sơ shop/ })).toHaveAttribute('href', '/seller/shop');
    expect(screen.getByRole('link', { name: /Đơn hàng/ })).toHaveAttribute('href', '/seller/orders');
    expect(screen.getByRole('link', { name: /Đánh giá/ })).toHaveAttribute('href', '/seller/reviews');
  });
});
