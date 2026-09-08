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
import { ReviewNotFoundError } from '../src/reviews/reviews.errors';
import { ReviewsService } from '../src/reviews/reviews.service';

const users: Record<string, AuthUser> = {
  buyer: { id: '00000000-0000-4000-8000-000000000001', email: 'buyer@example.test', displayName: 'Buyer Example', status: 'active', roles: ['buyer'] },
  seller: { id: '00000000-0000-4000-8000-000000000002', email: 'seller@example.test', displayName: 'Seller Example', status: 'active', roles: ['buyer', 'seller'] },
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

describe('Seller review report E2E endpoints', () => {
  let app: INestApplication;
  const reviewsService = {
    listSellerShopReviews: jest.fn(),
    submitSellerReviewReport: jest.fn(),
  };
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
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: 'http://localhost:3000' }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('lists only the authenticated seller review projection with private caching', async () => {
    reviewsService.listSellerShopReviews.mockResolvedValue({ page: 1, pageSize: 10, totalItems: 1, totalPages: 1, items: [{
      id: reviewId, productId: '123e4567-e89b-12d3-a456-426614174002', productName: 'Seller Product', rating: 4,
      comment: 'Review text', visibility: 'VISIBLE', reportStatus: 'NOT_REPORTED',
      createdAt: '2026-08-21T12:00:00.000Z', updatedAt: '2026-08-21T12:00:00.000Z',
    }] });

    const res = await request(app.getHttpServer())
      .get('/api/v1/seller/reviews')
      .set('Authorization', 'Bearer seller');

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body.items[0]).not.toHaveProperty('buyerUserId');
    expect(res.body.items[0]).not.toHaveProperty('sellerUserId');
    expect(reviewsService.listSellerShopReviews).toHaveBeenCalledWith(users.seller!.id, 1);
  });

  it('rejects a buyer from seller review routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/seller/reviews')
      .set('Authorization', 'Bearer buyer');
    expect(res.status).toBe(403);
  });

  it('submits a bounded seller report without exposing review ownership details', async () => {
    const receipt = { id: '123e4567-e89b-12d3-a456-426614174010', reviewId, status: 'SUBMITTED', createdAt: '2026-08-21T12:00:00.000Z' };
    reviewsService.submitSellerReviewReport.mockResolvedValue(receipt);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/seller/reviews/${reviewId}/reports`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', 'Bearer seller')
      .set('Idempotency-Key', idempotencyKey)
      .send({ reasonCode: 'SPAM_OR_FRAUD', details: 'Links to an unrelated payment page.' });

    expect(res.status).toBe(201);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual(receipt);
    expect(reviewsService.submitSellerReviewReport).toHaveBeenCalledWith(
      users.seller!.id,
      reviewId,
      { reasonCode: 'SPAM_OR_FRAUD', details: 'Links to an unrelated payment page.' },
      idempotencyKey,
      expect.any(String),
    );
  });

  it('returns the same sanitized 404 for a review outside the seller shop', async () => {
    reviewsService.submitSellerReviewReport.mockRejectedValue(new ReviewNotFoundError());

    const res = await request(app.getHttpServer())
      .post(`/api/v1/seller/reviews/${reviewId}/reports`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', 'Bearer seller')
      .set('Idempotency-Key', idempotencyKey)
      .send({ reasonCode: 'ABUSIVE_CONTENT' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404, type: expect.stringContaining('review-unavailable') });
  });

  it('rejects malformed bodies and idempotency keys before calling the service', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/seller/reviews/${reviewId}/reports`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', 'Bearer seller')
      .set('Idempotency-Key', 'not-a-uuid')
      .send({ reasonCode: 'COUNTERFEIT' });

    expect(res.status).toBe(400);
    expect(reviewsService.submitSellerReviewReport).not.toHaveBeenCalled();
  });
});
