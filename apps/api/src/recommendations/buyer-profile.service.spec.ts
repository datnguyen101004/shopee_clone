import { buildBuyerSearchProfile } from './buyer-profile.builder';
import { BuyerProfileRepository } from './buyer-profile.repository';
import { BuyerProfileService } from './buyer-profile.service';
import { isCompatibleRankingModel } from './recommendation-model.repository';
import { PROFILE_POLICY } from './recommendation.types';
import type { PrismaService } from '../prisma/prisma.service';

describe('buyer recommendation profiles', () => {
  const now = new Date('2026-09-03T00:00:00.000Z');

  it('builds deterministic bounded affinities and recent products', () => {
    const activities = [
      ...Array.from({ length: 60 }, (_, index) => ({
        type: 'view' as const,
        productId: `product-${index}`,
        categoryId: `category-${index}`,
        shopId: `shop-${index}`,
        priceMinor: 100_000 + index,
        occurredAt: new Date(now.getTime() - index * 1_000),
      })),
      {
        type: 'favorite' as const,
        productId: 'product-1',
        categoryId: 'category-1',
        shopId: 'shop-1',
        priceMinor: 200_000,
        occurredAt: now,
      },
      { type: 'follow' as const, shopId: 'shop-followed', occurredAt: now },
      {
        type: 'order' as const,
        productId: 'product-2',
        categoryId: 'category-2',
        shopId: 'shop-2',
        priceMinor: 300_000,
        occurredAt: now,
      },
    ];
    const first = buildBuyerSearchProfile({ userId: 'buyer-1', generatedAt: now, activities });
    const second = buildBuyerSearchProfile({
      userId: 'buyer-1',
      generatedAt: now,
      activities: [...activities],
    });

    expect(first).toEqual(second);
    expect(first.eligible).toBe(true);
    expect(first.eligibilityScore).toBe(71);
    expect(first.categoryAffinities).toHaveLength(PROFILE_POLICY.maxCategoryAffinities);
    expect(first.shopAffinities).toHaveLength(PROFILE_POLICY.maxShopAffinities);
    expect(first.recentProductIds).toHaveLength(PROFILE_POLICY.maxRecentProductIds);
    expect(first.preferredPriceMinMinor).toBe(100_000);
    expect(first.preferredPriceMaxMinor).toBe(300_000);
  });

  it('keeps profiles usable for thirty days, then uses cold start for stale or foreign profiles', async () => {
    const findProfile = jest.fn().mockResolvedValue({
      userId: 'buyer-2',
      profileVersion: 1,
      featureSchemaVersion: 1,
      generatedAt: new Date(now.getTime() - 29 * 24 * 3_600_000),
      eligibilityScore: 10,
      eligible: true,
      viewCount30d: 10,
      favoriteCount90d: 0,
      followedShopCount: 0,
      orderCount90d: 0,
      categoryAffinities: [],
      shopAffinities: [],
      preferredPriceMinMinor: null,
      preferredPriceMaxMinor: null,
      preferredPriceMeanMinor: null,
      recentProductIds: [],
      source: 'test',
    });
    const repository = {
      findProfile,
    } as unknown as BuyerProfileRepository;
    const service = new BuyerProfileService(repository);

    await expect(service.resolveEligibleProfile(null, now)).resolves.toBeNull();
    await expect(service.resolveEligibleProfile('buyer-1', now)).resolves.toBeNull();
    await expect(service.resolveEligibleProfile('buyer-2', now)).resolves.toMatchObject({ userId: 'buyer-2' });
    findProfile.mockResolvedValueOnce({
      userId: 'buyer-2',
      profileVersion: 1,
      featureSchemaVersion: 1,
      generatedAt: new Date(now.getTime() - 31 * 24 * 3_600_000),
      eligibilityScore: 10,
      eligible: true,
      viewCount30d: 10,
      favoriteCount90d: 0,
      followedShopCount: 0,
      orderCount90d: 0,
      categoryAffinities: [],
      shopAffinities: [],
      preferredPriceMinMinor: null,
      preferredPriceMaxMinor: null,
      preferredPriceMeanMinor: null,
      recentProductIds: [],
      source: 'test',
    });
    await expect(service.resolveEligibleProfile('buyer-2', now)).resolves.toBeNull();
  });

  it('does not include cancelled payment/order rows in the profile source query', async () => {
    const prisma = {
      recentlyViewedProduct: { findMany: jest.fn().mockResolvedValue([]) },
      productFavorite: { findMany: jest.fn().mockResolvedValue([]) },
      shopFollower: { findMany: jest.fn().mockResolvedValue([]) },
      orderLine: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    await new BuyerProfileRepository(prisma).loadActivities('buyer-1', now);
    expect(prisma.orderLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order: expect.objectContaining({
            status: { not: 'CANCELLED' },
            purchase: expect.objectContaining({
              buyerId: 'buyer-1',
              paymentStatus: expect.objectContaining({ notIn: ['CANCELLED', 'FAILED', 'EXPIRED'] }),
            }),
          }),
        }),
      }),
    );
  });

  it('rejects incompatible model versions before activation', () => {
    expect(
      isCompatibleRankingModel({
        productProjectionVersion: 1,
        featureSchemaVersion: 1,
        storedScriptVersion: 1,
      }),
    ).toBe(true);
    expect(
      isCompatibleRankingModel({
        productProjectionVersion: 99,
        featureSchemaVersion: 1,
        storedScriptVersion: 1,
      }),
    ).toBe(false);
    expect(
      isCompatibleRankingModel({
        productProjectionVersion: 1,
        featureSchemaVersion: 99,
        storedScriptVersion: 1,
      }),
    ).toBe(false);
    expect(
      isCompatibleRankingModel({
        productProjectionVersion: 1,
        featureSchemaVersion: 1,
        storedScriptVersion: 99,
      }),
    ).toBe(false);
  });
});
