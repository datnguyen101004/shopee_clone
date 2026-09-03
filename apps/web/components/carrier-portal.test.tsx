import type {
  AuthUser,
  DemoCarrierDashboardResponse,
  DemoCarrierShipment,
} from '@shopee-clone/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthSession } from './auth-session-provider';
import { CarrierPortal } from './carrier-portal';
import { CarrierShipmentDetailPage } from './carrier-shipment-detail-page';
import { CarrierShipmentsPage } from './carrier-shipments-page';
import { CarrierShell } from './carrier/carrier-shell';

type AuthSessionValue = ReturnType<typeof useAuthSession>;

vi.mock('./auth-session-provider', () => ({ useAuthSession: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/carrier',
  useParams: () => ({ trackingCode: 'VN-EXP-12345678' }),
}));

const operatorUser: AuthUser = {
  id: '00000000-0000-4000-8000-000000000005',
  email: 'carrier@example.test',
  displayName: 'Carrier Operator User',
  status: 'active',
  roles: ['buyer', 'carrier_operator'],
};

const buyerOnlyUser: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer User',
  status: 'active',
  roles: ['buyer'],
};

const mockShipment: DemoCarrierShipment = {
  provider: 'DEMO_CARRIER',
  version: 'demo-distance-v1',
  simulation: true,
  shipmentReference: 'ORD-20260828-001',
  trackingCode: 'VN-EXP-12345678',
  externalShipmentId: 'EXT-SHIP-001',
  status: 'OUT_FOR_DELIVERY',
  service: 'EXPRESS',
  quote: {
    provider: 'DEMO_CARRIER',
    version: 'demo-distance-v1',
    simulation: true,
    shipmentReference: 'ORD-20260828-001',
    pickup: {
      provinceCode: '01',
      districtCode: '001',
      provinceName: 'Hà Nội',
      districtName: 'Ba Đình',
      resolutionLevel: 'DISTRICT',
    },
    delivery: {
      provinceCode: '79',
      districtCode: '760',
      provinceName: 'TP. Hồ Chí Minh',
      districtName: 'Quận 1',
      resolutionLevel: 'DISTRICT',
    },
    straightLineDistanceKm: 1140,
    estimatedDistanceKm: 1425,
    billableDistanceKm: 1425,
    shipmentWeightGrams: 500,
    service: 'EXPRESS',
    estimatedDaysMin: 1,
    estimatedDaysMax: 2,
    baseFeeMinor: 20000,
    nearDistanceFeeMinor: 0,
    longDistanceFeeMinor: 35000,
    weightFeeMinor: 0,
    totalFeeMinor: 55000,
    currency: 'VND',
    calculationVersion: 'demo-distance-v1',
    locationSnapshotVersion: 'vn-legacy-63-696-v1',
    calculatedAt: new Date().toISOString(),
  },
  versionNumber: 3,
  registeredAt: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
  deliveredAt: null,
  returnedAt: null,
  sender: {
    name: 'Shop Hà Nội',
    phoneNumber: '0912345678',
    address: '12 Tràng Thi, Hoàn Kiếm, Hà Nội',
  },
  recipient: {
    name: 'Người nhận thật',
    phoneNumber: '0987654321',
    address: '25 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
  },
  order: {
    shopName: 'Shop Hà Nội',
    currency: 'VND',
    createdAt: new Date().toISOString(),
    note: null,
    codAmountMinor: 550_000,
    items: [
      {
        productName: 'Điện thoại thử nghiệm',
        variantName: 'Đen',
        quantity: 1,
        shipmentWeightGrams: 500,
        imageUrl: 'https://cdn.example.test/dien-thoai.jpg',
        description: 'Điện thoại có màn hình sắc nét và pin sử dụng cả ngày.',
      },
    ],
  },
  driver: null,
  events: [
    {
      externalEventId: 'EVT-001',
      shipmentReference: 'ORD-20260828-001',
      previousStatus: null,
      status: 'CREATED',
      versionNumber: 1,
      reason: null,
      note: 'Đã tạo vận đơn',
      occurredAt: new Date().toISOString(),
    },
    {
      externalEventId: 'EVT-002',
      shipmentReference: 'ORD-20260828-001',
      previousStatus: 'CREATED',
      status: 'OUT_FOR_DELIVERY',
      versionNumber: 2,
      reason: null,
      note: 'Đang đi giao hàng',
      occurredAt: new Date().toISOString(),
    },
  ],
};

const mockDashboard: DemoCarrierDashboardResponse = {
  provider: 'DEMO_CARRIER',
  simulation: true,
  counts: {
    REGISTRATION_PENDING: 0,
    REGISTRATION_FAILED: 0,
    CREATED: 1,
    ACCEPTED: 2,
    IN_TRANSIT: 3,
    OUT_FOR_DELIVERY: 4,
    DELIVERY_FAILED: 1,
    RETURN_IN_TRANSIT: 0,
    DELIVERED: 10,
    RETURNED: 2,
  },
  attention: [mockShipment],
};

describe('Carrier Shell and Portal Components', () => {
  beforeEach(() => {
    vi.mocked(useAuthSession).mockReset();
  });

  it('renders carrier shell with simulation banner and navigation links', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'authenticated', user: operatorUser },
      authenticatedFetch: vi.fn(),
    } as unknown as AuthSessionValue);

    render(
      <CarrierShell>
        <div>Carrier Portal Child</div>
      </CarrierShell>,
    );

    expect(screen.getByText(/Môi trường thử nghiệm/i)).toBeInTheDocument();
    expect(screen.getByText('DEMO CARRIER')).toBeInTheDocument();
    expect(screen.getByText('OPERATIONS PORTAL')).toBeInTheDocument();
    expect(screen.getByText('Tổng quan')).toBeInTheDocument();
    expect(screen.queryByText('Đơn hàng')).toBeNull();
    expect(screen.queryByText('Vận đơn')).toBeNull();
    expect(screen.getByText('Về Marketplace')).toBeInTheDocument();
    expect(screen.getByText('Carrier Operator User')).toBeInTheDocument();
    expect(screen.getByText('Carrier Portal Child')).toBeInTheDocument();
  });

  it('renders guest state in CarrierPortal when unauthenticated', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'guest', user: null },
      authenticatedFetch: vi.fn(),
    } as unknown as AuthSessionValue);

    render(<CarrierPortal />);
    expect(screen.getByText('Cần đăng nhập')).toBeInTheDocument();
    expect(screen.getByText('Đăng nhập ngay')).toBeInTheDocument();
  });

  it('renders unauthorized state when user lacks carrier_operator role', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'authenticated', user: buyerOnlyUser },
      authenticatedFetch: vi.fn(),
    } as unknown as AuthSessionValue);

    render(<CarrierPortal />);
    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
  });

  it('renders dashboard KPI counts, shipment items, and interactive actions when operator is logged in', async () => {
    const mockAuthFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/dashboard')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDashboard),
        });
      }
      if (url.includes('/shipments')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [mockShipment] }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'authenticated', user: operatorUser },
      authenticatedFetch: mockAuthFetch,
    } as unknown as AuthSessionValue);

    render(<CarrierPortal />);

    await waitFor(() => {
      expect(screen.getByText('Quản lý vận đơn')).toBeInTheDocument();
    });

    // Check KPI counts
    expect(screen.getAllByText('Đang giao hàng').length).toBeGreaterThan(0);

    // Check shipment item in list
    expect(screen.getAllByText('VN-EXP-12345678').length).toBeGreaterThan(0);
    expect(screen.getByText('Shop Hà Nội')).toBeInTheDocument();
    expect(screen.getByText('Người nhận thật')).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Chờ lấy hàng' })).toHaveLength(1);
    expect(screen.getByText('25 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh')).toHaveAttribute(
      'title',
      '25 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
    );
    expect(screen.getByText('Chưa phân công')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Xem chi tiết VN-EXP-12345678' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tùy chọn VN-EXP-12345678/ })).toBeNull();

    // Check action buttons for OUT_FOR_DELIVERY status
    expect(screen.getByText('Xác nhận giao thành công (DELIVERED)')).toBeInTheDocument();
    expect(screen.getByText('Giả lập giao thất bại')).toBeInTheDocument();
  });

  it('renders CarrierShipmentsPage with filters and table items', async () => {
    const mockAuthFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [mockShipment] }),
    });

    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'authenticated', user: operatorUser },
      authenticatedFetch: mockAuthFetch,
    } as unknown as AuthSessionValue);

    render(<CarrierShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Danh sách vận đơn')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('Nhập mã đơn hàng hoặc mã vận đơn…')).toBeInTheDocument();
    expect(screen.getByText('VN-EXP-12345678')).toBeInTheDocument();
    expect(screen.getAllByText('Nhanh').length).toBeGreaterThan(0);
  });

  it('renders CarrierShipmentDetailPage with timeline and action buttons', async () => {
    const mockAuthFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockShipment),
    });

    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'authenticated', user: operatorUser },
      authenticatedFetch: mockAuthFetch,
    } as unknown as AuthSessionValue);

    render(<CarrierShipmentDetailPage />);

    await waitFor(() => {
      expect(screen.getAllByText('VN-EXP-12345678').length).toBeGreaterThan(0);
    });

    expect(screen.getByText('Đang đi giao hàng')).toBeInTheDocument();
    expect(screen.getByText('Điện thoại thử nghiệm')).toBeInTheDocument();
    expect(screen.getByText('Đen · Số lượng: 1')).toBeInTheDocument();
    expect(screen.getByText('Điện thoại có màn hình sắc nét và pin sử dụng cả ngày.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Điện thoại thử nghiệm' })).toHaveAttribute(
      'src',
      'https://cdn.example.test/dien-thoai.jpg',
    );
    expect(screen.getByText(/550\.000/)).toBeInTheDocument();
    expect(screen.getByText('Bảng điều khiển mô phỏng')).toBeInTheDocument();
    expect(screen.getByText('Giao hàng thành công (DELIVERED)')).toBeInTheDocument();
  });
});
