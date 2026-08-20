import { SellerAnalyticsService } from './seller-analytics.service';
import { SellerAnalyticsNotFoundError, SellerAnalyticsUnavailableError, SellerAnalyticsValidationError } from './seller-analytics.errors';

const query = { from: '2026-08-01', to: '2026-08-02', granularity: 'DAY' as const };

function serviceWith(timeZone = 'Asia/Ho_Chi_Minh') {
  const rows = [
    [{ now: new Date('2026-08-19T00:00:00.000Z') }],
    [{ eligibleOrderCount: 2n, unitsSold: 3n, merchandiseRevenueMinor: 120000n }],
    [{ bucket: '2026-08-01', eligibleOrderCount: 2n, unitsSold: 3n, merchandiseRevenueMinor: 120000n }],
    [],
    [],
  ];
  const tx = { $executeRaw: jest.fn().mockResolvedValue(0), $queryRaw: jest.fn().mockImplementation(() => Promise.resolve(rows.shift() ?? [])) };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  const scope = { resolve: jest.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', timeZone }) };
  return { service: new SellerAnalyticsService(prisma as never, scope as never), tx, prisma, scope };
}

describe('SellerAnalyticsService', () => {
  it('creates zero-filled local buckets and preserves the shop timezone', async () => {
    const { service, tx } = serviceWith();
    const response = await service.dashboard('owner-1', query);
    expect(response.range).toMatchObject({ timeZone: 'Asia/Ho_Chi_Minh', fromUtc: '2026-07-31T17:00:00.000Z', toUtcExclusive: '2026-08-02T17:00:00.000Z' });
    expect(response.timeSeries).toHaveLength(2);
    expect(response.timeSeries[1]).toMatchObject({ eligibleOrderCount: 0, unitsSold: 0, merchandiseRevenueMinor: 0 });
    expect(tx.$executeRaw).toHaveBeenCalledWith(expect.anything());
    expect(JSON.stringify(tx.$executeRaw.mock.calls[0]?.[0])).toContain("set_config('statement_timeout'");
  });

  it('handles DST-observing IANA zones without assuming every local day is 24 hours', async () => {
    const { service } = serviceWith('America/New_York');
    const response = await service.dashboard('owner-1', { from: '2026-03-08', to: '2026-03-08', granularity: 'DAY' });
    expect(response.range.fromUtc).toBe('2026-03-08T05:00:00.000Z');
    expect(response.range.toUtcExclusive).toBe('2026-03-09T04:00:00.000Z');
  });

  it('fails closed for missing ownership, invalid cursors, and unsafe aggregate integers', async () => {
    const missing = serviceWith('Not/A_Timezone');
    await expect(missing.service.dashboard('owner-1', query)).rejects.toBeInstanceOf(SellerAnalyticsUnavailableError);

    const invalid = serviceWith();
    await expect(invalid.service.products('owner-1', { ...query, limit: 20, cursor: 'not-a-valid-cursor' })).rejects.toBeInstanceOf(SellerAnalyticsValidationError);

    const unsafe = serviceWith();
    unsafe.tx.$queryRaw.mockReset().mockResolvedValueOnce([{ now: new Date('2026-08-19T00:00:00.000Z') }]).mockResolvedValueOnce([{ eligibleOrderCount: 2n ** 60n, unitsSold: 0n, merchandiseRevenueMinor: 0n }]).mockResolvedValue([]);
    await expect(unsafe.service.dashboard('owner-1', query)).rejects.toBeInstanceOf(SellerAnalyticsUnavailableError);
  });

  it('maps a missing approved shop to a non-enumerating not-found error', async () => {
    const { scope } = serviceWith();
    scope.resolve.mockRejectedValueOnce(Object.assign(new Error('not found'), { name: 'SellerShopScopeNotFoundError' }));
    // The shared scope error is intentionally not identified by message in production; this
    // assertion documents the service boundary using the real error type in a separate call.
    const realScope = serviceWith();
    const { SellerShopScopeNotFoundError } = await import('../seller-scope/seller-shop-scope.service');
    realScope.scope.resolve.mockRejectedValueOnce(new SellerShopScopeNotFoundError());
    await expect(realScope.service.dashboard('owner-1', query)).rejects.toBeInstanceOf(SellerAnalyticsNotFoundError);
  });
});
