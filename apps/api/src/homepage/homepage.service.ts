import { Inject, Injectable } from '@nestjs/common';
import type {
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

@Injectable()
export class HomepageService {
  constructor(
    private readonly repository: HomepageRepository,
    @Inject(HOMEPAGE_CLOCK) private readonly clock: HomepageClock,
    @Inject(ScheduledDiscountService)
    private readonly scheduledDiscounts?: ScheduledDiscountService,
    @Inject(BuyerBestPriceService)
    private readonly buyerPrices?: BuyerBestPriceService,
  ) {}

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
      if (products.length) {
        const type = moduleTypeMap[record.type];
        modules.push({
          ...base,
          type,
          products,
          ...(record.activeUntil ? { endsAt: record.activeUntil.toISOString() } : {}),
        } satisfies HomepageProductModule);
      }
    }

    return { evaluatedAt: now.toISOString(), modules };
  }
}
