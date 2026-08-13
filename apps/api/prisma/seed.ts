import {
  HomepageModuleType,
  MarketplaceRole,
  ProductStatus,
  RoleAuditAction,
  RoleAuditSource,
  ShopStatus,
  UserStatus,
} from '../src/generated/prisma/enums';
import { createPrismaClient } from './create-prisma-client';
import { importCanonicalDataset } from './dataset/importer';
import {
  seedCategories,
  seedHomepageBanners,
  seedHomepageModules,
  seedShops,
  seedShopFollowers,
  seedShippingAddresses,
  seedUnavailableEngagementProduct,
  seedUsers,
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
        create: { ...shop, status: ShopStatus.ACTIVE },
        update: {
          ownerId: shop.ownerId,
          slug: shop.slug,
          name: shop.name,
          location: shop.location,
          status: ShopStatus.ACTIVE,
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

    for (const banner of seedHomepageBanners) {
      await transaction.homepageBanner.upsert({
        where: { id: banner.id },
        create: banner,
        update: banner,
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
    select: { id: true },
    orderBy: [{ id: 'asc' }],
    take: 3,
  });
  if (availableProducts.length < 3) {
    throw new Error('At least three canonical products are required for engagement seed data.');
  }

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

  await prisma.$transaction(async (transaction) => {
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
