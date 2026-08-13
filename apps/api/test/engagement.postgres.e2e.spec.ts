import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { EngagementService } from '../src/engagement/engagement.service';
import { ProductStatus, UserStatus } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest = process.env.RUN_ENGAGEMENT_DATABASE_TESTS === '1' ? describe : describe.skip;
const firstUserId = '00000000-0000-4000-8000-000000009911';
const secondUserId = '00000000-0000-4000-8000-000000009912';

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('Buyer engagement with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let engagement: EngagementService;
  let activeProductIds: string[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    engagement = app.get(EngagementService);
    await prisma.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } });
    await prisma.user.createMany({
      data: [
        {
          id: firstUserId,
          email: 't14-first@example.test',
          displayName: 'T14 First',
          status: UserStatus.ACTIVE,
        },
        {
          id: secondUserId,
          email: 't14-second@example.test',
          displayName: 'T14 Second',
          status: UserStatus.ACTIVE,
        },
      ],
    });
    activeProductIds = (
      await prisma.product.findMany({
        where: {
          status: ProductStatus.ACTIVE,
          deletedAt: null,
          shop: { status: 'ACTIVE', deletedAt: null },
          category: { isActive: true, deletedAt: null },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 105,
      })
    ).map(({ id }) => id);
    expect(activeProductIds).toHaveLength(105);
  });

  afterAll(async () => {
    if (prisma)
      await prisma.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } });
    await app?.close();
  });

  it('isolates owners and preserves one timestamp under concurrent favorite writes/deletes', async () => {
    const productId = activeProductIds[0]!;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => engagement.addFavorite(firstUserId, productId)),
    );
    expect(new Set(results.map(({ favoritedAt }) => favoritedAt)).size).toBe(1);
    expect(await prisma.productFavorite.count({ where: { userId: firstUserId, productId } })).toBe(
      1,
    );
    await expect(engagement.status(secondUserId, [productId])).resolves.toEqual({
      items: [{ productId, isFavorite: false }],
    });
    await Promise.all(
      Array.from({ length: 5 }, () => engagement.removeFavorite(firstUserId, productId)),
    );
    expect(await prisma.productFavorite.count({ where: { userId: firstUserId, productId } })).toBe(
      0,
    );
  });

  it('promotes repeat views and deterministically retains only the latest 100', async () => {
    for (const productId of activeProductIds) await engagement.recordView(firstUserId, productId);
    expect(await prisma.recentlyViewedProduct.count({ where: { userId: firstUserId } })).toBe(100);
    const promotedId = activeProductIds[10]!;
    await engagement.recordView(firstUserId, promotedId);
    const page = await engagement.recentlyViewed(firstUserId, { page: 1, pageSize: 20 });
    expect(page.items[0]?.productId).toBe(promotedId);
    expect(page.pagination.totalItems).toBeLessThanOrEqual(100);
    expect(page.pagination.totalItems).toBeGreaterThan(0);
  });

  it('keeps unavailable favorites removable and excludes unavailable history from totals', async () => {
    const unavailable = await prisma.product.findFirstOrThrow({
      where: { status: ProductStatus.ARCHIVED },
      select: { id: true },
    });
    await prisma.productFavorite.create({
      data: { userId: secondUserId, productId: unavailable.id },
    });
    await prisma.recentlyViewedProduct.create({
      data: { userId: secondUserId, productId: unavailable.id },
    });
    await expect(
      engagement.favorites(secondUserId, { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      items: [{ availability: 'unavailable', productId: unavailable.id }],
    });
    await expect(
      engagement.recentlyViewed(secondUserId, { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({ items: [], pagination: { totalItems: 0 } });
    await engagement.removeFavorite(secondUserId, unavailable.id);
    expect(await prisma.productFavorite.count({ where: { userId: secondUserId } })).toBe(0);
  });
});
