import type { AuthUser, RoleAuditPage } from '@shopee-clone/contracts';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { MarketplaceOwnershipService } from '../src/auth/marketplace-ownership.service';
import { RoleAuthorizationService } from '../src/auth/role-authorization.service';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';

const users: Record<string, AuthUser> = {
  buyer: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'buyer@example.test',
    displayName: 'Buyer Example',
    status: 'active',
    roles: ['buyer'],
  },
  seller: {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'seller@example.test',
    displayName: 'Seller Example',
    status: 'active',
    roles: ['buyer', 'seller'],
  },
  admin: {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'admin@example.test',
    displayName: 'Admin Example',
    status: 'active',
    roles: ['buyer', 'admin'],
  },
};

class MatrixAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    const user = token ? users[token] : undefined;
    if (!user) throw new AuthenticationFailedError();
    request.authUser = user;
    return true;
  }
}

describe('Role authorization endpoints', () => {
  let app: INestApplication;
  const roles = {
    grantRole: jest.fn(),
    revokeRole: jest.fn(),
    auditPage: jest.fn(),
    bootstrapFirstAdmin: jest.fn(),
  };
  const ownership = { ownedShop: jest.fn(), ownsShop: jest.fn() };
  const allowedOrigin = 'http://localhost:3000';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(RoleAuthorizationService)
      .useValue(roles)
      .overrideProvider(MarketplaceOwnershipService)
      .useValue(ownership)
      .overrideGuard(AuthGuard)
      .useClass(MatrixAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(
      app,
      loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: allowedOrigin }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    roles.grantRole.mockResolvedValue({ userId: users.buyer!.id, roles: ['buyer', 'seller'] });
    roles.revokeRole.mockResolvedValue({ userId: users.buyer!.id, roles: ['buyer'] });
    roles.auditPage.mockResolvedValue({ items: [], nextCursor: null } satisfies RoleAuditPage);
    ownership.ownedShop.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000101',
      slug: 'seller-shop',
      name: 'Seller Shop',
      status: 'active',
    });
  });

  afterAll(async () => app.close());

  it('keeps guests at 401 and separates buyer, seller, and admin capabilities', async () => {
    await request(app.getHttpServer()).get('/api/v1/seller/shop').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/seller/shop')
      .set('Authorization', 'Bearer buyer')
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/seller/shop')
      .set('Authorization', 'Bearer admin')
      .expect(403);
    const sellerResponse = await request(app.getHttpServer())
      .get('/api/v1/seller/shop')
      .set('Authorization', 'Bearer seller')
      .expect(200);
    expect(sellerResponse.body).toEqual(expect.objectContaining({ slug: 'seller-shop' }));
    expect(sellerResponse.body).not.toHaveProperty('ownerId');

    await request(app.getHttpServer())
      .get('/api/v1/admin/role-audit')
      .set('Authorization', 'Bearer seller')
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/role-audit?limit=10')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(roles.auditPage).toHaveBeenCalledWith(10, undefined);
  });

  it('validates trusted origin and strict role commands before mutation', async () => {
    const endpoint = `/api/v1/admin/users/${users.buyer!.id}/roles`;
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Origin', allowedOrigin)
      .send({ role: 'seller', reason: 'Unauthenticated role change attempt' })
      .expect(401);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer buyer')
      .set('Origin', allowedOrigin)
      .send({ role: 'seller', reason: 'Buyer role change attempt denied' })
      .expect(403);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer seller')
      .set('Origin', allowedOrigin)
      .send({ role: 'seller', reason: 'Seller role change attempt denied' })
      .expect(403);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer admin')
      .set('Origin', 'https://attacker.example')
      .send({ role: 'seller', reason: 'Approved seller onboarding' })
      .expect(403);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer admin')
      .set('Origin', allowedOrigin)
      .send({ role: 'buyer', reason: 'Invalid buyer elevation attempt' })
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer admin')
      .set('Origin', allowedOrigin)
      .send({
        role: 'seller',
        reason: 'Approved seller onboarding',
        actorUserId: users.admin!.id,
      })
      .expect(400);
    expect(roles.grantRole).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer admin')
      .set('Origin', allowedOrigin)
      .send({ role: 'seller', reason: 'Approved seller onboarding' })
      .expect(201);
    expect(roles.grantRole).toHaveBeenCalledWith(
      users.admin!.id,
      users.buyer!.id,
      'seller',
      'Approved seller onboarding',
    );
  });

  it('has no unprefixed aliases or HTTP bootstrap surface', async () => {
    await request(app.getHttpServer()).get('/seller/shop').expect(404);
    await request(app.getHttpServer()).get('/admin/role-audit').expect(404);
    await request(app.getHttpServer()).post('/api/v1/admin/bootstrap').expect(404);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
});
