import {
  HomepageModuleType,
  MarketplaceRole,
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
          passwordHash: user.passwordHash,
          status: UserStatus.ACTIVE,
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
  });

  return importCanonicalDataset(prisma);
}

seedMarketplace()
  .then((summary) => {
    console.log(`Deterministic marketplace seed completed: ${JSON.stringify(summary)}.`);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
