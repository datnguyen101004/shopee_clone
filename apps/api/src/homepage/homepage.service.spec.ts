import { HomepageModuleType, ProductStatus, ShopStatus } from '../generated/prisma/enums';
import type { HomepageClock } from './homepage.clock';
import type { HomepageRepository } from './homepage.repository';
import type { ScheduledDiscountService } from '../pricing/scheduled-discount.service';
import { HomepageService } from './homepage.service';
import type { CatalogPublicFacade } from '../catalog/catalog-public.facade';
import type { CatalogProductCard } from '@shopee-clone/contracts';
import type { SearchConfig } from '../search/search.config';

const now = new Date('2026-08-12T10:00:00.000Z');

function productRecord() {
  return {
    id: 'entry-1',
    label: 'Bán chạy',
    soldCount: 1200,
    sortOrder: 1,
    productId: 'product-1',
    moduleId: 'module-1',
    product: {
      id: 'product-1',
      name: 'Tai nghe không dây',
      status: ProductStatus.ACTIVE,
      deletedAt: null,
      shop: { name: 'Tech Store', status: ShopStatus.ACTIVE, deletedAt: null },
      images: [{ url: '/media/products/wireless-earbuds.jpg', altText: null }],
      variants: [
        {
          id: 'v1',
          priceMinor: 100_000n,
          compareAtPriceMinor: 120_000n,
          inventory: { quantityOnHand: 2, quantityReserved: 1 },
        },
        {
          id: 'v2',
          priceMinor: 200_000n,
          compareAtPriceMinor: null,
          inventory: { quantityOnHand: 3, quantityReserved: 0 },
        },
      ],
    },
  };
}

function moduleRecord(type: HomepageModuleType = HomepageModuleType.FLASH_SALE) {
  return {
    id: 'module-1',
    key: 'flash',
    type,
    title: 'Flash Sale',
    subtitle: null,
    sortOrder: 10,
    isEnabled: true,
    activeFrom: null,
    activeUntil: null,
    createdAt: now,
    updatedAt: now,
    banners: [],
    categories: [],
    products: [productRecord()],
  };
}

function recommendationCard(
  id: string,
  shopName: string,
  categoryName: string,
): CatalogProductCard {
  return {
    id,
    name: `Sản phẩm ${id}`,
    href: `/products/${id}`,
    imageUrl: null,
    imageAlt: `Sản phẩm ${id}`,
    priceMinor: 100_000,
    ratingAverageBasisPoints: 450,
    ratingCount: 20,
    soldCount: 100,
    shop: { name: shopName, location: 'Hà Nội' },
    category: { name: categoryName, slug: categoryName.toLowerCase() },
  };
}

function searchConfig(dailyRecommendations = true): SearchConfig {
  return {
    elasticsearch: {
      url: 'http://127.0.0.1:9200',
      productIndexAlias: 'products-search',
      requestTimeoutMs: 150,
      indexingRequestTimeoutMs: 30_000,
      indexFreshnessTargetSeconds: 30,
      incrementalBatchSize: 250,
      periodicReconciliationWindowSeconds: 3_600,
      personalizationProfileTimeoutMs: 100,
    },
    features: {
      baselineSearch: true,
      personalization: true,
      dailyRecommendations,
    },
  };
}

describe('HomepageService', () => {
  it('maps the lowest available offer and a safe stable product link', async () => {
    const repository = { findActive: jest.fn().mockResolvedValue([moduleRecord()]) };
    const service = new HomepageService(repository as unknown as HomepageRepository, {
      now: () => now,
    });
    const response = await service.getHomepage();

    expect(repository.findActive).toHaveBeenCalledWith(now);
    expect(response.evaluatedAt).toBe(now.toISOString());
    expect(response.modules[0]).toMatchObject({
      type: 'flash-sale',
      products: [
        { priceMinor: 100_000, compareAtPriceMinor: 120_000, href: '/products/product-1' },
      ],
    });
  });

  it('drops unsafe banners and independently empty modules', async () => {
    const campaign = {
      ...moduleRecord(HomepageModuleType.CAMPAIGN_BANNER),
      products: [],
      banners: [
        {
          id: 'banner',
          eyebrow: null,
          title: 'Unsafe',
          description: null,
          imageUrl: null,
          altText: null,
          destinationPath: 'https://example.com',
          themeKey: 'brand',
          sortOrder: 1,
          moduleId: 'module-1',
        },
      ],
    };
    const repository = { findActive: jest.fn().mockResolvedValue([campaign]) };
    const service = new HomepageService(repository as unknown as HomepageRepository, {
      now: () => now,
    } satisfies HomepageClock);
    await expect(service.getHomepage()).resolves.toEqual({
      evaluatedAt: now.toISOString(),
      modules: [],
    });
  });

  it('resolves all module variants once and exposes the matching effective price', async () => {
    const repository = { findActive: jest.fn().mockResolvedValue([moduleRecord()]) };
    const scheduledDiscounts = {
      resolveVariants: jest.fn().mockImplementation(
        async (_transaction, variants, evaluatedAt) =>
          new Map(
            variants.map(
              (variant: {
                id: string;
                productId: string;
                priceMinor: bigint;
                compareAtPriceMinor: bigint | null;
              }) => [
                variant.id,
                {
                  variantId: variant.id,
                  productId: variant.productId,
                  basePriceMinor: variant.priceMinor,
                  effectivePriceMinor: variant.priceMinor - 20_000n,
                  compareAtPriceMinor: variant.compareAtPriceMinor,
                  discountBasisPoints: 2_000,
                  campaignId: 'campaign-1',
                  evaluatedAt,
                },
              ],
            ),
          ),
      ),
    };
    const service = new HomepageService(
      repository as unknown as HomepageRepository,
      { now: () => now },
      scheduledDiscounts as unknown as ScheduledDiscountService,
    );

    const response = await service.getHomepage();
    expect(response.modules[0]).toMatchObject({
      products: [
        {
          priceMinor: 80_000,
          compareAtPriceMinor: 120_000,
          scheduledPrice: {
            basePriceMinor: 100_000,
            effectivePriceMinor: 80_000,
            campaignId: 'campaign-1',
            evaluatedAt: now.toISOString(),
          },
        },
      ],
    });
    expect(scheduledDiscounts.resolveVariants).toHaveBeenCalledTimes(1);
    expect(scheduledDiscounts.resolveVariants.mock.calls[0]?.[1]).toHaveLength(2);
    expect(scheduledDiscounts.resolveVariants.mock.calls[0]?.[2]).toBe(now);
  });

  it('uses personalized relevance for buyers and a best-selling baseline for guests', async () => {
    const repository = {
      findActive: jest
        .fn()
        .mockResolvedValue([moduleRecord(HomepageModuleType.DAILY_RECOMMENDATIONS)]),
    };
    const catalog = {
      getProducts: jest
        .fn()
        .mockResolvedValue({ items: [recommendationCard('product-1', 'Shop', 'Phones')] }),
    };
    const service = new HomepageService(
      repository as unknown as HomepageRepository,
      { now: () => now },
      undefined,
      undefined,
      catalog as unknown as CatalogPublicFacade,
      searchConfig(),
    );

    await service.getHomepage('buyer-1');
    expect(catalog.getProducts.mock.calls[0]?.[0]).toMatchObject({
      sort: 'relevance',
      page: 1,
      pageSize: 48,
      availability: 'in-stock',
      recommendationSurface: 'daily-recommendations',
    });
    await service.getHomepage(null);
    expect(catalog.getProducts.mock.calls[1]?.[0]).toMatchObject({ sort: 'best-selling' });
  });

  it('limits daily recommendations to 24 unique products with shop/category caps', async () => {
    const daily = {
      ...moduleRecord(HomepageModuleType.DAILY_RECOMMENDATIONS),
      products: [],
    };
    const cards = [
      ...Array.from({ length: 10 }, (_, index) =>
        recommendationCard(`same-${index}`, 'Same Shop', 'Same Category'),
      ),
      ...Array.from({ length: 30 }, (_, index) =>
        recommendationCard(`unique-${index}`, `Shop ${index}`, `Category ${index}`),
      ),
    ];
    const repository = { findActive: jest.fn().mockResolvedValue([daily]) };
    const catalog = {
      getProducts: jest.fn().mockResolvedValue({ items: cards }),
    };
    const service = new HomepageService(
      repository as unknown as HomepageRepository,
      { now: () => now },
      undefined,
      undefined,
      catalog as unknown as CatalogPublicFacade,
      searchConfig(),
    );

    const response = await service.getHomepage('buyer-1');
    const products = (response.modules[0] as { products: Array<{ id: string; shopName: string }> })
      .products;
    expect(products).toHaveLength(24);
    expect(new Set(products.map((product) => product.id)).size).toBe(24);
    expect(products.filter((product) => product.shopName === 'Same Shop')).toHaveLength(3);
    expect(response.modules[0]).toMatchObject({ type: 'daily-recommendations' });
  });

  it('falls back to configured daily products and preserves unrelated modules', async () => {
    const flash = moduleRecord(HomepageModuleType.FLASH_SALE);
    const daily = moduleRecord(HomepageModuleType.DAILY_RECOMMENDATIONS);
    const repository = { findActive: jest.fn().mockResolvedValue([flash, daily]) };
    const catalog = { getProducts: jest.fn().mockRejectedValue(new Error('search unavailable')) };
    const service = new HomepageService(
      repository as unknown as HomepageRepository,
      { now: () => now },
      undefined,
      undefined,
      catalog as unknown as CatalogPublicFacade,
      searchConfig(),
    );

    const response = await service.getHomepage('buyer-1');
    expect(response.modules.map((module) => module.type)).toEqual([
      'flash-sale',
      'daily-recommendations',
    ]);
    expect(response.modules[1]).toMatchObject({ products: [{ id: 'product-1' }] });
  });

  it('returns the available subset and treats an empty or stale candidate pool as a fallback', async () => {
    const daily = moduleRecord(HomepageModuleType.DAILY_RECOMMENDATIONS);
    const repository = { findActive: jest.fn().mockResolvedValue([daily]) };
    const catalog = {
      getProducts: jest
        .fn()
        .mockResolvedValueOnce({
          items: [recommendationCard('available-1', 'Shop', 'Category')],
        })
        .mockResolvedValueOnce({ items: [] }),
    };
    const service = new HomepageService(
      repository as unknown as HomepageRepository,
      { now: () => now },
      undefined,
      undefined,
      catalog as unknown as CatalogPublicFacade,
      searchConfig(),
    );

    const subset = await service.getHomepage('buyer-1');
    expect(subset.modules[0]).toMatchObject({ products: [{ id: 'available-1' }] });

    const fallback = await service.getHomepage('buyer-1');
    expect(fallback.modules[0]).toMatchObject({ products: [{ id: 'product-1' }] });
  });

  it('does not query recommendation candidates when the daily flag is disabled', async () => {
    const repository = {
      findActive: jest
        .fn()
        .mockResolvedValue([moduleRecord(HomepageModuleType.DAILY_RECOMMENDATIONS)]),
    };
    const catalog = { getProducts: jest.fn() };
    const service = new HomepageService(
      repository as unknown as HomepageRepository,
      { now: () => now },
      undefined,
      undefined,
      catalog as unknown as CatalogPublicFacade,
      searchConfig(false),
    );

    const response = await service.getHomepage('buyer-1');
    expect(catalog.getProducts).not.toHaveBeenCalled();
    expect(response.modules[0]).toMatchObject({
      type: 'daily-recommendations',
      products: [{ id: 'product-1' }],
    });
  });
});
