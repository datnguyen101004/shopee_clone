import { Inject, Injectable } from '@nestjs/common';
import type {
  PublicShopCatalogPage,
  PublicShopProfile,
  ShopCatalogQuery,
  ShopFollowMutationResponse,
  ShopFollowStateList,
} from '@shopee-clone/contracts';

import { CatalogPublicFacade } from '../catalog/catalog-public.facade';
import { ShopStorefrontClock } from './shop-storefront-clock';
import {
  PublicShopNotFoundError,
  ShopFollowOwnerUnavailableError,
  ShopSelfFollowConflictError,
  ShopStorefrontAggregateError,
} from './shop-storefront.errors';
import { ShopStorefrontRepository } from './shop-storefront.repository';

function safeSum(values: number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total) || total < 0) throw new ShopStorefrontAggregateError();
  }
  return total;
}

@Injectable()
export class ShopStorefrontService {
  constructor(
    @Inject(ShopStorefrontRepository) private readonly repository: ShopStorefrontRepository,
    @Inject(CatalogPublicFacade) private readonly catalog: CatalogPublicFacade,
    @Inject(ShopStorefrontClock) private readonly clock: ShopStorefrontClock,
  ) {}

  private async resolvePublicShop(slug: string) {
    const shop = await this.repository.findPublicShopBySlug(slug);
    if (!shop) throw new PublicShopNotFoundError();
    return shop;
  }

  async profile(slug: string): Promise<PublicShopProfile> {
    const shop = await this.resolvePublicShop(slug);
    const [summary, followerCount] = await Promise.all([
      this.catalog.getShopSummary(shop.id),
      this.repository.countFollowers(shop.id),
    ]);
    const ratingCount = safeSum(summary.products.map((product) => product.ratingCount));
    const weightedRating = safeSum(
      summary.products.map((product) => product.ratingAverageBasisPoints * product.ratingCount),
    );
    return {
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      location: shop.location,
      joinedAt: shop.createdAt.toISOString(),
      activeProductCount: summary.products.length,
      ratingAverageBasisPoints: ratingCount === 0 ? 0 : Math.round(weightedRating / ratingCount),
      ratingCount,
      soldCount: safeSum(summary.products.map((product) => product.soldCount)),
      followerCount,
      responseMetadata: {
        responseRateBasisPoints: null,
        responseTimeLabel: null,
        message: 'Chưa có dữ liệu phản hồi của shop.',
      },
      categories: summary.categories,
    };
  }

  async products(slug: string, query: ShopCatalogQuery): Promise<PublicShopCatalogPage> {
    const shop = await this.resolvePublicShop(slug);
    return this.catalog.getShopProducts(shop.id, query);
  }

  async status(userId: string, shopIds: string[]): Promise<ShopFollowStateList> {
    const rows = await this.repository.followingShopIds(userId, shopIds);
    const following = new Set(rows.map(({ shopId }) => shopId));
    return { items: shopIds.map((shopId) => ({ shopId, isFollowing: following.has(shopId) })) };
  }

  async follow(userId: string, shopId: string): Promise<ShopFollowMutationResponse> {
    return this.repository.transaction(async (transaction) => {
      if (!(await this.repository.lockActiveOwner(transaction, userId))) {
        throw new ShopFollowOwnerUnavailableError();
      }
      const shop = await this.repository.lockShop(transaction, shopId);
      if (!shop || shop.status !== 'active' || shop.deletedAt !== null) {
        throw new PublicShopNotFoundError();
      }
      if (shop.ownerId === userId) throw new ShopSelfFollowConflictError();
      const row = await this.repository.createFollow(transaction, userId, shopId, this.clock.now());
      const followerCount = await this.repository.countFollowersInTransaction(transaction, shopId);
      return {
        shopId,
        isFollowing: true,
        followedAt: row.followedAt.toISOString(),
        followerCount,
      };
    });
  }

  async unfollow(userId: string, shopId: string): Promise<ShopFollowMutationResponse> {
    return this.repository.transaction(async (transaction) => {
      if (!(await this.repository.lockActiveOwner(transaction, userId))) {
        throw new ShopFollowOwnerUnavailableError();
      }
      const shop = await this.repository.lockShop(transaction, shopId);
      await this.repository.deleteFollow(transaction, userId, shopId);
      const followerCount =
        shop?.status === 'active' && shop.deletedAt === null
          ? await this.repository.countFollowersInTransaction(transaction, shopId)
          : null;
      return { shopId, isFollowing: false, followedAt: null, followerCount };
    });
  }
}
