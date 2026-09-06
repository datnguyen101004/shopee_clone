'use client';

import Link from 'next/link';
import * as nextNav from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Bell,
  Boxes,
  CalendarDays,
  MessageCircle,
  Package,
  RotateCcw,
  ShoppingCart,
  Star,
  Store,
} from '@shopee-clone/ui';

import { fetchSellerShopWorkspace } from '../lib/seller-shop-api';
import { useAuthSession } from './auth-session-provider';
import { NotificationBell } from './notifications/notification-bell';

const productWorkspaceNavigation = [
  { href: '/seller', label: 'Tổng quan', Icon: Boxes },
  { href: '/seller/notifications', label: 'Thông báo', Icon: Bell },
  { href: '/seller/chat', label: 'Chat', Icon: MessageCircle },
  { href: '/seller/shop', label: 'Hồ sơ shop', Icon: Store },
  { href: '/seller/products', label: 'Sản phẩm', Icon: Package },
  { href: '/seller/inventory', label: 'Tồn kho', Icon: Boxes },
  { href: '/seller/orders', label: 'Đơn hàng', Icon: ShoppingCart },
  { href: '/seller/reviews', label: 'Đánh giá', Icon: Star },
  { href: '/seller/promotions', label: 'Khuyến mãi', Icon: Package },
  { href: '/seller/returns', label: 'Trả hàng / Hoàn tiền', Icon: RotateCcw },
  { href: '/seller/campaigns', label: 'Chiến dịch', Icon: CalendarDays },
];

type ShopGateState = 'loading' | 'ready' | 'missing' | 'blocked' | 'error';

function SellerShopRequired({ state }: { state: Exclude<ShopGateState, 'loading' | 'ready'> }) {
  const missing = state === 'missing';
  const error = state === 'error';
  const title = error
    ? 'Không thể kiểm tra trạng thái shop'
    : missing
      ? 'Chưa có shop bán hàng'
      : 'Shop chưa đủ điều kiện bán';
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
      <Link href="/account/shop-registration">Xem hồ sơ đăng ký</Link>
    </section>
  );
}

function sellerInitials(displayName: string | null | undefined, email: string | null | undefined) {
  const source = (displayName || email || 'Seller').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}` : source.slice(0, 2)
  ).toUpperCase();
}

function SellerWorkspace({
  currentPath,
  displayName,
  email,
  children,
}: {
  currentPath: string;
  displayName: string | null | undefined;
  email: string | null | undefined;
  children: ReactNode;
}) {
  const headerCopy =
    currentPath === '/seller'
      ? [
          `Chào buổi sáng, ${displayName || 'bạn'}!`,
          'Đây là tình hình kinh doanh của shop hôm nay.',
        ]
      : currentPath === '/seller/shop'
        ? ['Hồ sơ shop', 'Quản lý thông tin, hình ảnh và thiết lập hiển thị của cửa hàng.']
        : currentPath === '/seller/notifications'
          ? ['Thông báo', 'Theo dõi các cập nhật mới dành cho shop.']
          : currentPath.startsWith('/seller/chat')
            ? ['Chat', 'Trao đổi và hỗ trợ khách hàng của shop.']
            : currentPath === '/seller/products'
              ? ['Quản lý sản phẩm', 'Quản lý kho hàng, giá bán và trạng thái sản phẩm của bạn']
              : currentPath.endsWith('/new')
                ? ['Thêm sản phẩm mới', 'Tạo và đăng bán sản phẩm trong shop']
                : currentPath.startsWith('/seller/products/')
                  ? ['Chi tiết sản phẩm', 'Xem và cập nhật thông tin chi tiết sản phẩm']
                  : currentPath.startsWith('/seller/inventory')
                    ? ['Tồn kho', 'Theo dõi số lượng và lịch sử điều chỉnh sản phẩm']
                    : currentPath.startsWith('/seller/orders')
                      ? ['Đơn hàng', 'Xử lý và theo dõi đơn hàng của shop']
                      : currentPath.startsWith('/seller/reviews')
                        ? ['Đánh giá', 'Theo dõi phản hồi từ khách hàng']
                        : currentPath.startsWith('/seller/promotions')
                          ? ['Khuyến mãi', 'Quản lý voucher shop']
                          : currentPath.startsWith('/seller/returns')
                            ? ['Trả hàng / Hoàn tiền', 'Xử lý các yêu cầu sau bán hàng']
                            : currentPath.startsWith('/seller/moderation')
                              ? ['Kiểm duyệt', 'Theo dõi trạng thái kiểm duyệt sản phẩm và nội dung']
                              : currentPath.startsWith('/seller/campaigns')
                                ? ['Chiến dịch', 'Theo dõi các chiến dịch dành cho người bán']
                                : ['Chiến dịch', 'Theo dõi các chiến dịch dành cho người bán'];
  const [headerTitle, headerSubtitle] = headerCopy;

  return (
    <div className="seller-workspace" data-testid="seller-workspace">
      <aside className="seller-workspace__sidebar" aria-label="Quản lý shop">
        <div className="seller-workspace__brand">
          <span className="seller-workspace__brand-mark" aria-hidden="true">
            <Package aria-hidden="true" />
          </span>
          <span>
            <strong>Kênh Người Bán</strong>
            <small>QUẢN LÝ SHOP</small>
          </span>
        </div>
        <nav className="seller-workspace__nav" aria-label="Điều hướng Kênh Người Bán">
          {productWorkspaceNavigation.map((item) => {
            const active =
              item.href === '/seller'
                ? currentPath === item.href
                : currentPath === item.href || currentPath.startsWith(`${item.href}/`);
            return (
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={active ? 'is-active' : undefined}
                key={item.href}
              >
                <span className="seller-workspace__nav-icon" aria-hidden="true">
                  <item.Icon />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <p className="seller-workspace__sidebar-note">
          Quản lý hồ sơ, sản phẩm và trạng thái bán của shop tại đây.
        </p>
      </aside>

      <div className="seller-workspace__main">
        <header className="seller-workspace__header">
          <div>
            <h1>{headerTitle}</h1>
            <p>{headerSubtitle}</p>
          </div>
          <div className="seller-workspace__header-actions">
            <NotificationBell sellerDashboard={currentPath.startsWith('/seller')} />
            <div className="seller-workspace__profile" aria-label="Tài khoản người bán">
              <span className="seller-workspace__avatar" aria-hidden="true">
                {sellerInitials(displayName, email)}
              </span>
              <span>
                <strong>{displayName || email || 'Người bán'}</strong>
                <small>Người bán</small>
              </span>
            </div>
          </div>
        </header>
        <main className="seller-workspace__content">{children}</main>
      </div>
    </div>
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
  const [shopGate, setShopGate] = useState<{ path: string; state: ShopGateState }>({
    path: '',
    state: 'loading',
  });

  useEffect(() => {
    if (!isSeller || isShopProfile) return;
    let active = true;
    void fetchSellerShopWorkspace(authenticatedFetch)
      .then((workspace) => {
        if (!active) return;
        setShopGate({
          path: currentPath,
          state: workspace.shop?.canSell ? 'ready' : workspace.shop ? 'blocked' : 'missing',
        });
      })
      .catch(() => {
        if (active) setShopGate({ path: currentPath, state: 'error' });
      });
    return () => {
      active = false;
    };
  }, [authenticatedFetch, currentPath, isSeller, isShopProfile]);

  const canRenderOperationalPage =
    !isSeller || isShopProfile || (shopGate.path === currentPath && shopGate.state === 'ready');
  const showShopGateLoading =
    isSeller && !isShopProfile && (shopGate.path !== currentPath || shopGate.state === 'loading');

  if (state.status === 'loading') {
    return (
      <SellerWorkspace currentPath={currentPath} displayName={null} email={null}>
        <section className="seller-workspace__state" aria-busy="true">
          <h2>Đang kiểm tra quyền người bán</h2>
        </section>
      </SellerWorkspace>
    );
  }

  if (state.status === 'guest') {
    return (
      <SellerWorkspace currentPath={currentPath} displayName={null} email={null}>
        <section className="seller-workspace__state">
          <h2>Cần đăng nhập</h2>
          <p>Đăng nhập để truy cập Kênh Người Bán.</p>
          <Link href="/login?returnTo=/seller">Đăng nhập</Link>
        </section>
      </SellerWorkspace>
    );
  }

  if (!isSeller && !isShopProfile) {
    return (
      <main className="seller-access-state">
        <section className="seller-access-state__panel" role="status">
          <h1>Bạn chưa phải người bán</h1>
          <p>Hãy hoàn tất hồ sơ đăng ký shop trong khu vực tài khoản người mua.</p>
          <Link href="/account/shop-registration">Đăng ký thành shop</Link>
        </section>
      </main>
    );
  }

  const gatedContent = showShopGateLoading ? (
    <section className="operational-panel" aria-busy="true">
      <span className="operational-eyebrow">Seller Center</span>
      <h1>Đang kiểm tra trạng thái shop</h1>
    </section>
  ) : !canRenderOperationalPage && shopGate.path === currentPath && shopGate.state === 'blocked' ? (
    <SellerShopRequired state="blocked" />
  ) : !canRenderOperationalPage &&
    shopGate.path === currentPath &&
    (shopGate.state === 'missing' || shopGate.state === 'error') ? (
    <SellerShopRequired state={shopGate.state} />
  ) : canRenderOperationalPage ? (
    children
  ) : null;

  return (
    <SellerWorkspace
      currentPath={currentPath}
      displayName={state.status === 'authenticated' ? state.user.displayName : null}
      email={state.status === 'authenticated' ? state.user.email : null}
    >
      {gatedContent}
    </SellerWorkspace>
  );
}
