'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import {
  AuditIcon,
  CategoryIcon,
  DashboardIcon,
  HomepageIcon,
  ModerationIcon,
  ProductIcon,
  ShopIcon,
  UsersIcon,
} from './admin-icons';
import { useAuthSession } from '../auth-session-provider';
import { OperationalRoleGate } from '../operational-role-gate';
import { WorkspaceColumnResizer } from '../workspace-column-resizer';

const navigation = [
  {
    href: '/admin',
    label: 'Tổng quan',
    description: 'Tổng hợp hoạt động và chỉ số hệ thống.',
    Icon: DashboardIcon,
  },
  {
    href: '/admin/moderation',
    label: 'Kiểm duyệt & Tố cáo',
    description: 'Xử lý báo cáo và quyết định kiểm duyệt.',
    Icon: ModerationIcon,
  },
  {
    href: '/admin/users',
    label: 'Người dùng',
    description: 'Tra cứu tài khoản và trạng thái truy cập.',
    Icon: UsersIcon,
  },
  {
    href: '/admin/shops',
    label: 'Cửa hàng',
    description: 'Duyệt hồ sơ và quản lý trạng thái shop.',
    Icon: ShopIcon,
  },
  {
    href: '/admin/products',
    label: 'Kiểm soát sản phẩm',
    description: 'Tra cứu, kiểm duyệt và quản lý sản phẩm.',
    Icon: ProductIcon,
  },
  {
    href: '/admin/categories',
    label: 'Danh mục',
    description: 'Tổ chức cây danh mục và liên kết sản phẩm.',
    Icon: CategoryIcon,
  },
  {
    href: '/admin/homepage',
    label: 'Trang chủ & Banner',
    description: 'Cấu hình module và nội dung trang chủ.',
    Icon: HomepageIcon,
  },
  {
    href: '/admin/campaigns',
    label: 'Chiến dịch sàn',
    description: 'Quản lý chiến dịch và điều kiện tham gia.',
    Icon: HomepageIcon,
  },
  {
    href: '/admin/audit',
    label: 'Nhật ký kiểm toán',
    description: 'Theo dõi các thao tác đặc quyền.',
    Icon: AuditIcon,
  },
  {
    href: '/admin/returns',
    label: 'Trả hàng / Hoàn tiền',
    description: 'Xử lý tranh chấp và yêu cầu hoàn tiền.',
    Icon: ModerationIcon,
  },
];

export function AdminCenterLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state } = useAuthSession();
  const section =
    pathname === '/admin'
      ? navigation[0]!
      : navigation.find(
          (item) =>
            item.href !== '/admin' &&
            (pathname === item.href || pathname.startsWith(`${item.href}/`)),
        ) ?? navigation[0]!;
  const sectionTitle = pathname === '/admin' ? 'Quản trị hệ thống' : section.label;

  return (
    <OperationalRoleGate role="admin">
      <div className="admin-page-frame admin-workspace" data-density="compact">
        <WorkspaceColumnResizer rootSelector=".admin-workspace" />
        <div className="admin-shell">
          <aside className="admin-sidebar" aria-label="Menu quản trị">
            <div className="admin-sidebar__brand">
              <span className="admin-sidebar__brand-mark" aria-hidden="true">
                <ProductIcon size={20} />
              </span>
              <span className="admin-sidebar__brand-copy">
                <strong>Trung tâm Quản trị</strong>
                <small>ADMIN CONSOLE</small>
              </span>
            </div>
            {state.status === 'authenticated' ? (
              <div className="admin-sidebar__user">{state.user.displayName}</div>
            ) : null}

            <nav className="admin-sidebar__nav">
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
                    <item.Icon size={18} color="currentColor" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="admin-sidebar__footer">
              <Link
                href="/"
                className="admin-btn admin-btn-secondary"
              >
                ← Về trang mua sắm
              </Link>
            </div>
          </aside>

          <main className="admin-content">
            <header className="admin-topbar" aria-label="Thanh điều hướng quản trị">
              <div className="admin-topbar__copy">
                <h1 className="admin-topbar__title">{sectionTitle}</h1>
                <p className="admin-topbar__description">{section.description}</p>
              </div>
              {state.status === 'authenticated' ? (
                <div className="admin-topbar__account">
                  <span className="admin-topbar__notification" role="img" aria-label="Thông báo">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                    </svg>
                  </span>
                  <span className="admin-topbar__avatar" aria-hidden="true">
                    {state.user.displayName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="admin-topbar__identity">
                    <strong>{state.user.displayName}</strong>
                    <small>Quản trị viên</small>
                  </span>
                </div>
              ) : null}
            </header>
            <div className="admin-content__body">{children}</div>
            <footer className="admin-workspace__footer">
              <span>Trung tâm quản trị</span>
              <span>Dữ liệu được cập nhật từ hệ thống</span>
            </footer>
          </main>
        </div>
      </div>
    </OperationalRoleGate>
  );
}
