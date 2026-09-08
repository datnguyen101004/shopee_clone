import { createPrismaClient } from '../apps/api/prisma/create-prisma-client';
import {
  MarketplaceRole,
  ProductModerationStatus,
  ProductStatus,
  RoleAuditSource,
  ShopOnboardingStatus,
  ShopStatus,
  UserStatus,
  VariantStatus,
} from '../apps/api/src/generated/prisma/enums';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const passwordHash =
  'scrypt$1$1024$8$1$AQEBAQEBAQEBAQEBAQEBAQ$IUJomy5LTpJY_DjgO4mKl1L902RXjPocRZObmEPkZBmiSZSeVtdiiH07p92QfkZHmequfoP0DzS-jq2xd4w9DA';
const ids = {
  admin: '10000000-0000-4000-8000-000000000001',
  seller: '10000000-0000-4000-8000-000000000002',
  buyer: '10000000-0000-4000-8000-000000000003',
  shop: '10000000-0000-4000-8000-000000000101',
  product: '10000000-0000-4000-8000-000000000201',
  variant: '10000000-0000-4000-8000-000000000202',
};

const prisma = createPrismaClient(databaseUrl);

async function main() {
  const category = await prisma.category.findFirst({
    where: { isActive: true, deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (!category) throw new Error('Seed must provide an active category.');

  await prisma.$transaction(async (tx) => {
    const users = [
      { id: ids.admin, email: 'flash-sale-admin@example.test', displayName: 'Flash Sale E2E Admin', roles: [MarketplaceRole.ADMIN, MarketplaceRole.BUYER] },
      { id: ids.seller, email: 'flash-sale-seller@example.test', displayName: 'Flash Sale E2E Seller', roles: [MarketplaceRole.SELLER, MarketplaceRole.BUYER] },
      { id: ids.buyer, email: 'flash-sale-buyer@example.test', displayName: 'Flash Sale E2E Buyer', roles: [MarketplaceRole.BUYER] },
    ];
    for (const user of users) {
      await tx.user.upsert({
        where: { id: user.id },
        create: { id: user.id, email: user.email, displayName: user.displayName, passwordHash, status: UserStatus.ACTIVE },
        update: { email: user.email, displayName: user.displayName, passwordHash, status: UserStatus.ACTIVE, deletedAt: null },
      });
      for (const role of user.roles) {
        await tx.userRoleAssignment.upsert({
          where: { userId_role: { userId: user.id, role } },
          create: { userId: user.id, role, source: RoleAuditSource.SEED },
          update: {},
        });
      }
    }

    await tx.shop.upsert({
      where: { id: ids.shop },
      create: {
        id: ids.shop,
        ownerId: ids.seller,
        slug: 'flash-sale-e2e-shop',
        name: 'Flash Sale E2E Shop',
        description: 'Shop dùng cho happy path E2E.',
        location: 'Thành phố Hồ Chí Minh',
        status: ShopStatus.ACTIVE,
        onboardingStatus: ShopOnboardingStatus.APPROVED,
      },
      update: { ownerId: ids.seller, name: 'Flash Sale E2E Shop', status: ShopStatus.ACTIVE, onboardingStatus: ShopOnboardingStatus.APPROVED, deletedAt: null },
    });
    await tx.product.upsert({
      where: { id: ids.product },
      create: {
        id: ids.product,
        shopId: ids.shop,
        categoryId: category.id,
        slug: 'flash-sale-e2e-product',
        name: 'Flash Sale E2E Product',
        description: 'Sản phẩm dùng cho happy path E2E.',
        status: ProductStatus.ACTIVE,
        moderationStatus: ProductModerationStatus.ACTIVE,
      },
      update: { shopId: ids.shop, categoryId: category.id, name: 'Flash Sale E2E Product', status: ProductStatus.ACTIVE, moderationStatus: ProductModerationStatus.ACTIVE, deletedAt: null },
    });
    await tx.productVariant.upsert({
      where: { id: ids.variant },
      create: { id: ids.variant, productId: ids.product, shopId: ids.shop, sku: 'FLASH-SALE-E2E-SKU', combinationKey: '', name: 'Mặc định', priceMinor: 100000, status: VariantStatus.ACTIVE },
      update: { productId: ids.product, shopId: ids.shop, priceMinor: 100000, status: VariantStatus.ACTIVE, deletedAt: null },
    });
    await tx.inventory.upsert({
      where: { variantId: ids.variant },
      create: { variantId: ids.variant, quantityOnHand: 20, quantityReserved: 0, quantitySold: 0 },
      update: { quantityOnHand: 20, quantityReserved: 0, quantitySold: 0 },
    });
  });
  console.log(JSON.stringify({ ids }));
}

main().finally(() => prisma.$disconnect());
