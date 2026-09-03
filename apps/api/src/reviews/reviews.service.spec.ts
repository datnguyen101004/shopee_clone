/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReviewsService } from './reviews.service';
import { ReviewNotFoundError } from './reviews.errors';

const review = (id: string, updatedAt: Date) => ({
  id, rating: 5, text: 'Tốt', orderLineId: '00000000-0000-4000-8000-000000000011', visibility: 'VISIBLE', version: 0,
  buyer: { displayName: 'Ngọc' }, media: [], updatedAt,
});

describe('ReviewsService public projection', () => {
  it('emits only privacy-safe visible items and an opaque next cursor', async () => {
    const prisma = {
      productReview: { findMany: jest.fn().mockResolvedValue([review('00000000-0000-4000-8000-000000000001', new Date('2026-08-15T01:00:00.000Z')), review('00000000-0000-4000-8000-000000000002', new Date('2026-08-15T00:00:00.000Z'))]) },
      product: { findFirst: jest.fn().mockResolvedValue({ ratingAverageBasisPoints: 500, ratingCount: 2 }) },
    } as any;
    const result = await new ReviewsService(prisma).publicPage('00000000-0000-4000-8000-000000000010', { rating: null, limit: 1, cursor: null });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('orderLineId');
    expect(result.items[0]).not.toHaveProperty('email');
    expect(result.page.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('cleans only expired staged assets', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const prisma = { reviewMedia: { findMany: jest.fn().mockResolvedValue([{ id: 'one', storageKey: 'one.png' }]), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) } } as any;
    await expect(new ReviewsService(prisma).cleanupExpired({ remove })).resolves.toBe(1);
    expect(remove).toHaveBeenCalledWith('one.png');
    expect(prisma.reviewMedia.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ state: 'STAGED' }) }));
  });

  it('uses the public source cart line id, scoped to its order, when creating a review', async () => {
    const line = {
      id: '00000000-0000-4000-8000-000000000099', productId: '00000000-0000-4000-8000-000000000010',
      order: { shopId: '00000000-0000-4000-8000-000000000020' }, review: null,
    };
    const created = { ...review('00000000-0000-4000-8000-000000000001', new Date()), ...line, buyer: { displayName: 'Ngọc' } };
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      productReview: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
        findUniqueOrThrow: jest.fn().mockResolvedValue(created),
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 1 }, _avg: { rating: 5 } }),
      },
      orderLine: { findFirst: jest.fn().mockResolvedValue(line) },
      product: { update: jest.fn().mockResolvedValue({}) },
      shop: { update: jest.fn().mockResolvedValue({}) },
    } as any;
    const prisma = { $transaction: (callback: (value: typeof tx) => Promise<unknown>) => callback(tx) } as any;

    await new ReviewsService(prisma).create('buyer-1', 'order-1', 'cart-line-1', 'key-1', { rating: 5, text: 'Tốt' });

    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT id FROM order_lines WHERE order_id = $1 AND source_cart_line_id = $2 FOR UPDATE',
      'order-1',
      'cart-line-1',
    );
    expect(tx.orderLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ orderId: 'order-1', sourceCartLineId: 'cart-line-1' }),
    }));
  });

  it('lists only reviews belonging to the seller current shop and exposes only that seller report status', async () => {
    const prisma = {
      productReview: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'review-1', productId: 'product-1', rating: 4, text: 'Nội dung review', visibility: 'VISIBLE',
            createdAt: new Date('2026-08-21T00:00:00.000Z'), updatedAt: new Date('2026-08-21T01:00:00.000Z'),
            product: { name: 'Sản phẩm của shop' }, sellerReports: [{ status: 'OPEN' }],
          },
        ]),
      },
    } as any;

    const result = await new ReviewsService(prisma).listSellerShopReviews('seller-1');

    expect(prisma.productReview.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { shop: { ownerId: 'seller-1' } },
      select: expect.objectContaining({ sellerReports: expect.objectContaining({ where: { sellerUserId: 'seller-1' } }) }),
    }));
    expect(result.items).toEqual([expect.objectContaining({ id: 'review-1', reportStatus: 'OPEN' })]);
    expect(result.items[0]).not.toHaveProperty('buyerUserId');
    expect(result.items[0]).not.toHaveProperty('sellerUserId');
  });

  it('returns a seller-safe not-found response path when a review is outside the seller shop', async () => {
    const tx = {
      sellerReviewReport: { findUnique: jest.fn().mockResolvedValue(null) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      productReview: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const prisma = { $transaction: (callback: (value: typeof tx) => Promise<unknown>) => callback(tx) } as any;

    await expect(new ReviewsService(prisma).submitSellerReviewReport(
      'seller-1', 'review-foreign', { reasonCode: 'ABUSIVE_CONTENT' }, 'idempotency-1', 'digest',
    )).rejects.toBeInstanceOf(ReviewNotFoundError);
    expect(tx.productReview.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'review-foreign', shop: { ownerId: 'seller-1' } },
    }));
  });

  it('reuses an open seller report instead of creating a duplicate', async () => {
    const createdAt = new Date('2026-08-21T01:00:00.000Z');
    const tx = {
      sellerReviewReport: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-report', createdAt }),
        create: jest.fn(),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      productReview: { findFirst: jest.fn().mockResolvedValue({ id: 'review-1', shopId: 'shop-1' }) },
    } as any;
    const prisma = { $transaction: (callback: (value: typeof tx) => Promise<unknown>) => callback(tx) } as any;

    await expect(new ReviewsService(prisma).submitSellerReviewReport(
      'seller-1', 'review-1', { reasonCode: 'SPAM_OR_FRAUD' }, 'idempotency-1', 'digest',
    )).resolves.toEqual({ id: 'existing-report', reviewId: 'review-1', status: 'ALREADY_SUBMITTED', createdAt: createdAt.toISOString() });
    expect(tx.sellerReviewReport.create).not.toHaveBeenCalled();
  });

  it('keeps a reported review visible without touching aggregates and writes only a safe audit summary', async () => {
    const tx = {
      moderationCommand: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      productReview: { findUnique: jest.fn().mockResolvedValue({ id: 'review-1', visibility: 'VISIBLE', version: 4, productId: 'product-1', shopId: 'shop-1' }) },
      sellerReviewReport: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      privilegedAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    } as any;
    const prisma = { $transaction: (callback: (value: typeof tx) => Promise<unknown>) => callback(tx) } as any;

    await expect(new ReviewsService(prisma).adminExecuteReviewAction(
      'admin-1', 'review-1', 'KEEP_VISIBLE', 'Review is within policy.', 4, 'idempotency-1', 'digest',
    )).resolves.toEqual(expect.objectContaining({ reviewId: 'review-1', visibility: 'VISIBLE', version: 4 }));

    expect(tx.sellerReviewReport.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { reviewId: 'review-1', status: 'OPEN' },
      data: expect.objectContaining({ status: 'RESOLVED' }),
    }));
    expect(tx.privilegedAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        targetId: 'review-1',
        action: 'NO_ACTION',
        beforeSummary: { visibility: 'VISIBLE' },
        afterSummary: { visibility: 'VISIBLE', sellerReports: 'RESOLVED' },
      }),
    }));
    expect(tx.productReview.update).toBeUndefined();
  });
});
