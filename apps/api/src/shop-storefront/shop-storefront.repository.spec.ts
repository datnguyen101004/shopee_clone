import { ShopStorefrontRepository } from './shop-storefront.repository';

const userId = '00000000-0000-4000-8000-000000000001';
const shopId = '00000000-0000-4000-8000-000000000101';

describe('ShopStorefrontRepository', () => {
  it('scopes membership reads to the buyer and public shops', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new ShopStorefrontRepository({ shopFollower: { findMany } } as never);
    await repository.followingShopIds(userId, [shopId]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId,
        shopId: { in: [shopId] },
        shop: { status: 'ACTIVE', deletedAt: null },
      },
      select: { shopId: true },
    });
  });

  it('uses conflict-safe insert and reads back the first persisted timestamp', async () => {
    const transaction = {
      shopFollower: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ followedAt: new Date(0) }),
      },
    };
    const repository = new ShopStorefrontRepository({} as never);
    await repository.createFollow(transaction as never, userId, shopId, new Date(1));
    expect(transaction.shopFollower.createMany).toHaveBeenCalledWith({
      data: { userId, shopId, followedAt: new Date(1) },
      skipDuplicates: true,
    });
    expect(transaction.shopFollower.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { userId_shopId: { userId, shopId } },
    });
  });

  it('makes delete owner-scoped and idempotent', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const repository = new ShopStorefrontRepository({ shopFollower: { deleteMany } } as never);
    await repository.deleteFollow({ shopFollower: { deleteMany } } as never, userId, shopId);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId, shopId } });
  });
});
