import { SellerAnalyticsService } from './seller-analytics.service';

const productId = '00000000-0000-4000-8000-000000000201';
const shopId = '00000000-0000-4000-8000-000000000101';

describe('seller analytics overview composition', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-12T08:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it('combines one Athena scan and one bounded commerce aggregation with server formulas', async () => {
    const commerceRows = [
      { rowType: 'catalog', period: 'current', bucketStart: null, productId, productName: 'Phone', productImageUrl: null, orders: 0n, unitsSold: 0n, revenue: 0n },
      { rowType: 'summary', period: 'current', bucketStart: null, productId: null, productName: null, productImageUrl: null, orders: 2n, unitsSold: 3n, revenue: 120000n },
      { rowType: 'summary', period: 'previous', bucketStart: null, productId: null, productName: null, productImageUrl: null, orders: 1n, unitsSold: 1n, revenue: 60000n },
      { rowType: 'trend', period: 'current', bucketStart: new Date('2026-09-11T17:00:00.000Z'), productId: null, productName: null, productImageUrl: null, orders: 2n, unitsSold: 3n, revenue: 120000n },
      { rowType: 'product', period: 'current', bucketStart: null, productId, productName: 'Phone', productImageUrl: null, orders: 2n, unitsSold: 3n, revenue: 120000n },
    ];
    const tx = { $executeRaw: jest.fn().mockResolvedValue(0), $queryRaw: jest.fn().mockResolvedValue(commerceRows) };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const scope = { resolve: jest.fn().mockResolvedValue({ id: shopId, timeZone: 'Asia/Ho_Chi_Minh' }) };
    const athena = { query: jest.fn().mockResolvedValue({
      current: { impressions: 10, productViews: 4, uniqueVisitors: 2, clicks: 2, addToCart: 1 },
      previous: { impressions: 5, productViews: 2, uniqueVisitors: 1, clicks: 1, addToCart: 0 },
      trends: [{ period: 'current', bucketStart: '2026-09-12T00:00:00.000Z', impressions: 10, productViews: 4, uniqueVisitors: 2, clicks: 2, addToCart: 1 }], products: [{ period: 'current', productId, impressions: 10, productViews: 4, uniqueVisitors: 2, clicks: 2, addToCart: 1 }],
    }) };
    const service = new SellerAnalyticsService(prisma as never, scope as never, athena as never);
    const response = await service.overview('seller-id', { preset: 'today', page: 1, pageSize: 10 });
    expect(scope.resolve).toHaveBeenCalledWith('seller-id');
    expect(athena.query).toHaveBeenCalledWith(expect.objectContaining({ shopId, currentFrom: '2026-09-11T17:00:00.000Z', currentTo: '2026-09-12T08:00:00.000Z', previousFrom: '2026-09-10T17:00:00.000Z', previousTo: '2026-09-11T08:00:00.000Z', timeZone: 'Asia/Ho_Chi_Minh' }));
    expect(response.trend.buckets[0]?.bucketStart).toBe('2026-09-11T17:00:00.000Z');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(response.summary).toMatchObject({
      impressions: { current: 10, previous: 5, change: 100 },
      clicks: { current: 2, previous: 1, change: 100 },
      ctr: { current: 0.2, previous: 0.2, change: 0 },
      orders: { current: 2, previous: 1, change: 100 },
      conversionRate: { current: 1, previous: 1, change: 0 },
      revenue: { current: 120000, previous: 60000, change: 100 },
    });
    expect(response.products).toMatchObject({ totalItems: 1, totalPages: 1, items: [{ productName: 'Phone', metrics: { orders: { current: 2 }, addToCart: { current: 1 } } }] });
  });

  it('preserves the Prisma transaction receiver for commerce aggregation', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(0), $queryRaw: jest.fn().mockResolvedValue([]) };
    const prisma = { $transaction: jest.fn() };
    prisma.$transaction.mockImplementation(async function (this: typeof prisma, work: (client: typeof tx) => unknown) {
      expect(this).toBe(prisma);
      return await work(tx);
    });
    const scope = { resolve: jest.fn().mockResolvedValue({ id: shopId, timeZone: 'Asia/Ho_Chi_Minh' }) };
    const athena = { query: jest.fn().mockResolvedValue({
      current: { impressions: 0, productViews: 0, uniqueVisitors: 0, clicks: 0, addToCart: 0 }, previous: { impressions: 0, productViews: 0, uniqueVisitors: 0, clicks: 0, addToCart: 0 }, trends: [], products: [],
    }) };
    const service = new SellerAnalyticsService(prisma as never, scope as never, athena as never);

    const response = await service.overview('seller-id', { preset: 'today', page: 1, pageSize: 10 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(response.summary.orders.current).toBe(0);
  });

  it('maps sparse previous buckets by their expected relative start, not row position', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(0), $queryRaw: jest.fn().mockResolvedValue([]) };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const scope = { resolve: jest.fn().mockResolvedValue({ id: shopId, timeZone: 'Asia/Ho_Chi_Minh' }) };
    const athena = { query: jest.fn().mockResolvedValue({
      current: { impressions: 0, productViews: 0, uniqueVisitors: 0, clicks: 0, addToCart: 0 }, previous: { impressions: 0, productViews: 0, uniqueVisitors: 0, clicks: 0, addToCart: 0 },
      trends: [{ period: 'current', bucketStart: '2026-09-11T17:00:00.000Z', impressions: 1, productViews: 0, uniqueVisitors: 0, clicks: 0, addToCart: 0 }, { period: 'current', bucketStart: '2026-09-11T18:00:00.000Z', impressions: 1, productViews: 0, uniqueVisitors: 0, clicks: 0, addToCart: 0 }, { period: 'previous', bucketStart: '2026-09-10T18:00:00.000Z', impressions: 4, productViews: 0, uniqueVisitors: 0, clicks: 0, addToCart: 0 }], products: [],
    }) };
    const service = new SellerAnalyticsService(prisma as never, scope as never, athena as never);
    const response = await service.overview('seller-id', { preset: 'today', page: 1, pageSize: 10 });
    expect(response.trend.buckets.find((bucket) => bucket.bucketStart === '2026-09-11T18:00:00.000Z')?.metrics.impressions.previous).toBe(4);
    expect(response.trend.buckets.find((bucket) => bucket.bucketStart === '2026-09-11T17:00:00.000Z')?.metrics.impressions.previous).toBe(0);
  });

  it('returns truthful zero values and numbered empty pages', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(0), $queryRaw: jest.fn().mockResolvedValue([]) };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const scope = { resolve: jest.fn().mockResolvedValue({ id: shopId, timeZone: 'Asia/Ho_Chi_Minh' }) };
    const athena = { query: jest.fn().mockResolvedValue({ current: { impressions: 0, productViews: 0, uniqueVisitors: 0, clicks: 0, addToCart: 0 }, previous: { impressions: 0, productViews: 0, uniqueVisitors: 0, clicks: 0, addToCart: 0 }, trends: [], products: [] }) };
    const service = new SellerAnalyticsService(prisma as never, scope as never, athena as never);
    const response = await service.overview('seller-id', { from: '2026-09-11', to: '2026-09-11', page: 2, pageSize: 10 });
    expect(response.summary.ctr).toEqual({ current: 0, previous: 0, change: 0 });
    expect(response.summary.conversionRate).toEqual({ current: 0, previous: 0, change: 0 });
    expect(response.products).toMatchObject({ page: 2, totalItems: 0, totalPages: 0, items: [] });
  });
});
