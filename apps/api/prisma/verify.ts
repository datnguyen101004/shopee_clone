import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { Pool } from 'pg';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import {
  ExternalIdentityProvider,
  ProductStatus,
  UserStatus,
  VariantStatus,
} from '../src/generated/prisma/enums';
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
      authSessions: await prisma.authSession.count(),
      passwordResetTokens: await prisma.passwordResetToken.count(),
      externalIdentities: await prisma.externalIdentity.count(),
      googleLoginAttempts: await prisma.googleLoginAttempt.count(),
    };
    assert.deepEqual(counts, {
      ...seedExpectedCounts,
      authSessions: 0,
      passwordResetTokens: 0,
      externalIdentities: 0,
      googleLoginAttempts: 0,
    });

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
        images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
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
    assert.equal(product.images[1]?.variantId, seedVariants[0].id);
    assert.equal(product.images[2]?.variantId, seedVariants[1].id);
    assert(
      product.images.every(
        (image, index) => index === 0 || product.images[index - 1]!.sortOrder <= image.sortOrder,
      ),
    );
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
    assert.equal(user.passwordHash, null);

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

    assert(new Set(seedShops.map((shop) => shop.location)).size >= 2);
    assert(seedProducts.some((item) => /[À-ỹĐđ]/u.test(item.name)));
    assert(new Set(seedProducts.map((item) => item.ratingAverageBasisPoints)).size >= 4);
    assert(new Set(seedProducts.map((item) => item.soldCount)).size >= 4);
    assert(seedVariants.some((item) => item.compareAtPriceMinor !== null));
    assert(seedVariants.some((item) => item.compareAtPriceMinor === null));
    assert(seedVariants.some((item) => item.quantityOnHand === item.quantityReserved));
    assert(new Set(seedVariants.map((item) => item.priceMinor.toString())).size >= 4);

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
         ,'product_images_product_id_variant_id_fkey'
         ,'users_email_normalized'
         ,'auth_sessions_token_hash_format'
         ,'auth_sessions_valid_expiry'
         ,'auth_sessions_valid_rotation'
         ,'auth_sessions_valid_revocation'
         ,'auth_sessions_valid_last_use'
         ,'password_reset_tokens_token_hash_format'
         ,'password_reset_tokens_valid_expiry'
         ,'password_reset_tokens_valid_use'
         ,'password_reset_tokens_valid_revocation'
         ,'auth_sessions_user_id_fkey'
         ,'auth_sessions_replaced_by_id_fkey'
         ,'password_reset_tokens_user_id_fkey'
         ,'external_identities_subject_not_blank'
         ,'external_identities_valid_last_login'
         ,'external_identities_user_id_fkey'
         ,'google_login_attempts_state_hash_format'
         ,'google_login_attempts_browser_hash_format'
         ,'google_login_attempts_nonce_hash_format'
         ,'google_login_attempts_return_to_local'
         ,'google_login_attempts_valid_expiry'
         ,'google_login_attempts_valid_consumption'
       )
       ORDER BY conname`,
    );
    assert.equal(constraintRows.length, 33);

    const googleIndexRows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname
       FROM pg_indexes
       WHERE indexname IN (
         'external_identities_provider_provider_subject_key',
         'external_identities_provider_user_id_key',
         'external_identities_user_id_idx',
         'google_login_attempts_state_hash_key',
         'google_login_attempts_expires_at_idx',
         'google_login_attempts_consumed_at_expires_at_idx'
       )`,
    );
    assert.equal(googleIndexRows.length, 6);

    const externalIdentityColumns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'external_identities'`,
    );
    assert(
      externalIdentityColumns.every(
        ({ column_name }) => !/token|email|client|secret/i.test(column_name),
      ),
    );

    await expectDatabaseRejection('a duplicate user email', () =>
      prisma.user.create({
        data: {
          id: '00000000-0000-4000-8000-000000009001',
          email: seedUsers[0].email,
          displayName: 'Duplicate User',
        },
      }),
    );

    await expectDatabaseRejection('a non-normalized user email', () =>
      prisma.user.create({
        data: {
          id: '00000000-0000-4000-8000-000000009006',
          email: 'UPPERCASE@example.com',
          displayName: 'Invalid Canonical Email',
        },
      }),
    );

    const authFixtureUserId = '00000000-0000-4000-8000-000000009010';
    await prisma.user.create({
      data: {
        id: authFixtureUserId,
        email: 'auth-fixture@example.com',
        displayName: 'Auth Fixture',
        passwordHash: 'scrypt$1$1024$8$1$salt$hash',
      },
    });
    const authSessionId = '00000000-0000-4000-8000-000000009011';
    await prisma.authSession.create({
      data: {
        id: authSessionId,
        userId: authFixtureUserId,
        familyId: '00000000-0000-4000-8000-000000009012',
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.passwordResetToken.create({
      data: {
        id: '00000000-0000-4000-8000-000000009013',
        userId: authFixtureUserId,
        tokenHash: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.externalIdentity.create({
      data: {
        id: '00000000-0000-4000-8000-000000009016',
        userId: authFixtureUserId,
        provider: ExternalIdentityProvider.GOOGLE,
        providerSubject: 'CaseSensitiveGoogleSubject',
      },
    });
    const caseFixtureUserId = '00000000-0000-4000-8000-000000009018';
    await prisma.user.create({
      data: {
        id: caseFixtureUserId,
        email: 'auth-case-fixture@example.com',
        displayName: 'Auth Case Fixture',
      },
    });
    await prisma.externalIdentity.create({
      data: {
        id: '00000000-0000-4000-8000-000000009019',
        userId: caseFixtureUserId,
        provider: ExternalIdentityProvider.GOOGLE,
        providerSubject: 'casesensitivegooglesubject',
      },
    });
    await prisma.googleLoginAttempt.create({
      data: {
        id: '00000000-0000-4000-8000-000000009017',
        stateHash: 'e'.repeat(64),
        browserBindingHash: 'f'.repeat(64),
        nonceHash: '0'.repeat(64),
        protectedPayload: 'versioned-encrypted-envelope',
        returnTo: '/',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expectDatabaseRejection('an invalid refresh token digest', () =>
      prisma.authSession.create({
        data: {
          userId: authFixtureUserId,
          familyId: '00000000-0000-4000-8000-000000009014',
          tokenHash: 'not-a-token-digest',
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    );
    await expectDatabaseRejection('an expired-at-creation refresh session', () =>
      prisma.authSession.create({
        data: {
          userId: authFixtureUserId,
          familyId: '00000000-0000-4000-8000-000000009015',
          tokenHash: 'c'.repeat(64),
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      }),
    );
    await expectDatabaseRejection('an orphan password reset token', () =>
      prisma.passwordResetToken.create({
        data: {
          userId: '00000000-0000-4000-8000-000000009999',
          tokenHash: 'd'.repeat(64),
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    );
    await expectDatabaseRejection('a duplicate Google subject', () =>
      prisma.externalIdentity.create({
        data: {
          userId: seedUsers[0].id,
          provider: ExternalIdentityProvider.GOOGLE,
          providerSubject: 'CaseSensitiveGoogleSubject',
        },
      }),
    );
    await expectDatabaseRejection('an invalid Google state digest', () =>
      prisma.googleLoginAttempt.create({
        data: {
          stateHash: 'invalid',
          browserBindingHash: '1'.repeat(64),
          nonceHash: '2'.repeat(64),
          protectedPayload: 'versioned-encrypted-envelope',
          returnTo: '/',
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    );
    await expectDatabaseRejection('an external Google return path', () =>
      prisma.googleLoginAttempt.create({
        data: {
          stateHash: '3'.repeat(64),
          browserBindingHash: '4'.repeat(64),
          nonceHash: '5'.repeat(64),
          protectedPayload: 'versioned-encrypted-envelope',
          returnTo: 'https://attacker.example',
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    );
    await prisma.user.delete({ where: { id: authFixtureUserId } });
    await prisma.user.delete({ where: { id: caseFixtureUserId } });
    assert.equal(await prisma.authSession.count({ where: { id: authSessionId } }), 0);
    assert.equal(
      await prisma.passwordResetToken.count({ where: { userId: authFixtureUserId } }),
      0,
    );
    assert.equal(await prisma.externalIdentity.count({ where: { userId: authFixtureUserId } }), 0);
    await prisma.googleLoginAttempt.deleteMany({
      where: { id: '00000000-0000-4000-8000-000000009017' },
    });

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

    await expectDatabaseRejection('an image associated with a variant of another product', () =>
      prisma.productImage.create({
        data: {
          id: '00000000-0000-4000-8000-000000009005',
          productId: seedProducts[0].id,
          variantId: seedVariants[4].id,
          url: '/media/products/invalid.jpg',
          altText: 'Invalid relation',
          sortOrder: 99,
        },
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
