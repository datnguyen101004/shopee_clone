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
}
