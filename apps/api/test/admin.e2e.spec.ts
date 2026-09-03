import type {
  AdminDashboardResponse,
  AuthUser,
} from '@shopee-clone/contracts';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AdminService } from '../src/admin/admin.service';
import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
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
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const user = token ? users[token] : undefined;
    if (!user) throw new AuthenticationFailedError();
    req.authUser = user;
    return true;
  }
}

describe('Admin Console E2E Endpoints', () => {
  let app: INestApplication;
  const adminService = {
    dashboard: jest.fn(),
    listUsers: jest.fn(),
    getUser: jest.fn(),
    executeUserAction: jest.fn(),
    listShops: jest.fn(),
    getShop: jest.fn(),
    executeShopAction: jest.fn(),
    listCategories: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    deleteCategory: jest.fn(),
    reorderCategories: jest.fn(),
    listBanners: jest.fn(),
    createBanner: jest.fn(),
    updateBanner: jest.fn(),
    deleteBanner: jest.fn(),
    reorderBanners: jest.fn(),
    listHomepageModules: jest.fn(),
    updateHomepageModuleSettings: jest.fn(),
    listAuditEvents: jest.fn(),
    lookupProduct: jest.fn(),
    applyProductAction: jest.fn(),
  };

  const allowedOrigin = 'http://localhost:3000';


  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(AdminService)
      .useValue(adminService)
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
    adminService.dashboard.mockResolvedValue({
      adminVersion: 'admin-v1',
      generatedAt: '2026-08-20T12:00:00.000Z',
      counts: {
        usersCount: 10,
        activeUsersCount: 9,
        suspendedUsersCount: 1,
        shopsCount: 5,
        pendingShopApprovalsCount: 1,
        categoriesCount: 8,
        activeCategoriesCount: 8,
        homepageBannersCount: 2,
        enabledHomepageModulesCount: 4,
        recentAuditEventsCount: 3,
      },
    } satisfies AdminDashboardResponse);
  });

  afterAll(async () => app.close());

  describe('Authorization Matrix (Guest / Buyer / Seller / Admin)', () => {
    it('rejects unauthenticated guests with 401 Problem Details', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .expect(401);
      expect(res.body.type).toContain('problems/authentication-failed');
    });

    it('rejects buyers with 403 Problem Details without data leakage', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .set('Authorization', 'Bearer buyer')
        .expect(403);
      expect(res.body.type).toContain('problems/authorization-denied');
      expect(res.body).not.toHaveProperty('counts');
    });

    it('rejects sellers with 403 Problem Details', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .set('Authorization', 'Bearer seller')
        .expect(403);
      expect(res.body.type).toContain('problems/authorization-denied');
    });

    it('allows admin and returns private no-store headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .set('Authorization', 'Bearer admin')
        .expect(200);
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.body.counts.usersCount).toBe(10);
    });
  });

  describe('Admin Mutation Origin Security', () => {
    it('denies user action when Origin header is untrusted', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/users/00000000-0000-4000-8000-000000000002/actions')
        .set('Authorization', 'Bearer admin')
        .set('Origin', 'https://malicious-site.test')
        .send({ action: 'SUSPEND', reason: 'Valid suspension reason' })
        .expect(403);
    });

    it('allows user action when Origin header is trusted', async () => {
      adminService.executeUserAction.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        email: 'target@example.com',
        displayName: 'Target User',
        phoneNumber: null,
        status: 'SUSPENDED',
        roles: ['buyer'],
        createdAt: '2026-08-20T12:00:00.000Z',
        updatedAt: '2026-08-20T12:00:00.000Z',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/users/00000000-0000-4000-8000-000000000002/actions')
        .set('Authorization', 'Bearer admin')
        .set('Origin', allowedOrigin)
        .send({ action: 'SUSPEND', reason: 'Valid suspension reason' })
        .expect(201);

      expect(res.body.status).toBe('SUSPENDED');
      expect(adminService.executeUserAction).toHaveBeenCalled();
    });
  });

  describe('Product Inspection & Moderation E2E', () => {
    it('looks up product by slug for admin', async () => {
      adminService.lookupProduct.mockResolvedValue({
        adminVersion: 'admin-v1',
        product: {
          id: '00000000-0000-4000-8000-000000000301',
          shopId: '00000000-0000-4000-8000-000000000101',
          shopName: 'Shop Official',
          shopSlug: 'shop-official',
          shopStatus: 'ACTIVE',
          categoryId: '00000000-0000-4000-8000-000000000201',
          categoryName: 'Thời trang',
          categorySlug: 'thoi-trang',
          slug: 'ao-thun-nam',
          name: 'Áo thun nam cotton',
          description: 'Mô tả chi tiết',
          status: 'ACTIVE',
          moderationStatus: 'ACTIVE',
          ratingAverageBasisPoints: 480,
          ratingCount: 100,
          soldCount: 500,
          images: [],
          variants: [],
          createdAt: '2026-08-20T12:00:00.000Z',
          updatedAt: '2026-08-20T12:00:00.000Z',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/products/lookup?slug=ao-thun-nam')
        .set('Authorization', 'Bearer admin')
        .expect(200);

      expect(res.body.product.name).toBe('Áo thun nam cotton');
      expect(adminService.lookupProduct).toHaveBeenCalledWith('ao-thun-nam');
    });

    it('applies product moderation action with valid reason', async () => {
      adminService.applyProductAction.mockResolvedValue({
        adminVersion: 'admin-v1',
        productId: '00000000-0000-4000-8000-000000000301',
        moderationStatus: 'SUSPENDED',
        updatedAt: '2026-08-20T12:00:00.000Z',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/products/00000000-0000-4000-8000-000000000301/actions')
        .set('Authorization', 'Bearer admin')
        .set('Origin', allowedOrigin)
        .send({
          action: 'SUSPEND',
          reason: 'Counterfeit policy violation report',
        })
        .expect(201);

      expect(res.body.moderationStatus).toBe('SUSPENDED');
      expect(adminService.applyProductAction).toHaveBeenCalled();
    });
  });
});

