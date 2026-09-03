import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  CatalogProductCard,
  HomepageCampaignModule,
  HomepageCategoryModule,
  HomepageModule,
  HomepageProductModule,
  HomepageProductSummary,
  HomepageResponse,
} from '@shopee-clone/contracts';

import { HomepageModuleType } from '../generated/prisma/enums';
import { HOMEPAGE_CLOCK, type HomepageClock } from './homepage.clock';
import { HomepageRepository } from './homepage.repository';
import { ScheduledDiscountService } from '../pricing/scheduled-discount.service';
import { applyScheduledPrice, representativeOffer } from '../catalog/catalog-presentation';
import { BuyerBestPriceService } from '../pricing/buyer-best-price.service';
import { CatalogPublicFacade } from '../catalog/catalog-public.facade';
import type { NormalizedCatalogQuery } from '../catalog/catalog-query';
import { SEARCH_CONFIG, type SearchConfig } from '../search/search.config';

const moduleTypeMap = {
  [HomepageModuleType.CAMPAIGN_BANNER]: 'campaign-banner',
  [HomepageModuleType.CATEGORY_SHORTCUTS]: 'category-shortcuts',
  [HomepageModuleType.FLASH_SALE]: 'flash-sale',
  [HomepageModuleType.TOP_SELLING]: 'top-selling',
  [HomepageModuleType.MALL]: 'mall',
  [HomepageModuleType.DAILY_RECOMMENDATIONS]: 'daily-recommendations',
} as const;

function safePath(path: string): boolean {
  return path === '/' || path.startsWith('/search?') || /^\/products\/[A-Za-z0-9%_-]+$/.test(path);
}

function safeMinor(value: bigint): number | null {
  const converted = Number(value);
  return Number.isSafeInteger(converted) && converted >= 0 ? converted : null;
}

function diversityKey(value: string): string {
  return value.trim().toLocaleLowerCase('vi');
}

function diversifyRecommendations(
  products: readonly CatalogProductCard[],
  maximum = 24,
): CatalogProductCard[] {
  const selected: CatalogProductCard[] = [];
  const seen = new Set<string>();
  const shopCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  for (const product of products) {
    if (selected.length >= maximum || seen.has(product.id)) continue;
    const shopKey = diversityKey(product.shop.name);
    const categoryKey = diversityKey(product.category.name);
    if ((shopCounts.get(shopKey) ?? 0) >= 3 || (categoryCounts.get(categoryKey) ?? 0) >= 6) {
      continue;
    }
    seen.add(product.id);
    selected.push(product);
    shopCounts.set(shopKey, (shopCounts.get(shopKey) ?? 0) + 1);
    categoryCounts.set(categoryKey, (categoryCounts.get(categoryKey) ?? 0) + 1);
  }
  return selected;
}

function homepageProductFromCatalog(product: CatalogProductCard): HomepageProductSummary {
  return {
    id: product.id,
    name: product.name,
    shopName: product.shop.name,
    href: product.href,
    imageUrl: product.imageUrl,
    imageAlt: product.imageAlt,
    priceMinor: product.priceMinor,
    ...(product.compareAtPriceMinor !== undefined
      ? { compareAtPriceMinor: product.compareAtPriceMinor }
      : {}),
    ...(product.scheduledPrice ? { scheduledPrice: product.scheduledPrice } : {}),
    ...(product.buyerBestPrice ? { buyerBestPrice: product.buyerBestPrice } : {}),
    soldCount: product.soldCount,
  };
}

@Injectable()
export class HomepageService {
  constructor(
    private readonly repository: HomepageRepository,
    @Inject(HOMEPAGE_CLOCK) private readonly clock: HomepageClock,
    @Inject(ScheduledDiscountService)
    private readonly scheduledDiscounts?: ScheduledDiscountService,
    @Inject(BuyerBestPriceService)
    private readonly buyerPrices?: BuyerBestPriceService,
    @Optional()
    @Inject(CatalogPublicFacade)
    private readonly catalog?: CatalogPublicFacade,
    @Optional()
    @Inject(SEARCH_CONFIG)
    private readonly searchConfig?: SearchConfig,
  ) {}

  private async resolveDailyRecommendations(
    buyerId: string | null,
  ): Promise<HomepageProductSummary[] | null> {
    if (!this.catalog || !this.searchConfig?.features.dailyRecommendations) return null;

    const query: NormalizedCatalogQuery = {
      q: null,
      category: null,
      minPrice: null,
      maxPrice: null,
      rating: null,
      location: null,
      availability: 'in-stock',
      promotion: null,
      sort: buyerId ? 'relevance' : 'best-selling',
      page: 1,
      pageSize: 48,
      recommendationSurface: 'daily-recommendations',
    };
    try {
      const response = await this.catalog.getProducts(query, buyerId);
      const selected = diversifyRecommendations(response.items);
      return selected.length ? selected.map(homepageProductFromCatalog) : null;
    } catch {
      return null;
    }
  }

  async getHomepage(buyerId: string | null = null): Promise<HomepageResponse> {
    const now = this.clock.now();
    const records = await this.repository.findActive(now);
    const modules: HomepageModule[] = [];
    const discounts = this.scheduledDiscounts
      ? await this.scheduledDiscounts.resolveVariants(
          undefined,
          records.flatMap((record) =>
            record.products.flatMap((entry) =>
              entry.product.variants.map((variant) => ({
                id: variant.id,
                productId: entry.product.id,
                priceMinor: variant.priceMinor,
                compareAtPriceMinor: variant.compareAtPriceMinor,
              })),
            ),
          ),
          now,
        )
      : new Map();
    const previewSnapshots = new Map<
      string,
      Parameters<BuyerBestPriceService['previews']>[1][number]
    >();
    for (const record of records) {
      for (const entry of record.products) {
        const product = entry.product;
        if (!HomepageRepository.isDisplayableProduct(product)) continue;
        const representative = representativeOffer(
          product.variants.map((variant) =>
            applyScheduledPrice(variant, discounts.get(variant.id)),
          ),
        );
        if (!representative) continue;
        previewSnapshots.set(representative.offer.id, {
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
        });
      }
    }
    const buyerPreviews = this.buyerPrices
      ? await this.buyerPrices.previews(buyerId, [...previewSnapshots.values()], now)
      : new Map();

    for (const record of records) {
      const base = {
        id: record.id,
        key: record.key,
        title: record.title,
        ...(record.subtitle ? { subtitle: record.subtitle } : {}),
        sortOrder: record.sortOrder,
      };

      if (record.type === HomepageModuleType.CAMPAIGN_BANNER) {
        const banners = record.banners
          .filter((banner) => safePath(banner.destinationPath))
          .map((banner) => ({
            id: banner.id,
            ...(banner.eyebrow ? { eyebrow: banner.eyebrow } : {}),
            title: banner.title,
            ...(banner.description ? { description: banner.description } : {}),
            imageUrl: banner.imageUrl,
            altText: banner.altText ?? banner.title,
            href: banner.destinationPath,
            theme: banner.themeKey,
          }));
        if (banners.length) {
          modules.push({
            ...base,
            type: 'campaign-banner',
            banners,
          } satisfies HomepageCampaignModule);
        }
        continue;
      }

      if (record.type === HomepageModuleType.CATEGORY_SHORTCUTS) {
        const categories = record.categories
          .filter(({ category }) => category.isActive && category.deletedAt === null)
          .map(({ category, iconKey, label }) => ({
            id: category.id,
            label: label ?? category.name,
            icon: iconKey ?? 'category',
            href: `/search?category=${encodeURIComponent(category.slug)}`,
          }));
        if (categories.length) {
          modules.push({
            ...base,
            type: 'category-shortcuts',
            categories,
          } satisfies HomepageCategoryModule);
        }
        continue;
      }

      const products: HomepageProductSummary[] = [];
      for (const entry of record.products) {
        const product = entry.product;
        if (!HomepageRepository.isDisplayableProduct(product)) continue;
        const representative = representativeOffer(
          product.variants.map((variant) =>
            applyScheduledPrice(variant, discounts.get(variant.id)),
          ),
        );
        if (!representative) continue;
        const priceMinor = representative.priceMinor;
        const compareAt = representative.offer.compareAtPriceMinor
          ? safeMinor(representative.offer.compareAtPriceMinor)
          : null;
        const image = product.images[0];
        products.push({
          id: product.id,
          name: product.name,
          shopName: product.shop.name,
          href: `/products/${encodeURIComponent(product.slug || product.id)}`,
          imageUrl: image?.url ?? null,

          imageAlt: image?.altText ?? product.name,
          priceMinor,
          ...(compareAt !== null && compareAt > priceMinor
            ? { compareAtPriceMinor: compareAt }
            : {}),
          ...(representative.offer.scheduledPrice
            ? { scheduledPrice: representative.offer.scheduledPrice }
            : {}),
          ...(buyerPreviews.get(representative.offer.id)
            ? { buyerBestPrice: buyerPreviews.get(representative.offer.id)! }
            : {}),
          ...(entry.label ? { label: entry.label } : {}),
          ...(entry.soldCount !== null ? { soldCount: entry.soldCount } : {}),
        });
      }
      const recommendationProducts =
        record.type === HomepageModuleType.DAILY_RECOMMENDATIONS
          ? await this.resolveDailyRecommendations(buyerId)
          : null;
      const resolvedProducts = recommendationProducts ?? products;
      if (resolvedProducts.length) {
        const type = moduleTypeMap[record.type];
        modules.push({
          ...base,
          type,
          products: resolvedProducts,
          ...(record.activeUntil ? { endsAt: record.activeUntil.toISOString() } : {}),
        } satisfies HomepageProductModule);
      }
    }

    return { evaluatedAt: now.toISOString(), modules };
  }
}
