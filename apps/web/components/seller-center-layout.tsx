'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuthSession } from './auth-session-provider';

const navigation = [
  { href: '/seller', label: 'Tổng quan', icon: '⌂' },
  { href: '/seller/shop', label: 'Hồ sơ shop', icon: '◉' },
  { href: '/seller/products', label: 'Sản phẩm', icon: '▦' },
  { href: '/seller/inventory', label: 'Tồn kho', icon: '◫' },
];

export function SellerCenterLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state } = useAuthSession();
  const isSeller = state.status === 'authenticated' && state.user.roles.includes('seller');
  return (
    <div className="seller-center-shell">
      <aside className="seller-center-sidebar" aria-label="Quản lý shop">
        <div className="seller-center-sidebar__heading"><span>Seller Center</span><strong>Kênh người bán</strong></div>
        <nav>
          {navigation.map((item) => {
            const active = item.href === '/seller' ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link href={item.href} aria-current={active ? 'page' : undefined} data-disabled={!isSeller ? 'true' : undefined} key={item.href}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>;
          })}
        </nav>
        <p className="seller-center-sidebar__hint">Quản lý hồ sơ, sản phẩm và trạng thái bán của shop tại đây.</p>
      </aside>
      <main className="seller-center-content">{children}</main>
    </div>
  );
}
