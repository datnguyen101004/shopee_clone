import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  PublicShopNotFoundError,
  ShopSelfFollowConflictError,
} from '../src/shop-storefront/shop-storefront.errors';
import { ShopStorefrontService } from '../src/shop-storefront/shop-storefront.service';

const origin = 'http://localhost:3000';
const userId = '00000000-0000-4000-8000-000000000001';
const shopId = '00000000-0000-4000-8000-000000000101';
const timestamp = '2026-08-14T03:00:00.000Z';

class ShopAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const incoming = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (incoming.headers.authorization !== 'Bearer buyer') throw new AuthenticationFailedError();
    incoming.authUser = {
      id: userId,
      email: 'buyer@example.test',
      displayName: 'Buyer',
      status: 'active',
      roles: ['buyer'],
    };
    return true;
  }
}

describe('Shop storefront endpoints', () => {
  let app: INestApplication;
  const storefront = {
    profile: jest.fn(),
    products: jest.fn(),
    status: jest.fn(),
    followedShops: jest.fn(),
    follow: jest.fn(),
    unfollow: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(ShopStorefrontService)
      .useValue(storefront)
      .overrideGuard(AuthGuard)
      .useClass(ShopAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    storefront.profile.mockResolvedValue({ id: shopId, slug: 'demo-shop' });
    storefront.products.mockResolvedValue({ shopId, items: [] });
    storefront.status.mockResolvedValue({ items: [{ shopId, isFollowing: false }] });
    storefront.followedShops.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
    storefront.follow.mockResolvedValue({
      shopId,
      isFollowing: true,
      followedAt: timestamp,
      followerCount: 1,
    });
    storefront.unfollow.mockResolvedValue({
      shopId,
      isFollowing: false,
      followedAt: null,
      followerCount: 0,
    });
  });

  afterAll(async () => app.close());

  const buyer = () => ({ Authorization: 'Bearer buyer' });

  it('serves non-personalized profile and catalog with strict queries and no-store', async () => {
    const profile = await request(app.getHttpServer()).get('/api/v1/shops/demo-shop').expect(200);
    expect(profile.headers['cache-control']).toBe('no-store');
    const products = await request(app.getHttpServer())
      .get('/api/v1/shops/demo-shop/products?q=dien%20thoai&page=2&pageSize=24')
      .expect(200);
    expect(products.headers['cache-control']).toBe('no-store');
    expect(storefront.products).toHaveBeenCalledWith('demo-shop', {
      q: 'dien thoai',
      category: null,
      sort: 'relevance',
      page: 2,
      pageSize: 24,
    });
    await request(app.getHttpServer())
      .get('/api/v1/shops/demo-shop/products?location=private')
      .expect(400);
    await request(app.getHttpServer()).get('/api/v1/shops/INVALID').expect(404);
  });

  it('protects buyer state, preserves batch input, and validates canonical ids', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/account/followed-shops/status?shopIds=${shopId}`)
      .expect(401);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/account/followed-shops/status?shopIds=${shopId}`)
      .set(buyer())
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(storefront.status).toHaveBeenCalledWith(userId, [shopId]);
    await request(app.getHttpServer())
      .get(`/api/v1/account/followed-shops/status?shopIds=${shopId},${shopId}`)
      .set(buyer())
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/account/followed-shops/not-a-uuid')
      .set(buyer())
      .set('Origin', origin)
      .expect(400);
  });

  it('lists followed shops with strict pagination, auth, and no-store', async () => {
    await request(app.getHttpServer()).get('/api/v1/account/followed-shops').expect(401);
    const response = await request(app.getHttpServer())
      .get('/api/v1/account/followed-shops?page=2&pageSize=10')
      .set(buyer())
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(storefront.followedShops).toHaveBeenCalledWith(userId, { page: 2, pageSize: 10 });
    await request(app.getHttpServer())
      .get('/api/v1/account/followed-shops?page=1&page=2')
      .set(buyer())
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/account/followed-shops?ownerId=private')
      .set(buyer())
      .expect(400);
  });

  it('enforces trusted origin and returns idempotent mutation confirmations', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/account/followed-shops/${shopId}`)
      .set(buyer())
      .set('Origin', origin)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/account/followed-shops/${shopId}`)
      .set(buyer())
      .set('Origin', origin)
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/account/followed-shops/${shopId}`)
      .set(buyer())
      .set('Origin', 'https://attacker.example')
      .expect(403);
    expect(storefront.follow).toHaveBeenCalledTimes(1);
  });

  it('uses uniform safe errors without leaking identifiers or database details', async () => {
    storefront.profile.mockRejectedValueOnce(new PublicShopNotFoundError());
    const missing = await request(app.getHttpServer())
      .get('/api/v1/shops/missing-shop')
      .expect(404);
    expect(JSON.stringify(missing.body)).not.toContain('missing-shop');
    storefront.follow.mockRejectedValueOnce(new ShopSelfFollowConflictError());
    await request(app.getHttpServer())
      .put(`/api/v1/account/followed-shops/${shopId}`)
      .set(buyer())
      .set('Origin', origin)
      .expect(409);
    storefront.unfollow.mockRejectedValueOnce(new Error(`database failed for ${shopId}`));
    const unavailable = await request(app.getHttpServer())
      .delete(`/api/v1/account/followed-shops/${shopId}`)
      .set(buyer())
      .set('Origin', origin)
      .expect(503);
    expect(JSON.stringify(unavailable.body)).not.toContain(shopId);
    storefront.followedShops.mockRejectedValueOnce(new Error(`query failed for ${shopId}`));
    const listFailure = await request(app.getHttpServer())
      .get('/api/v1/account/followed-shops')
      .set(buyer())
      .expect(503);
    expect(JSON.stringify(listFailure.body)).not.toContain(shopId);
  });

  it('publishes all five route shapes in OpenAPI', async () => {
    const document = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(Object.keys(document.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/shops/{shopSlug}',
        '/api/v1/shops/{shopSlug}/products',
        '/api/v1/account/followed-shops',
        '/api/v1/account/followed-shops/status',
        '/api/v1/account/followed-shops/{shopId}',
      ]),
    );
    expect(
      document.body.paths['/api/v1/shops/{shopSlug}'].get.responses['200'].content[
        'application/json'
      ].schema.required,
    ).toEqual(expect.arrayContaining(['id', 'slug', 'followerCount', 'categories']));
  });
});
