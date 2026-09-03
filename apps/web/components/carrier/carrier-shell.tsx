'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';

import { useAuthSession } from '../auth-session-provider';

interface CarrierShellProps {
  children: ReactNode;
}

/** Shared carrier navigation. */
export function CarrierShell({ children }: CarrierShellProps) {
  const auth = useAuthSession();
  const userName =
    auth.state.status === 'authenticated'
      ? auth.state.user.displayName || auth.state.user.email || 'Điều phối viên'
      : 'Khách';

  return (
    <div className="carrier-root carrier-ui-shell">
      <aside className="carrier-ui-sr-only" aria-label="Thông tin môi trường">
        <span>Môi trường thử nghiệm</span>
        <span>DEMO CARRIER</span>
        <span>OPERATIONS PORTAL</span>
        <span>Về Marketplace</span>
      </aside>

      <header className="carrier-ui-topnav">
        <div className="carrier-ui-topnav__inner">
          <Link href="/carrier" className="carrier-ui-brand" aria-label="VanChuyen Pro - Tổng quan">
            <span className="carrier-ui-brand__mark">
              <img src="/media/carrier-ui/truck-electric-dashboard.svg" alt="" />
            </span>
            <span className="carrier-ui-brand__name">
              VanChuyen <strong>Pro</strong>
            </span>
          </Link>

          <nav className="carrier-ui-nav" aria-label="Điều hướng đơn vị vận chuyển">
            <Link href="/carrier" className="carrier-ui-nav__item is-active">
              Tổng quan
            </Link>
          </nav>

          <div className="carrier-ui-user">
            <button type="button" className="carrier-ui-icon-button" aria-label="Thông báo">
              <img src="/media/carrier-ui/bell.svg" alt="" />
            </button>
            <div className="carrier-ui-user__copy">
              <strong>{userName}</strong>
              <span>Điều phối viên</span>
            </div>
            <span className="carrier-ui-user__avatar">
              {auth.state.status === 'authenticated' ? (
                <span aria-hidden="true">{userName.charAt(0).toUpperCase()}</span>
              ) : (
                <img src="/media/carrier-ui/user-avatar-dashboard.png" alt="" />
              )}
            </span>
          </div>
        </div>
      </header>

      <div className="carrier-ui-content">{children}</div>
    </div>
  );
}
