import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { ShopStatus, UserStatus } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { ShopSelfFollowConflictError } from '../src/shop-storefront/shop-storefront.errors';
import { ShopStorefrontService } from '../src/shop-storefront/shop-storefront.service';

const databaseTest =
  process.env.RUN_SHOP_STOREFRONT_DATABASE_TESTS === '1' ? describe : describe.skip;
const firstUserId = '00000000-0000-4000-8000-000000009921';
const secondUserId = '00000000-0000-4000-8000-000000009922';

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('Shop storefront with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storefront: ShopStorefrontService;
  let shop: { id: string; slug: string; ownerId: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    storefront = app.get(ShopStorefrontService);
    await prisma.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } });
    await prisma.user.createMany({
      data: [
        {
          id: firstUserId,
          email: 't15-first@example.test',
          displayName: 'T15 First',
          status: UserStatus.ACTIVE,
        },
        {
          id: secondUserId,
          email: 't15-second@example.test',
          displayName: 'T15 Second',
          status: UserStatus.ACTIVE,
        },
      ],
    });
    const fixture = await prisma.product.findFirstOrThrow({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        shop: { status: ShopStatus.ACTIVE, deletedAt: null },
        category: { isActive: true, deletedAt: null },
        variants: { some: { status: 'ACTIVE', deletedAt: null, inventory: { isNot: null } } },
      },
      select: { shop: { select: { id: true, slug: true, ownerId: true } } },
      orderBy: { id: 'asc' },
    });
    shop = fixture.shop;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.shop.updateMany({
        where: { id: shop?.id },
        data: { status: ShopStatus.ACTIVE },
      });
      await prisma.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } });
    }
    await app?.close();
  });

  it('composes public weighted aggregates and deterministic scoped catalog pages', async () => {
    const profile = await storefront.profile(shop.slug);
    const page = await storefront.products(shop.slug, {
      q: null,
      category: null,
      sort: 'newest',
      page: 1,
      pageSize: 2,
    });
    expect(profile.id).toBe(shop.id);
    expect(profile.activeProductCount).toBeGreaterThan(0);
    expect(profile.ratingAverageBasisPoints).toBeGreaterThanOrEqual(0);
    expect(
      profile.categories.every(({ productCount }) => productCount <= profile.activeProductCount),
    ).toBe(true);
    expect(page.shopId).toBe(shop.id);
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.items.every(({ shop: itemShop }) => itemShop.name === profile.name)).toBe(true);
  });

  it('isolates buyers and preserves one first timestamp under concurrent idempotent writes', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => storefront.follow(firstUserId, shop.id)),
    );
    expect(new Set(results.map(({ followedAt }) => followedAt)).size).toBe(1);
    expect(
      await prisma.shopFollower.count({ where: { userId: firstUserId, shopId: shop.id } }),
    ).toBe(1);
    await expect(storefront.status(secondUserId, [shop.id])).resolves.toEqual({
      items: [{ shopId: shop.id, isFollowing: false }],
    });
    const deletes = await Promise.all(
      Array.from({ length: 5 }, () => storefront.unfollow(firstUserId, shop.id)),
    );
    expect(deletes.every(({ isFollowing }) => !isFollowing)).toBe(true);
    expect(
      await prisma.shopFollower.count({ where: { userId: firstUserId, shopId: shop.id } }),
    ).toBe(0);

    const mixed = await Promise.all([
      storefront.follow(firstUserId, shop.id),
      storefront.unfollow(firstUserId, shop.id),
      storefront.follow(firstUserId, shop.id),
      storefront.unfollow(firstUserId, shop.id),
    ]);
    expect(mixed).toHaveLength(4);
    expect(
      await prisma.shopFollower.count({ where: { userId: firstUserId, shopId: shop.id } }),
    ).toBeLessThanOrEqual(1);
  });

  it('removes an owned relation after a shop becomes inactive and returns a private-safe null count', async () => {
    await storefront.follow(firstUserId, shop.id);
    await prisma.shop.update({ where: { id: shop.id }, data: { status: ShopStatus.INACTIVE } });
    try {
      await expect(storefront.status(firstUserId, [shop.id])).resolves.toEqual({
        items: [{ shopId: shop.id, isFollowing: false }],
      });
      await expect(storefront.unfollow(firstUserId, shop.id)).resolves.toEqual({
        shopId: shop.id,
        isFollowing: false,
        followedAt: null,
        followerCount: null,
      });
    } finally {
      await prisma.shop.update({ where: { id: shop.id }, data: { status: ShopStatus.ACTIVE } });
    }
  });

  it('lists deterministic pages with current grouped counts and unrelated-user isolation', async () => {
    const shops = await prisma.shop.findMany({
      where: { status: ShopStatus.ACTIVE, deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 3,
    });
    expect(shops).toHaveLength(3);
    const shopIds = shops.map(({ id }) => id);
    const followedAt = new Date('2026-08-14T04:00:00.000Z');
    await prisma.shopFollower.deleteMany({
      where: { userId: { in: [firstUserId, secondUserId] }, shopId: { in: shopIds } },
    });
    await prisma.shopFollower.createMany({
      data: [
        ...shopIds.map((shopId) => ({ userId: firstUserId, shopId, followedAt })),
        { userId: secondUserId, shopId: shopIds[0]!, followedAt },
      ],
    });

    const firstPage = await storefront.followedShops(firstUserId, { page: 1, pageSize: 2 });
    const secondPage = await storefront.followedShops(firstUserId, { page: 2, pageSize: 2 });
    const outOfRange = await storefront.followedShops(firstUserId, { page: 3, pageSize: 2 });
    expect(firstPage.items.map(({ shopId }) => shopId)).toEqual(shopIds.slice(0, 2));
    expect(secondPage.items.map(({ shopId }) => shopId)).toEqual(shopIds.slice(2));
    expect(firstPage.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(outOfRange).toEqual({
      items: [],
      pagination: { page: 3, pageSize: 2, totalItems: 3, totalPages: 2 },
    });
    for (const item of [...firstPage.items, ...secondPage.items]) {
      expect(item.availability).toBe('available');
      if (item.availability === 'available') {
        await expect(prisma.shopFollower.count({ where: { shopId: item.shopId } })).resolves.toBe(
          item.shop.followerCount,
        );
      }
    }
    await expect(
      storefront.followedShops(secondUserId, { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      items: [{ shopId: shopIds[0] }],
      pagination: { totalItems: 1, totalPages: 1 },
    });
  });

  it('retains private-safe inactive and soft-deleted rows while allowing removal', async () => {
    await storefront.follow(firstUserId, shop.id);
    const assertUnavailable = async () => {
      const page = await storefront.followedShops(firstUserId, { page: 1, pageSize: 20 });
      const item = page.items.find(({ shopId }) => shopId === shop.id);
      expect(item).toEqual({
        availability: 'unavailable',
        shopId: shop.id,
        followedAt: expect.any(String),
        shop: { id: shop.id, name: expect.any(String), href: null },
      });
      expect(Object.keys(item!.shop).sort()).toEqual(['href', 'id', 'name']);
    };
    try {
      await prisma.shop.update({ where: { id: shop.id }, data: { status: ShopStatus.INACTIVE } });
      await assertUnavailable();
      await prisma.shop.update({
        where: { id: shop.id },
        data: { status: ShopStatus.ACTIVE, deletedAt: new Date('2026-08-14T05:00:00.000Z') },
      });
      await assertUnavailable();
      await expect(storefront.unfollow(firstUserId, shop.id)).resolves.toMatchObject({
        shopId: shop.id,
        isFollowing: false,
        followerCount: null,
      });
    } finally {
      await prisma.shop.update({
        where: { id: shop.id },
        data: { status: ShopStatus.ACTIVE, deletedAt: null },
      });
    }
  });

  it('removes followed rows through the existing hard-delete cascade', async () => {
    const temporary = await prisma.shop.create({
      data: {
        ownerId: secondUserId,
        slug: `t151-cascade-${Date.now()}`,
        name: 'T15.1 Cascade Shop',
        location: 'Hà Nội',
        status: ShopStatus.ACTIVE,
      },
      select: { id: true },
    });
    await storefront.follow(firstUserId, temporary.id);
    expect(
      await prisma.shopFollower.count({ where: { userId: firstUserId, shopId: temporary.id } }),
    ).toBe(1);
    await prisma.shop.delete({ where: { id: temporary.id } });
    expect(
      await prisma.shopFollower.count({ where: { userId: firstUserId, shopId: temporary.id } }),
    ).toBe(0);
    const page = await storefront.followedShops(firstUserId, { page: 1, pageSize: 20 });
    expect(page.items.some(({ shopId }) => shopId === temporary.id)).toBe(false);
  });

  it('rejects the active owner self-follow policy without creating a relation', async () => {
    await expect(storefront.follow(shop.ownerId, shop.id)).rejects.toBeInstanceOf(
      ShopSelfFollowConflictError,
    );
    expect(
      await prisma.shopFollower.count({ where: { userId: shop.ownerId, shopId: shop.id } }),
    ).toBe(0);
  });
});
