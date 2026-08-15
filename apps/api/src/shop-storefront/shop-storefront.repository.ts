import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { ShopStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export type ShopStorefrontTransaction = Prisma.TransactionClient;

@Injectable()
export class ShopStorefrontRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findPublicShopBySlug(slug: string) {
    return this.prisma.shop.findFirst({
      where: { slug, status: ShopStatus.ACTIVE, deletedAt: null },
      select: { id: true, ownerId: true, slug: true, name: true, location: true, createdAt: true, ratingAverageBasisPoints: true, ratingCount: true },
    });
  }

  countFollowers(shopId: string) {
    return this.prisma.shopFollower.count({ where: { shopId } });
  }

  followingShopIds(userId: string, shopIds: string[]) {
    return this.prisma.shopFollower.findMany({
      where: {
        userId,
        shopId: { in: shopIds },
        shop: { status: ShopStatus.ACTIVE, deletedAt: null },
      },
      select: { shopId: true },
    });
  }

  countFollowedShops(userId: string) {
    return this.prisma.shopFollower.count({ where: { userId } });
  }

  followedShopPage(userId: string, skip: number, take: number) {
    return this.prisma.shopFollower.findMany({
      where: { userId },
      orderBy: [{ followedAt: 'desc' }, { shopId: 'asc' }],
      skip,
      take,
      select: {
        shopId: true,
        followedAt: true,
        shop: {
          select: {
            id: true,
            slug: true,
            name: true,
            location: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });
  }

  followerCounts(shopIds: string[]) {
    if (shopIds.length === 0) return Promise.resolve([]);
    return this.prisma.shopFollower.groupBy({
      by: ['shopId'],
      where: { shopId: { in: shopIds } },
      _count: { _all: true },
    });
  }

  transaction<T>(work: (transaction: ShopStorefrontTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  async lockActiveOwner(transaction: ShopStorefrontTransaction, userId: string): Promise<boolean> {
    const rows = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT id FROM users WHERE id = $1 AND status = 'active' AND deleted_at IS NULL FOR UPDATE",
      userId,
    );
    return rows.length === 1;
  }

  async lockShop(transaction: ShopStorefrontTransaction, shopId: string) {
    const rows = await transaction.$queryRawUnsafe<
      Array<{ id: string; ownerId: string; status: string; deletedAt: Date | null }>
    >(
      'SELECT id, owner_id AS "ownerId", status::text, deleted_at AS "deletedAt" FROM shops WHERE id = $1 FOR UPDATE',
      shopId,
    );
    return rows[0] ?? null;
  }

  async createFollow(
    transaction: ShopStorefrontTransaction,
    userId: string,
    shopId: string,
    followedAt: Date,
  ) {
    await transaction.shopFollower.createMany({
      data: { userId, shopId, followedAt },
      skipDuplicates: true,
    });
    return transaction.shopFollower.findUniqueOrThrow({
      where: { userId_shopId: { userId, shopId } },
    });
  }

  deleteFollow(transaction: ShopStorefrontTransaction, userId: string, shopId: string) {
    return transaction.shopFollower.deleteMany({ where: { userId, shopId } });
  }

  countFollowersInTransaction(transaction: ShopStorefrontTransaction, shopId: string) {
    return transaction.shopFollower.count({ where: { shopId } });
  }
}
