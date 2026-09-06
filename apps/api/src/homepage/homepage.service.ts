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
import { campaignLifecycleAt, isValidBannerDestination } from '@shopee-clone/contracts';
import { NotificationService } from '../notifications/notification.service';
import { homepageBannerCampaignTargetUnavailableEvent } from '../notifications/notification-events';

const moduleTypeMap = {
  [HomepageModuleType.CAMPAIGN_BANNER]: 'campaign-banner',
  [HomepageModuleType.CATEGORY_SHORTCUTS]: 'category-shortcuts',
  [HomepageModuleType.FLASH_SALE]: 'flash-sale',
  [HomepageModuleType.TOP_SELLING]: 'top-selling',
  [HomepageModuleType.MALL]: 'mall',
  [HomepageModuleType.DAILY_RECOMMENDATIONS]: 'daily-recommendations',
} as const;

const DAILY_RECOMMENDATION_LIMIT = 12;
const DAILY_RECOMMENDATION_CANDIDATE_LIMIT = 48;
const FLASH_SALE_CAMPAIGN_SHELF_ENABLED = process.env.CAMPAIGN_FLASH_SALE_SHELF_ENABLED !== 'false';
const CAMPAIGN_COLLECTIONS_ENABLED = process.env.CAMPAIGN_COLLECTIONS_ENABLED !== 'false';

type BannerTargetType = 'CAMPAIGN' | 'PRODUCT' | 'SHOP' | 'CATEGORY' | 'SEARCH' | 'URL';

const BANNER_TARGET_TYPES: readonly BannerTargetType[] = [
  'CAMPAIGN',
  'PRODUCT',
  'SHOP',
  'CATEGORY',
  'SEARCH',
  'URL',
];

function bannerTargetTypeOf(banner: { targetType?: string | null }): BannerTargetType {
  if (banner.targetType && BANNER_TARGET_TYPES.includes(banner.targetType as BannerTargetType)) {
    return banner.targetType as BannerTargetType;
  }
  return 'URL';
}

function campaignFailureReason(
  campaign: { publishedAt: Date | null; cancelledAt: Date | null; announceAt: Date; enrollmentStartsAt: Date; enrollmentEndsAt: Date; startsAt: Date; endsAt: Date } | null,
  now: Date,
): 'ENDED' | 'CANCELLED' | 'MISSING' | 'FETCH_FAILED' {
  if (!campaign) return 'MISSING';
  if (campaign.cancelledAt) return 'CANCELLED';
  if (campaign.endsAt <= now) return 'ENDED';
  return 'FETCH_FAILED';
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
  maximum = DAILY_RECOMMENDATION_LIMIT,
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

function fillRecommendations(
  primary: readonly CatalogProductCard[],
  fallback: readonly CatalogProductCard[],
  maximum = DAILY_RECOMMENDATION_LIMIT,
): CatalogProductCard[] {
  const selected = diversifyRecommendations(primary, maximum);
  const seen = new Set(selected.map((product) => product.id));
  for (const product of fallback) {
    if (selected.length >= maximum) break;
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    selected.push(product);
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
    @Optional()
    @Inject(NotificationService)
    private readonly notifications?: NotificationService,
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
      pageSize: DAILY_RECOMMENDATION_CANDIDATE_LIMIT,
      recommendationSurface: 'daily-recommendations',
    };
    const guestFallbackQuery: NormalizedCatalogQuery = {
      ...query,
      sort: 'best-selling',
    };

    let primaryItems: CatalogProductCard[] = [];
    try {
      primaryItems = (await this.catalog.getProducts(query, buyerId)).items;
    } catch {
      // A buyer-specific recommendation failure can still be filled from the
      // same high-score guest baseline used for anonymous visitors.
    }

    try {
      let fallbackItems: readonly CatalogProductCard[] = [];
      const primarySelection = diversifyRecommendations(primaryItems);
      if (primarySelection.length < DAILY_RECOMMENDATION_LIMIT) {
        if (buyerId) {
          fallbackItems = (await this.catalog.getProducts(guestFallbackQuery, null)).items;
        } else {
          // Guest results are already sorted by the baseline score; reuse the
          // same response to relax diversity caps without another request.
          fallbackItems = primaryItems;
        }
      }
      const selected = fillRecommendations(primaryItems, fallbackItems);
      return selected.length ? selected.map(homepageProductFromCatalog) : null;
    } catch {
      return null;
    }
  }

  async getHomepage(buyerId: string | null = null): Promise<HomepageResponse> {
    const now = this.clock.now();
    const records = await this.repository.findActive(now);
    const repositoryWithTargets = this.repository as HomepageRepository & {
      findCampaignTargets?: (ids: readonly string[]) => Promise<Array<{
        id: string;
        publishedAt: Date | null;
        cancelledAt: Date | null;
        announceAt: Date;
        enrollmentStartsAt: Date;
        enrollmentEndsAt: Date;
        startsAt: Date;
        endsAt: Date;
      }>>;
      findProductTargets?: (ids: readonly string[]) => Promise<Array<{ id: string; slug: string; status: string; deletedAt: Date | null }>>;
      findShopTargets?: (ids: readonly string[]) => Promise<Array<{ id: string; slug: string; status: string; onboardingStatus: string; deletedAt: Date | null }>>;
      findCategoryTargets?: (ids: readonly string[]) => Promise<Array<{ id: string; slug: string; isActive: boolean; deletedAt: Date | null }>>;
      findActiveAdminUserIds?: () => Promise<string[]>;
    };
    const bannerRecords = records.flatMap((record) => record.banners);
    const targetIdsByType = (type: BannerTargetType) =>
      bannerRecords
        .filter((banner) => bannerTargetTypeOf(banner) === type)
        .map((banner) => banner.targetId)
        .filter((id): id is string => Boolean(id));
    const [campaignTargets, productTargets, shopTargets, categoryTargets] = await Promise.all([
      repositoryWithTargets.findCampaignTargets?.(targetIdsByType('CAMPAIGN')) ?? Promise.resolve([]),
      repositoryWithTargets.findProductTargets?.(targetIdsByType('PRODUCT')) ?? Promise.resolve([]),
      repositoryWithTargets.findShopTargets?.(targetIdsByType('SHOP')) ?? Promise.resolve([]),
      repositoryWithTargets.findCategoryTargets?.(targetIdsByType('CATEGORY')) ?? Promise.resolve([]),
    ]);
    const campaignById = new Map(campaignTargets.map((campaign) => [campaign.id, campaign]));
    const productById = new Map(productTargets.map((product) => [product.id, product]));
    const shopById = new Map(shopTargets.map((shop) => [shop.id, shop]));
    const categoryById = new Map(categoryTargets.map((category) => [category.id, category]));
    let adminUserIdsPromise: Promise<string[]> | undefined;
    const notifyUnavailableCampaign = (bannerId: string, campaignId: string, reason: 'ENDED' | 'CANCELLED' | 'MISSING' | 'FETCH_FAILED') => {
      if (!this.notifications || !repositoryWithTargets.findActiveAdminUserIds) return;
      adminUserIdsPromise ??= repositoryWithTargets.findActiveAdminUserIds();
      void adminUserIdsPromise
        .then((adminUserIds) => this.notifications
          ? this.notifications.notify(homepageBannerCampaignTargetUnavailableEvent({ bannerId, campaignId, reason, adminUserIds }))
          : undefined)
        .catch(() => undefined);
    };
    // The generic collection relation is optional during the migration rollout.
    // A repository without the relation is treated as the pre-migration
    // compatibility path. Once the relation is available, an empty active
    // campaign collection intentionally produces an empty shelf rather than
    // showing stale legacy Flash Sale products.
    const campaignCollectionSourceAvailable =
      CAMPAIGN_COLLECTIONS_ENABLED &&
      typeof (this.repository as HomepageRepository & {
        findActiveCampaignCollections?: (at: Date) => Promise<unknown[]>;
      }).findActiveCampaignCollections === 'function';
    const campaignCollections = campaignCollectionSourceAvailable
      ? await (this.repository as HomepageRepository & {
          findActiveCampaignCollections: (at: Date) => Promise<unknown[]>;
        }).findActiveCampaignCollections(now)
      : [];
    type HomepageProductEntry = (typeof records)[number]['products'][number];
    const campaignProductsByModule = new Map<string, HomepageProductEntry[]>();
    for (const collection of campaignCollections as Array<{
      id: string;
      moduleId: string;
      typeId: string;
      module: { type: HomepageModuleType };
        type: { id: string };
      campaign: {
        id: string;
        type: { id: string; code: string; displayName: string };
        participations: Array<{
          products: Array<{ product: HomepageProductEntry['product'] }>;
        }>;
      };
    }>) {
      if (collection.typeId !== collection.campaign.type.id) continue;
      if (collection.module.type === HomepageModuleType.FLASH_SALE && collection.campaign.type.code !== 'FLASH_SALE') continue;
      const entries = campaignProductsByModule.get(collection.moduleId) ?? [];
      for (const participation of collection.campaign.participations) {
        for (const submitted of participation.products) {
          if (entries.some((entry) => entry.product.id === submitted.product.id)) continue;
          entries.push({
            id: `campaign:${collection.id}:${submitted.product.id}`,
            label: collection.campaign.type.displayName,
            soldCount: null,
            sortOrder: entries.length,
            productId: submitted.product.id,
            moduleId: collection.moduleId,
            product: submitted.product,
          } as HomepageProductEntry);
        }
      }
      campaignProductsByModule.set(collection.moduleId, entries);
    }
    const sourceEntries = (record: (typeof records)[number]): HomepageProductEntry[] => {
      if (!CAMPAIGN_COLLECTIONS_ENABLED || !campaignCollectionSourceAvailable) return record.products;
      if (record.type === HomepageModuleType.FLASH_SALE && !FLASH_SALE_CAMPAIGN_SHELF_ENABLED) return record.products;
      if (record.type === HomepageModuleType.FLASH_SALE) return campaignProductsByModule.get(record.id) ?? [];
      return campaignProductsByModule.get(record.id) ?? record.products;
    };
    const modules: HomepageModule[] = [];
    const discounts = this.scheduledDiscounts
      ? await this.scheduledDiscounts.resolveVariants(
          undefined,
          records.flatMap((record) =>
            sourceEntries(record).flatMap((entry) =>
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
      for (const entry of sourceEntries(record)) {
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
          .filter((banner) =>
            banner.isEnabled !== false &&
            (!banner.displayFrom || banner.displayFrom <= now) &&
            (!banner.displayUntil || banner.displayUntil > now),
          )
          .map((banner) => {
            const targetType = bannerTargetTypeOf(banner);
            const targetId = banner.targetId;
            const targetQuery = banner.targetQuery;
            let href: string | undefined;
            let targetAvailable = false;

            if (targetType === 'CAMPAIGN') {
              const campaign = targetId ? campaignById.get(targetId) ?? null : null;
              if (campaign && campaignLifecycleAt(campaign) === 'ACTIVE') {
                href = `/campaigns/${encodeURIComponent(targetId!)}`;
                targetAvailable = true;
              } else {
                notifyUnavailableCampaign(
                  banner.id,
                  targetId ?? `missing:${banner.id}`,
                  campaignFailureReason(campaign, now),
                );
              }
            } else if (targetType === 'PRODUCT') {
              const product = targetId ? productById.get(targetId) : undefined;
              if (product && product.status === 'ACTIVE' && product.deletedAt === null) {
                href = `/products/${encodeURIComponent(product.slug || product.id)}`;
                targetAvailable = true;
              }
            } else if (targetType === 'SHOP') {
              const shop = targetId ? shopById.get(targetId) : undefined;
              if (shop && shop.status === 'ACTIVE' && shop.onboardingStatus === 'APPROVED' && shop.deletedAt === null) {
                href = `/shops/${encodeURIComponent(shop.slug)}`;
                targetAvailable = true;
              }
            } else if (targetType === 'CATEGORY') {
              const category = targetId ? categoryById.get(targetId) : undefined;
              if (category && category.isActive && category.deletedAt === null) {
                href = `/search?category=${encodeURIComponent(category.slug)}`;
                targetAvailable = true;
              }
            } else if (targetType === 'SEARCH') {
              if (targetQuery) {
                href = `/search?q=${encodeURIComponent(targetQuery)}`;
                targetAvailable = true;
              }
            } else if (targetQuery && isValidBannerDestination(targetQuery)) {
              href = targetQuery;
              targetAvailable = true;
            }

            if (targetType !== 'CAMPAIGN' && !targetAvailable) return null;

            return {
              id: banner.id,
              ...(banner.eyebrow ? { eyebrow: banner.eyebrow } : {}),
              title: banner.title,
              ...(banner.description ? { description: banner.description } : {}),
              imageUrl: banner.imageUrl,
              altText: banner.altText ?? banner.title,
              ...(href ? { href } : {}),
              theme: banner.themeKey,
              targetType,
              ...(targetId ? { targetId } : {}),
              ...(targetQuery ? { targetQuery } : {}),
              targetAvailable,
            };
          })
          .filter((banner): banner is NonNullable<typeof banner> => banner !== null);
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
      for (const entry of sourceEntries(record)) {
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
