import { HomepageModuleType, ProductStatus, ShopStatus } from '../generated/prisma/enums';
import type { HomepageClock } from './homepage.clock';
import type { HomepageRepository } from './homepage.repository';
import { HomepageService } from './homepage.service';

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
});
