import type { AuthUser } from '@shopee-clone/contracts';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCenterLayout } from './admin/admin-center-layout';
import { useAuthSession } from './auth-session-provider';

vi.mock('./auth-session-provider', () => ({ useAuthSession: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}));

const adminUser: AuthUser = {
  id: '00000000-0000-4000-8000-000000000003',
  email: 'admin@example.test',
  displayName: 'Admin User',
  status: 'active',
  roles: ['buyer', 'admin'],
};

const buyerUser: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer User',
  status: 'active',
  roles: ['buyer'],
};

describe('AdminCenterLayout and Admin Console Gating', () => {
  beforeEach(() => {
    vi.mocked(useAuthSession).mockReset();
  });

  it('renders guest state when not authenticated', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'guest', user: null },
      authenticatedFetch: vi.fn(),
    } as any);

    render(
      <AdminCenterLayout>
        <div>Admin Content</div>
      </AdminCenterLayout>,
    );

    expect(screen.getByText('Cần đăng nhập')).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('renders forbidden state when user has only buyer role', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'authenticated', user: buyerUser },
      authenticatedFetch: vi.fn(),
    } as any);

    render(
      <AdminCenterLayout>
        <div>Admin Content</div>
      </AdminCenterLayout>,
    );

    expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('renders admin console navigation and content when authenticated as admin', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'authenticated', user: adminUser },
      authenticatedFetch: vi.fn(),
    } as any);

    render(
      <AdminCenterLayout>
        <div>Admin Content Area</div>
      </AdminCenterLayout>,
    );

    expect(screen.getByText('Trung tâm Quản trị')).toBeInTheDocument();
    expect(screen.getByText('Tổng quan')).toBeInTheDocument();
    expect(screen.getByText('Người dùng')).toBeInTheDocument();
    expect(screen.getByText('Cửa hàng')).toBeInTheDocument();
    expect(screen.getByText('Kiểm soát sản phẩm')).toBeInTheDocument();
    expect(screen.getByText('Trang chủ & Banner')).toBeInTheDocument();

    expect(screen.getByText('Nhật ký kiểm toán')).toBeInTheDocument();
    expect(screen.getByText('Admin Content Area')).toBeInTheDocument();
  });
});
