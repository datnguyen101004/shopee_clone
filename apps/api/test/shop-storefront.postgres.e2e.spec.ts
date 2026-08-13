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

  it('rejects the active owner self-follow policy without creating a relation', async () => {
    await expect(storefront.follow(shop.ownerId, shop.id)).rejects.toBeInstanceOf(
      ShopSelfFollowConflictError,
    );
    expect(
      await prisma.shopFollower.count({ where: { userId: shop.ownerId, shopId: shop.id } }),
    ).toBe(0);
  });
});
