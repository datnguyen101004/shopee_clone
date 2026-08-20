'use client';

import type { AdminDashboardResponse } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  AuditIcon,
  CategoryIcon,
  HomepageIcon,
  ProductIcon,
  ShopIcon,
  UsersIcon,
} from '../../../components/admin/admin-icons';

import { useAuthSession } from '../../../components/auth-session-provider';
import { fetchAdminDashboard } from '../../../lib/admin-api';



export default function AdminDashboardPage() {
  const { authenticatedFetch } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminDashboardResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetchAdminDashboard(authenticatedFetch)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || 'Không thể tải dữ liệu tổng quan');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [authenticatedFetch]);

  if (loading) {
    return (
      <div style={{ padding: '24px', background: '#ffffff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <p style={{ color: '#6b7280', fontSize: '15px' }}>Đang tải thông số vận hành...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '24px', background: '#ffffff', borderRadius: '12px', border: '1px solid #fee2e2' }}>
        <h2 style={{ color: '#ef4444', fontSize: '18px', fontWeight: 600 }}>Lỗi tải trang tổng quan</h2>
        <p style={{ color: '#4b5563', marginTop: '8px' }}>{error}</p>
      </div>
    );
  }

  const { counts } = data;

  const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: '12px',
    padding: '20px 24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    border: '1px solid #f3f4f6',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>Tổng quan sàn thương mại</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
          Số liệu thống kê thời gian thực từ cơ sở dữ liệu hệ thống (Cập nhật: {new Date(data.generatedAt).toLocaleTimeString('vi-VN')})
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Users Card */}
        <div className="admin-card-hover" style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Tài khoản Người dùng</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb' }}>
              <UsersIcon size={20} />
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#111827' }}>{counts.usersCount}</div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', marginTop: '4px' }}>
            <span style={{ color: '#10b981' }}>● {counts.activeUsersCount} Hoạt động</span>
            <span style={{ color: '#ef4444' }}>● {counts.suspendedUsersCount} Đã khóa</span>
          </div>
          <Link href="/admin/users" style={{ fontSize: '13px', color: '#ee4d2d', fontWeight: 600, marginTop: '8px', textDecoration: 'none' }}>
            Quản lý người dùng →
          </Link>
        </div>

        {/* Shops Card */}
        <div className="admin-card-hover" style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Cửa hàng (Shops)</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '10px', background: '#ecfdf5', color: '#059669' }}>
              <ShopIcon size={20} />
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#111827' }}>{counts.shopsCount}</div>
          <div style={{ fontSize: '13px', color: counts.pendingShopApprovalsCount > 0 ? '#d97706' : '#6b7280', marginTop: '4px' }}>
            {counts.pendingShopApprovalsCount} đơn đăng ký chờ duyệt
          </div>
          <Link href="/admin/shops" style={{ fontSize: '13px', color: '#ee4d2d', fontWeight: 600, marginTop: '8px', textDecoration: 'none' }}>
            Duyệt & Quản lý shop →
          </Link>
        </div>

        {/* Products Card */}
        <div className="admin-card-hover" style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Kiểm soát Sản phẩm</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '10px', background: '#fef3c7', color: '#d97706' }}>
              <ProductIcon size={20} />
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#111827' }}>{counts.categoriesCount} <span style={{ fontSize: '16px', fontWeight: 500, color: '#6b7280' }}>Danh mục</span></div>
          <div style={{ fontSize: '13px', color: '#10b981', marginTop: '4px' }}>
            Tra cứu & kiểm duyệt theo Slug / UUID
          </div>
          <Link href="/admin/products" style={{ fontSize: '13px', color: '#ee4d2d', fontWeight: 600, marginTop: '8px', textDecoration: 'none' }}>
            Tra cứu & kiểm duyệt sản phẩm →
          </Link>
        </div>

        {/* Homepage & Banner Card */}
        <div className="admin-card-hover" style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Cấu hình Trang chủ</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '10px', background: '#f3e8ff', color: '#7c3aed' }}>
              <HomepageIcon size={20} />
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#111827' }}>{counts.homepageBannersCount} <span style={{ fontSize: '16px', fontWeight: 500, color: '#6b7280' }}>Banner</span></div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            {counts.enabledHomepageModulesCount} module đang kích hoạt
          </div>
          <Link href="/admin/homepage" style={{ fontSize: '13px', color: '#ee4d2d', fontWeight: 600, marginTop: '8px', textDecoration: 'none' }}>
            Cấu hình module & Banner →
          </Link>
        </div>

        {/* Audit Log Card */}
        <div className="admin-card-hover" style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Nhật ký Vận hành (24h)</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '10px', background: '#fee2e2', color: '#dc2626' }}>
              <AuditIcon size={20} />
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#111827' }}>{counts.recentAuditEventsCount}</div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Hành động đặc quyền ghi nhận
          </div>
          <Link href="/admin/audit" style={{ fontSize: '13px', color: '#ee4d2d', fontWeight: 600, marginTop: '8px', textDecoration: 'none' }}>
            Xem nhật ký kiểm toán →
          </Link>
        </div>
      </div>
    </div>
  );
}

