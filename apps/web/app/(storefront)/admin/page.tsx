'use client';

import type { AdminDashboardResponse } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useEffect, useState, type ComponentType } from 'react';

import {
  AuditIcon,
  HomepageIcon,
  ProductIcon,
  ShopIcon,
  UsersIcon,
} from '../../../components/admin/admin-icons';
import { useAuthSession } from '../../../components/auth-session-provider';
import { fetchAdminDashboard } from '../../../lib/admin-api';

type AdminMetricIcon = ComponentType<{ size?: number; color?: string }>;

function MetricCard({
  label,
  value,
  suffix,
  detail,
  detailTone = 'muted',
  href,
  actionLabel,
  Icon,
  tone = 'blue',
}: {
  label: string;
  value: number;
  suffix?: string;
  detail: string;
  detailTone?: 'muted' | 'success' | 'warning' | 'danger';
  href: string;
  actionLabel: string;
  Icon: AdminMetricIcon;
  tone?: 'blue' | 'green' | 'purple' | 'red';
}) {
  return (
    <article className="admin-metric-card admin-card-hover">
      <div className="admin-metric-card__heading">
        <span className="admin-metric-card__label">{label}</span>
        <span
          className={`admin-metric-card__icon admin-metric-card__icon--${tone}`}
          aria-hidden="true"
        >
          <Icon size={20} />
        </span>
      </div>
      <div className="admin-metric-card__value">
        {value}
        {suffix ? <span>{suffix}</span> : null}
      </div>
      <p className={`admin-metric-card__detail admin-metric-card__detail--${detailTone}`}>
        {detail}
      </p>
      <Link className="admin-inline-link" href={href}>
        {actionLabel} →
      </Link>
    </article>
  );
}

export default function AdminDashboardPage() {
  const { authenticatedFetch } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminDashboardResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetchAdminDashboard(authenticatedFetch)
      .then((response) => {
        if (!active) return;
        setData(response);
        setLoading(false);
      })
      .catch((caughtError: unknown) => {
        if (!active) return;
        setError(
          caughtError instanceof Error ? caughtError.message : 'Không thể tải dữ liệu tổng quan',
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authenticatedFetch]);

  if (loading) {
    return (
      <section className="admin-state-card" aria-busy="true">
        <p>Đang tải thông số vận hành...</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="admin-state-card admin-state-card--error" role="alert">
        <h2>Lỗi tải trang tổng quan</h2>
        <p>{error ?? 'Không có dữ liệu tổng quan.'}</p>
      </section>
    );
  }

  const { counts } = data;
  return (
    <div className="admin-page admin-dashboard-page">
      <div className="admin-dashboard-grid">
        <MetricCard
          label="Tài khoản người dùng"
          value={counts.usersCount}
          detail={`${counts.activeUsersCount} hoạt động · ${counts.suspendedUsersCount} đã khóa`}
          detailTone={counts.suspendedUsersCount > 0 ? 'warning' : 'success'}
          href="/admin/users"
          actionLabel="Quản lý người dùng"
          Icon={UsersIcon}
          tone="blue"
        />
        <MetricCard
          label="Cửa hàng"
          value={counts.shopsCount}
          detail={`${counts.pendingShopApprovalsCount} đơn đăng ký chờ duyệt`}
          detailTone={counts.pendingShopApprovalsCount > 0 ? 'warning' : 'muted'}
          href="/admin/shops"
          actionLabel="Duyệt và quản lý shop"
          Icon={ShopIcon}
          tone="green"
        />
        <MetricCard
          label="Danh mục sản phẩm"
          value={counts.categoriesCount}
          detail="Tra cứu và kiểm duyệt sản phẩm"
          detailTone="muted"
          href="/admin/products"
          actionLabel="Tra cứu sản phẩm"
          Icon={ProductIcon}
          tone="purple"
        />
        <MetricCard
          label="Cấu hình trang chủ"
          value={counts.homepageBannersCount}
          suffix=" banner"
          detail={`${counts.enabledHomepageModulesCount} module đang kích hoạt`}
          detailTone="muted"
          href="/admin/homepage"
          actionLabel="Cấu hình module và banner"
          Icon={HomepageIcon}
          tone="purple"
        />
        <MetricCard
          label="Nhật ký vận hành (24h)"
          value={counts.recentAuditEventsCount}
          detail="Hành động đặc quyền đã ghi nhận"
          detailTone="muted"
          href="/admin/audit"
          actionLabel="Xem nhật ký kiểm toán"
          Icon={AuditIcon}
          tone="red"
        />
      </div>
      <p className="admin-dashboard-page__updated">
        Cập nhật lúc {new Date(data.generatedAt).toLocaleTimeString('vi-VN')}
      </p>
    </div>
  );
}
