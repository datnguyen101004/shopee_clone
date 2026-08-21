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
import { SellerModerationNoticesService } from '../src/seller-moderation-notices/seller-moderation-notices.service';

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

describe('Seller Moderation Notices E2E Endpoints', () => {
  let app: INestApplication;
  const noticesService = {
    listNotices: jest.fn(),
    markRead: jest.fn(),
  };

  const allowedOrigin = 'http://localhost:3000';
  const noticeId = '123e4567-e89b-12d3-a456-426614174000';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(SellerModerationNoticesService)
      .useValue(noticesService)
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

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/v1/seller/moderation-notices lists notices for seller', async () => {
    const mockList = {
      items: [
        {
          id: noticeId,
          targetType: 'PRODUCT',
          targetId: '123e4567-e89b-12d3-a456-426614174002',
          targetName: 'Sample Product',
          targetSlug: 'sample-product',
          action: 'PRODUCT_SUSPENDED',
          reason: 'Violated counterfeit guidelines.',
          effectiveAt: '2026-08-21T12:00:00.000Z',
          readAt: null,
        },
      ],
      unreadCount: 1,
      nextCursor: null,
    };
    noticesService.listNotices.mockResolvedValue(mockList);

    const res = await request(app.getHttpServer())
      .get('/api/v1/seller/moderation-notices?unreadOnly=true')
      .set('Authorization', 'Bearer seller');

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual(mockList);
  });

  it('GET /api/v1/seller/moderation-notices rejects buyer without seller role with 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/seller/moderation-notices')
      .set('Authorization', 'Bearer buyer');

    expect(res.status).toBe(403);
  });

  it('POST /api/v1/seller/moderation-notices/:noticeId/read marks notice as read', async () => {
    const mockResult = {
      noticeId,
      readAt: '2026-08-21T12:05:00.000Z',
    };
    noticesService.markRead.mockResolvedValue(mockResult);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/seller/moderation-notices/${noticeId}/read`)
      .set('Origin', allowedOrigin)
      .set('Authorization', 'Bearer seller');

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual(mockResult);
  });
});
