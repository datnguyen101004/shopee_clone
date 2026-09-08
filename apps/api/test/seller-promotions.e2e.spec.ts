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
import { SellerPromotionsService } from '../src/seller-promotions/seller-promotions.service';

const seller: AuthUser = { id: '00000000-0000-4000-0000-000000000002', email: 'seller@example.test', displayName: 'Seller', status: 'active', roles: ['buyer', 'seller'] };
class MatrixAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.headers.authorization !== 'Bearer seller') throw new AuthenticationFailedError();
    req.authUser = seller;
    return true;
  }
}

const voucher = { id: '00000000-0000-4000-8000-000000000011', issuer: 'SHOP', code: 'SHOP10', name: 'Shop sale', benefitType: 'FIXED_AMOUNT', fixedAmountMinor: 10000, percentageBasisPoints: null, maximumDiscountMinor: null, minimumSpendMinor: 0, startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-31T00:00:00.000Z', usageLimit: 10, perBuyerLimit: 1, productIds: [], state: 'SCHEDULED', usedCount: 0, version: 1, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };
const discount = { id: '00000000-0000-4000-8000-000000000012', name: 'Summer', startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-31T00:00:00.000Z', products: [{ productId: '00000000-0000-4000-8000-000000000013', discountBasisPoints: 1500 }], state: 'SCHEDULED', version: 1, archivedAt: null, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };

describe('Seller promotions HTTP contract', () => {
  let app: INestApplication;
  const service = { listVouchers: jest.fn(), getVoucher: jest.fn(), createVoucher: jest.fn(), updateVoucher: jest.fn(), actionVoucher: jest.fn(), deleteVoucher: jest.fn(), listDiscounts: jest.fn(), getDiscount: jest.fn(), createDiscount: jest.fn(), updateDiscount: jest.fn(), actionDiscount: jest.fn() };
  const origin = 'http://localhost:3000';
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(SellerPromotionsService).useValue(service)
      .overrideGuard(AuthGuard).useClass(MatrixAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin }));
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    service.listVouchers.mockResolvedValue({ sellerPromotionVersion: 'seller-promotions-v1', items: [voucher], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
    service.getVoucher.mockResolvedValue(voucher); service.createVoucher.mockResolvedValue(voucher); service.updateVoucher.mockResolvedValue({ ...voucher, version: 2 }); service.actionVoucher.mockResolvedValue({ ...voucher, state: 'PAUSED', version: 2 }); service.deleteVoucher.mockResolvedValue({ deleted: true });
    service.listDiscounts.mockResolvedValue({ sellerPromotionVersion: 'seller-promotions-v1', items: [discount], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
    service.getDiscount.mockResolvedValue(discount); service.createDiscount.mockResolvedValue(discount); service.updateDiscount.mockResolvedValue({ ...discount, version: 2 }); service.actionDiscount.mockResolvedValue({ ...discount, state: 'PAUSED', version: 2 });
  });
  afterAll(async () => app.close());

  it('covers voucher list/detail/create/update/action headers, origin, and exact service inputs', async () => {
    await request(app.getHttpServer()).get('/api/v1/seller/promotions/vouchers').expect(401);
    const list = await request(app.getHttpServer()).get('/api/v1/seller/promotions/vouchers?state=SCHEDULED&page=1').set('Authorization', 'Bearer seller').expect(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(service.listVouchers).toHaveBeenCalledWith(seller.id, { state: 'SCHEDULED', page: 1 });
    const body = { name: 'New', benefitType: 'FIXED_AMOUNT', fixedAmountMinor: 10000, percentageBasisPoints: null, maximumDiscountMinor: null, minimumSpendMinor: 0, startsAt: voucher.startsAt, endsAt: voucher.endsAt, usageLimit: 10, perBuyerLimit: 1, productIds: [] };
    await request(app.getHttpServer()).post('/api/v1/seller/promotions/vouchers').set('Authorization', 'Bearer seller').set('Origin', 'https://attacker.test').set('Idempotency-Key', '00000000-0000-4000-8000-000000000021').send(body).expect(403);
    const created = await request(app.getHttpServer()).post('/api/v1/seller/promotions/vouchers').set('Authorization', 'Bearer seller').set('Origin', origin).set('Idempotency-Key', '00000000-0000-4000-8000-000000000021').send(body).expect(201);
    expect(created.headers.etag).toBe('"seller-promotion-1"');
    await request(app.getHttpServer()).get(`/api/v1/seller/promotions/vouchers/${voucher.id}`).set('Authorization', 'Bearer seller').expect(200);
    await request(app.getHttpServer()).patch(`/api/v1/seller/promotions/vouchers/${voucher.id}`).set('Authorization', 'Bearer seller').set('Origin', origin).set('If-Match', '"seller-promotion-1"').send({ name: 'Edited' }).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/seller/promotions/vouchers/${voucher.id}/actions`).set('Authorization', 'Bearer seller').set('Origin', origin).set('If-Match', '"seller-promotion-1"').set('Idempotency-Key', '00000000-0000-4000-8000-000000000022').send({ action: 'PAUSE' }).expect(201);
    expect(service.actionVoucher).toHaveBeenCalledWith(seller.id, voucher.id, 1, 'PAUSE', '00000000-0000-4000-8000-000000000022');
    await request(app.getHttpServer()).delete(`/api/v1/seller/promotions/vouchers/${voucher.id}`).set('Authorization', 'Bearer seller').set('Origin', origin).set('If-Match', '"seller-promotion-2"').expect(200);
    expect(service.deleteVoucher).toHaveBeenCalledWith(seller.id, voucher.id, 2);
  });

  it('rejects client-supplied voucher codes', async () => {
    const body = {
      code: 'SHOP10',
      name: 'Giảm 20k cho đơn hàng trên 300k',
      benefitType: 'FIXED_AMOUNT',
      fixedAmountMinor: 20000,
      percentageBasisPoints: null,
      maximumDiscountMinor: null,
      minimumSpendMinor: 300000,
      startsAt: voucher.startsAt,
      endsAt: voucher.endsAt,
      usageLimit: 100,
      perBuyerLimit: 1,
      productIds: [],
    };
    const response = await request(app.getHttpServer())
      .post('/api/v1/seller/promotions/vouchers')
      .set('Authorization', 'Bearer seller')
      .set('Origin', origin)
      .set('Idempotency-Key', '00000000-0000-4000-8000-000000000031')
      .send(body)
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'INVALID_SELLER_PROMOTION_REQUEST',
      invalidParameters: ['request'],
      detail: 'Request body shape is invalid.',
    });
    expect(service.createVoucher).not.toHaveBeenCalled();
  });

  it('covers discount list/create/update/action and rejects malformed or missing concurrency headers', async () => {
    await request(app.getHttpServer()).get('/api/v1/seller/promotions/discounts?state=ACTIVE').set('Authorization', 'Bearer seller').expect(200);
    expect(service.listDiscounts).toHaveBeenCalledWith(seller.id, { state: 'ACTIVE', page: 1 });
    const body = { name: 'Summer', startsAt: discount.startsAt, endsAt: discount.endsAt, products: discount.products };
    const created = await request(app.getHttpServer()).post('/api/v1/seller/promotions/discounts').set('Authorization', 'Bearer seller').set('Origin', origin).set('Idempotency-Key', '00000000-0000-4000-8000-000000000023').send(body).expect(201);
    expect(created.headers.etag).toBe('"seller-promotion-1"');
    await request(app.getHttpServer()).patch(`/api/v1/seller/promotions/discounts/${discount.id}`).set('Authorization', 'Bearer seller').set('Origin', origin).send({ name: 'Missing etag' }).expect(400);
    await request(app.getHttpServer()).post(`/api/v1/seller/promotions/discounts/${discount.id}/actions`).set('Authorization', 'Bearer seller').set('Origin', origin).set('If-Match', '"seller-promotion-1"').set('Idempotency-Key', '00000000-0000-4000-8000-000000000024').send({ action: 'PAUSE' }).expect(201);
    expect(service.actionDiscount).toHaveBeenCalledWith(seller.id, discount.id, 1, 'PAUSE', '00000000-0000-4000-8000-000000000024');
  });
});
