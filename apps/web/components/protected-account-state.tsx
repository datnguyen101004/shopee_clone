'use client';

import { ButtonLink, ErrorState, StorefrontContainer } from '@shopee-clone/ui';
import Link from 'next/link';
import * as nextNav from 'next/navigation';
import type { ReactNode } from 'react';

import { useAuthSession, type AuthSessionState } from './auth-session-provider';

// Font Awesome SVG Icons
function FaUser({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true">
      <path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z" />
    </svg>
  );
}

function FaPencil({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M410.3 231l11.3-11.3-33.9-33.9-62.1-62.1L291.7 89.8l-11.3 11.3-22.6 22.6L58.6 322.9c-10.4 10.4-18 23.3-22.2 37.4L1 480.7c-2.5 8.4-.2 17.5 6.1 23.7s15.3 8.5 23.7 6.1l120.4-35.4c14.1-4.2 27-11.8 37.4-22.2L387.7 253.6 410.3 231zM160 399.4l-9.1 22.7c-4 3.1-8.5 5.4-13.3 6.9L59.4 452l23-78.1c1.4-4.9 3.8-9.4 6.9-13.3l22.7-9.1 0 32c0 8.8 7.2 16 16 16l32 0zM362.7 18.7l-42.3 42.3 96 96 42.3-42.3c14.1-14.1 14.1-36.9 0-50.9L413.6 18.7c-14.1-14.1-36.9-14.1-50.9 0z" />
    </svg>
  );
}

function FaClipboardList({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
      <path d="M192 0c-41.8 0-77.4 26.7-90.5 64L48 64C21.5 64 0 85.5 0 112l0 352c0 26.5 21.5 48 48 48l288 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48l-53.5 0C269.4 26.7 233.8 0 192 0zm0 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM72 192l240 0c13.3 0 24 10.7 24 24s-10.7 24-24 24L72 240c-13.3 0-24-10.7-24-24s10.7-24 24-24zm0 96l240 0c13.3 0 24 10.7 24 24s-10.7 24-24 24L72 336c-13.3 0-24-10.7-24-24s10.7-24 24-24zm0 96l144 0c13.3 0 24 10.7 24 24s-10.7 24-24 24L72 432c-13.3 0-24-10.7-24-24s10.7-24 24-24z" />
    </svg>
  );
}

function FaBell({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true">
      <path d="M224 0c-17.7 0-32 14.3-32 32l0 19.2C119 66 64 130.6 64 208l0 25.4c0 45.4-15.5 89.5-43.8 124.9L5.3 377c-5.8 7.2-6.9 17.1-2.9 25.4S14.8 416 24 416l400 0c9.2 0 17.6-5.3 21.6-13.6s2.9-18.2-2.9-25.4l-14.9-18.6C399.5 322.9 384 278.8 384 233.4l0-25.4c0-77.4-55-142-128-156.8L256 32c0-17.7-14.3-32-32-32zm0 512c35.3 0 64-28.7 64-64l-128 0c0 35.3 28.7 64 64 64z" />
    </svg>
  );
}

function FaMapMarkerAlt({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
      <path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z" />
    </svg>
  );
}

function FaTicketAlt({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 576 512" fill="currentColor" aria-hidden="true">
      <path d="M0 128C0 92.7 28.7 64 64 64l448 0c35.3 0 64 28.7 64 64l0 38.2c-27.8 7.8-48 33.3-48 63.8s20.2 56 48 63.8l0 38.2c0 35.3-28.7 64-64 64L64 396c-35.3 0-64-28.7-64-64l0-38.2c27.8-7.8 48-33.3 48-63.8s-20.2-56-48-63.8L0 128zm128 48c-8.8 0-16 7.2-16 16l0 128c0 8.8 7.2 16 16 16s16-7.2 16-16l0-128c0-8.8-7.2-16-16-16zm64 0c-8.8 0-16 7.2-16 16l0 128c0 8.8 7.2 16 16 16s16-7.2 16-16l0-128c0-8.8-7.2-16-16-16zm64 0c-8.8 0-16 7.2-16 16l0 128c0 8.8 7.2 16 16 16s16-7.2 16-16l0-128c0-8.8-7.2-16-16-16z" />
    </svg>
  );
}

export function AccountWorkspace({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  let currentPath = '';
  try {
    currentPath = nextNav.usePathname?.() ?? '';
  } catch {
    currentPath = '';
  }
  const auth = useAuthSession();
  const displayName = auth.state.status === 'authenticated' ? auth.state.user.displayName : 'Người dùng';

  return (
    <StorefrontContainer className="buyer-account-page">
      <div className="shopee-account-container">
        <aside className="shopee-account-sidebar">
          {/* User profile brief header */}
          <div className="shopee-sidebar-user">
            <div className="shopee-sidebar-user__avatar" aria-hidden="true">
              <FaUser />
            </div>
            <div className="shopee-sidebar-user__info">
              <strong className="shopee-sidebar-user__name">{displayName}</strong>
              <Link href="/account/profile" className="shopee-sidebar-user__edit">
                <FaPencil /> Sửa hồ sơ
              </Link>
            </div>
          </div>

          {/* Shopee-style categorized navigation */}
          <nav className="shopee-sidebar-nav" aria-label="Quản lý tài khoản">
            {/* Group: Tài khoản của tôi */}
            <div className="shopee-sidebar-group">
              <div className="shopee-sidebar-group__heading">
                <FaUser className="shopee-icon-account" />
                <span>Tài Khoản Của Tôi</span>
              </div>
              <div className="shopee-sidebar-group__links">
                <Link
                  href="/account/profile"
                  className={currentPath === '/account/profile' ? 'is-active' : undefined}
                  aria-current={currentPath === '/account/profile' ? 'page' : undefined}
                >
                  Hồ sơ
                </Link>
                <Link
                  href="/account/addresses"
                  className={currentPath === '/account/addresses' ? 'is-active' : undefined}
                  aria-current={currentPath === '/account/addresses' ? 'page' : undefined}
                >
                  Địa chỉ nhận hàng
                </Link>
                <Link
                  href="/account/profile/notifications"
                  className={currentPath === '/account/profile/notifications' ? 'is-active' : undefined}
                  aria-current={currentPath === '/account/profile/notifications' ? 'page' : undefined}
                >
                  Cài đặt thông báo
                </Link>
              </div>
            </div>

            {/* Link: Đơn Mua */}
            <div className="shopee-sidebar-item">
              <Link
                href="/account/orders"
                className={`shopee-sidebar-item__link${currentPath.startsWith('/account/orders') ? ' is-active' : ''}`}
                aria-current={currentPath.startsWith('/account/orders') ? 'page' : undefined}
              >
                <FaClipboardList className="shopee-icon-orders" />
                <span>Đơn mua</span>
              </Link>
            </div>

            {/* Link: Thông Báo */}
            <div className="shopee-sidebar-item">
              <Link
                href="/account/notifications"
                className={`shopee-sidebar-item__link${currentPath === '/account/notifications' ? ' is-active' : ''}`}
                aria-current={currentPath === '/account/notifications' ? 'page' : undefined}
              >
                <FaBell className="shopee-icon-notifications" />
                <span>Thông báo</span>
              </Link>
            </div>

            {/* Link: Sản phẩm yêu thích */}
            <div className="shopee-sidebar-item">
              <Link
                href="/account/favorites"
                className={`shopee-sidebar-item__link${currentPath === '/account/favorites' ? ' is-active' : ''}`}
                aria-current={currentPath === '/account/favorites' ? 'page' : undefined}
              >
                <FaTicketAlt className="shopee-icon-vouchers" />
                <span>Sản phẩm yêu thích</span>
              </Link>
            </div>

            {/* Link: Sản phẩm đã xem */}
            <div className="shopee-sidebar-item">
              <Link
                href="/account/recently-viewed"
                className={`shopee-sidebar-item__link${currentPath === '/account/recently-viewed' ? ' is-active' : ''}`}
                aria-current={currentPath === '/account/recently-viewed' ? 'page' : undefined}
              >
                <FaClipboardList className="shopee-icon-account" />
                <span>Sản phẩm đã xem</span>
              </Link>
            </div>

            {/* Link: Shop đang theo dõi */}
            <div className="shopee-sidebar-item">
              <Link
                href="/account/followed-shops"
                className={`shopee-sidebar-item__link${currentPath === '/account/followed-shops' ? ' is-active' : ''}`}
                aria-current={currentPath === '/account/followed-shops' ? 'page' : undefined}
              >
                <FaUser className="shopee-icon-account" />
                <span>Shop đang theo dõi</span>
              </Link>
            </div>

            {/* Link: Trả hàng / Hoàn tiền */}
            <div className="shopee-sidebar-item">
              <Link
                href="/account/returns"
                className={`shopee-sidebar-item__link${currentPath.startsWith('/account/returns') ? ' is-active' : ''}`}
                aria-current={currentPath.startsWith('/account/returns') ? 'page' : undefined}
              >
                <FaClipboardList className="shopee-icon-orders" />
                <span>Trả hàng / Hoàn tiền</span>
              </Link>
            </div>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="shopee-account-content">
          {currentPath !== '/account/profile' ? (
            <header className="buyer-account-heading">
              <span>TÀI KHOẢN CỦA TÔI</span>
              <h1>{title}</h1>
              <p>{description}</p>
            </header>
          ) : null}
          {children}
        </main>
      </div>
    </StorefrontContainer>
  );
}

export function ProtectedAccountState({
  account,
  returnTo,
  children,
}: {
  account: AuthSessionState;
  returnTo:
    | '/account/profile'
    | '/account/profile/notifications'
    | '/account/notifications'
    | '/account/addresses'
    | '/account/favorites'
    | '/account/recently-viewed'
    | '/account/followed-shops'
    | '/account/orders'
    | `/account/orders/${string}`
    | '/account/returns'
    | `/account/returns/${string}`;
  children: ReactNode;
}) {
  if (account.status === 'loading') {
    return (
      <section className="buyer-account-state" aria-busy="true" aria-label="Đang khôi phục phiên">
        <span className="buyer-account-state__spinner" aria-hidden="true" />
        <h2>Đang kiểm tra phiên đăng nhập…</h2>
      </section>
    );
  }
  if (account.status === 'guest') {
    return (
      <section className="buyer-account-state">
        <h2>Đăng nhập để quản lý tài khoản</h2>
        <p>Thông tin hồ sơ và địa chỉ chỉ hiển thị sau khi phiên của bạn được xác thực.</p>
        <ButtonLink href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Đăng nhập</ButtonLink>
      </section>
    );
  }
  return children;
}

export function AccountLoadFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorState
      title="Chưa thể tải dữ liệu tài khoản"
      description="Kết nối tạm thời gián đoạn. Dữ liệu bạn đã nhập chưa được gửi đi."
      onRetry={onRetry}
    />
  );
}
