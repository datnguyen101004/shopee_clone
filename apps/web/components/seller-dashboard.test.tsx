import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SellerDashboard } from './seller-dashboard';

const api = vi.hoisted(() => ({ fetchDashboard: vi.fn(), authenticatedFetch: vi.fn() }));

vi.mock('./auth-session-provider', () => ({
  useAuthSession: () => ({
    state: { status: 'authenticated', user: { roles: ['buyer', 'seller'] } },
    authenticatedFetch: api.authenticatedFetch,
  }),
}));
vi.mock('../lib/seller-analytics-api', () => ({
  fetchSellerDashboard: (...args: unknown[]) => api.fetchDashboard(...args),
}));

const dashboard = (overrides: Record<string, unknown> = {}) => ({
  sellerAnalyticsVersion: 'seller-analytics-v1',
  currency: 'VND',
  range: {
    from: '2026-08-01',
    to: '2026-08-07',
    timeZone: 'Asia/Ho_Chi_Minh',
    fromUtc: '2026-07-31T17:00:00.000Z',
    toUtcExclusive: '2026-08-07T17:00:00.000Z',
  },
  generatedAt: '2026-08-19T00:00:00.000Z',
  kpis: { eligibleOrderCount: 0, unitsSold: 0, merchandiseRevenueMinor: 0 },
  timeSeries: [{ bucket: '2026-08-01', eligibleOrderCount: 0, unitsSold: 0, merchandiseRevenueMinor: 0 }],
  bestSellers: [],
  lowStock: { threshold: 10, items: [] },
  conversion: { status: 'NOT_AVAILABLE', rateBasisPoints: null, visits: null },
  ...overrides,
});

describe('SellerDashboard', () => {
  beforeEach(() => {
    api.fetchDashboard.mockReset().mockResolvedValue(dashboard());
  });

  it('loads local range, renders zero-state and explicit conversion placeholder', async () => {
    render(<SellerDashboard />);
    expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument();
    expect(screen.getByText(/Chưa có đơn hợp lệ/)).toBeInTheDocument();
    expect(screen.getByText(/Không có biến thể nào sắp hết hàng/)).toBeInTheDocument();
    expect(api.fetchDashboard).toHaveBeenCalledWith(api.authenticatedFetch, expect.objectContaining({ granularity: 'DAY' }));
  });

  it('keeps timezone labels and snapshot/current product states visible', async () => {
    api.fetchDashboard.mockResolvedValueOnce(dashboard({
      kpis: { eligibleOrderCount: 2, unitsSold: 3, merchandiseRevenueMinor: 120000 },
      bestSellers: [{ productId: '00000000-0000-4000-8000-000000000001', productName: 'Sản phẩm lưu snapshot', productImageUrl: null, unitsSold: 3, merchandiseRevenueMinor: 120000, currentProductAvailable: false }],
      lowStock: { threshold: 10, items: [{ variantId: '00000000-0000-4000-8000-000000000002', productId: '00000000-0000-4000-8000-000000000001', productName: 'Sản phẩm tồn kho', productImageUrl: null, variantName: 'Mặc định', sku: 'SKU-1', availableQuantity: 2, quantityOnHand: 2, quantityReserved: 0 }] },
    }));
    render(<SellerDashboard />);
    expect(await screen.findByText('Sản phẩm lưu snapshot')).toBeInTheDocument();
    expect(screen.getByText(/múi giờ Asia\/Ho_Chi_Minh/)).toBeInTheDocument();
    expect(screen.getByText('Sản phẩm tồn kho')).toBeInTheDocument();
  });

  it('opens the range calendar with two-letter English weekdays', async () => {
    render(<SellerDashboard />);
    await screen.findByText('Chưa có dữ liệu');
    fireEvent.click(screen.getByRole('button', { name: 'Từ ngày' }));
    for (const day of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
    expect(screen.queryByText('SA')).not.toBeInTheDocument();
  });

  it('synchronizes range/granularity changes through the authoritative API and recovers errors', async () => {
    api.fetchDashboard.mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce(dashboard());
    render(<SellerDashboard />);
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Nhóm theo'), { target: { value: 'MONTH' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật' }));
    await waitFor(() => expect(api.fetchDashboard).toHaveBeenLastCalledWith(api.authenticatedFetch, expect.objectContaining({ granularity: 'MONTH' })));
  });
});

