import {
  ProductStatus,
  ShopStatus,
  UserStatus,
  VariantStatus,
} from '../src/generated/prisma/enums';
import { createPrismaClient } from './create-prisma-client';
import {
  seedCategories,
  seedImages,
  seedProducts,
  seedShops,
  seedUsers,
  seedVariants,
} from './seed-data';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the marketplace database.');
}

const prisma = createPrismaClient(databaseUrl);

async function seedMarketplace(): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    for (const user of seedUsers) {
      await transaction.user.upsert({
        where: { id: user.id },
        create: { ...user, status: UserStatus.ACTIVE },
        update: {
          email: user.email,
          displayName: user.displayName,
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
          status: ShopStatus.ACTIVE,
          deletedAt: null,
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

    for (const product of seedProducts) {
      await transaction.product.upsert({
        where: { id: product.id },
        create: { ...product, status: ProductStatus.ACTIVE },
        update: {
          shopId: product.shopId,
          categoryId: product.categoryId,
          slug: product.slug,
          name: product.name,
          description: product.description,
          status: ProductStatus.ACTIVE,
          deletedAt: null,
        },
      });
    }

    for (const variant of seedVariants) {
      const { quantityOnHand, quantityReserved, ...variantData } = variant;
      await transaction.productVariant.upsert({
        where: { id: variant.id },
        create: { ...variantData, status: VariantStatus.ACTIVE },
        update: {
          productId: variant.productId,
          sku: variant.sku,
          name: variant.name,
          priceMinor: variant.priceMinor,
          compareAtPriceMinor: variant.compareAtPriceMinor,
          status: VariantStatus.ACTIVE,
          deletedAt: null,
        },
      });

      await transaction.inventory.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, quantityOnHand, quantityReserved },
        update: { quantityOnHand, quantityReserved },
      });
    }

    for (const image of seedImages) {
      await transaction.productImage.upsert({
        where: { id: image.id },
        create: image,
        update: {
          productId: image.productId,
          url: image.url,
          altText: image.altText,
          sortOrder: image.sortOrder,
        },
      });
    }
  });
}

seedMarketplace()
  .then(() => {
    console.log('Deterministic marketplace seed completed.');
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
