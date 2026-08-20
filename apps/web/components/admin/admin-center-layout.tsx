'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import {
  AuditIcon,
  DashboardIcon,
  HomepageIcon,
  ProductIcon,
  ShopIcon,
  UsersIcon,
} from './admin-icons';
import { useAuthSession } from '../auth-session-provider';
import { OperationalRoleGate } from '../operational-role-gate';

const navigation = [
  { href: '/admin', label: 'Tổng quan', Icon: DashboardIcon },
  { href: '/admin/users', label: 'Người dùng', Icon: UsersIcon },
  { href: '/admin/shops', label: 'Cửa hàng', Icon: ShopIcon },
  { href: '/admin/products', label: 'Kiểm soát sản phẩm', Icon: ProductIcon },
  { href: '/admin/homepage', label: 'Trang chủ & Banner', Icon: HomepageIcon },
  { href: '/admin/audit', label: 'Nhật ký kiểm toán', Icon: AuditIcon },
];



export function AdminCenterLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state } = useAuthSession();

  return (
    <OperationalRoleGate role="admin">
      <div style={{ background: '#f3f4f6', minHeight: 'calc(100vh - 120px)', padding: '24px 48px' }}>
        <div
          className="admin-shell"
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            display: 'flex',
            minHeight: '820px',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
          }}
        >
          <aside
            className="admin-sidebar"
            aria-label="Menu quản trị"
            style={{
              width: '260px',
              background: '#fafafa',
              borderRight: '1px solid #f3f4f6',
              padding: '28px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <div style={{ paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#ee4d2d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Admin Console
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginTop: '4px' }}>
                Trung tâm Quản trị
              </div>
              {state.status === 'authenticated' && (
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                  {state.user.displayName}
                </div>
              )}
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {navigation.map((item) => {
                const active =
                  item.href === '/admin'
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`admin-nav-link ${active ? 'active' : ''}`}
                  >
                    <item.Icon size={18} color={active ? '#ffffff' : '#6b7280'} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <Link
                href="/"
                className="admin-btn admin-btn-secondary"
                style={{
                  width: '100%',
                  fontSize: '13px',
                  padding: '8px 12px',
                  justifyContent: 'center',
                }}
              >
                ← Về trang mua sắm
              </Link>
            </div>

          </aside>

          <main className="admin-content" style={{ flex: 1, padding: '36px 56px', overflowY: 'auto', background: '#ffffff' }}>
            {children}
          </main>
        </div>
      </div>
    </OperationalRoleGate>
  );
}

