import { describe, expect, it } from 'vitest';
import { isSellerDashboardResponse, parseSellerAnalyticsProductQuery, parseSellerAnalyticsQuery } from '../src/seller-analytics';

describe('seller analytics contracts', () => {
  it('parses bounded local date queries and rejects malformed ranges', () => {
    expect(parseSellerAnalyticsQuery({ from: '2026-08-01', to: '2026-08-31', granularity: 'DAY' })).toEqual({ from: '2026-08-01', to: '2026-08-31', granularity: 'DAY' });
    expect(parseSellerAnalyticsQuery({ from: '2026-08-31', to: '2026-08-01', granularity: 'DAY' })).toBeNull();
    expect(parseSellerAnalyticsQuery({ from: '2025-01-01', to: '2026-01-02', granularity: 'DAY' })).toBeNull();
    expect(parseSellerAnalyticsQuery({ from: '2026-08-01', to: '2026-08-31', granularity: 'DAY', shopId: 'foreign' })).toBeNull();
  });

  it('parses product pagination without accepting an oversized page', () => {
    expect(parseSellerAnalyticsProductQuery({ from: '2026-08-01', to: '2026-08-31', limit: '100', cursor: undefined })).toMatchObject({ limit: 100, cursor: null });
    expect(parseSellerAnalyticsProductQuery({ from: '2026-08-01', to: '2026-08-31', limit: '101' })).toBeNull();
  });

  it('guards exact dashboard response shape and unavailable conversion', () => {
    const response = {
      sellerAnalyticsVersion: 'seller-analytics-v1', currency: 'VND', range: { from: '2026-08-01', to: '2026-08-01', timeZone: 'Asia/Ho_Chi_Minh', fromUtc: '2026-07-31T17:00:00.000Z', toUtcExclusive: '2026-08-01T17:00:00.000Z' }, generatedAt: '2026-08-01T00:00:00.000Z', kpis: { eligibleOrderCount: 0, unitsSold: 0, merchandiseRevenueMinor: 0 }, timeSeries: [], bestSellers: [], lowStock: { threshold: 10, items: [] }, conversion: { status: 'NOT_AVAILABLE', rateBasisPoints: null, visits: null },
    };
    expect(isSellerDashboardResponse(response)).toBe(true);
    expect(isSellerDashboardResponse({ ...response, kpis: { ...response.kpis, fake: 1 } })).toBe(false);
  });
});
