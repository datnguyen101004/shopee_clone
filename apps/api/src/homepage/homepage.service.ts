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
import { publicScheduledPrice } from '../catalog/catalog-presentation';

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
    @Inject(ScheduledDiscountService) private readonly scheduledDiscounts?: ScheduledDiscountService,
  ) {}

  async getHomepage(): Promise<HomepageResponse> {
    const now = this.clock.now();
    const records = await this.repository.findActive(now);
    const modules: HomepageModule[] = [];

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
      const discounts = this.scheduledDiscounts
        ? await this.scheduledDiscounts.resolveVariants(undefined, record.products.flatMap((entry) => entry.product.variants.map((variant) => ({ id: variant.id, productId: entry.product.id, priceMinor: variant.priceMinor, compareAtPriceMinor: variant.compareAtPriceMinor }))), now)
        : new Map();
      for (const entry of record.products) {
        const product = entry.product;
        if (!HomepageRepository.isDisplayableProduct(product)) continue;
        const variant = product.variants.find(
          (candidate) =>
            candidate.inventory !== null &&
            candidate.inventory.quantityOnHand - candidate.inventory.quantityReserved > 0,
        );
        if (!variant) continue;
        const discount = discounts.get(variant.id);
        const effectivePriceMinor = discount?.effectivePriceMinor ?? variant.priceMinor;
        const effectiveCompareAt = discount && discount.effectivePriceMinor !== discount.basePriceMinor
          ? (variant.compareAtPriceMinor === null || variant.compareAtPriceMinor < discount.basePriceMinor ? discount.basePriceMinor : variant.compareAtPriceMinor)
          : variant.compareAtPriceMinor;
        const priceMinor = safeMinor(effectivePriceMinor);
        if (priceMinor === null) continue;
        const compareAt = effectiveCompareAt
          ? safeMinor(effectiveCompareAt)
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
          ...(discount ? (() => { const scheduledPrice = publicScheduledPrice(discount); return scheduledPrice ? { scheduledPrice } : {}; })() : {}),
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
