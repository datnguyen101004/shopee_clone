import { fetchSellerAnalyticsOverview } from './seller-analytics-api';

const metric = { current: 0, previous: 0, change: 0 };
const metrics = {
  impressions: metric,
  productViews: metric,
  uniqueVisitors: metric,
  clicks: metric,
  ctr: metric,
  addToCart: metric,
  orders: metric,
  unitsSold: metric,
  revenue: metric,
  conversionRate: metric,
};

const overview = {
  sellerAnalyticsVersion: 'seller-analytics-overview-v1',
  currency: 'VND',
  generatedAt: '2026-09-12T08:00:00.000Z',
  freshness: 'near_real_time',
  range: {
    preset: 'today',
    from: '2026-09-12',
    to: '2026-09-12',
    timeZone: 'Asia/Ho_Chi_Minh',
    fromUtc: '2026-09-11T17:00:00.000Z',
    toUtcExclusive: '2026-09-12T08:00:00.000Z',
    previousFromUtc: '2026-09-10T17:00:00.000Z',
    previousToUtcExclusive: '2026-09-11T08:00:00.000Z',
  },
  summary: metrics,
  trend: { interval: 'hour', buckets: [] },
  products: { items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
};

describe('fetchSellerAnalyticsOverview', () => {
  it('calls the unified overview endpoint with preset, page, page size, and abort signal', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(overview), { status: 200 }));
    const signal = new AbortController().signal;
    await fetchSellerAnalyticsOverview(fetcher, { preset: 'today', page: 2, pageSize: 10 }, { signal });
    const [input, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(input.pathname).toBe('/api/v1/seller/analytics/overview');
    expect(Object.fromEntries(input.searchParams)).toEqual({ preset: 'today', page: '2', pageSize: '10' });
    expect(init.signal).toBe(signal);
    expect(init.cache).toBe('no-store');
  });

  it('uses custom date query fields and rejects an invalid response contract', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(overview), { status: 200 }));
    await fetchSellerAnalyticsOverview(fetcher, { from: '2026-09-01', to: '2026-09-12', page: 1, pageSize: 10 });
    const [input] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(Object.fromEntries(input.searchParams)).toEqual({ from: '2026-09-01', to: '2026-09-12', page: '1', pageSize: '10' });

    const invalidFetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(fetchSellerAnalyticsOverview(invalidFetcher, { preset: 'today', page: 1, pageSize: 10 })).rejects.toMatchObject({ kind: 'contract', status: 200 });
  });
});
