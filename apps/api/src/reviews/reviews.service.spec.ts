/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReviewsService } from './reviews.service';

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
});
