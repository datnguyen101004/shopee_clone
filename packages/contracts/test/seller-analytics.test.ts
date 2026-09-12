import { describe, expect, it } from 'vitest';
import { isSellerAnalyticsOverviewResponse, isSellerDashboardResponse, parseSellerAnalyticsOverviewQuery, parseSellerAnalyticsProductQuery, parseSellerAnalyticsQuery } from '../src/seller-analytics';

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

  it('parses overview presets, custom ranges, and numbered pagination', () => {
    expect(parseSellerAnalyticsOverviewQuery({ preset: 'today', page: '2', pageSize: '10' })).toEqual({ preset: 'today', page: 2, pageSize: 10 });
    expect(parseSellerAnalyticsOverviewQuery({ from: '2026-09-01', to: '2026-09-12' })).toEqual({ from: '2026-09-01', to: '2026-09-12', page: 1, pageSize: 10 });
    expect(parseSellerAnalyticsOverviewQuery({ preset: 'today', from: '2026-09-01', to: '2026-09-01' })).toBeNull();
    expect(parseSellerAnalyticsOverviewQuery({ from: '2026-08-01', to: '2026-09-01' })).toBeNull();
    expect(parseSellerAnalyticsOverviewQuery({ preset: 'today', shopId: 'foreign' })).toBeNull();
    expect(parseSellerAnalyticsOverviewQuery({ page: '0' })).toBeNull();
  });

  it('validates the exact unified overview response shape', () => {
    const metric = { current: 0, previous: 0, change: 0 };
    const metrics = { impressions: metric, productViews: metric, uniqueVisitors: metric, clicks: metric, ctr: metric, addToCart: metric, orders: metric, unitsSold: metric, revenue: metric, conversionRate: metric };
    const response = {
      sellerAnalyticsVersion: 'seller-analytics-overview-v1', currency: 'VND', generatedAt: '2026-09-12T08:00:00.000Z', freshness: 'near_real_time',
      range: { preset: 'today', from: '2026-09-12', to: '2026-09-12', timeZone: 'Asia/Ho_Chi_Minh', fromUtc: '2026-09-11T17:00:00.000Z', toUtcExclusive: '2026-09-12T08:00:00.000Z', previousFromUtc: '2026-09-10T17:00:00.000Z', previousToUtcExclusive: '2026-09-11T08:00:00.000Z' },
      summary: metrics, trend: { interval: 'hour', buckets: [{ bucketStart: '2026-09-12T07:00:00.000Z', metrics }] }, products: { items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    };
    expect(isSellerAnalyticsOverviewResponse(response)).toBe(true);
    expect(isSellerAnalyticsOverviewResponse({ ...response, summary: { ...metrics, bogus: metric } })).toBe(false);
    expect(isSellerAnalyticsOverviewResponse({ ...response, products: { ...response.products, page: 0 } })).toBe(false);
    expect(isSellerAnalyticsOverviewResponse({ ...response, products: { ...response.products, pageSize: 0 } })).toBe(false);
    expect(isSellerAnalyticsOverviewResponse({ ...response, products: { ...response.products, totalPages: 0 } })).toBe(true);
  });
});
