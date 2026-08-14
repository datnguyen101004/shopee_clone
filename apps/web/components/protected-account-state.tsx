'use client';

import { ButtonLink, Container, ErrorState } from '@shopee-clone/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { AuthSessionState } from './auth-session-provider';

export function AccountWorkspace({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Container className="buyer-account-page">
      <header className="buyer-account-heading">
        <span>TÀI KHOẢN CỦA TÔI</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <div className="buyer-account-layout">
        <nav className="buyer-account-nav" aria-label="Quản lý tài khoản">
          <Link href="/account/profile">Hồ sơ</Link>
          <Link href="/account/addresses">Địa chỉ nhận hàng</Link>
          <Link href="/account/favorites">Sản phẩm yêu thích</Link>
          <Link href="/account/recently-viewed">Sản phẩm đã xem</Link>
          <Link href="/account/followed-shops">Shop đang theo dõi</Link>
          <Link href="/account/orders">Đơn mua</Link>
        </nav>
        <div className="buyer-account-content">{children}</div>
      </div>
    </Container>
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
    | '/account/addresses'
    | '/account/favorites'
    | '/account/recently-viewed'
    | '/account/followed-shops'
    | '/account/orders'
    | `/account/orders/${string}`;
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
