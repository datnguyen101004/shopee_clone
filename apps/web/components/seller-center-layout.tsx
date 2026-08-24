'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { fetchSellerShopWorkspace } from '../lib/seller-shop-api';
import { useAuthSession } from './auth-session-provider';
import { NotificationBell } from './notifications/notification-bell';

const navigation = [
  { href: '/seller', label: 'Tổng quan', icon: '⌂' },
  { href: '/seller/shop', label: 'Hồ sơ shop', icon: '◉' },
  { href: '/seller/products', label: 'Sản phẩm', icon: '▦' },
  { href: '/seller/inventory', label: 'Tồn kho', icon: '◫' },
  { href: '/seller/orders', label: 'Đơn hàng', icon: '▤' },
  { href: '/seller/reviews', label: 'Đánh giá', icon: '★' },
  { href: '/seller/promotions', label: 'Khuyến mãi', icon: '％' },
  { href: '/seller/returns', label: 'Trả hàng / Hoàn tiền', icon: '↩' },
];

type ShopGateState = 'loading' | 'ready' | 'missing' | 'blocked' | 'error';

function SellerShopRequired({ state }: { state: Exclude<ShopGateState, 'loading' | 'ready'> }) {
  const missing = state === 'missing';
  const error = state === 'error';
  const title = error ? 'Không thể kiểm tra trạng thái shop' : missing ? 'Chưa có shop bán hàng' : 'Shop chưa đủ điều kiện bán';
  const message = error
    ? 'Không thể tải hồ sơ shop lúc này. Hãy thử tải lại trang sau.'
    : missing
      ? 'Hãy hoàn tất hồ sơ shop để gửi đăng ký và chờ admin duyệt trước khi quản lý sản phẩm, đơn hàng và tồn kho.'
      : 'Hồ sơ shop chưa được admin duyệt hoặc shop đang tạm ngừng. Các chức năng vận hành sẽ mở khi shop hoạt động.';
  return (
    <section className="operational-panel" role="status" aria-live="polite">
      <span className="operational-eyebrow">Seller Center</span>
      <h1>{title}</h1>
      <p>{message}</p>
      <Link href="/seller/shop">Mở hồ sơ shop</Link>
    </section>
  );
}

export function SellerCenterLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, authenticatedFetch } = useAuthSession();
  const isSeller = state.status === 'authenticated' && state.user.roles.includes('seller');
  const isShopProfile = pathname === '/seller/shop' || pathname.startsWith('/seller/shop/');
  const [shopGate, setShopGate] = useState<{ path: string; state: ShopGateState }>({ path: '', state: 'loading' });

  useEffect(() => {
    if (!isSeller || isShopProfile) return;
    let active = true;
    void fetchSellerShopWorkspace(authenticatedFetch)
      .then((workspace) => {
        if (!active) return;
        setShopGate({ path: pathname, state: workspace.shop?.canSell ? 'ready' : workspace.shop ? 'blocked' : 'missing' });
      })
      .catch(() => {
        if (active) setShopGate({ path: pathname, state: 'error' });
      });
    return () => {
      active = false;
    };
  }, [authenticatedFetch, isSeller, isShopProfile, pathname]);

  const canRenderOperationalPage = !isSeller || isShopProfile || (shopGate.path === pathname && shopGate.state === 'ready');
  const showShopGateLoading = isSeller && !isShopProfile && (shopGate.path !== pathname || shopGate.state === 'loading');

  return (
    <div className="seller-center-shell">
      <aside className="seller-center-sidebar" aria-label="Quản lý shop">
        <div className="seller-center-sidebar__heading">
          <div className="seller-center-sidebar__heading-row">
            <div>
              <span>Seller Center</span>
              <strong>Kênh người bán</strong>
            </div>
            {state.status === 'authenticated' ? <NotificationBell /> : null}
          </div>
        </div>
        <nav>
          {navigation.map((item) => {
            const active =
              item.href === '/seller'
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                data-disabled={!isSeller ? 'true' : undefined}
                key={item.href}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="seller-center-sidebar__hint">
          Quản lý hồ sơ, sản phẩm và trạng thái bán của shop tại đây.
        </p>
      </aside>
      <main className="seller-center-content">
        {showShopGateLoading ? (
          <section className="operational-panel" aria-busy="true">
            <span className="operational-eyebrow">Seller Center</span>
            <h1>Đang kiểm tra trạng thái shop</h1>
          </section>
        ) : !canRenderOperationalPage && shopGate.path === pathname && shopGate.state === 'blocked' ? (
          <SellerShopRequired state="blocked" />
        ) : !canRenderOperationalPage && shopGate.path === pathname && (shopGate.state === 'missing' || shopGate.state === 'error') ? (
          <SellerShopRequired state={shopGate.state} />
        ) : canRenderOperationalPage ? children : null}
      </main>
    </div>
  );
}
