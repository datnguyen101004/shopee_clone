import type { AuthUser, SellerShopProfile } from '@shopee-clone/contracts';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';
import { SellerOnboardingService } from '../src/seller-onboarding/seller-onboarding.service';

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

const profile: SellerShopProfile = {
  id: '00000000-0000-4000-8000-000000000101',
  slug: 'an-tech-shop',
  name: 'An Tech Shop',
  description: 'Linh kiện',
  logoUrl: null,
  bannerUrl: null,
  location: 'TP. Hồ Chí Minh',
  contactPhone: '0912345678',
  contactEmail: 'shop@example.test',
  pickupAddress: {
    recipientName: 'An Nguyen',
    phoneNumber: '0912345678',
    province: 'TP. Hồ Chí Minh',
    district: 'Quận 1',
    ward: 'Phường Bến Nghé',
    addressLine: '12 Nguyễn Huệ',
  },
  returnAddress: {
    recipientName: 'An Nguyen',
    phoneNumber: '0912345678',
    province: 'TP. Hồ Chí Minh',
    district: 'Quận 1',
    ward: 'Phường Bến Nghé',
    addressLine: '12 Nguyễn Huệ',
  },
  status: 'inactive',
  onboardingStatus: 'pending_approval',
  onboardingReason: null,
  canSell: false,
  createdAt: '2026-08-15T01:00:00.000Z',
  updatedAt: '2026-08-15T01:00:00.000Z',
};

describe('Seller onboarding endpoints', () => {
  let app: INestApplication;
  const onboarding = {
    workspace: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateRegistration: jest.fn(),
    approve: jest.fn(),
  };
  const allowedOrigin = 'http://localhost:3000';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(SellerOnboardingService)
      .useValue(onboarding)
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
    onboarding.workspace.mockResolvedValue({ shop: null, defaultAddress: null });
    onboarding.create.mockResolvedValue(profile);
    onboarding.update.mockResolvedValue(profile);
    onboarding.updateRegistration.mockResolvedValue(profile);
    onboarding.approve.mockResolvedValue({
      ...profile,
      status: 'active',
      onboardingStatus: 'approved',
      canSell: true,
    });
  });

  afterAll(async () => app.close());

  it('lets buyers register while preserving seller/admin operation boundaries and no-store', async () => {
    await request(app.getHttpServer()).get('/api/v1/seller/shop/workspace').expect(401);
    const workspace = await request(app.getHttpServer())
      .get('/api/v1/seller/shop/workspace')
      .set('Authorization', 'Bearer buyer')
      .expect(200);
    expect(workspace.headers['cache-control']).toBe('no-store');
    expect(workspace.body).toEqual({ shop: null, defaultAddress: null });

    await request(app.getHttpServer())
      .post('/api/v1/seller/shop')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', allowedOrigin)
      .send({ slug: 'bad slug' })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/api/v1/seller/shop/registration')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', allowedOrigin)
      .send({ name: 'Corrected shop' })
      .expect(200);
    expect(onboarding.updateRegistration).toHaveBeenCalledWith(users.buyer!.id, {
      name: 'Corrected shop',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/shops/${profile.id}/approval`)
      .set('Authorization', 'Bearer seller')
      .set('Origin', allowedOrigin)
      .send({ decision: 'approve', reason: 'Shop identity looks complete' })
      .expect(403);

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/admin/shops/${profile.id}/approval`)
      .set('Authorization', 'Bearer admin')
      .set('Origin', allowedOrigin)
      .send({ decision: 'approve', reason: 'Shop identity looks complete' })
      .expect(200);
    expect(approved.headers['cache-control']).toBe('no-store');
    expect(onboarding.approve).toHaveBeenCalledWith(profile.id, {
      decision: 'approve',
      reason: 'Shop identity looks complete',
    }, users.admin!.id);
  });
});
