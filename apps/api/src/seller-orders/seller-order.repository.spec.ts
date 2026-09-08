import type { SellerOrderQueueQuery } from '@shopee-clone/contracts';

import { SellerOrderRepository } from './seller-order.repository';

describe('SellerOrderRepository pagination', () => {
  it('uses skip 20 and take 10 for page 3 with a stable order', async () => {
    const prisma = {
      shopOrder: {
        count: jest.fn().mockResolvedValue(24),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new SellerOrderRepository(prisma as never);
    const query: SellerOrderQueueQuery = {
      status: 'ALL',
      fulfillment: 'ALL',
      from: null,
      to: null,
      orderReference: null,
      page: 3,
    };

    await expect(repository.list('seller-1', query)).resolves.toEqual({
      rows: [],
      totalItems: 24,
    });
    expect(prisma.shopOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });
});
