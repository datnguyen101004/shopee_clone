import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthService } from '../src/auth/auth.service';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { configureApplication } from '../src/configure-application';
import {
  ProductStatus,
  ShopStatus,
  UserStatus,
  VariantStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest = process.env.RUN_CART_DATABASE_TESTS === '1' ? describe : describe.skip;
const userId = '00000000-0000-4000-8000-000000009970';
const bearer = 'Bearer valid.cart.session';

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('Authenticated cart HTTP and browser security with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let variantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthTokenService)
      .useValue({
        verifyAccess(token: string) {
          if (token !== 'valid.cart.session') throw new Error('invalid token');
          return { sub: userId, sid: '00000000-0000-4000-8000-000000009971' };
        },
      })
      .overrideProvider(AuthService)
      .useValue({
        authenticateAccess: jest.fn().mockResolvedValue({
          id: userId,
          email: 't16-http@example.test',
          displayName: 'T16 HTTP',
          status: 'active',
          roles: ['buyer'],
        }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test' }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.user.create({
      data: {
        id: userId,
        email: 't16-http@example.test',
        displayName: 'T16 HTTP',
        status: UserStatus.ACTIVE,
      },
    });
    variantId = (
      await prisma.productVariant.findFirstOrThrow({
        where: {
          status: VariantStatus.ACTIVE,
          deletedAt: null,
          inventory: { quantityOnHand: { gt: 0 } },
          product: {
            status: ProductStatus.ACTIVE,
            deletedAt: null,
            category: { isActive: true, deletedAt: null },
            shop: { status: ShopStatus.ACTIVE, deletedAt: null },
          },
        },
        select: { id: true },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.cart.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cart.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app?.close();
  });

  it('requires a valid bearer session for reads and mutations', async () => {
    const read = await request(app.getHttpServer()).get('/api/v1/cart').expect(401);
    expect(read.headers['cache-control']).toBe('private, no-store');
    expect(read.body).toMatchObject({
      type: 'https://shopee-clone.local/problems/authentication-failed',
      status: 401,
    });
    await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ variantId, quantity: 1 })
      .expect(401);
    expect(await prisma.cart.count({ where: { userId } })).toBe(0);
  });

  it('returns a private authenticated empty read without creating a cookie', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', bearer)
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.etag).toBe('"cart-0"');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).toMatchObject({ owner: 'authenticated', version: 0, groups: [] });
  });

  it('denies missing/untrusted Origin and form-compatible payloads before mutation', async () => {
    const body = { variantId, quantity: 1 };
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('If-Match', '"cart-0"')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'https://attacker.test')
      .set('If-Match', '"cart-0"')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .type('form')
      .send(body)
      .expect(415);
  });

  it('persists only the account cart and validates ETag versions', async () => {
    const added = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ variantId, quantity: 1 })
      .expect(200);
    expect(added.headers['set-cookie']).toBeUndefined();
    expect(added.body.cart).toMatchObject({ owner: 'authenticated', version: 1 });
    expect(added.headers.etag).toBe('"cart-1"');
    expect(await prisma.cart.count({ where: { userId } })).toBe(1);

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ variantId, quantity: 1 })
      .expect(409);
    const restored = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', bearer)
      .expect(200);
    expect(restored.body.summary.distinctLineCount).toBe(1);
    expect(restored.body.groups[0].lines[0].quantity).toBe(1);
  });

  it('rejects unknown JSON fields through the global strict DTO boundary', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', bearer)
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"cart-0"')
      .send({ variantId, quantity: 1, userId })
      .expect(400);
  });
});
