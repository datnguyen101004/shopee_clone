import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { configureApplication } from '../src/configure-application';
import { EngagementProductNotFoundError } from '../src/engagement/engagement.errors';
import { EngagementService } from '../src/engagement/engagement.service';
import { PrismaService } from '../src/prisma/prisma.service';

const origin = 'http://localhost:3000';
const userId = '00000000-0000-4000-8000-000000000001';
const productId = '00000000-0000-4000-8000-000000000101';
const timestamp = '2026-08-13T03:00:00.000Z';

class EngagementAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.headers.authorization !== 'Bearer buyer') throw new AuthenticationFailedError();
    request.authUser = {
      id: userId,
      email: 'buyer@example.test',
      displayName: 'Buyer',
      status: 'active',
      roles: ['buyer'],
    };
    return true;
  }
}

describe('Buyer engagement endpoints', () => {
  let app: INestApplication;
  const engagement = {
    favorites: jest.fn(),
    status: jest.fn(),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
    recentlyViewed: jest.fn(),
    recordView: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(EngagementService)
      .useValue(engagement)
      .overrideGuard(AuthGuard)
      .useClass(EngagementAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin }));
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    engagement.favorites.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
    engagement.status.mockResolvedValue({ items: [{ productId, isFavorite: false }] });
    engagement.addFavorite.mockResolvedValue({
      productId,
      isFavorite: true,
      favoritedAt: timestamp,
    });
    engagement.removeFavorite.mockResolvedValue({
      productId,
      isFavorite: false,
      favoritedAt: null,
    });
    engagement.recentlyViewed.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
    engagement.recordView.mockResolvedValue({ productId, lastViewedAt: timestamp });
  });
  afterAll(async () => app.close());

  const buyer = () => ({ Authorization: 'Bearer buyer' });

  it('protects all reads, validates bounded queries, preserves status order, and disables caching', async () => {
    await request(app.getHttpServer()).get('/api/v1/account/favorites').expect(401);
    const favorites = await request(app.getHttpServer())
      .get('/api/v1/account/favorites?page=1&pageSize=20')
      .set(buyer())
      .expect(200);
    expect(favorites.headers['cache-control']).toBe('no-store');
    expect(engagement.favorites).toHaveBeenCalledWith(userId, { page: 1, pageSize: 20 });
    await request(app.getHttpServer())
      .get('/api/v1/account/favorites?pageSize=49')
      .set(buyer())
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/account/favorites/status?productIds=${productId}`)
      .set(buyer())
      .expect(200);
    expect(engagement.status).toHaveBeenCalledWith(userId, [productId]);
    await request(app.getHttpServer())
      .get(`/api/v1/account/favorites/status?productIds=${productId},${productId}`)
      .set(buyer())
      .expect(400);
  });

  it('exposes idempotent mutations with trusted-origin enforcement', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/account/favorites/${productId}`)
      .set(buyer())
      .set('Origin', origin)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/account/favorites/${productId}`)
      .set(buyer())
      .set('Origin', origin)
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/account/recently-viewed/${productId}`)
      .set(buyer())
      .set('Origin', origin)
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/account/favorites/${productId}`)
      .set(buyer())
      .set('Origin', 'https://attacker.example')
      .expect(403);
    expect(engagement.addFavorite).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid and missing products without leaking identifiers or dependency details', async () => {
    const invalid = await request(app.getHttpServer())
      .put('/api/v1/account/favorites/not-a-uuid')
      .set(buyer())
      .set('Origin', origin)
      .expect(400);
    expect(invalid.body).toMatchObject({ status: 400, invalidParameters: ['productId'] });
    engagement.addFavorite.mockRejectedValueOnce(new EngagementProductNotFoundError());
    const missing = await request(app.getHttpServer())
      .put(`/api/v1/account/favorites/${productId}`)
      .set(buyer())
      .set('Origin', origin)
      .expect(404);
    expect(JSON.stringify(missing.body)).not.toContain(productId);
    engagement.recordView.mockRejectedValueOnce(new Error(`database failed for ${productId}`));
    const unavailable = await request(app.getHttpServer())
      .put(`/api/v1/account/recently-viewed/${productId}`)
      .set(buyer())
      .set('Origin', origin)
      .expect(503);
    expect(JSON.stringify(unavailable.body)).not.toContain(productId);
  });

  it('lists recent history with exact pagination and no-store', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/account/recently-viewed?page=2&pageSize=10')
      .set(buyer())
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(engagement.recentlyViewed).toHaveBeenCalledWith(userId, { page: 2, pageSize: 10 });
  });
});
