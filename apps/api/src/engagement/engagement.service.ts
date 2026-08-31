import { Inject, Injectable } from '@nestjs/common';
import type {
  CatalogProductCard,
  EngagementPageQuery,
  FavoriteMutationResponse,
  FavoritePage,
  FavoriteStateList,
  RecentlyViewedMutationResponse,
  RecentlyViewedPage,
} from '@shopee-clone/contracts';

import {
  applyScheduledPrice,
  mapCatalogProductCard,
  representativeOffer,
} from '../catalog/catalog-presentation';
import { isSellableProduct } from '../catalog/sellable-product';
import { EngagementClock } from './engagement-clock';
import {
  EngagementOwnerUnavailableError,
  EngagementProductNotFoundError,
} from './engagement.errors';
import { EngagementRepository, type FavoriteRow } from './engagement.repository';
import { BuyerBestPriceService } from '../pricing/buyer-best-price.service';
import { ScheduledDiscountService } from '../pricing/scheduled-discount.service';

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
    @Inject(ScheduledDiscountService)
    private readonly scheduledDiscounts?: ScheduledDiscountService,
    @Inject(BuyerBestPriceService)
    private readonly buyerPrices?: BuyerBestPriceService,
  ) {}

  private async productCards(
    userId: string,
    products: readonly FavoriteRow['product'][],
  ): Promise<Map<string, CatalogProductCard>> {
    const evaluatedAt = this.clock.now();
    const discounts = this.scheduledDiscounts
      ? await this.scheduledDiscounts.resolveVariants(
          undefined,
          products.flatMap((product) =>
            product.variants.map((variant) => ({
              id: variant.id,
              productId: product.id,
              priceMinor: variant.priceMinor,
              compareAtPriceMinor: variant.compareAtPriceMinor,
            })),
          ),
          evaluatedAt,
        )
      : new Map();
    const enriched = products.map((product) => ({
      ...product,
      variants: product.variants.map((variant) =>
        applyScheduledPrice(variant, discounts.get(variant.id)),
      ),
    }));
    const snapshots = enriched.flatMap((product) => {
      const representative = representativeOffer(product.variants);
      return representative
        ? [
            {
              productId: product.id,
              variantId: representative.offer.id,
              effectivePriceMinor: representative.priceMinor,
              weightGrams: representative.offer.weightGrams ?? 0,
              shop: {
                id: product.shop.id,
                ownerUserId: product.shop.ownerId,
                slug: product.shop.slug,
                name: product.shop.name,
                location: product.shop.location,
                pickupProvince: product.shop.pickupProvince,
              },
            },
          ]
        : [];
    });
    const previews = this.buyerPrices
      ? await this.buyerPrices.previews(userId, snapshots, evaluatedAt)
      : new Map();
    return new Map(
      enriched.flatMap((product) => {
        const candidate = {
          ...product,
          variants: product.variants.map((variant) => {
            const buyerBestPrice = previews.get(variant.id);
            return buyerBestPrice ? { ...variant, buyerBestPrice } : variant;
          }),
        };
        const card = mapCatalogProductCard(candidate);
        return card ? ([[product.id, card]] as const) : [];
      }),
    );
  }

  async favorites(userId: string, query: EngagementPageQuery): Promise<FavoritePage> {
    const totalItems = await this.repository.countFavorites(userId);
    const rows = await this.repository.listFavoriteRows(
      userId,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const cards = await this.productCards(
      userId,
      rows.map((row) => row.product),
    );
    return {
      items: rows.map((row) => {
        const card = cards.get(row.productId) ?? null;
        const available =
          isSellableProduct(row.product) &&
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
    const cards = await this.productCards(
      userId,
      rows.map((row) => row.product),
    );
    const available = rows.flatMap((row) => {
      const product = cards.get(row.productId);
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
