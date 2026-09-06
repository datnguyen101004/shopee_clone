import {
  HomepageModuleType,
  MarketplaceRole,
  ProductStatus,
  RoleAuditAction,
  RoleAuditSource,
  ShopOnboardingStatus,
  ShopStatus,
  UserStatus,
  VoucherBenefitType,
  VoucherIssuer,
} from '../src/generated/prisma/enums';
import {
  assertVoucherProductScopeConsistency,
  canonicalizeVoucherDefinition,
} from '../src/vouchers/voucher-definition';
import { createPrismaClient } from './create-prisma-client';
import { importCanonicalDataset } from './dataset/importer';
import {
  seedCategories,
  seedHomepageBanners,
  seedHomepageModules,
  seedMarketplaceCampaignTypes,
  seedMarketplaceCampaignFixtureIds,
  seedShops,
  seedShopFollowers,
  seedShippingAddresses,
  seedUnavailableEngagementProduct,
  seedUsers,
  seedVoucherCodes,
  seedVoucherFixtureIds,
} from './seed-data';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the marketplace database.');
}

const prisma = createPrismaClient(databaseUrl);

async function seedMarketplace() {
  await prisma.$transaction(async (transaction) => {
    for (const user of seedUsers) {
      await transaction.user.upsert({
        where: { id: user.id },
        create: { ...user, status: UserStatus.ACTIVE },
        update: {
          email: user.email,
          displayName: user.displayName,
          phoneNumber: user.phoneNumber,
          passwordHash: user.passwordHash,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      });
    }

    for (const userId of new Set(seedShippingAddresses.map(({ userId }) => userId))) {
      await transaction.shippingAddress.updateMany({
        where: { userId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    }
    for (const address of seedShippingAddresses) {
      await transaction.shippingAddress.upsert({
        where: { id: address.id },
        create: address,
        update: {
          userId: address.userId,
          recipientName: address.recipientName,
          phoneNumber: address.phoneNumber,
          province: address.province,
          district: address.district,
          ward: address.ward,
          addressLine: address.addressLine,
          label: address.label,
          isDefault: address.isDefault,
          createdAt: address.createdAt,
          updatedAt: address.updatedAt,
          deletedAt: null,
        },
      });
    }

    for (const shop of seedShops) {
      await transaction.shop.upsert({
        where: { id: shop.id },
        create: {
          ...shop,
          status: ShopStatus.ACTIVE,
          onboardingStatus: ShopOnboardingStatus.APPROVED,
        },
        update: {
          ownerId: shop.ownerId,
          slug: shop.slug,
          name: shop.name,
          location: shop.location,
          pickupProvince: shop.pickupProvince,
          pickupDistrict: shop.pickupDistrict,
          status: ShopStatus.ACTIVE,
          onboardingStatus: ShopOnboardingStatus.APPROVED,
          deletedAt: null,
        },
      });
    }

    for (const [index, user] of seedUsers.entries()) {
      const assignment = await transaction.userRoleAssignment.createMany({
        data: {
          userId: user.id,
          role: MarketplaceRole.BUYER,
          source: RoleAuditSource.SEED,
        },
        skipDuplicates: true,
      });
      if (assignment.count === 1) {
        await transaction.roleAuditEvent.create({
          data: {
            id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            targetUserId: user.id,
            role: MarketplaceRole.BUYER,
            action: RoleAuditAction.GRANT,
            source: RoleAuditSource.SEED,
            reason: 'Buyer role assigned by deterministic local seed',
          },
        });
      }
    }

    for (const [index, ownerId] of [
      ...new Set(seedShops.map(({ ownerId }) => ownerId)),
    ].entries()) {
      const assignment = await transaction.userRoleAssignment.createMany({
        data: {
          userId: ownerId,
          role: MarketplaceRole.SELLER,
          source: RoleAuditSource.SEED,
        },
        skipDuplicates: true,
      });
      if (assignment.count === 1) {
        await transaction.roleAuditEvent.create({
          data: {
            id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            targetUserId: ownerId,
            role: MarketplaceRole.SELLER,
            action: RoleAuditAction.GRANT,
            source: RoleAuditSource.SEED,
            reason: 'Seller role assigned to deterministic shop owner',
          },
        });
      }
    }

    // The first deterministic local account is also the demo carrier operator.
    // This keeps the shared-login journey usable without granting carrier
    // authority to every buyer/seller account in a real environment.
    const carrierOperator = await transaction.userRoleAssignment.createMany({
      data: {
        userId: seedUsers[0].id,
        role: MarketplaceRole.CARRIER_OPERATOR,
        source: RoleAuditSource.SEED,
      },
      skipDuplicates: true,
    });
    if (carrierOperator.count === 1) {
      await transaction.roleAuditEvent.create({
        data: {
          id: '30000000-0000-4000-8000-000000000001',
          targetUserId: seedUsers[0].id,
          role: MarketplaceRole.CARRIER_OPERATOR,
          action: RoleAuditAction.GRANT,
          source: RoleAuditSource.SEED,
          reason: 'Carrier operator role assigned to deterministic local demo account',
        },
      });
    }

    for (const category of seedCategories) {
      await transaction.category.upsert({
        where: { id: category.id },
        create: { ...category, isActive: true },
        update: {
          parentId: category.parentId,
          slug: category.slug,
          name: category.name,
          sortOrder: category.sortOrder,
          isActive: true,
          deletedAt: null,
        },
      });
    }

    for (const module of seedHomepageModules) {
      await transaction.homepageModule.upsert({
        where: { id: module.id },
        create: { ...module, type: HomepageModuleType[module.type] },
        update: {
          key: module.key,
          type: HomepageModuleType[module.type],
          title: module.title,
          subtitle: module.subtitle,
          isEnabled: module.isEnabled,
          sortOrder: module.sortOrder,
          activeFrom: module.activeFrom,
          activeUntil: module.activeUntil,
        },
      });
    }

    for (const campaignType of seedMarketplaceCampaignTypes) {
      await transaction.marketplaceCampaignType.upsert({
        where: { id: campaignType.id },
        create: campaignType,
        update: {
          code: campaignType.code,
          displayName: campaignType.displayName,
          description: campaignType.description,
          policyKey: campaignType.policyKey,
          policyVersion: campaignType.policyVersion,
          policyConfig: campaignType.policyConfig,
          presentationKey: campaignType.presentationKey,
          productOrderKey: campaignType.productOrderKey,
          importanceClass: campaignType.importanceClass,
          rankingProfileKey: campaignType.rankingProfileKey,
          isEnabled: campaignType.isEnabled,
        },
      });
    }

    // Keep one deterministic campaign without any homepage banner. This
    // proves campaign content is independently seedable from CMS placements.
    await transaction.marketplaceCampaign.upsert({
      where: { id: seedMarketplaceCampaignFixtureIds.bannerDefault },
      create: {
        id: seedMarketplaceCampaignFixtureIds.bannerDefault,
        typeId: seedMarketplaceCampaignTypes[0].id,
        name: 'Banner seed campaign',
        description: 'Unpublished campaign owner for the canonical seed banner.',
        announceAt: new Date('2026-10-01T00:00:00.000Z'),
        enrollmentStartsAt: new Date('2026-10-02T00:00:00.000Z'),
        enrollmentEndsAt: new Date('2026-10-03T00:00:00.000Z'),
        startsAt: new Date('2026-10-04T00:00:00.000Z'),
        endsAt: new Date('2026-10-05T00:00:00.000Z'),
        minimumDiscountBasisPoints: 500,
        publishedAt: null,
        detailEyebrow: 'CHIẾN DỊCH MẪU',
        detailImageUrl: '/media/homepage/campaign-banner.jpg',
        detailAltText: 'Chiến dịch mẫu',
        detailThemeKey: 'brand',
        detailContentJson: [{ kind: 'paragraph', text: 'Nội dung chiến dịch mẫu.' }],
      },
      update: {
        typeId: seedMarketplaceCampaignTypes[0].id,
        name: 'Banner seed campaign',
        description: 'Unpublished campaign owner for the canonical seed banner.',
        announceAt: new Date('2026-10-01T00:00:00.000Z'),
        enrollmentStartsAt: new Date('2026-10-02T00:00:00.000Z'),
        enrollmentEndsAt: new Date('2026-10-03T00:00:00.000Z'),
        startsAt: new Date('2026-10-04T00:00:00.000Z'),
        endsAt: new Date('2026-10-05T00:00:00.000Z'),
        minimumDiscountBasisPoints: 500,
        publishedAt: null,
        cancelledAt: null,
        cancellationReason: null,
        detailEyebrow: 'CHIẾN DỊCH MẪU',
        detailImageUrl: '/media/homepage/campaign-banner.jpg',
        detailAltText: 'Chiến dịch mẫu',
        detailThemeKey: 'brand',
        detailContentJson: [{ kind: 'paragraph', text: 'Nội dung chiến dịch mẫu.' }],
      },
    });

    for (const banner of seedHomepageBanners) {
      await transaction.homepageBanner.upsert({
        where: { id: banner.id },
        create: {
          ...banner,
          isEnabled: true,
          priority: banner.sortOrder,
        },
        update: {
          ...banner,
          isEnabled: true,
          priority: banner.sortOrder,
        },
      });
    }

    await transaction.product.upsert({
      where: { id: seedUnavailableEngagementProduct.id },
      create: {
        id: seedUnavailableEngagementProduct.id,
        shopId: seedUnavailableEngagementProduct.shopId,
        categoryId: seedUnavailableEngagementProduct.categoryId,
        slug: seedUnavailableEngagementProduct.slug,
        name: seedUnavailableEngagementProduct.name,
        description: seedUnavailableEngagementProduct.description,
        status: ProductStatus.ARCHIVED,
      },
      update: {
        name: seedUnavailableEngagementProduct.name,
        description: seedUnavailableEngagementProduct.description,
        status: ProductStatus.ARCHIVED,
        deletedAt: null,
      },
    });
    await transaction.productImage.upsert({
      where: { id: seedUnavailableEngagementProduct.image.id },
      create: {
        id: seedUnavailableEngagementProduct.image.id,
        productId: seedUnavailableEngagementProduct.id,
        url: seedUnavailableEngagementProduct.image.url,
        altText: seedUnavailableEngagementProduct.image.altText,
      },
      update: {
        url: seedUnavailableEngagementProduct.image.url,
        altText: seedUnavailableEngagementProduct.image.altText,
      },
    });
  });

  const summary = await importCanonicalDataset(prisma);
  const availableProducts = await prisma.product.findMany({
    where: { datasetRecord: { isActive: true } },
    select: { id: true, shopId: true },
    orderBy: [{ id: 'asc' }],
    take: 50,
  });
  if (availableProducts.length < 3) {
    throw new Error('At least three canonical products are required for engagement seed data.');
  }

  // Deterministic campaign fixtures make the local seller/admin journeys
  // useful immediately after seeding. Dates are fixed so each lifecycle can
  // be exercised without mutating production data.
  const campaignTypes = await prisma.marketplaceCampaignType.findMany({
    where: { code: { in: ['STANDARD', 'FLASH_SALE', 'CHEAPEST_DEALS'] } },
    select: { id: true, code: true },
  });
  const typeIdByCode = new Map(campaignTypes.map((type) => [type.code, type.id]));
  const fixtureTimes = {
    draft: [
      '2026-10-01T00:00:00.000Z',
      '2026-10-02T00:00:00.000Z',
      '2026-10-03T00:00:00.000Z',
      '2026-10-04T00:00:00.000Z',
      '2026-10-05T00:00:00.000Z',
    ],
    enrolling: [
      '2026-09-01T00:00:00.000Z',
      '2026-09-02T00:00:00.000Z',
      '2026-09-20T00:00:00.000Z',
      '2026-09-21T00:00:00.000Z',
      '2026-09-30T00:00:00.000Z',
    ],
    scheduled: [
      '2026-08-01T00:00:00.000Z',
      '2026-08-02T00:00:00.000Z',
      '2026-08-10T00:00:00.000Z',
      '2026-09-10T00:00:00.000Z',
      '2026-09-30T00:00:00.000Z',
    ],
    active: [
      '2026-08-01T00:00:00.000Z',
      '2026-08-02T00:00:00.000Z',
      '2026-08-20T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      '2026-09-30T00:00:00.000Z',
    ],
    ended: [
      '2026-07-01T00:00:00.000Z',
      '2026-07-02T00:00:00.000Z',
      '2026-07-10T00:00:00.000Z',
      '2026-07-11T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
    ],
    cancelled: [
      '2026-09-01T00:00:00.000Z',
      '2026-09-02T00:00:00.000Z',
      '2026-09-20T00:00:00.000Z',
      '2026-09-21T00:00:00.000Z',
      '2026-09-30T00:00:00.000Z',
    ],
  } as const;
  const fixtureDefinitions = [
    { id: seedMarketplaceCampaignFixtureIds.draft, code: 'STANDARD', name: 'Fixture · Draft', times: fixtureTimes.draft, publishedAt: null, cancelledAt: null },
    { id: seedMarketplaceCampaignFixtureIds.enrolling, code: 'FLASH_SALE', name: 'Fixture · Enrollment open', times: fixtureTimes.enrolling, publishedAt: '2026-08-31T00:00:00.000Z', cancelledAt: null },
    { id: seedMarketplaceCampaignFixtureIds.scheduled, code: 'CHEAPEST_DEALS', name: 'Fixture · Scheduled', times: fixtureTimes.scheduled, publishedAt: '2026-07-31T00:00:00.000Z', cancelledAt: null },
    { id: seedMarketplaceCampaignFixtureIds.active, code: 'FLASH_SALE', name: 'Fixture · Active Flash Sale', times: fixtureTimes.active, publishedAt: '2026-07-31T00:00:00.000Z', cancelledAt: null },
    { id: seedMarketplaceCampaignFixtureIds.ended, code: 'STANDARD', name: 'Fixture · Ended', times: fixtureTimes.ended, publishedAt: '2026-06-30T00:00:00.000Z', cancelledAt: null },
    { id: seedMarketplaceCampaignFixtureIds.cancelled, code: 'CHEAPEST_DEALS', name: 'Fixture · Cancelled', times: fixtureTimes.cancelled, publishedAt: '2026-08-31T00:00:00.000Z', cancelledAt: '2026-08-31T01:00:00.000Z' },
  ] as const;
  const fixtureProduct = availableProducts[0]!;
  const secondFixtureProduct =
    availableProducts.find((product) => product.shopId === fixtureProduct.shopId && product.id !== fixtureProduct.id) ??
    availableProducts[1]!;
  await prisma.$transaction(async (transaction) => {
    for (const fixture of fixtureDefinitions) {
      const typeId = typeIdByCode.get(fixture.code);
      if (!typeId) throw new Error(`Missing seeded campaign type ${fixture.code}.`);
      const [announceAt, enrollmentStartsAt, enrollmentEndsAt, startsAt, endsAt] = fixture.times.map((value) => new Date(value));
      await transaction.marketplaceCampaign.upsert({
        where: { id: fixture.id },
        create: {
          id: fixture.id,
          typeId,
          name: fixture.name,
          description: `Dữ liệu kiểm thử ${fixture.name.toLowerCase()}.`,
          announceAt,
          enrollmentStartsAt,
          enrollmentEndsAt,
          startsAt,
          endsAt,
          minimumDiscountBasisPoints: fixture.code === 'FLASH_SALE' ? 1_000 : 500,
          publishedAt: fixture.publishedAt ? new Date(fixture.publishedAt) : null,
          cancelledAt: fixture.cancelledAt ? new Date(fixture.cancelledAt) : null,
          cancellationReason: fixture.cancelledAt ? 'Fixture cancellation state.' : null,
          detailEyebrow: 'CHIẾN DỊCH MẪU',
          detailImageUrl: '/media/homepage/campaign-banner.jpg',
          detailAltText: fixture.name,
          detailThemeKey: 'brand',
          detailContentJson: [{ kind: 'paragraph', text: `Nội dung ${fixture.name.toLowerCase()}.` }],
        },
        update: {
          typeId,
          name: fixture.name,
          announceAt,
          enrollmentStartsAt,
          enrollmentEndsAt,
          startsAt,
          endsAt,
          publishedAt: fixture.publishedAt ? new Date(fixture.publishedAt) : null,
          cancelledAt: fixture.cancelledAt ? new Date(fixture.cancelledAt) : null,
          cancellationReason: fixture.cancelledAt ? 'Fixture cancellation state.' : null,
        },
      });
    }

    const activeBannerContent = [
      { kind: 'heading', level: 2, text: 'Flash Sale mẫu' },
      { kind: 'paragraph', text: 'Sản phẩm mẫu được lấy từ chiến dịch Flash Sale đang hoạt động.' },
    ];
    for (const [index, banner] of seedHomepageBanners.entries()) {
      const targetType = index === 0 ? 'CAMPAIGN' : banner.targetType;
      const targetId = index === 0
        ? seedMarketplaceCampaignFixtureIds.active
        : ('targetId' in banner ? banner.targetId : null);
      const targetQuery = index === 0
        ? null
        : ('targetQuery' in banner ? banner.targetQuery : null);
      await transaction.homepageBanner.update({
        where: { id: banner.id },
        data: {
          targetType,
          targetId,
          targetQuery,
          priority: banner.sortOrder,
        },
      });
    }
    await transaction.marketplaceCampaign.update({
      where: { id: seedMarketplaceCampaignFixtureIds.active },
      data: {
        detailEyebrow: 'FLASH SALE MẪU',
        detailImageUrl: '/media/homepage/campaign-banner.jpg',
        detailAltText: 'Flash Sale mẫu',
        detailThemeKey: 'brand',
        detailContentJson: activeBannerContent,
      },
    });
    const flashModule = await transaction.homepageModule.findUniqueOrThrow({ where: { id: seedHomepageModules[2].id } });
    await transaction.homepageCampaignCollection.upsert({
      where: { moduleId_campaignId: { moduleId: flashModule.id, campaignId: seedMarketplaceCampaignFixtureIds.active } },
      create: { id: '00000000-0000-4000-8000-000000000931', moduleId: flashModule.id, campaignId: seedMarketplaceCampaignFixtureIds.active, typeId: typeIdByCode.get('FLASH_SALE')!, sortOrder: 1, isEnabled: true },
      update: { typeId: typeIdByCode.get('FLASH_SALE')!, sortOrder: 1, isEnabled: true },
    });

    const joined = await transaction.sellerCampaignParticipation.upsert({
      where: { campaignId_shopId: { campaignId: seedMarketplaceCampaignFixtureIds.active, shopId: fixtureProduct.shopId } },
      create: { campaignId: seedMarketplaceCampaignFixtureIds.active, shopId: fixtureProduct.shopId, state: 'JOINED', respondedAt: new Date('2026-08-20T00:00:00.000Z') },
      update: { state: 'JOINED', respondedAt: new Date('2026-08-20T00:00:00.000Z') },
    });
    await transaction.sellerCampaignProduct.deleteMany({ where: { participationId: joined.id } });
    await transaction.sellerCampaignProduct.create({ data: { participationId: joined.id, productId: fixtureProduct.id, discountBasisPoints: 1_500 } });
    await transaction.productPromotionReservation.upsert({
      where: { id: seedMarketplaceCampaignFixtureIds.activeReservation },
      create: { id: seedMarketplaceCampaignFixtureIds.activeReservation, productId: fixtureProduct.id, shopId: fixtureProduct.shopId, source: 'MARKETPLACE_CAMPAIGN', marketplaceCampaignId: seedMarketplaceCampaignFixtureIds.active, discountBasisPoints: 1_500, startsAt: new Date('2026-09-01T00:00:00.000Z'), endsAt: new Date('2026-09-30T00:00:00.000Z'), isEnabled: true },
      update: { productId: fixtureProduct.id, shopId: fixtureProduct.shopId, marketplaceCampaignId: seedMarketplaceCampaignFixtureIds.active, discountBasisPoints: 1_500, startsAt: new Date('2026-09-01T00:00:00.000Z'), endsAt: new Date('2026-09-30T00:00:00.000Z'), isEnabled: true },
    });

    const enrollingJoined = await transaction.sellerCampaignParticipation.upsert({
      where: { campaignId_shopId: { campaignId: seedMarketplaceCampaignFixtureIds.enrolling, shopId: fixtureProduct.shopId } },
      create: { campaignId: seedMarketplaceCampaignFixtureIds.enrolling, shopId: fixtureProduct.shopId, state: 'JOINED', respondedAt: new Date('2026-09-03T00:00:00.000Z') },
      update: { state: 'JOINED', respondedAt: new Date('2026-09-03T00:00:00.000Z') },
    });
    await transaction.sellerCampaignProduct.deleteMany({ where: { participationId: enrollingJoined.id } });
    await transaction.sellerCampaignProduct.create({ data: { participationId: enrollingJoined.id, productId: secondFixtureProduct.id, discountBasisPoints: 1_000 } });
    await transaction.productPromotionReservation.upsert({
      where: { id: seedMarketplaceCampaignFixtureIds.futureReservation },
      create: { id: seedMarketplaceCampaignFixtureIds.futureReservation, productId: secondFixtureProduct.id, shopId: secondFixtureProduct.shopId, source: 'MARKETPLACE_CAMPAIGN', marketplaceCampaignId: seedMarketplaceCampaignFixtureIds.enrolling, discountBasisPoints: 1_000, startsAt: new Date('2026-09-21T00:00:00.000Z'), endsAt: new Date('2026-09-30T00:00:00.000Z'), isEnabled: true },
      update: { productId: secondFixtureProduct.id, shopId: secondFixtureProduct.shopId, marketplaceCampaignId: seedMarketplaceCampaignFixtureIds.enrolling, discountBasisPoints: 1_000, startsAt: new Date('2026-09-21T00:00:00.000Z'), endsAt: new Date('2026-09-30T00:00:00.000Z'), isEnabled: true },
    });

    const declined = await transaction.sellerCampaignParticipation.upsert({
      where: { campaignId_shopId: { campaignId: seedMarketplaceCampaignFixtureIds.enrolling, shopId: seedShops[1].id } },
      create: { campaignId: seedMarketplaceCampaignFixtureIds.enrolling, shopId: seedShops[1].id, state: 'DECLINED', respondedAt: new Date('2026-09-03T00:00:00.000Z') },
      update: { state: 'DECLINED', respondedAt: new Date('2026-09-03T00:00:00.000Z') },
    });
    await transaction.sellerCampaignProduct.deleteMany({ where: { participationId: declined.id } });

    // Explicit response fixtures keep seller screens useful for every state;
    // conflict details are derived from the shared reservation table at read
    // time, so no invalid overlapping reservation is inserted into the seed.
    await transaction.sellerCampaignParticipation.upsert({
      where: { campaignId_shopId: { campaignId: seedMarketplaceCampaignFixtureIds.scheduled, shopId: fixtureProduct.shopId } },
      create: { campaignId: seedMarketplaceCampaignFixtureIds.scheduled, shopId: fixtureProduct.shopId, state: 'UNRESPONDED' },
      update: { state: 'UNRESPONDED', respondedAt: null },
    });
    const withdrawn = await transaction.sellerCampaignParticipation.upsert({
      where: { campaignId_shopId: { campaignId: seedMarketplaceCampaignFixtureIds.ended, shopId: fixtureProduct.shopId } },
      create: { campaignId: seedMarketplaceCampaignFixtureIds.ended, shopId: fixtureProduct.shopId, state: 'WITHDRAWN', respondedAt: new Date('2026-07-05T00:00:00.000Z') },
      update: { state: 'WITHDRAWN', respondedAt: new Date('2026-07-05T00:00:00.000Z') },
    });
    await transaction.sellerCampaignProduct.deleteMany({ where: { participationId: withdrawn.id } });
  });

  const favoriteFixtures = [
    {
      userId: seedUsers[0].id,
      productId: availableProducts[0]!.id,
      favoritedAt: new Date('2026-08-13T01:00:00.000Z'),
    },
    {
      userId: seedUsers[0].id,
      productId: seedUnavailableEngagementProduct.id,
      favoritedAt: new Date('2026-08-13T01:05:00.000Z'),
    },
    {
      userId: seedUsers[1].id,
      productId: availableProducts[1]!.id,
      favoritedAt: new Date('2026-08-13T01:10:00.000Z'),
    },
  ] as const;
  const recentlyViewedFixtures = [
    {
      userId: seedUsers[0].id,
      productId: availableProducts[0]!.id,
      lastViewedAt: new Date('2026-08-13T02:00:00.000Z'),
    },
    {
      userId: seedUsers[0].id,
      productId: availableProducts[1]!.id,
      lastViewedAt: new Date('2026-08-13T02:05:00.000Z'),
    },
    {
      userId: seedUsers[1].id,
      productId: availableProducts[2]!.id,
      lastViewedAt: new Date('2026-08-13T02:10:00.000Z'),
    },
  ] as const;

  const activeFrom = new Date('2020-01-01T00:00:00.000Z');
  const activeUntil = new Date('2999-01-01T00:00:00.000Z');
  const voucherDefinitions = [
    {
      id: seedVoucherFixtureIds.platformFixed,
      code: seedVoucherCodes.platformFixed,
      name: 'Sàn giảm 50K',
      issuer: VoucherIssuer.PLATFORM,
      shopId: null,
      benefitType: VoucherBenefitType.FIXED_AMOUNT,
      fixedAmountMinor: 50_000n,
      percentageBasisPoints: null,
      maximumDiscountMinor: null,
      minimumSpendMinor: 200_000n,
      startsAt: activeFrom,
      endsAt: activeUntil,
      isEnabled: true,
      usageLimit: 1_000,
      perBuyerLimit: 1,
      usedCount: 0,
    },
    {
      id: seedVoucherFixtureIds.platformPercentage,
      code: seedVoucherCodes.platformPercentage,
      name: 'Sàn giảm 10%',
      issuer: VoucherIssuer.PLATFORM,
      shopId: null,
      benefitType: VoucherBenefitType.PERCENTAGE,
      fixedAmountMinor: null,
      percentageBasisPoints: 1_000,
      maximumDiscountMinor: 100_000n,
      minimumSpendMinor: 100_000n,
      startsAt: activeFrom,
      endsAt: activeUntil,
      isEnabled: true,
      usageLimit: 1_000,
      perBuyerLimit: 1,
      usedCount: 0,
    },
    {
      id: seedVoucherFixtureIds.shopPercentage,
      code: seedVoucherCodes.shopPercentage,
      name: 'Shop giảm 15%',
      issuer: VoucherIssuer.SHOP,
      shopId: availableProducts[0]!.shopId,
      benefitType: VoucherBenefitType.PERCENTAGE,
      fixedAmountMinor: null,
      percentageBasisPoints: 1_500,
      maximumDiscountMinor: 60_000n,
      minimumSpendMinor: 50_000n,
      startsAt: activeFrom,
      endsAt: activeUntil,
      isEnabled: true,
      usageLimit: 500,
      perBuyerLimit: 1,
      usedCount: 0,
    },
    {
      id: seedVoucherFixtureIds.freeShipping,
      code: seedVoucherCodes.freeShipping,
      name: 'Miễn phí vận chuyển 30K',
      issuer: VoucherIssuer.PLATFORM,
      shopId: null,
      benefitType: VoucherBenefitType.FREE_SHIPPING,
      fixedAmountMinor: null,
      percentageBasisPoints: null,
      maximumDiscountMinor: 30_000n,
      minimumSpendMinor: 100_000n,
      startsAt: activeFrom,
      endsAt: activeUntil,
      isEnabled: true,
      usageLimit: 1_000,
      perBuyerLimit: 1,
      usedCount: 0,
    },
    {
      id: seedVoucherFixtureIds.expired,
      code: seedVoucherCodes.expired,
      name: 'Voucher đã hết hạn',
      issuer: VoucherIssuer.PLATFORM,
      shopId: null,
      benefitType: VoucherBenefitType.FIXED_AMOUNT,
      fixedAmountMinor: 10_000n,
      percentageBasisPoints: null,
      maximumDiscountMinor: null,
      minimumSpendMinor: 0n,
      startsAt: new Date('2019-01-01T00:00:00.000Z'),
      endsAt: new Date('2020-01-01T00:00:00.000Z'),
      isEnabled: true,
      usageLimit: 100,
      perBuyerLimit: 1,
      usedCount: 0,
    },
    {
      id: seedVoucherFixtureIds.future,
      code: seedVoucherCodes.future,
      name: 'Voucher chưa bắt đầu',
      issuer: VoucherIssuer.PLATFORM,
      shopId: null,
      benefitType: VoucherBenefitType.FIXED_AMOUNT,
      fixedAmountMinor: 10_000n,
      percentageBasisPoints: null,
      maximumDiscountMinor: null,
      minimumSpendMinor: 0n,
      startsAt: new Date('2998-01-01T00:00:00.000Z'),
      endsAt: new Date('2999-01-01T00:00:00.000Z'),
      isEnabled: true,
      usageLimit: 100,
      perBuyerLimit: 1,
      usedCount: 0,
    },
    {
      id: seedVoucherFixtureIds.exhausted,
      code: seedVoucherCodes.exhausted,
      name: 'Voucher đã hết lượt',
      issuer: VoucherIssuer.PLATFORM,
      shopId: null,
      benefitType: VoucherBenefitType.FIXED_AMOUNT,
      fixedAmountMinor: 10_000n,
      percentageBasisPoints: null,
      maximumDiscountMinor: null,
      minimumSpendMinor: 0n,
      startsAt: activeFrom,
      endsAt: activeUntil,
      isEnabled: true,
      usageLimit: 1,
      perBuyerLimit: 1,
      usedCount: 1,
    },
    {
      id: seedVoucherFixtureIds.buyerUsed,
      code: seedVoucherCodes.buyerUsed,
      name: 'Voucher người mua đã dùng',
      issuer: VoucherIssuer.PLATFORM,
      shopId: null,
      benefitType: VoucherBenefitType.FIXED_AMOUNT,
      fixedAmountMinor: 10_000n,
      percentageBasisPoints: null,
      maximumDiscountMinor: null,
      minimumSpendMinor: 0n,
      startsAt: activeFrom,
      endsAt: activeUntil,
      isEnabled: true,
      usageLimit: 100,
      perBuyerLimit: 1,
      usedCount: 1,
    },
  ] as const;
  for (const voucher of voucherDefinitions) canonicalizeVoucherDefinition(voucher);
  assertVoucherProductScopeConsistency(voucherDefinitions[2], [availableProducts[0]!]);

  await prisma.$transaction(async (transaction) => {
    for (const voucher of voucherDefinitions) {
      await transaction.voucher.upsert({
        where: { id: voucher.id },
        create: voucher,
        update: voucher,
      });
    }
    await transaction.voucherProductScope.deleteMany({
      where: { voucherId: { in: voucherDefinitions.map(({ id }) => id) } },
    });
    await transaction.voucherProductScope.create({
      data: {
        voucherId: seedVoucherFixtureIds.shopPercentage,
        productId: availableProducts[0]!.id,
      },
    });
    const usageFixtures = [
      {
        voucherId: seedVoucherFixtureIds.exhausted,
        userId: seedUsers[1].id,
        usedCount: 1,
      },
      {
        voucherId: seedVoucherFixtureIds.buyerUsed,
        userId: seedUsers[0].id,
        usedCount: 1,
      },
    ] as const;
    for (const usage of usageFixtures) {
      await transaction.voucherUserUsage.upsert({
        where: { voucherId_userId: { voucherId: usage.voucherId, userId: usage.userId } },
        create: usage,
        update: { usedCount: usage.usedCount },
      });
    }
    await transaction.voucherRedemption.deleteMany({
      where: {
        id: {
          in: [
            seedVoucherFixtureIds.exhaustedRedemption,
            seedVoucherFixtureIds.buyerUsedRedemption,
          ],
        },
      },
    });
    await transaction.voucherConsumption.deleteMany({
      where: {
        id: {
          in: [
            seedVoucherFixtureIds.exhaustedConsumption,
            seedVoucherFixtureIds.buyerUsedConsumption,
          ],
        },
      },
    });
    for (const favorite of favoriteFixtures) {
      await transaction.productFavorite.upsert({
        where: { userId_productId: { userId: favorite.userId, productId: favorite.productId } },
        create: favorite,
        update: { favoritedAt: favorite.favoritedAt },
      });
    }
    for (const view of recentlyViewedFixtures) {
      await transaction.recentlyViewedProduct.upsert({
        where: { userId_productId: { userId: view.userId, productId: view.productId } },
        create: view,
        update: { lastViewedAt: view.lastViewedAt },
      });
    }
    for (const follower of seedShopFollowers) {
      await transaction.shopFollower.upsert({
        where: { userId_shopId: { userId: follower.userId, shopId: follower.shopId } },
        create: follower,
        update: { followedAt: follower.followedAt },
      });
    }
  });

  return summary;
}

seedMarketplace()
  .then((summary) => {
    console.log(`Deterministic marketplace seed completed: ${JSON.stringify(summary)}.`);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
