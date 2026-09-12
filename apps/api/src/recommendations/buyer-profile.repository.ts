import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { PurchasePaymentStatus, ShopOrderStatus, VariantStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { PROFILE_POLICY, type BuyerActivity } from './recommendation.types';

type ProductContext = {
  categoryId: string;
  shopId: string;
  variants: readonly { priceMinor: bigint }[];
};

function productActivity(
  type: BuyerActivity['type'],
  productId: string,
  product: ProductContext,
  occurredAt: Date,
  fallbackPriceMinor?: bigint,
): BuyerActivity {
  const productPrice = fallbackPriceMinor ?? product.variants[0]?.priceMinor;
  const priceMinor = productPrice === undefined ? undefined : Number(productPrice);
  return {
    type,
    productId,
    categoryId: product.categoryId,
    shopId: product.shopId,
    priceMinor: Number.isSafeInteger(priceMinor) ? priceMinor : undefined,
    occurredAt,
  };
}

const productSelect = {
  categoryId: true,
  shopId: true,
  variants: {
    where: { status: VariantStatus.ACTIVE, deletedAt: null },
    orderBy: [{ priceMinor: 'asc' }, { id: 'asc' }],
    take: 1,
    select: { priceMinor: true },
  },
} satisfies Prisma.ProductSelect;

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class BuyerProfileRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async loadActivities(userId: string, now: Date): Promise<readonly BuyerActivity[]> {
    const viewSince = new Date(now.getTime() - PROFILE_POLICY.viewsLookbackDays * 86_400_000);
    const longSince = new Date(now.getTime() - PROFILE_POLICY.ordersLookbackDays * 86_400_000);
    const favoriteSince = new Date(
      now.getTime() - PROFILE_POLICY.favoritesLookbackDays * 86_400_000,
    );

    const [views, favorites, follows, orderLines] = await Promise.all([
      this.prisma.recentlyViewedProduct.findMany({
        where: { userId, lastViewedAt: { gte: viewSince, lte: now } },
        orderBy: [{ lastViewedAt: 'desc' }, { productId: 'asc' }],
        take: PROFILE_POLICY.maxActivityRowsPerSource,
        select: { productId: true, lastViewedAt: true, product: { select: productSelect } },
      }),
      this.prisma.productFavorite.findMany({
        where: { userId, favoritedAt: { gte: favoriteSince, lte: now } },
        orderBy: [{ favoritedAt: 'desc' }, { productId: 'asc' }],
        take: PROFILE_POLICY.maxActivityRowsPerSource,
        select: { productId: true, favoritedAt: true, product: { select: productSelect } },
      }),
      this.prisma.shopFollower.findMany({
        where: { userId, followedAt: { lte: now } },
        orderBy: [{ followedAt: 'desc' }, { shopId: 'asc' }],
        take: PROFILE_POLICY.maxActivityRowsPerSource,
        select: { shopId: true, followedAt: true },
      }),
      this.prisma.orderLine.findMany({
        where: {
          createdAt: { gte: longSince, lte: now },
          order: {
            status: { not: ShopOrderStatus.CANCELLED },
            purchase: {
              buyerId: userId,
              paymentStatus: {
                notIn: [
                  PurchasePaymentStatus.CANCELLED,
                  PurchasePaymentStatus.FAILED,
                  PurchasePaymentStatus.EXPIRED,
                ],
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: PROFILE_POLICY.maxActivityRowsPerSource,
        select: {
          productId: true,
          sellingUnitPriceMinor: true,
          createdAt: true,
          product: { select: productSelect },
        },
      }),
    ]);

    return [
      ...views.map((row) => productActivity('view', row.productId, row.product, row.lastViewedAt)),
      ...favorites.map((row) =>
        productActivity('favorite', row.productId, row.product, row.favoritedAt),
      ),
      ...follows.map((row) => ({
        type: 'follow' as const,
        shopId: row.shopId,
        occurredAt: row.followedAt,
      })),
      ...orderLines.map((row) =>
        productActivity(
          'order',
          row.productId,
          row.product,
          row.createdAt,
          row.sellingUnitPriceMinor,
        ),
      ),
    ];
  }

  upsertProfile(profile: {
    userId: string;
    profileVersion: number;
    featureSchemaVersion: number;
    generatedAt: Date;
    eligibilityScore: number;
    eligible: boolean;
    viewCount30d: number;
    favoriteCount90d: number;
    followedShopCount: number;
    orderCount90d: number;
    categoryAffinities: readonly unknown[];
    shopAffinities: readonly unknown[];
    preferredPriceMinMinor: number | null;
    preferredPriceMaxMinor: number | null;
    preferredPriceMeanMinor: number | null;
    recentProductIds: readonly string[];
    source: string;
  }) {
    return this.prisma.buyerSearchProfile.upsert({
      where: { userId: profile.userId },
      create: {
        userId: profile.userId,
        profileVersion: profile.profileVersion,
        featureSchemaVersion: profile.featureSchemaVersion,
        generatedAt: profile.generatedAt,
        eligibilityScore: profile.eligibilityScore,
        eligible: profile.eligible,
        viewCount30d: profile.viewCount30d,
        favoriteCount90d: profile.favoriteCount90d,
        followedShopCount: profile.followedShopCount,
        orderCount90d: profile.orderCount90d,
        categoryAffinities: jsonValue(profile.categoryAffinities),
        shopAffinities: jsonValue(profile.shopAffinities),
        preferredPriceMinMinor: profile.preferredPriceMinMinor,
        preferredPriceMaxMinor: profile.preferredPriceMaxMinor,
        preferredPriceMeanMinor: profile.preferredPriceMeanMinor,
        recentProductIds: jsonValue(profile.recentProductIds),
        source: profile.source,
      },
      update: {
        profileVersion: profile.profileVersion,
        featureSchemaVersion: profile.featureSchemaVersion,
        generatedAt: profile.generatedAt,
        eligibilityScore: profile.eligibilityScore,
        eligible: profile.eligible,
        viewCount30d: profile.viewCount30d,
        favoriteCount90d: profile.favoriteCount90d,
        followedShopCount: profile.followedShopCount,
        orderCount90d: profile.orderCount90d,
        categoryAffinities: jsonValue(profile.categoryAffinities),
        shopAffinities: jsonValue(profile.shopAffinities),
        preferredPriceMinMinor: profile.preferredPriceMinMinor,
        preferredPriceMaxMinor: profile.preferredPriceMaxMinor,
        preferredPriceMeanMinor: profile.preferredPriceMeanMinor,
        recentProductIds: jsonValue(profile.recentProductIds),
        source: profile.source,
      },
    });
  }

  findProfile(userId: string) {
    return this.prisma.buyerSearchProfile.findUnique({ where: { userId } });
  }

  async listActiveUserIds(): Promise<readonly string[]> {
    const rows = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => row.id);
  }

  async listActiveUserIdsPage(afterId: string | null, take: number): Promise<readonly string[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      select: { id: true },
      orderBy: [{ id: 'asc' }],
      take,
    });
    return rows.map((row) => row.id);
  }

  async listProfilesChangedPage(
    since: Date,
    cutoff: Date,
    afterUserId: string | null,
    take: number,
  ) {
    return this.prisma.buyerSearchProfile.findMany({
      where: {
        updatedAt: { gt: since, lte: cutoff },
        ...(afterUserId ? { userId: { gt: afterUserId } } : {}),
      },
      orderBy: [{ userId: 'asc' }],
      take,
    });
  }

  async listProfilesPage(afterUserId: string | null, take: number) {
    return this.prisma.buyerSearchProfile.findMany({
      where: afterUserId ? { userId: { gt: afterUserId } } : undefined,
      orderBy: [{ userId: 'asc' }],
      take,
    });
  }

  /** Find users with source activity changes without scanning every profile. */
  async listActivityUserIdsPage(since: Date, cutoff: Date, afterUserId: string | null, take: number): Promise<readonly string[]> {
    const userFilter = afterUserId ? { gt: afterUserId } : undefined;
    const [views, favorites, follows, orders] = await Promise.all([
      this.prisma.recentlyViewedProduct.findMany({
        where: { lastViewedAt: { gt: since, lte: cutoff }, ...(userFilter ? { userId: userFilter } : {}) },
        orderBy: [{ userId: 'asc' }], distinct: ['userId'], take,
        select: { userId: true },
      }),
      this.prisma.productFavorite.findMany({
        where: { favoritedAt: { gt: since, lte: cutoff }, ...(userFilter ? { userId: userFilter } : {}) },
        orderBy: [{ userId: 'asc' }], distinct: ['userId'], take,
        select: { userId: true },
      }),
      this.prisma.shopFollower.findMany({
        where: { followedAt: { gt: since, lte: cutoff }, ...(userFilter ? { userId: userFilter } : {}) },
        orderBy: [{ userId: 'asc' }], distinct: ['userId'], take,
        select: { userId: true },
      }),
      this.prisma.purchase.findMany({
        where: {
          ...(afterUserId ? { buyerId: userFilter } : {}),
          paymentStatus: { notIn: [PurchasePaymentStatus.CANCELLED, PurchasePaymentStatus.FAILED, PurchasePaymentStatus.EXPIRED] },
          orders: {
            some: {
              status: { not: ShopOrderStatus.CANCELLED },
              lines: { some: { createdAt: { gt: since, lte: cutoff } } },
            },
          },
        },
        orderBy: [{ buyerId: 'asc' }], distinct: ['buyerId'], take,
        select: { buyerId: true },
      }),
    ]);
    const ids = new Set<string>([...views, ...favorites, ...follows].map((row) => row.userId));
    orders.forEach((row) => ids.add(row.buyerId));
    return [...ids].sort().slice(0, take);
  }

  /** Batch-load all four activity sources for one bounded user page. */
  async loadActivitiesForUsers(userIds: readonly string[], now: Date): Promise<ReadonlyMap<string, readonly BuyerActivity[]>> {
    if (userIds.length === 0) return new Map();
    const viewSince = new Date(now.getTime() - PROFILE_POLICY.viewsLookbackDays * 86_400_000);
    const longSince = new Date(now.getTime() - PROFILE_POLICY.ordersLookbackDays * 86_400_000);
    const favoriteSince = new Date(now.getTime() - PROFILE_POLICY.favoritesLookbackDays * 86_400_000);
    const perSourceTake = userIds.length * PROFILE_POLICY.maxActivityRowsPerSource;
    const [views, favorites, follows, orderLines] = await Promise.all([
      this.prisma.recentlyViewedProduct.findMany({ where: { userId: { in: [...userIds] }, lastViewedAt: { gte: viewSince, lte: now } }, orderBy: [{ userId: 'asc' }, { lastViewedAt: 'desc' }, { productId: 'asc' }], take: perSourceTake, select: { userId: true, productId: true, lastViewedAt: true, product: { select: productSelect } } }),
      this.prisma.productFavorite.findMany({ where: { userId: { in: [...userIds] }, favoritedAt: { gte: favoriteSince, lte: now } }, orderBy: [{ userId: 'asc' }, { favoritedAt: 'desc' }, { productId: 'asc' }], take: perSourceTake, select: { userId: true, productId: true, favoritedAt: true, product: { select: productSelect } } }),
      this.prisma.shopFollower.findMany({ where: { userId: { in: [...userIds] }, followedAt: { lte: now } }, orderBy: [{ userId: 'asc' }, { followedAt: 'desc' }, { shopId: 'asc' }], take: perSourceTake, select: { userId: true, shopId: true, followedAt: true } }),
      this.prisma.orderLine.findMany({ where: { createdAt: { gte: longSince, lte: now }, order: { purchase: { buyerId: { in: [...userIds] }, paymentStatus: { notIn: [PurchasePaymentStatus.CANCELLED, PurchasePaymentStatus.FAILED, PurchasePaymentStatus.EXPIRED] }, }, status: { not: ShopOrderStatus.CANCELLED } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: perSourceTake, select: { productId: true, sellingUnitPriceMinor: true, createdAt: true, product: { select: productSelect }, order: { select: { purchase: { select: { buyerId: true } } } } } }),
    ]);
    const activities = new Map<string, BuyerActivity[]>();
    const add = (userId: string, activity: BuyerActivity) => activities.set(userId, [...(activities.get(userId) ?? []), activity]);
    views.forEach((row) => add(row.userId, productActivity('view', row.productId, row.product, row.lastViewedAt)));
    favorites.forEach((row) => add(row.userId, productActivity('favorite', row.productId, row.product, row.favoritedAt)));
    follows.forEach((row) => add(row.userId, { type: 'follow', shopId: row.shopId, occurredAt: row.followedAt }));
    orderLines.forEach((row) => { const userId = row.order.purchase?.buyerId; if (userId) add(userId, productActivity('order', row.productId, row.product, row.createdAt, row.sellingUnitPriceMinor)); });
    return activities;
  }

  async findProfilesByUserIds(userIds: readonly string[]) {
    if (userIds.length === 0) return [];
    return this.prisma.buyerSearchProfile.findMany({ where: { userId: { in: [...userIds] } } });
  }
}
