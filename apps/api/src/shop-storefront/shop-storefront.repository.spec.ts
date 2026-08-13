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

  it('reads one deterministic owner page and grouped public counts', async () => {
    const count = jest.fn().mockResolvedValue(2);
    const findMany = jest.fn().mockResolvedValue([]);
    const groupBy = jest.fn().mockResolvedValue([{ shopId, _count: { _all: 2 } }]);
    const repository = new ShopStorefrontRepository({
      shopFollower: { count, findMany, groupBy },
    } as never);
    await expect(repository.countFollowedShops(userId)).resolves.toBe(2);
    await repository.followedShopPage(userId, 20, 10);
    await repository.followerCounts([shopId]);
    expect(count).toHaveBeenCalledWith({ where: { userId } });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: [{ followedAt: 'desc' }, { shopId: 'asc' }],
        skip: 20,
        take: 10,
      }),
    );
    expect(groupBy).toHaveBeenCalledWith({
      by: ['shopId'],
      where: { shopId: { in: [shopId] } },
      _count: { _all: true },
    });
  });

  it('avoids a grouped query when a page has no available shops', async () => {
    const groupBy = jest.fn();
    const repository = new ShopStorefrontRepository({ shopFollower: { groupBy } } as never);
    await expect(repository.followerCounts([])).resolves.toEqual([]);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('makes delete owner-scoped and idempotent', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const repository = new ShopStorefrontRepository({ shopFollower: { deleteMany } } as never);
    await repository.deleteFollow({ shopFollower: { deleteMany } } as never, userId, shopId);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId, shopId } });
  });
});
