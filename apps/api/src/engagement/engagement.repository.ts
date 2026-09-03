import { Inject, Injectable } from '@nestjs/common';
import { RECENTLY_VIEWED_RETENTION_LIMIT } from '@shopee-clone/contracts';

import type { Prisma } from '../generated/prisma/client';
import { VariantStatus } from '../generated/prisma/enums';
import { sellableShopWhere } from '../catalog/sellable-shop';
import { sellableProductWhere } from '../catalog/sellable-product';
import { PrismaService } from '../prisma/prisma.service';

const productInclude = {
  shop: true,
  category: true,
  images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  variants: {
    where: { status: VariantStatus.ACTIVE, deletedAt: null },
    include: { inventory: true },
    orderBy: [{ priceMinor: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ProductInclude;

const displayableProductWhere = {
  ...sellableProductWhere,
  shop: sellableShopWhere,
  category: { isActive: true, deletedAt: null },
} satisfies Prisma.ProductWhereInput;

export type EngagementTransaction = Prisma.TransactionClient;
export type FavoriteRow = Awaited<ReturnType<EngagementRepository['listFavoriteRows']>>[number];
export type RecentRow = Awaited<ReturnType<EngagementRepository['listRecentRows']>>[number];

@Injectable()
export class EngagementRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  countFavorites(userId: string) {
    return this.prisma.productFavorite.count({ where: { userId } });
  }

  listFavoriteRows(userId: string, skip: number, take: number) {
    return this.prisma.productFavorite.findMany({
      where: { userId },
      include: { product: { include: productInclude } },
      orderBy: [{ favoritedAt: 'desc' }, { productId: 'asc' }],
      skip,
      take,
    });
  }

  findDisplayableProduct(productId: string) {
    return this.prisma.product.findFirst({
      where: { id: productId, ...displayableProductWhere },
      include: productInclude,
    });
  }

  async upsertFavorite(userId: string, productId: string, now: Date) {
    await this.prisma.productFavorite.createMany({
      data: { userId, productId, favoritedAt: now },
      skipDuplicates: true,
    });
    return this.prisma.productFavorite.findUniqueOrThrow({
      where: { userId_productId: { userId, productId } },
    });
  }

  deleteFavorite(userId: string, productId: string) {
    return this.prisma.productFavorite.deleteMany({ where: { userId, productId } });
  }

  async favoriteProductIds(userId: string, productIds: string[]): Promise<Set<string>> {
    const rows = await this.prisma.productFavorite.findMany({
      where: { userId, productId: { in: productIds } },
      select: { productId: true },
    });
    return new Set(rows.map(({ productId }) => productId));
  }

  listRecentRows(userId: string) {
    return this.prisma.recentlyViewedProduct.findMany({
      where: { userId, product: displayableProductWhere },
      include: { product: { include: productInclude } },
      orderBy: [{ lastViewedAt: 'desc' }, { productId: 'asc' }],
      take: RECENTLY_VIEWED_RETENTION_LIMIT,
    });
  }

  transaction<T>(work: (transaction: EngagementTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  async lockActiveOwner(transaction: EngagementTransaction, userId: string): Promise<boolean> {
    const rows = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT id FROM users WHERE id = $1 AND status = 'active' AND deleted_at IS NULL FOR UPDATE",
      userId,
    );
    return rows.length === 1;
  }

  findDisplayableProductInTransaction(transaction: EngagementTransaction, productId: string) {
    return transaction.product.findFirst({
      where: { id: productId, ...displayableProductWhere },
      select: { id: true },
    });
  }

  async upsertRecentAndTrim(
    transaction: EngagementTransaction,
    userId: string,
    productId: string,
    now: Date,
  ) {
    const row = await transaction.recentlyViewedProduct.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, lastViewedAt: now },
      update: { lastViewedAt: now },
    });
    const overflow = await transaction.recentlyViewedProduct.findMany({
      where: { userId },
      orderBy: [{ lastViewedAt: 'desc' }, { productId: 'asc' }],
      skip: RECENTLY_VIEWED_RETENTION_LIMIT,
      select: { productId: true },
    });
    if (overflow.length > 0) {
      await transaction.recentlyViewedProduct.deleteMany({
        where: { userId, productId: { in: overflow.map(({ productId: id }) => id) } },
      });
    }
    return row;
  }
}
