import { Inject, Injectable } from '@nestjs/common';
import type {
  EngagementPageQuery,
  FavoriteMutationResponse,
  FavoritePage,
  FavoriteStateList,
  RecentlyViewedMutationResponse,
  RecentlyViewedPage,
} from '@shopee-clone/contracts';

import { mapCatalogProductCard } from '../catalog/catalog-presentation';
import { EngagementClock } from './engagement-clock';
import {
  EngagementOwnerUnavailableError,
  EngagementProductNotFoundError,
} from './engagement.errors';
import { EngagementRepository } from './engagement.repository';

function pagination(query: EngagementPageQuery, totalItems: number) {
  return {
    ...query,
    totalItems,
    totalPages: Math.ceil(totalItems / query.pageSize),
  };
}

@Injectable()
export class EngagementService {
  constructor(
    @Inject(EngagementRepository) private readonly repository: EngagementRepository,
    @Inject(EngagementClock) private readonly clock: EngagementClock,
  ) {}

  async favorites(userId: string, query: EngagementPageQuery): Promise<FavoritePage> {
    const totalItems = await this.repository.countFavorites(userId);
    const rows = await this.repository.listFavoriteRows(
      userId,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    return {
      items: rows.map((row) => {
        const card = mapCatalogProductCard(row.product);
        const available =
          row.product.status === 'ACTIVE' &&
          row.product.deletedAt === null &&
          row.product.shop.status === 'ACTIVE' &&
          row.product.shop.onboardingStatus === 'APPROVED' &&
          row.product.shop.deletedAt === null &&
          row.product.category.isActive &&
          row.product.category.deletedAt === null &&
          card !== null;
        return available
          ? {
              availability: 'available' as const,
              productId: row.productId,
              favoritedAt: row.favoritedAt.toISOString(),
              product: card,
            }
          : {
              availability: 'unavailable' as const,
              productId: row.productId,
              favoritedAt: row.favoritedAt.toISOString(),
              product: {
                id: row.product.id,
                name: row.product.name,
                href: null,
                imageUrl: row.product.images[0]?.url ?? null,
                imageAlt: row.product.images[0]?.altText ?? row.product.name,
              },
            };
      }),
      pagination: pagination(query, totalItems),
    };
  }

  async status(userId: string, productIds: string[]): Promise<FavoriteStateList> {
    const favorites = await this.repository.favoriteProductIds(userId, productIds);
    return {
      items: productIds.map((productId) => ({ productId, isFavorite: favorites.has(productId) })),
    };
  }

  async addFavorite(userId: string, productId: string): Promise<FavoriteMutationResponse> {
    if (!(await this.repository.findDisplayableProduct(productId))) {
      throw new EngagementProductNotFoundError();
    }
    const row = await this.repository.upsertFavorite(userId, productId, this.clock.now());
    return { productId, isFavorite: true, favoritedAt: row.favoritedAt.toISOString() };
  }

  async removeFavorite(userId: string, productId: string): Promise<FavoriteMutationResponse> {
    await this.repository.deleteFavorite(userId, productId);
    return { productId, isFavorite: false, favoritedAt: null };
  }

  async recentlyViewed(userId: string, query: EngagementPageQuery): Promise<RecentlyViewedPage> {
    const rows = await this.repository.listRecentRows(userId);
    const available = rows.flatMap((row) => {
      const product = mapCatalogProductCard(row.product);
      return product
        ? [{ productId: row.productId, lastViewedAt: row.lastViewedAt.toISOString(), product }]
        : [];
    });
    const totalItems = available.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      items: available.slice(start, start + query.pageSize),
      pagination: pagination(query, totalItems),
    };
  }

  async recordView(userId: string, productId: string): Promise<RecentlyViewedMutationResponse> {
    return this.repository.transaction(async (transaction) => {
      if (!(await this.repository.lockActiveOwner(transaction, userId))) {
        throw new EngagementOwnerUnavailableError();
      }
      if (!(await this.repository.findDisplayableProductInTransaction(transaction, productId))) {
        throw new EngagementProductNotFoundError();
      }
      const row = await this.repository.upsertRecentAndTrim(
        transaction,
        userId,
        productId,
        this.clock.now(),
      );
      return { productId, lastViewedAt: row.lastViewedAt.toISOString() };
    });
  }
}
