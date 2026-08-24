'use client';

import Link from 'next/link';
import * as nextNav from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { fetchSellerShopWorkspace } from '../lib/seller-shop-api';
import { useAuthSession } from './auth-session-provider';

// Flaticon-Style SVG Icons for Seller Center
function FlaticonDashboard({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h18a1 1 0 1 0 0-2H4V4a1 1 0 0 0-1-1zm18.707 5.293a1 1 0 0 0-1.414 0L15 13.586l-3.293-3.293a1 1 0 0 0-1.414 0l-4 4a1 1 0 0 0 1.414 1.414L11 12.414l3.293 3.293a1 1 0 0 0 1.414 0l6-6a1 1 0 0 0 0-1.414z" />
    </svg>
  );
}

function FlaticonShop({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.9 8.25l-1.35-4.5A2 2 0 0 0 18.63 2.5H5.37a2 2 0 0 0-1.92 1.25L2.1 8.25A3 3 0 0 0 5 12.5a3 3 0 0 0 2.5-1.34 3 3 0 0 0 4.5 1.34 3 3 0 0 0 4.5-1.34A3 3 0 0 0 19 12.5a3 3 0 0 0 2.9-4.25zM4 14.5v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6a4.9 4.9 0 0 1-1.5.25 4.93 4.93 0 0 1-3.5-1.46 4.93 4.93 0 0 1-3.5 1.46 4.93 4.93 0 0 1-3.5-1.46A4.93 4.93 0 0 1 5.5 14.75a4.9 4.9 0 0 1-1.5-.25zM10 19.5v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3z" />
    </svg>
  );
}

function FlaticonProduct({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.72 1.16a1.5 1.5 0 0 0-1.44 0L3.1 5.61A1.5 1.5 0 0 0 2.25 7v10a1.5 1.5 0 0 0 .85 1.39l8.18 4.45a1.5 1.5 0 0 0 1.44 0l8.18-4.45a1.5 1.5 0 0 0 .85-1.39V7a1.5 1.5 0 0 0-.85-1.39zM12 3.24l6.93 3.77-2.61 1.42L9.39 4.66zM4.25 7.01l6.75 3.67v7.55L4.25 14.56zM13 18.23v-7.55l6.75-3.67v7.55z" />
    </svg>
  );
}

function FlaticonInventory({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 3h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 11h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2zm1-7h14V5H5v2zm0 11h14v-2H5v2zm4-12h6v1H9V5zm0 11h6v1H9v-1z" />
    </svg>
  );
}

function FlaticonOrders({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 3h-3.18a3 3 0 0 0-5.64 0H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3zm-7-1a1 1 0 0 1 1 1v1h-2V3a1 1 0 0 1 1-1zm8 18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2v1a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V5h2a1 1 0 0 1 1 1zM9 10h6a1 1 0 1 0 0-2H9a1 1 0 0 0 0 2zm0 4h6a1 1 0 1 0 0-2H9a1 1 0 0 0 0 2zm0 4h4a1 1 0 1 0 0-2H9a1 1 0 0 0 0 2z" />
    </svg>
  );
}

function FlaticonReviews({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1.5a1.2 1.2 0 0 1 1.08.68l2.67 5.4 5.96.87a1.2 1.2 0 0 1 .66 2.05l-4.31 4.2 1.02 5.94a1.2 1.2 0 0 1-1.74 1.26L12 19.1l-5.34 2.8a1.2 1.2 0 0 1-1.74-1.26l1.02-5.94-4.31-4.2a1.2 1.2 0 0 1 .66-2.05l5.96-.87 2.67-5.4A1.2 1.2 0 0 1 12 1.5z" />
    </svg>
  );
}

function FlaticonPromotions({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .59 1.42l9 9A2 2 0 0 0 13 22a2 2 0 0 0 1.41-.59l7-7a2 2 0 0 0 0-2.83zM6.5 8A1.5 1.5 0 1 1 8 6.5 1.5 1.5 0 0 1 6.5 8zm7.71 8.29a1 1 0 0 1-1.42 0l-3-3a1 1 0 0 1 1.42-1.42l3 3a1 1 0 0 1 0 1.42zm2.09-2.58a1 1 0 0 1-1.41-1.42l1-1a1 1 0 0 1 1.41 1.42z" />
    </svg>
  );
}

function FlaticonReturns({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm-1-13v2.1A5 5 0 0 0 7.5 14a1 1 0 0 0 1.8-.88 3 3 0 0 1 2.7-4.12H11v2.5a.5.5 0 0 0 .85.35l3.5-3.5a.5.5 0 0 0 0-.7l-3.5-3.5A.5.5 0 0 0 11 7z" />
    </svg>
  );
}

const navigation = [
  { href: '/seller', label: 'Tổng quan', Icon: FlaticonDashboard, iconColor: '#ea580c' },
  { href: '/seller/shop', label: 'Hồ sơ shop', Icon: FlaticonShop, iconColor: '#2563eb' },
  { href: '/seller/products', label: 'Sản phẩm', Icon: FlaticonProduct, iconColor: '#059669' },
  { href: '/seller/inventory', label: 'Tồn kho', Icon: FlaticonInventory, iconColor: '#d97706' },
  { href: '/seller/orders', label: 'Đơn hàng', Icon: FlaticonOrders, iconColor: '#7c3aed' },
  { href: '/seller/reviews', label: 'Đánh giá', Icon: FlaticonReviews, iconColor: '#eab308' },
  { href: '/seller/promotions', label: 'Khuyến mãi', Icon: FlaticonPromotions, iconColor: '#dc2626' },
  { href: '/seller/returns', label: 'Trả hàng / Hoàn tiền', Icon: FlaticonReturns, iconColor: '#0284c7' },
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
  let currentPath = '';
  try {
    currentPath = nextNav.usePathname?.() ?? '';
  } catch {
    currentPath = '';
  }
  const { state, authenticatedFetch } = useAuthSession();
  const isSeller = state.status === 'authenticated' && state.user.roles.includes('seller');
  const isShopProfile = currentPath === '/seller/shop' || currentPath.startsWith('/seller/shop/');
  const [shopGate, setShopGate] = useState<{ path: string; state: ShopGateState }>({ path: '', state: 'loading' });

  useEffect(() => {
    if (!isSeller || isShopProfile) return;
    let active = true;
    void fetchSellerShopWorkspace(authenticatedFetch)
      .then((workspace) => {
        if (!active) return;
        setShopGate({ path: currentPath, state: workspace.shop?.canSell ? 'ready' : workspace.shop ? 'blocked' : 'missing' });
      })
      .catch(() => {
        if (active) setShopGate({ path: currentPath, state: 'error' });
      });
    return () => {
      active = false;
    };
  }, [authenticatedFetch, currentPath, isSeller, isShopProfile]);

  const canRenderOperationalPage = !isSeller || isShopProfile || (shopGate.path === currentPath && shopGate.state === 'ready');
  const showShopGateLoading = isSeller && !isShopProfile && (shopGate.path !== currentPath || shopGate.state === 'loading');

  return (
    <div className="seller-center-shell">
      <aside className="seller-center-sidebar" aria-label="Quản lý shop">
        <div className="seller-center-sidebar__heading">
          <div className="seller-center-sidebar__heading-row">
            <div className="seller-center-sidebar__title-group">
              <span className="seller-center-sidebar__badge">KÊNH NGƯỜI BÁN</span>
              <strong className="seller-center-sidebar__title">Kênh Người Bán</strong>
            </div>
          </div>
        </div>
        <nav className="seller-center-nav">
          {navigation.map((item) => {
            const active =
              item.href === '/seller'
                ? currentPath === item.href
                : currentPath === item.href || currentPath.startsWith(`${item.href}/`);
            return (
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                data-disabled={!isSeller ? 'true' : undefined}
                className={active ? 'is-active' : undefined}
                key={item.href}
              >
                <span className="seller-nav-icon" style={{ color: item.iconColor }} aria-hidden="true">
                  <item.Icon />
                </span>
                <span className="seller-nav-label">{item.label}</span>
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
        ) : !canRenderOperationalPage && shopGate.path === currentPath && shopGate.state === 'blocked' ? (
          <SellerShopRequired state="blocked" />
        ) : !canRenderOperationalPage && shopGate.path === currentPath && (shopGate.state === 'missing' || shopGate.state === 'error') ? (
          <SellerShopRequired state={shopGate.state} />
        ) : canRenderOperationalPage ? children : null}
      </main>
    </div>
  );
}
