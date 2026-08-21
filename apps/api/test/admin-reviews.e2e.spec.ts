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
import {
  ReviewNotFoundError,
  ReviewStaleError,
} from '../src/reviews/reviews.errors';
import { ReviewsService } from '../src/reviews/reviews.service';

const users: Record<string, AuthUser> = {
  buyer: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'buyer@example.test',
    displayName: 'Buyer Example',
    status: 'active',
    roles: ['buyer'],
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

describe('Admin Reviews E2E Endpoints', () => {
  let app: INestApplication;
  const reviewsService = {
    adminGetReview: jest.fn(),
    adminListReportedReviews: jest.fn(),
    adminExecuteReviewAction: jest.fn(),
  };

  const allowedOrigin = 'http://localhost:3000';
  const reviewId = '123e4567-e89b-12d3-a456-426614174000';
  const idempotencyKey = '123e4567-e89b-12d3-a456-426614174001';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(ReviewsService)
      .useValue(reviewsService)
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

  it('GET /api/v1/admin/reviews/:reviewId returns review details for admin', async () => {
    const mockDetail = {
      id: reviewId,
      productId: '123e4567-e89b-12d3-a456-426614174002',
      productName: 'Sample Product',
      authorUserId: users.buyer!.id,
      authorDisplayName: users.buyer!.displayName,
      rating: 5,
      comment: 'Great product!',
      visibility: 'VISIBLE',
      version: 0,
      createdAt: '2026-08-21T12:00:00.000Z',
      updatedAt: '2026-08-21T12:00:00.000Z',
    };
    reviewsService.adminGetReview.mockResolvedValue(mockDetail);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/reviews/${reviewId}`)
      .set('Authorization', 'Bearer admin');

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual(mockDetail);
  });

  it('GET /api/v1/admin/reviews/reported returns a private seller-report queue only to admins', async () => {
    const queue = [{
      reviewId,
      productId: '123e4567-e89b-12d3-a456-426614174002',
      productName: 'Sample Product',
      shopId: '123e4567-e89b-12d3-a456-426614174003',
      shopName: 'Sample Shop',
      rating: 1,
      comment: 'Suspicious review text',
      visibility: 'VISIBLE',
      reportCount: 1,
      latestReportedAt: '2026-08-21T12:00:00.000Z',
    }];
    reviewsService.adminListReportedReviews.mockResolvedValue(queue);

    const allowed = await request(app.getHttpServer())
      .get('/api/v1/admin/reviews/reported')
      .set('Authorization', 'Bearer admin');
    expect(allowed.status).toBe(200);
    expect(allowed.header['cache-control']).toBe('private, no-store');
    expect(allowed.body).toEqual({ items: queue });

    const denied = await request(app.getHttpServer())
      .get('/api/v1/admin/reviews/reported')
      .set('Authorization', 'Bearer buyer');
    expect(denied.status).toBe(403);
  });

  it('GET /api/v1/admin/reviews/:reviewId returns 404 instead of 503 for a missing review', async () => {
    reviewsService.adminGetReview.mockRejectedValue(new ReviewNotFoundError());

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/reviews/fdb49322-09b3-5e97-b94a-6193ef3957e8')
      .set('Authorization', 'Bearer admin');

    expect(res.status).toBe(404);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toMatchObject({
      status: 404,
      type: expect.stringContaining('admin-resource-not-found'),
    });
  });

  it('GET /api/v1/admin/reviews/:reviewId rejects a malformed UUID before persistence', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/reviews/not-a-review-id')
      .set('Authorization', 'Bearer admin');

    expect(res.status).toBe(400);
    expect(reviewsService.adminGetReview).not.toHaveBeenCalled();
  });

  it('POST /api/v1/admin/reviews/:reviewId/actions executes HIDE action', async () => {
    const mockResult = {
      reviewId,
      visibility: 'HIDDEN',
      version: 1,
      updatedAt: '2026-08-21T12:00:00.000Z',
    };
    reviewsService.adminExecuteReviewAction.mockResolvedValue(mockResult);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/reviews/${reviewId}/actions`)
      .set('Origin', allowedOrigin)
      .set('Authorization', 'Bearer admin')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        action: 'HIDE',
        reason: 'Review contains spam links or harassment.',
        expectedVersion: 0,
      });

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual(mockResult);
  });

  it('POST /api/v1/admin/reviews/:reviewId/actions accepts KEEP_VISIBLE', async () => {
    const mockResult = { reviewId, visibility: 'VISIBLE', version: 0, updatedAt: '2026-08-21T12:00:00.000Z' };
    reviewsService.adminExecuteReviewAction.mockResolvedValue(mockResult);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/reviews/${reviewId}/actions`)
      .set('Origin', allowedOrigin)
      .set('Authorization', 'Bearer admin')
      .set('Idempotency-Key', idempotencyKey)
      .send({ action: 'KEEP_VISIBLE', reason: 'Review is critical but within marketplace policy.', expectedVersion: 0 });

    expect(res.status).toBe(200);
    expect(reviewsService.adminExecuteReviewAction).toHaveBeenCalledWith(
      users.admin!.id,
      reviewId,
      'KEEP_VISIBLE',
      expect.any(String),
      0,
      idempotencyKey,
      expect.any(String),
    );
  });

  it('POST /api/v1/admin/reviews/:reviewId/actions returns a typed stale-version conflict', async () => {
    reviewsService.adminExecuteReviewAction.mockRejectedValue(new ReviewStaleError(3));

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/reviews/${reviewId}/actions`)
      .set('Origin', allowedOrigin)
      .set('Authorization', 'Bearer admin')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        action: 'HIDE',
        reason: 'Review contains spam links or harassment.',
        expectedVersion: 0,
      });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      status: 409,
      currentVersion: 3,
      type: expect.stringContaining('review-version-conflict'),
    });
  });
});
