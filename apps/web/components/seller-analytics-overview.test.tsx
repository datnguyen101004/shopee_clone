import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SellerAnalyticsOverviewResponse, SellerAnalyticsMetrics } from '@shopee-clone/contracts';
import { SellerAnalyticsOverview, formatSellerAnalyticsMetric, isValidSellerAnalyticsRange } from './seller-analytics-overview';

const api = vi.hoisted(() => ({ fetchOverview: vi.fn(), authenticatedFetch: vi.fn() }));

vi.mock('./auth-session-provider', () => ({
  useAuthSession: () => ({
    state: { status: 'authenticated', user: { roles: ['seller'], displayName: 'Shop', email: 'seller@example.test' } },
    authenticatedFetch: api.authenticatedFetch,
  }),
}));

vi.mock('../lib/seller-analytics-api', () => ({
  fetchSellerAnalyticsOverview: (...args: unknown[]) => api.fetchOverview(...args),
}));

const productId = '10000000-0000-4000-8000-000000000001';

function makeMetrics(overrides: Partial<Record<keyof SellerAnalyticsMetrics, { current: number; previous: number; change: number | 'new' }>> = {}): SellerAnalyticsMetrics {
  const zero = { current: 0, previous: 0, change: 0 as const };
  return {
    impressions: overrides.impressions ?? zero,
    productViews: overrides.productViews ?? zero,
    uniqueVisitors: overrides.uniqueVisitors ?? zero,
    clicks: overrides.clicks ?? zero,
    ctr: overrides.ctr ?? zero,
    addToCart: overrides.addToCart ?? zero,
    orders: overrides.orders ?? zero,
    unitsSold: overrides.unitsSold ?? zero,
    revenue: overrides.revenue ?? zero,
    conversionRate: overrides.conversionRate ?? zero,
  };
}

function makeOverview(overrides: Partial<SellerAnalyticsOverviewResponse> = {}): SellerAnalyticsOverviewResponse {
  const metrics = makeMetrics({
    impressions: { current: 1200, previous: 1000, change: 20 },
    productViews: { current: 800, previous: 0, change: 'new' },
    clicks: { current: 150, previous: 150, change: 0 },
    ctr: { current: 0.125, previous: 0.1, change: 25 },
    revenue: { current: 1250000, previous: 1000000, change: 25 },
  });
  return {
    sellerAnalyticsVersion: 'seller-analytics-overview-v1',
    currency: 'VND',
    generatedAt: '2026-09-12T08:00:00.000Z',
    freshness: 'near_real_time',
    range: {
      preset: 'last_7_days',
      from: '2026-09-06',
      to: '2026-09-12',
      timeZone: 'Asia/Ho_Chi_Minh',
      fromUtc: '2026-09-05T17:00:00.000Z',
      toUtcExclusive: '2026-09-12T17:00:00.000Z',
      previousFromUtc: '2026-08-29T17:00:00.000Z',
      previousToUtcExclusive: '2026-09-05T17:00:00.000Z',
    },
    summary: metrics,
    trend: { interval: 'day', buckets: [{ bucketStart: '2026-09-06T17:00:00.000Z', metrics }] },
    products: {
      items: [{ productId, productName: 'Áo khoác xanh', productImageUrl: null, metrics }],
      page: 1,
      pageSize: 10,
      totalItems: 11,
      totalPages: 2,
    },
    ...overrides,
  };
}

describe('SellerAnalyticsOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchOverview.mockResolvedValue(makeOverview());
  });

  it('validates the inclusive 31-day custom range and formats rates as percentages', () => {
    expect(isValidSellerAnalyticsRange('2026-09-01', '2026-09-12')).toBe(true);
    expect(isValidSellerAnalyticsRange('2026-09-01', '2026-09-13')).toBe(false);
    expect(formatSellerAnalyticsMetric('ctr', 0.125)).toBe('12,50%');
    expect(formatSellerAnalyticsMetric('revenue', 1250000)).toContain('1.250.000');
  });

  it('requests presets and then a valid custom range', async () => {
    render(<SellerAnalyticsOverview />);
    await waitFor(() => expect(api.fetchOverview).toHaveBeenCalledWith(
      expect.anything(),
      { preset: 'last_7_days', page: 1, pageSize: 10 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    await waitFor(() => expect(api.fetchOverview).toHaveBeenLastCalledWith(
      expect.anything(),
      { preset: 'today', page: 1, pageSize: 10 },
      expect.anything(),
    ));

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-09-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await waitFor(() => expect(api.fetchOverview).toHaveBeenLastCalledWith(
      expect.anything(),
      { from: '2026-09-01', to: '2026-09-12', page: 1, pageSize: 10 },
      expect.anything(),
    ));
  });

  it('renders ten KPI cards, localized new/zero comparisons, chart data, and product actions', async () => {
    render(<SellerAnalyticsOverview />);
    await screen.findByText('Phân tích shop');
    expect(await screen.findByTestId('seller-analytics-kpi-conversionRate')).toBeInTheDocument();
    expect(screen.getAllByText('Mới').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12,50%').length).toBeGreaterThan(0);
    expect(screen.getByRole('list', { name: 'Biểu đồ xu hướng theo ngày' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Hiệu quả theo sản phẩm' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem sản phẩm Áo khoác xanh' })).toHaveAttribute('href', `/seller/products/${productId}`);
  });

  it('uses numbered pagination for product rows', async () => {
    render(<SellerAnalyticsOverview />);
    await screen.findByText('Áo khoác xanh');
    fireEvent.click(screen.getByRole('button', { name: 'Trang 2' }));
    await waitFor(() => expect(api.fetchOverview).toHaveBeenLastCalledWith(
      expect.anything(),
      { preset: 'last_7_days', page: 2, pageSize: 10 },
      expect.anything(),
    ));
  });

  it('ignores a stale response when the seller changes period quickly', async () => {
    let resolveFirst: (value: SellerAnalyticsOverviewResponse) => void = () => undefined;
    let resolveSecond: (value: SellerAnalyticsOverviewResponse) => void = () => undefined;
    api.fetchOverview
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    render(<SellerAnalyticsOverview />);
    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    resolveSecond(makeOverview({ summary: makeMetrics({ impressions: { current: 222, previous: 0, change: 'new' } }) }));
    await screen.findByText('222');
    resolveFirst(makeOverview({ summary: makeMetrics({ impressions: { current: 111, previous: 0, change: 'new' } }) }));
    await waitFor(() => expect(screen.queryByText('111')).not.toBeInTheDocument());
  });
});
