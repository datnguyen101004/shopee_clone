'use client';

import { hasMarketplaceRole, type MarketplaceRole } from '@shopee-clone/contracts';
import { Container } from '@shopee-clone/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { useAuthSession } from './auth-session-provider';

export function OperationalRoleGate({
  role,
  children,
}: {
  role: Extract<MarketplaceRole, 'seller' | 'admin'>;
  children: ReactNode;
}) {
  const { state } = useAuthSession();

  if (state.status === 'loading') {
    return (
      <Container className="operational-state" aria-live="polite" aria-busy="true">
        <h1>Đang kiểm tra quyền truy cập</h1>
        <p>Vui lòng chờ trong giây lát.</p>
      </Container>
    );
  }
  if (state.status === 'guest') {
    return (
      <Container className="operational-state">
        <h1>Cần đăng nhập</h1>
        <p>Đăng nhập để tiếp tục đến khu vực vận hành.</p>
        <Link href="/login">Đăng nhập</Link>
      </Container>
    );
  }
  if (!hasMarketplaceRole(state.user, role)) {
    return (
      <Container className="operational-state" role="status" aria-live="polite">
        <h1>Không có quyền truy cập</h1>
        <p>Tài khoản hiện tại chưa được cấp quyền phù hợp.</p>
        <Link href="/">Quay lại trang chủ</Link>
      </Container>
    );
  }
  return children;
}
