import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { Pool } from 'pg';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { ProductStatus, UserStatus, VariantStatus } from '../src/generated/prisma/enums';
import { createPrismaClient } from './create-prisma-client';
import {
  seedCategories,
  seedExpectedCounts,
  seedHomepageBanners,
  seedHomepageCategories,
  seedHomepageModules,
  seedHomepageProducts,
  seedImages,
  seedProducts,
  seedShops,
  seedUsers,
  seedVariants,
} from './seed-data';
import { assertSafeTestDatabaseUrl } from './test-database-url';

loadRepositoryEnvironment();

const apiRoot = path.resolve(__dirname, '..');

function sanitizeOutput(output: string, databaseUrl: string): string {
  return output
    .replaceAll(databaseUrl, '[REDACTED_DATABASE_URL]')
    .replace(/(postgres(?:ql)?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@');
}

function runPrisma(args: string[], databaseUrl: string): string {
  const packageManagerPath = process.env.npm_execpath;
  if (!packageManagerPath) {
    throw new Error('db:verify must be run through the pinned pnpm package script.');
  }

  const result = spawnSync(process.execPath, [packageManagerPath, 'exec', 'prisma', ...args], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    windowsHide: true,
  });

  const output = sanitizeOutput(`${result.stdout ?? ''}${result.stderr ?? ''}`, databaseUrl).trim();
  if (result.status !== 0) {
    throw new Error(`Prisma ${args.join(' ')} failed.\n${output}`);
  }

  return output;
}

async function expectDatabaseRejection(
  label: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }

  throw new Error(`Expected PostgreSQL to reject ${label}.`);
}

async function recreatePublicSchema(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000, max: 1 });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
  } finally {
    await pool.end();
  }
}

async function verifyDatabase(databaseUrl: string): Promise<void> {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const counts = {
      users: await prisma.user.count(),
      shops: await prisma.shop.count(),
      categories: await prisma.category.count(),
      products: await prisma.product.count(),
      variants: await prisma.productVariant.count(),
      images: await prisma.productImage.count(),
      inventory: await prisma.inventory.count(),
      homepageModules: await prisma.homepageModule.count(),
      homepageBanners: await prisma.homepageBanner.count(),
      homepageCategories: await prisma.homepageModuleCategory.count(),
      homepageProducts: await prisma.homepageModuleProduct.count(),
    };
    assert.deepEqual(counts, seedExpectedCounts);

    const category = await prisma.category.findUnique({
      where: { id: seedCategories[0].id },
      include: { children: true },
    });
    assert(category);
    assert.equal(category.children[0]?.id, seedCategories[1].id);

    const product = await prisma.product.findUnique({
      where: { id: seedProducts[0].id },
      include: {
        shop: true,
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { include: { inventory: true }, orderBy: { sku: 'asc' } },
      },
    });
    assert(product);
    assert.equal(product.shop.id, seedShops[0].id);
    assert.equal(product.category.id, seedCategories[1].id);
    assert.equal(product.status, ProductStatus.ACTIVE);
    assert.equal(product.shop.location, seedShops[0].location);
    assert.equal(product.ratingAverageBasisPoints, seedProducts[0].ratingAverageBasisPoints);
    assert.equal(product.ratingCount, seedProducts[0].ratingCount);
    assert.equal(product.soldCount, seedProducts[0].soldCount);
    assert.equal(product.images[0]?.id, seedImages[0].id);
    assert(product.variants.length >= 2);
    assert(product.variants.every((variant) => variant.inventory !== null));
    assert(product.variants.every((variant) => variant.status === VariantStatus.ACTIVE));

    const user = await prisma.user.findUniqueOrThrow({ where: { id: seedUsers[0].id } });
    assert.equal(user.email, seedUsers[0].email);
    assert.equal(user.status, UserStatus.ACTIVE);
    assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert(user.createdAt instanceof Date);
    assert(user.updatedAt instanceof Date);
    assert.equal(user.deletedAt, null);

    const homepageModules = await prisma.homepageModule.findMany({
      include: { banners: true, categories: true, products: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    assert.equal(homepageModules.length, seedHomepageModules.length);
    assert.equal(homepageModules[0]?.banners[0]?.id, seedHomepageBanners[0]?.id);
    assert.equal(homepageModules[1]?.categories.length, seedHomepageCategories.length);
    assert.equal(
      homepageModules.reduce((count, module) => count + module.products.length, 0),
      seedHomepageProducts.length,
    );
    assert(
      homepageModules.every(
        (module, index, modules) =>
          index === 0 || module.sortOrder >= modules[index - 1]!.sortOrder,
      ),
    );
    assert(
      homepageModules.filter((module) => module.activeUntil && module.activeUntil <= new Date())
        .length >= 1,
    );
    assert(
      homepageModules.filter((module) => module.activeFrom && module.activeFrom > new Date())
        .length >= 1,
    );
    assert(seedHomepageBanners.every((banner) => banner.destinationPath.startsWith('/')));
    assert(seedImages.every((image) => image.url.startsWith('/media/products/')));
    assert(seedImages.every((image) => /\.(?:jpg|svg)$/.test(image.url)));

    const orderedProducts = await prisma.product.findMany({
      where: { status: ProductStatus.ACTIVE, deletedAt: null },
      select: { id: true, createdAt: true, categoryId: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    assert(orderedProducts.length > 12);
    assert.equal(
      new Set(orderedProducts.map((item) => item.createdAt.toISOString())).size,
      orderedProducts.length,
    );
    assert(orderedProducts.some((item) => item.categoryId === seedCategories[1].id));
    assert(orderedProducts.some((item) => item.categoryId === seedCategories[3].id));

    const constraintRows = await prisma.$queryRawUnsafe<Array<{ constraint_name: string }>>(
      `SELECT conname AS constraint_name
       FROM pg_constraint
       WHERE conname IN (
         'product_variants_price_minor_nonnegative',
         'product_variants_compare_at_price_minor_nonnegative',
         'inventory_quantity_on_hand_nonnegative',
         'inventory_quantity_reserved_nonnegative',
         'inventory_reserved_not_above_on_hand'
         ,'homepage_modules_valid_window'
         ,'homepage_module_products_sold_count_nonnegative'
         ,'products_rating_average_bounded'
         ,'products_rating_count_nonnegative'
         ,'products_sold_count_nonnegative'
       )
       ORDER BY conname`,
    );
    assert.equal(constraintRows.length, 10);

    await expectDatabaseRejection('a duplicate user email', () =>
      prisma.user.create({
        data: {
          id: '00000000-0000-4000-8000-000000009001',
          email: seedUsers[0].email,
          displayName: 'Duplicate User',
        },
      }),
    );

    await expectDatabaseRejection('an orphan shop', () =>
      prisma.shop.create({
        data: {
          id: '00000000-0000-4000-8000-000000009002',
          ownerId: '00000000-0000-4000-8000-000000009999',
          slug: 'invalid-orphan-shop',
          name: 'Invalid Orphan Shop',
        },
      }),
    );

    await expectDatabaseRejection('a negative variant price', () =>
      prisma.productVariant.create({
        data: {
          id: '00000000-0000-4000-8000-000000009003',
          productId: seedProducts[0].id,
          sku: 'INVALID-NEGATIVE-PRICE',
          name: 'Invalid Negative Price',
          priceMinor: -1n,
        },
      }),
    );

    await expectDatabaseRejection('a negative comparison price', () =>
      prisma.productVariant.create({
        data: {
          id: '00000000-0000-4000-8000-000000009004',
          productId: seedProducts[0].id,
          sku: 'INVALID-NEGATIVE-COMPARE',
          name: 'Invalid Negative Compare Price',
          priceMinor: 1n,
          compareAtPriceMinor: -1n,
        },
      }),
    );

    await expectDatabaseRejection('negative on-hand inventory', () =>
      prisma.inventory.update({
        where: { variantId: seedVariants[0].id },
        data: { quantityOnHand: -1 },
      }),
    );

    await expectDatabaseRejection('negative reserved inventory', () =>
      prisma.inventory.update({
        where: { variantId: seedVariants[0].id },
        data: { quantityReserved: -1 },
      }),
    );

    await expectDatabaseRejection('reserved inventory above on-hand inventory', () =>
      prisma.inventory.update({
        where: { variantId: seedVariants[0].id },
        data: { quantityOnHand: 5, quantityReserved: 6 },
      }),
    );

    await expectDatabaseRejection('a rating above five stars', () =>
      prisma.product.update({
        where: { id: seedProducts[0].id },
        data: { ratingAverageBasisPoints: 501 },
      }),
    );
    await expectDatabaseRejection('a negative rating count', () =>
      prisma.product.update({
        where: { id: seedProducts[0].id },
        data: { ratingCount: -1 },
      }),
    );
    await expectDatabaseRejection('a negative sold count', () =>
      prisma.product.update({
        where: { id: seedProducts[0].id },
        data: { soldCount: -1 },
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const databaseUrl = assertSafeTestDatabaseUrl();

  console.log('Recreating isolated test schema...');
  await recreatePublicSchema(databaseUrl);

  console.log('Applying committed migrations from empty state...');
  runPrisma(['migrate', 'deploy'], databaseUrl);

  console.log('Confirming migration deployment is idempotent...');
  runPrisma(['migrate', 'deploy'], databaseUrl);

  console.log('Running deterministic seed twice...');
  runPrisma(['db', 'seed'], databaseUrl);
  runPrisma(['db', 'seed'], databaseUrl);

  console.log('Verifying marketplace relations and PostgreSQL constraints...');
  await verifyDatabase(databaseUrl);

  console.log(`Persistence verification passed: ${JSON.stringify(seedExpectedCounts)}.`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown persistence verification failure.';
  console.error(message);
  process.exitCode = 1;
});
