import type { AuthUser } from '@shopee-clone/contracts';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';
import { SellerAnalyticsService } from '../src/seller-analytics/seller-analytics.service';

const users: Record<string, AuthUser> = {
  buyer: { id: '00000000-0000-4000-0000-000000000001', email: 'buyer@example.test', displayName: 'Buyer', status: 'active', roles: ['buyer'] },
  seller: { id: '00000000-0000-4000-0000-000000000002', email: 'seller@example.test', displayName: 'Seller', status: 'active', roles: ['buyer', 'seller'] },
};

class MatrixAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = users[req.headers.authorization?.replace(/^Bearer /, '') ?? ''];
    if (!user) throw new AuthenticationFailedError();
    req.authUser = user;
    return true;
  }
}

const range = { from: '2026-08-01', to: '2026-08-07', timeZone: 'Asia/Ho_Chi_Minh', fromUtc: '2026-07-31T17:00:00.000Z', toUtcExclusive: '2026-08-07T17:00:00.000Z' };
const dashboard = { sellerAnalyticsVersion: 'seller-analytics-v1', currency: 'VND', range, generatedAt: '2026-08-19T00:00:00.000Z', kpis: { eligibleOrderCount: 0, unitsSold: 0, merchandiseRevenueMinor: 0 }, timeSeries: [{ bucket: '2026-08-01', eligibleOrderCount: 0, unitsSold: 0, merchandiseRevenueMinor: 0 }], bestSellers: [], lowStock: { threshold: 10, items: [] }, conversion: { status: 'NOT_AVAILABLE', rateBasisPoints: null, visits: null } };
const productPage = { sellerAnalyticsVersion: 'seller-analytics-v1', currency: 'VND', range, items: [], nextCursor: null };
const zeroMetric = { current: 0, previous: 0, change: 0 };
const overview = {
  sellerAnalyticsVersion: 'seller-analytics-overview-v1', currency: 'VND', generatedAt: '2026-08-19T00:00:00.000Z', freshness: 'near_real_time',
  range: { preset: 'today', from: '2026-08-19', to: '2026-08-19', timeZone: 'Asia/Ho_Chi_Minh', fromUtc: '2026-08-18T17:00:00.000Z', toUtcExclusive: '2026-08-19T00:00:00.000Z', previousFromUtc: '2026-08-17T17:00:00.000Z', previousToUtcExclusive: '2026-08-18T00:00:00.000Z' },
  summary: { impressions: zeroMetric, productViews: zeroMetric, uniqueVisitors: zeroMetric, clicks: zeroMetric, ctr: zeroMetric, addToCart: zeroMetric, orders: zeroMetric, unitsSold: zeroMetric, revenue: zeroMetric, conversionRate: zeroMetric },
  trend: { interval: 'hour', buckets: [] }, products: { items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
};

describe('Seller analytics HTTP contract', () => {
  let app: INestApplication;
  const analytics = { dashboard: jest.fn(), products: jest.fn(), overview: jest.fn() };
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(SellerAnalyticsService).useValue(analytics)
      .overrideGuard(AuthGuard).useClass(MatrixAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: 'http://localhost:3000' }));
    await app.init();
  });
  beforeEach(() => { jest.clearAllMocks(); analytics.dashboard.mockResolvedValue(dashboard); analytics.products.mockResolvedValue(productPage); analytics.overview.mockResolvedValue(overview); });
  afterAll(async () => app.close());

  it('enforces authentication/role, private caching, ownership and exact dashboard output', async () => {
    await request(app.getHttpServer()).get('/api/v1/seller/dashboard?from=2026-08-01&to=2026-08-07').expect(401);
    await request(app.getHttpServer()).get('/api/v1/seller/dashboard?from=2026-08-01&to=2026-08-07').set('Authorization', 'Bearer buyer').expect(403);
    const response = await request(app.getHttpServer()).get('/api/v1/seller/dashboard?from=2026-08-01&to=2026-08-07&granularity=DAY').set('Authorization', 'Bearer seller').expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual(dashboard);
    expect(analytics.dashboard).toHaveBeenCalledWith(users.seller!.id, { from: '2026-08-01', to: '2026-08-07', granularity: 'DAY' });
  });

  it.each(['from=2026-08-08&to=2026-08-01', 'from=2025-01-01&to=2026-08-01', 'from=2026-08-01&to=2026-08-07&shopId=foreign'])('rejects malformed or client-selected dashboard ranges: %s', async (query) => {
    const response = await request(app.getHttpServer()).get(`/api/v1/seller/dashboard?${query}`).set('Authorization', 'Bearer seller').expect(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(analytics.dashboard).not.toHaveBeenCalled();
  });

  it('bounds product analytics pagination and binds cursor input to the seller request', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/seller/analytics/products?from=2026-08-01&to=2026-08-07&limit=100&cursor=abc_DEF').set('Authorization', 'Bearer seller').expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual(productPage);
    expect(analytics.products).toHaveBeenCalledWith(users.seller!.id, { from: '2026-08-01', to: '2026-08-07', granularity: 'DAY', limit: 100, cursor: 'abc_DEF' });
    await request(app.getHttpServer()).get('/api/v1/seller/analytics/products?from=2026-08-01&to=2026-08-07&limit=101').set('Authorization', 'Bearer seller').expect(400);
  });

  it('enforces seller auth, owner-scoped overview input and exact response validation', async () => {
    await request(app.getHttpServer()).get('/api/v1/seller/analytics/overview?preset=today').expect(401);
    await request(app.getHttpServer()).get('/api/v1/seller/analytics/overview?preset=today').set('Authorization', 'Bearer buyer').expect(403);
    const response = await request(app.getHttpServer()).get('/api/v1/seller/analytics/overview?preset=today&page=1&pageSize=10').set('Authorization', 'Bearer seller').expect(200);
    expect(response.headers['cache-control']).toBe('private, max-age=30, stale-while-revalidate=60');
    expect(response.body).toEqual(overview);
    expect(analytics.overview).toHaveBeenCalledWith(users.seller!.id, { preset: 'today', page: 1, pageSize: 10 });
    await request(app.getHttpServer()).get('/api/v1/seller/analytics/overview?preset=today&shopId=foreign').set('Authorization', 'Bearer seller').expect(400);
    expect(analytics.overview).toHaveBeenCalledTimes(1);
  });
});

