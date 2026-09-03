import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { CatalogProductDetailService } from '../src/catalog/catalog-product-detail.service';
import type { NormalizedCatalogQuery } from '../src/catalog/catalog-query';
import { CatalogService } from '../src/catalog/catalog.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import {
  HomepageModuleType,
  ProductModerationStatus,
  ProductStatus,
  ShopOnboardingStatus,
  ShopStatus,
  VariantStatus,
} from '../src/generated/prisma/enums';
import { HomepageService } from '../src/homepage/homepage.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ShopStorefrontService } from '../src/shop-storefront/shop-storefront.service';
import { BuyerBestPriceService } from '../src/pricing/buyer-best-price.service';

const databaseTest =
  process.env.RUN_EFFECTIVE_PRICE_DATABASE_TESTS === '1' ? describe : describe.skip;

const campaignId = '00000000-0000-4000-8000-000000009934';
const homepageModuleId = '00000000-0000-4000-8000-000000009935';
const homepageEntryId = '00000000-0000-4000-8000-000000009936';
const productId = '00000000-0000-4000-8000-000000009937';
const variantId = '00000000-0000-4000-8000-000000009938';
const homepageKey = 'effective-price-integration';
const shippingAddressId = '00000000-0000-4000-8000-000000009939';
const shopVoucherId = '00000000-0000-4000-8000-000000009940';
const platformVoucherId = '00000000-0000-4000-8000-000000009941';
const shippingVoucherId = '00000000-0000-4000-8000-000000009942';
const buyerFixtureId = '00000000-0000-4000-8000-000000009943';

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('Effective product price with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let catalog: CatalogService;
  let detail: CatalogProductDetailService;
  let homepage: HomepageService;
  let storefront: ShopStorefrontService;
  let buyerPrices: BuyerBestPriceService;
  let buyerId: string;
  let originalPickupProvince: string | null;
  let product: {
    id: string;
    name: string;
    shopId: string;
    shop: {
      slug: string;
      ownerId: string;
      name: string;
      location: string;
      pickupProvince: string | null;
    };
    variants: Array<{
      id: string;
      priceMinor: bigint;
      inventory: { quantityOnHand: number; quantityReserved: number } | null;
    }>;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    catalog = app.get(CatalogService);
    detail = app.get(CatalogProductDetailService);
    homepage = app.get(HomepageService);
    storefront = app.get(ShopStorefrontService);
    buyerPrices = app.get(BuyerBestPriceService);

    await prisma.homepageModule.deleteMany({
      where: { OR: [{ id: homepageModuleId }, { key: homepageKey }] },
    });
    await prisma.shopDiscountCampaign.deleteMany({ where: { id: campaignId } });
    await prisma.voucher.deleteMany({
      where: { id: { in: [shopVoucherId, platformVoucherId, shippingVoucherId] } },
    });
    await prisma.shippingAddress.deleteMany({ where: { id: shippingAddressId } });
    await prisma.user.deleteMany({ where: { id: buyerFixtureId } });
    await prisma.inventory.deleteMany({ where: { variantId } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    const fixture = await prisma.product.findFirstOrThrow({
      where: {
        status: ProductStatus.ACTIVE,
        moderationStatus: ProductModerationStatus.ACTIVE,
        deletedAt: null,
        shop: {
          status: ShopStatus.ACTIVE,
          onboardingStatus: ShopOnboardingStatus.APPROVED,
          deletedAt: null,
        },
        variants: {
          some: {
            status: VariantStatus.ACTIVE,
            deletedAt: null,
            inventory: { is: { quantityOnHand: { gt: 0 } } },
          },
        },
      },
      select: {
        categoryId: true,
        shopId: true,
        shop: {
          select: {
            slug: true,
            ownerId: true,
            name: true,
            location: true,
            pickupProvince: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });
    product = await prisma.product.create({
      data: {
        id: productId,
        shopId: fixture.shopId,
        categoryId: fixture.categoryId,
        slug: 'effective-price-integration-product',
        name: 'T34 Effective Price Unique Product',
        description: 'Deterministic PostgreSQL effective price fixture',
        status: ProductStatus.ACTIVE,
        variants: {
          create: {
            id: variantId,
            sku: 'T34-EFFECTIVE-PRICE',
            name: 'Default',
            priceMinor: 100_000n,
            status: VariantStatus.ACTIVE,
            inventory: { create: { quantityOnHand: 10, quantityReserved: 1 } },
          },
        },
      },
      select: {
        id: true,
        name: true,
        shopId: true,
        shop: {
          select: {
            slug: true,
            ownerId: true,
            name: true,
            location: true,
            pickupProvince: true,
          },
        },
        variants: { select: { id: true, priceMinor: true, inventory: true } },
      },
    });

    buyerId = buyerFixtureId;
    await prisma.user.create({
      data: {
        id: buyerId,
        email: 't34-buyer-preview@shopee-clone.local',
        displayName: 'T34 Buyer Preview',
      },
    });

    const shopBefore = await prisma.shop.findUniqueOrThrow({
      where: { id: product.shopId },
      select: { pickupProvince: true },
    });
    originalPickupProvince = shopBefore.pickupProvince;
    await prisma.shop.update({
      where: { id: product.shopId },
      data: { pickupProvince: 'Thành phố Hà Nội' },
    });
    await prisma.shippingAddress.create({
      data: {
        id: shippingAddressId,
        userId: buyerId,
        recipientName: 'Buyer Preview',
        phoneNumber: '0900000000',
        province: 'Thành phố Hồ Chí Minh',
        district: 'Quận 1',
        ward: 'Bến Nghé',
        addressLine: '1 Nguyễn Huệ',
        isDefault: true,
      },
    });

    const now = new Date();
    await prisma.shopDiscountCampaign.create({
      data: {
        id: campaignId,
        shopId: product.shopId,
        name: 'Effective price integration',
        startsAt: new Date(now.getTime() - 60_000),
        endsAt: new Date(now.getTime() + 3_600_000),
        products: { create: { productId: product.id, discountBasisPoints: 2_000 } },
      },
    });
    await prisma.homepageModule.create({
      data: {
        id: homepageModuleId,
        key: homepageKey,
        type: HomepageModuleType.DAILY_RECOMMENDATIONS,
        title: 'Effective price integration',
        sortOrder: 999_999,
        products: {
          create: { id: homepageEntryId, productId: product.id, sortOrder: 0 },
        },
      },
    });
    const voucherWindow = {
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 3_600_000),
      usageLimit: 100,
      perBuyerLimit: 2,
      productScopes: { create: { productId: product.id } },
    };
    await prisma.voucher.create({
      data: {
        id: shopVoucherId,
        code: 'T34SHOP10K',
        name: 'T34 Shop 10K',
        issuer: 'SHOP',
        shopId: product.shopId,
        benefitType: 'FIXED_AMOUNT',
        fixedAmountMinor: 10_000n,
        ...voucherWindow,
      },
    });
    await prisma.voucher.create({
      data: {
        id: platformVoucherId,
        code: 'T34PLATFORM5K',
        name: 'T34 Platform 5K',
        issuer: 'PLATFORM',
        benefitType: 'FIXED_AMOUNT',
        fixedAmountMinor: 5_000n,
        ...voucherWindow,
      },
    });
    await prisma.voucher.create({
      data: {
        id: shippingVoucherId,
        code: 'T34FREESHIP15K',
        name: 'T34 Freeship 15K',
        issuer: 'PLATFORM',
        benefitType: 'FREE_SHIPPING',
        maximumDiscountMinor: 15_000n,
        ...voucherWindow,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.homepageModule.deleteMany({
        where: { OR: [{ id: homepageModuleId }, { key: homepageKey }] },
      });
      await prisma.shopDiscountCampaign.deleteMany({ where: { id: campaignId } });
      await prisma.voucher.deleteMany({
        where: { id: { in: [shopVoucherId, platformVoucherId, shippingVoucherId] } },
      });
      await prisma.shippingAddress.deleteMany({ where: { id: shippingAddressId } });
      await prisma.user.deleteMany({ where: { id: buyerFixtureId } });
      await prisma.shop.update({
        where: { id: product.shopId },
        data: { pickupProvince: originalPickupProvince },
      });
      await prisma.inventory.deleteMany({ where: { variantId } });
      await prisma.productVariant.deleteMany({ where: { id: variantId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    await app?.close();
  });

  it('keeps catalog, public shop, homepage, and detail aligned without changing stored base price', async () => {
    const representative = product.variants.find(
      (variant) =>
        variant.inventory !== null &&
        variant.inventory.quantityOnHand - variant.inventory.quantityReserved > 0,
    );
    if (!representative) throw new Error('Expected one in-stock integration variant.');
    const expected = representative.priceMinor - (representative.priceMinor * 2_000n) / 10_000n;
    const expectedNumber = Number(expected);
    const query: NormalizedCatalogQuery = {
      q: product.name,
      category: null,
      minPrice: null,
      maxPrice: null,
      rating: null,
      location: null,
      availability: null,
      promotion: null,
      sort: 'price-asc',
      page: 1,
      pageSize: 48,
    };

    const [catalogResponse, shopResponse, homepageResponse, detailResponse] = await Promise.all([
      catalog.getProducts(query),
      storefront.products(product.shop.slug, {
        q: product.name,
        category: null,
        sort: 'price-asc',
        page: 1,
        pageSize: 48,
      }),
      homepage.getHomepage(),
      detail.getProduct(product.id),
    ]);
    const catalogCard = catalogResponse.items.find((item) => item.id === product.id);
    const shopCard = shopResponse.items.find((item) => item.id === product.id);
    const homepageModule = homepageResponse.modules.find(
      (module) => module.id === homepageModuleId,
    );
    const homepageProduct =
      homepageModule && 'products' in homepageModule
        ? homepageModule.products.find((item) => item.id === product.id)
        : undefined;
    const detailVariant = detailResponse.variants.find(
      (variant) => variant.id === representative.id,
    );

    const surfaces = { catalogCard, shopCard, homepageProduct, detailVariant };
    expect(
      Object.entries(surfaces)
        .filter(([, item]) => item === undefined)
        .map(([surface]) => surface),
    ).toEqual([]);
    for (const item of Object.values(surfaces)) {
      expect(item).toMatchObject({
        priceMinor: expectedNumber,
        scheduledPrice: {
          basePriceMinor: Number(representative.priceMinor),
          effectivePriceMinor: expectedNumber,
          campaignId,
        },
      });
      expect(Date.parse(item!.scheduledPrice!.evaluatedAt)).not.toBeNaN();
    }
    expect(
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: representative.id },
        select: { priceMinor: true },
      }),
    ).toEqual({ priceMinor: representative.priceMinor });
  });

  it('keeps guest pricing effective and aligns buyer voucher previews without consuming usage', async () => {
    const previousFlag = process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED;
    process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED = 'true';
    try {
      const query: NormalizedCatalogQuery = {
        q: product.name,
        category: null,
        minPrice: null,
        maxPrice: null,
        rating: null,
        location: null,
        availability: null,
        promotion: null,
        sort: 'price-asc',
        page: 1,
        pageSize: 48,
      };
      const usageBefore = await prisma.voucherUserUsage.count({ where: { userId: buyerId } });
      const [guest, catalogResponse, shopResponse, homepageResponse, detailResponse] =
        await Promise.all([
          catalog.getProducts(query),
          catalog.getProducts(query, buyerId),
          storefront.products(
            product.shop.slug,
            { q: product.name, category: null, sort: 'price-asc', page: 1, pageSize: 48 },
            buyerId,
          ),
          homepage.getHomepage(buyerId),
          detail.getProduct(product.id, buyerId),
        ]);
      expect(guest.items.find((item) => item.id === product.id)).not.toHaveProperty(
        'buyerBestPrice',
      );
      const homepageModule = homepageResponse.modules.find(
        (module) => module.id === homepageModuleId,
      );
      const surfaces = [
        catalogResponse.items.find((item) => item.id === product.id),
        shopResponse.items.find((item) => item.id === product.id),
        homepageModule && 'products' in homepageModule
          ? homepageModule.products.find((item) => item.id === product.id)
          : undefined,
        detailResponse.variants.find((variant) => variant.id === variantId),
      ];
      const previews = surfaces.map((item) => item?.buyerBestPrice);
      expect(previews.every(Boolean)).toBe(true);
      const first = previews[0]!;
      expect(first).toMatchObject({
        effectivePriceMinor: 80_000,
        shopVoucher: { code: 'T34SHOP10K' },
        shipping: { service: 'STANDARD' },
      });
      expect(first.merchandisePayableMinor).toBeLessThanOrEqual(65_000);
      expect(first.platformVoucherDiscountMinor).toBeGreaterThanOrEqual(5_000);
      expect(first.shipping!.shippingVoucherDiscountMinor).toBeGreaterThanOrEqual(15_000);
      for (const preview of previews.slice(1)) {
        expect(preview).toMatchObject({
          merchandisePayableMinor: first.merchandisePayableMinor,
          shopVoucher: { code: first.shopVoucher!.code },
          platformVoucher: { code: first.platformVoucher!.code },
          shipping: {
            shippingVoucherDiscountMinor: first.shipping!.shippingVoucherDiscountMinor,
          },
        });
      }
      expect(await prisma.voucherUserUsage.count({ where: { userId: buyerId } })).toBe(usageBefore);
    } finally {
      if (previousFlag === undefined) delete process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED;
      else process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED = previousFlag;
    }
  });

  it('falls back consistently for disabled, archived, future, expired, and ineffective campaigns', async () => {
    const states = [
      {
        name: 'disabled',
        campaign: {
          isEnabled: false,
          archivedAt: null,
          startsAt: new Date('2020-01-01T00:00:00.000Z'),
          endsAt: new Date('2100-01-01T00:00:00.000Z'),
        },
        priceMinor: 100_000n,
        expected: 100_000,
      },
      {
        name: 'archived',
        campaign: {
          isEnabled: true,
          archivedAt: new Date('2099-08-31T00:00:00.000Z'),
          startsAt: new Date('2020-01-01T00:00:00.000Z'),
          endsAt: new Date('2100-01-01T00:00:00.000Z'),
        },
        priceMinor: 100_000n,
        expected: 100_000,
      },
      {
        name: 'future',
        campaign: {
          isEnabled: true,
          archivedAt: null,
          startsAt: new Date('2100-01-01T00:00:00.000Z'),
          endsAt: new Date('2101-01-01T00:00:00.000Z'),
        },
        priceMinor: 100_000n,
        expected: 100_000,
      },
      {
        name: 'expired',
        campaign: {
          isEnabled: true,
          archivedAt: null,
          startsAt: new Date('2020-01-01T00:00:00.000Z'),
          endsAt: new Date('2021-01-01T00:00:00.000Z'),
        },
        priceMinor: 100_000n,
        expected: 100_000,
      },
      {
        name: 'ineffective',
        campaign: {
          isEnabled: true,
          archivedAt: null,
          startsAt: new Date('2020-01-01T00:00:00.000Z'),
          endsAt: new Date('2100-01-01T00:00:00.000Z'),
        },
        priceMinor: 1n,
        expected: 1,
      },
    ] as const;

    for (const state of states) {
      await prisma.productVariant.update({
        where: { id: variantId },
        data: { priceMinor: state.priceMinor },
      });
      await prisma.shopDiscountCampaign.update({
        where: { id: campaignId },
        data: state.campaign,
      });
      const query: NormalizedCatalogQuery = {
        q: product.name,
        category: null,
        minPrice: null,
        maxPrice: null,
        rating: null,
        location: null,
        availability: null,
        promotion: null,
        sort: 'price-asc',
        page: 1,
        pageSize: 48,
      };
      const [catalogResponse, shopResponse, homepageResponse, detailResponse] = await Promise.all([
        catalog.getProducts(query),
        storefront.products(product.shop.slug, {
          q: product.name,
          category: null,
          sort: 'price-asc',
          page: 1,
          pageSize: 48,
        }),
        homepage.getHomepage(),
        detail.getProduct(product.id),
      ]);
      const homepageModule = homepageResponse.modules.find(
        (module) => module.id === homepageModuleId,
      );
      const prices = {
        catalog: catalogResponse.items.find((item) => item.id === product.id),
        shop: shopResponse.items.find((item) => item.id === product.id),
        homepage:
          homepageModule && 'products' in homepageModule
            ? homepageModule.products.find((item) => item.id === product.id)
            : undefined,
        detail: detailResponse.variants.find((variant) => variant.id === variantId),
      };
      expect(
        Object.entries(prices)
          .filter(([, item]) => item === undefined)
          .map(([surface]) => surface),
      ).toEqual([]);
      for (const item of Object.values(prices)) {
        expect(item).toMatchObject({ priceMinor: state.expected });
        expect(item).not.toHaveProperty('scheduledPrice');
      }
    }

    await prisma.productVariant.update({
      where: { id: variantId },
      data: { priceMinor: 100_000n },
    });
  });

  it('keeps the 48-card PostgreSQL preview enrichment p95 within 75 ms', async () => {
    const previousFlag = process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED;
    process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED = 'true';
    try {
      const snapshots = Array.from({ length: 48 }, (_, index) => ({
        productId: product.id,
        variantId: `preview-variant-${index}`,
        effectivePriceMinor: 80_000,
        weightGrams: 500,
        shop: {
          id: product.shopId,
          ownerUserId: product.shop.ownerId,
          slug: product.shop.slug,
          name: product.shop.name,
          location: product.shop.location,
          pickupProvince: product.shop.pickupProvince,
        },
      }));
      const durations: number[] = [];
      for (let run = 0; run < 10; run += 1) {
        const startedAt = performance.now();
        const previews = await buyerPrices.previews(buyerId, snapshots, new Date());
        durations.push(performance.now() - startedAt);
        expect(previews.size).toBe(48);
      }
      durations.sort((left, right) => left - right);
      const p95 = durations[Math.ceil(durations.length * 0.95) - 1]!;
      expect(p95).toBeLessThanOrEqual(75);
    } finally {
      if (previousFlag === undefined) delete process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED;
      else process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED = previousFlag;
    }
  });
});
