import { EngagementRepository } from './engagement.repository';

const userId = '00000000-0000-4000-8000-000000000001';
const productId = '00000000-0000-4000-8000-000000000101';

describe('EngagementRepository', () => {
  it('keeps favorite reads owner-scoped and deterministically ordered', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new EngagementRepository({ productFavorite: { findMany } } as never);
    await repository.listFavoriteRows(userId, 20, 10);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        skip: 20,
        take: 10,
        orderBy: [{ favoritedAt: 'desc' }, { productId: 'asc' }],
      }),
    );
  });

  it('preserves an existing favorite timestamp and makes deletion idempotent', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = jest.fn().mockResolvedValue({ favoritedAt: new Date(0) });
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const repository = new EngagementRepository({
      productFavorite: { createMany, findUniqueOrThrow, deleteMany },
    } as never);
    await repository.upsertFavorite(userId, productId, new Date(0));
    expect(createMany).toHaveBeenCalledWith({
      data: { userId, productId, favoritedAt: new Date(0) },
      skipDuplicates: true,
    });
    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { userId_productId: { userId, productId } },
    });
    await repository.deleteFavorite(userId, productId);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId, productId } });
  });

  it('trims only the same buyer after a deterministic history upsert', async () => {
    const overflowId = '00000000-0000-4000-8000-000000000999';
    const transaction = {
      recentlyViewedProduct: {
        upsert: jest.fn().mockResolvedValue({ productId }),
        findMany: jest.fn().mockResolvedValue([{ productId: overflowId }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new EngagementRepository({} as never);
    await repository.upsertRecentAndTrim(transaction as never, userId, productId, new Date(0));
    expect(transaction.recentlyViewedProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        skip: 100,
        orderBy: [{ lastViewedAt: 'desc' }, { productId: 'asc' }],
      }),
    );
    expect(transaction.recentlyViewedProduct.deleteMany).toHaveBeenCalledWith({
      where: { userId, productId: { in: [overflowId] } },
    });
  });
});
