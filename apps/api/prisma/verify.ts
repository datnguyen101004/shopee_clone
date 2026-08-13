import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { Pool } from 'pg';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import {
  ExternalIdentityProvider,
  MarketplaceRole,
  ProductStatus,
  RoleAuditSource,
  UserStatus,
  VariantStatus,
} from '../src/generated/prisma/enums';
import { createPrismaClient } from './create-prisma-client';
import { createCanonicalDatasetPlan } from './dataset/normalizer';
import { loadCanonicalDataset } from './dataset/loader';
import {
  seedCategories,
  seedExpectedCounts,
  seedHomepageBanners,
  seedHomepageModules,
  seedShops,
  seedShopFollowers,
  seedShippingAddresses,
  seedUnavailableEngagementProduct,
  seedUsers,
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
    const datasetPlan = createCanonicalDatasetPlan(await loadCanonicalDataset());
    const datasetOwnerCount = datasetPlan.sources.length;
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
      roleAssignments: await prisma.userRoleAssignment.count(),
      roleAuditEvents: await prisma.roleAuditEvent.count(),
      shippingAddresses: await prisma.shippingAddress.count(),
      productFavorites: await prisma.productFavorite.count(),
      recentlyViewedProducts: await prisma.recentlyViewedProduct.count(),
      shopFollowers: await prisma.shopFollower.count(),
    };
    assert.deepEqual(counts, {
      ...seedExpectedCounts,
      authSessions: 0,
      passwordResetTokens: 0,
      externalIdentities: 0,
      googleLoginAttempts: 0,
      roleAssignments:
        seedUsers.length +
        new Set(seedShops.map(({ ownerId }) => ownerId)).size +
        datasetOwnerCount * 2,
      roleAuditEvents:
        seedUsers.length +
        new Set(seedShops.map(({ ownerId }) => ownerId)).size +
        datasetOwnerCount * 2,
    });

    const category = await prisma.category.findUnique({
      where: { id: seedCategories[0].id },
      include: { children: true },
    });
    assert(category);
    assert.equal(category.children[0]?.id, seedCategories[1].id);

    const datasetRecord = await prisma.datasetProductRecord.findFirstOrThrow({
      where: { isActive: true },
      orderBy: [{ sourceId: 'asc' }, { sourceIndex: 'asc' }],
      include: {
        source: true,
        product: {
          include: {
            shop: true,
            category: true,
            images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
            variants: { include: { inventory: true }, orderBy: { sku: 'asc' } },
          },
        },
      },
    });
    const product = datasetRecord.product;
    const primaryVariant = product.variants[0];
    assert(primaryVariant);
    const otherVariant = await prisma.productVariant.findFirstOrThrow({
      where: { productId: { not: product.id }, product: { datasetRecord: { isActive: true } } },
    });
    assert(datasetPlan.sources.some(({ shop }) => shop.id === product.shop.id));
    assert(datasetPlan.sources.some(({ category }) => category.id === product.category.id));
    assert.equal(product.status, ProductStatus.ACTIVE);
    assert(product.ratingAverageBasisPoints >= 100 && product.ratingAverageBasisPoints <= 500);
    assert(product.ratingCount >= 0);
    assert(product.soldCount >= 0);
    assert.equal(product.images.length, 1);
    assert.equal(product.images[0]?.variantId, null);
    assert(
      product.images.every(
        (image, index) => index === 0 || product.images[index - 1]!.sortOrder <= image.sortOrder,
      ),
    );
    assert.equal(product.variants.length, 1);
    assert(product.variants.every((variant) => variant.inventory !== null));
    assert(product.variants.every((variant) => variant.status === VariantStatus.ACTIVE));
    assert.equal(datasetRecord.source.checksum.length, 64);
    assert.equal(datasetRecord.source.recordCount > 0, true);
    assert.equal(datasetRecord.sourceIdentity.trim().length > 0, true);

    const provenance = await prisma.datasetProductRecord.findMany({
      where: { isActive: true },
      select: { stableRecordKey: true, generatedFields: true, product: { select: { slug: true } } },
    });
    assert.equal(provenance.length, 1_377);
    assert.equal(new Set(provenance.map(({ stableRecordKey }) => stableRecordKey)).size, 1_377);
    assert.equal(new Set(provenance.map(({ product }) => product.slug)).size, 1_377);
    const generatedFieldNames = provenance.flatMap(({ generatedFields }) =>
      Array.isArray(generatedFields)
        ? generatedFields.flatMap((entry) =>
            entry && typeof entry === 'object' && !Array.isArray(entry) && entry.field
              ? [String(entry.field)]
              : [],
          )
        : [],
    );
    assert.equal(generatedFieldNames.filter((field) => field === 'priceMinor').length, 3);
    assert.equal(generatedFieldNames.filter((field) => field === 'rating').length, 952);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: seedUsers[0].id } });
    assert.equal(user.email, seedUsers[0].email);
    assert.equal(user.status, UserStatus.ACTIVE);
    assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert(user.createdAt instanceof Date);
    assert(user.updatedAt instanceof Date);
    assert.equal(user.deletedAt, null);
    assert.equal(user.passwordHash, null);
    assert.equal(user.phoneNumber, seedUsers[0].phoneNumber);

    const shippingAddresses = await prisma.shippingAddress.findMany({
      where: { userId: seedUsers[0].id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    assert.equal(shippingAddresses.length, seedShippingAddresses.length);
    assert.equal(shippingAddresses[0]?.id, seedShippingAddresses[0].id);
    assert.equal(shippingAddresses.filter(({ isDefault }) => isDefault).length, 1);
    assert(shippingAddresses.every(({ phoneNumber }) => /^0[0-9]{9}$/.test(phoneNumber)));
    assert(shippingAddresses.every(({ deletedAt }) => deletedAt === null));
    assert.equal(
      await prisma.shippingAddress.count({ where: { userId: seedUsers[1].id, deletedAt: null } }),
      0,
    );

    const buyerOneFavorites = await prisma.productFavorite.findMany({
      where: { userId: seedUsers[0].id },
      orderBy: [{ favoritedAt: 'desc' }, { productId: 'asc' }],
    });
    assert.equal(buyerOneFavorites.length, 2);
    assert.equal(buyerOneFavorites[0]?.productId, seedUnavailableEngagementProduct.id);
    assert(
      buyerOneFavorites.every(
        (favorite, index, rows) =>
          index === 0 || favorite.favoritedAt <= rows[index - 1]!.favoritedAt,
      ),
    );
    assert.equal(await prisma.productFavorite.count({ where: { userId: seedUsers[1].id } }), 1);
    const buyerOneHistory = await prisma.recentlyViewedProduct.findMany({
      where: { userId: seedUsers[0].id },
      orderBy: [{ lastViewedAt: 'desc' }, { productId: 'asc' }],
    });
    assert.equal(buyerOneHistory.length, 2);
    assert(buyerOneHistory[0]!.lastViewedAt > buyerOneHistory[1]!.lastViewedAt);

    const buyerOneFollowing = await prisma.shopFollower.findMany({
      where: { userId: seedUsers[0].id },
      orderBy: [{ followedAt: 'desc' }, { shopId: 'asc' }],
    });
    assert.equal(buyerOneFollowing.length, 1);
    assert.equal(buyerOneFollowing[0]?.shopId, seedShops[1].id);
    assert.equal(
      buyerOneFollowing[0]?.followedAt.toISOString(),
      seedShopFollowers[0].followedAt.toISOString(),
    );
    assert.equal(await prisma.shopFollower.count({ where: { userId: seedUsers[1].id } }), 1);
    assert.equal(await prisma.shopFollower.count({ where: { shopId: seedShops[0].id } }), 1);
    assert.equal(
      await prisma.shopFollower.count({
        where: { userId: seedUsers[0].id, shopId: seedShops[0].id },
      }),
      0,
    );

    await expectDatabaseRejection('a duplicate buyer-product favorite', () =>
      prisma.productFavorite.create({ data: buyerOneFavorites[0]! }),
    );
    await expectDatabaseRejection('a duplicate buyer-shop follow', () =>
      prisma.shopFollower.create({ data: buyerOneFollowing[0]! }),
    );

    const roleAssignments = await prisma.userRoleAssignment.findMany({
      orderBy: [{ userId: 'asc' }, { role: 'asc' }],
    });
    assert.equal(
      roleAssignments.filter(({ role }) => role === MarketplaceRole.BUYER).length,
      seedUsers.length + datasetOwnerCount,
    );
    assert.equal(
      roleAssignments.filter(({ role }) => role === MarketplaceRole.SELLER).length,
      new Set(seedShops.map(({ ownerId }) => ownerId)).size + datasetOwnerCount,
    );
    assert.equal(
      roleAssignments.some(({ role }) => role === MarketplaceRole.ADMIN),
      false,
    );
    for (const seedUser of seedUsers) {
      assert(
        roleAssignments.some(
          ({ userId, role }) => userId === seedUser.id && role === MarketplaceRole.BUYER,
        ),
      );
    }
    for (const shop of [...seedShops, ...datasetPlan.sources.map(({ shop }) => shop)]) {
      assert(
        roleAssignments.some(
          ({ userId, role }) => userId === shop.ownerId && role === MarketplaceRole.SELLER,
        ),
      );
    }
    const seedRoleAuditEvents = await prisma.roleAuditEvent.findMany();
    assert(seedRoleAuditEvents.every(({ source }) => source === RoleAuditSource.SEED));
    assert(seedRoleAuditEvents.every(({ actorUserId }) => actorUserId === null));

    const homepageModules = await prisma.homepageModule.findMany({
      include: { banners: true, categories: true, products: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    assert.equal(homepageModules.length, seedHomepageModules.length);
    assert.equal(homepageModules[0]?.banners[0]?.id, seedHomepageBanners[0]?.id);
    assert.equal(homepageModules[1]?.categories.length, datasetPlan.sources.length);
    assert.equal(
      homepageModules.reduce((count, module) => count + module.products.length, 0),
      24,
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
    assert(product.images.every((image) => /^(?:\/|https:\/\/)/.test(image.url)));

    const orderedProducts = await prisma.product.findMany({
      where: { status: ProductStatus.ACTIVE, deletedAt: null },
      select: { id: true, createdAt: true, categoryId: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    assert.equal(orderedProducts.length, 1_377);
    assert.equal(
      new Set(orderedProducts.map((item) => item.createdAt.toISOString())).size,
      orderedProducts.length,
    );
    for (const source of datasetPlan.sources) {
      assert(orderedProducts.some((item) => item.categoryId === source.category.id));
    }

    assert(new Set(seedShops.map((shop) => shop.location)).size >= 2);
    assert(
      datasetPlan.sources
        .flatMap(({ products }) => products)
        .some((item) => /[À-ỹĐđ]/u.test(item.name)),
    );
    assert(
      new Set(
        datasetPlan.sources
          .flatMap(({ products }) => products)
          .map((item) => item.ratingAverageBasisPoints),
      ).size >= 4,
    );
    assert(
      new Set(datasetPlan.sources.flatMap(({ products }) => products).map((item) => item.soldCount))
        .size >= 4,
    );
    assert(
      datasetPlan.sources
        .flatMap(({ products }) => products)
        .some((item) => item.variant.compareAtPriceMinor !== null),
    );
    assert(
      datasetPlan.sources
        .flatMap(({ products }) => products)
        .some((item) => item.variant.compareAtPriceMinor === null),
    );
    assert(
      new Set(
        datasetPlan.sources
          .flatMap(({ products }) => products)
          .map((item) => item.variant.priceMinor.toString()),
      ).size >= 4,
    );

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
         ,'user_role_assignments_actor_source'
         ,'role_audit_events_reason_bounded'
         ,'role_audit_events_actor_source'
         ,'user_role_assignments_user_id_fkey'
         ,'user_role_assignments_granted_by_user_id_fkey'
         ,'role_audit_events_target_user_id_fkey'
         ,'role_audit_events_actor_user_id_fkey'
         ,'dataset_sources_key_not_blank'
         ,'dataset_sources_checksum_format'
         ,'dataset_sources_record_count_nonnegative'
         ,'dataset_product_records_stable_key_format'
         ,'dataset_product_records_source_index_nonnegative'
         ,'dataset_product_records_source_identity_not_blank'
         ,'dataset_product_records_source_id_fkey'
         ,'dataset_product_records_product_id_fkey'
         ,'users_phone_number_format'
         ,'shipping_addresses_phone_number_format'
         ,'shipping_addresses_recipient_name_bounded'
         ,'shipping_addresses_province_bounded'
         ,'shipping_addresses_district_bounded'
         ,'shipping_addresses_ward_bounded'
         ,'shipping_addresses_address_line_bounded'
         ,'shipping_addresses_label_bounded'
         ,'shipping_addresses_deleted_not_default'
         ,'shipping_addresses_valid_timestamps'
         ,'shipping_addresses_user_id_fkey'
       )
       ORDER BY conname`,
    );
    assert.equal(constraintRows.length, 59);

    const accountIndexRows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname
       FROM pg_indexes
       WHERE indexname IN (
         'shipping_addresses_user_id_deleted_at_is_default_created_at_id_idx',
         'shipping_addresses_deleted_at_idx',
         'shipping_addresses_active_order_idx',
         'shipping_addresses_one_active_default_per_user'
       )`,
    );
    assert.equal(accountIndexRows.length, 4);

    const engagementIndexRows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname
       FROM pg_indexes
       WHERE indexname IN (
         'product_favorites_user_id_favorited_at_product_id_idx',
         'product_favorites_product_id_idx',
         'recently_viewed_products_user_id_last_viewed_at_product_idx',
         'recently_viewed_products_product_id_idx'
       )`,
    );
    assert.equal(engagementIndexRows.length, 4);

    const shopFollowerIndexRows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname
       FROM pg_indexes
       WHERE indexname IN (
         'shop_followers_shop_id_followed_at_user_id_idx',
         'shop_followers_user_id_followed_at_shop_id_idx'
       )`,
    );
    assert.equal(shopFollowerIndexRows.length, 2);

    const shopFollowerConstraintRows = await prisma.$queryRawUnsafe<
      Array<{ constraint_name: string }>
    >(
      `SELECT conname AS constraint_name
       FROM pg_constraint
       WHERE conname IN (
         'shop_followers_user_id_fkey',
         'shop_followers_shop_id_fkey'
       )`,
    );
    assert.equal(shopFollowerConstraintRows.length, 2);

    const cascadeUserId = '00000000-0000-4000-8000-000000009010';
    await prisma.user.create({
      data: {
        id: cascadeUserId,
        email: 'engagement-cascade@shopee-clone.local',
        displayName: 'Engagement Cascade Fixture',
        productFavorites: { create: { productId: product.id } },
        recentlyViewed: { create: { productId: product.id } },
        followedShops: { create: { shopId: seedShops[0].id } },
      },
    });
    await prisma.user.delete({ where: { id: cascadeUserId } });
    assert.equal(await prisma.productFavorite.count({ where: { userId: cascadeUserId } }), 0);
    assert.equal(await prisma.recentlyViewedProduct.count({ where: { userId: cascadeUserId } }), 0);
    assert.equal(await prisma.shopFollower.count({ where: { userId: cascadeUserId } }), 0);

    const cascadeShopOwnerId = '00000000-0000-4000-8000-000000009030';
    const cascadeShopId = '00000000-0000-4000-8000-000000009031';
    await prisma.user.create({
      data: {
        id: cascadeShopOwnerId,
        email: 'shop-follower-cascade@shopee-clone.local',
        displayName: 'Shop Follower Cascade Owner',
      },
    });
    await prisma.shop.create({
      data: {
        id: cascadeShopId,
        ownerId: cascadeShopOwnerId,
        slug: 'shop-follower-cascade-fixture',
        name: 'Shop Follower Cascade Fixture',
        followers: { create: { userId: seedUsers[0].id } },
      },
    });
    await prisma.shop.delete({ where: { id: cascadeShopId } });
    assert.equal(await prisma.shopFollower.count({ where: { shopId: cascadeShopId } }), 0);
    await prisma.user.delete({ where: { id: cascadeShopOwnerId } });

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

    const roleIndexRows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname
       FROM pg_indexes
       WHERE indexname IN (
         'user_role_assignments_role_user_id_idx',
         'user_role_assignments_granted_by_user_id_idx',
         'role_audit_events_created_at_id_idx',
         'role_audit_events_target_user_id_created_at_idx',
         'role_audit_events_actor_user_id_created_at_idx',
         'role_audit_events_role_action_created_at_idx'
       )`,
    );
    assert.equal(roleIndexRows.length, 6);

    const roleEnumLabels = await prisma.$queryRawUnsafe<Array<{ label: string; type: string }>>(
      `SELECT t.typname AS type, e.enumlabel AS label
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname IN ('marketplace_role', 'role_audit_action', 'role_audit_source')`,
    );
    assert.deepEqual(
      new Set(
        roleEnumLabels.filter(({ type }) => type === 'marketplace_role').map(({ label }) => label),
      ),
      new Set(['buyer', 'seller', 'admin']),
    );

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

    const roleColumns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('user_role_assignments', 'role_audit_events')`,
    );
    assert(
      roleColumns.every(
        ({ column_name }) => !/password|token|cookie|email|secret/i.test(column_name),
      ),
    );

    await expectDatabaseRejection('a duplicate active buyer role', () =>
      prisma.userRoleAssignment.create({
        data: {
          userId: seedUsers[0].id,
          role: MarketplaceRole.BUYER,
          source: RoleAuditSource.SEED,
        },
      }),
    );
    await expectDatabaseRejection('an admin-source role without an actor', () =>
      prisma.userRoleAssignment.create({
        data: {
          userId: seedUsers[0].id,
          role: MarketplaceRole.ADMIN,
          source: RoleAuditSource.ADMIN,
        },
      }),
    );
    const firstAuditEvent = seedRoleAuditEvents[0];
    assert(firstAuditEvent);
    await expectDatabaseRejection('role audit event update', () =>
      prisma.roleAuditEvent.update({
        where: { id: firstAuditEvent.id },
        data: { reason: 'Mutated audit reason is prohibited' },
      }),
    );
    await expectDatabaseRejection('role audit event deletion', () =>
      prisma.roleAuditEvent.delete({ where: { id: firstAuditEvent.id } }),
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

    await expectDatabaseRejection('an invalid profile phone', () =>
      prisma.user.update({
        where: { id: seedUsers[0].id },
        data: { phoneNumber: '+84 912 345 678' },
      }),
    );
    await expectDatabaseRejection('a second active default address', () =>
      prisma.shippingAddress.create({
        data: {
          id: '00000000-0000-4000-8000-000000009020',
          userId: seedUsers[0].id,
          recipientName: 'Default Conflict',
          phoneNumber: '0987654321',
          province: 'TP. Hồ Chí Minh',
          district: 'Quận 5',
          ward: 'Phường 1',
          addressLine: '123 Đường Kiểm Thử',
          label: null,
          isDefault: true,
        },
      }),
    );
    await expectDatabaseRejection('a deleted address remaining default', () =>
      prisma.shippingAddress.update({
        where: { id: seedShippingAddresses[0].id },
        data: { deletedAt: new Date() },
      }),
    );
    await expectDatabaseRejection('an untrimmed shipping recipient', () =>
      prisma.shippingAddress.create({
        data: {
          id: '00000000-0000-4000-8000-000000009021',
          userId: seedUsers[1].id,
          recipientName: ' Untrimmed Recipient ',
          phoneNumber: '0987654321',
          province: 'Hà Nội',
          district: 'Quận Ba Đình',
          ward: 'Phường Điện Biên',
          addressLine: '123 Đường Kiểm Thử',
          label: null,
          isDefault: false,
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
          productId: product.id,
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
          productId: product.id,
          sku: 'INVALID-NEGATIVE-COMPARE',
          name: 'Invalid Negative Compare Price',
          priceMinor: 1n,
          compareAtPriceMinor: -1n,
        },
      }),
    );

    await expectDatabaseRejection('negative on-hand inventory', () =>
      prisma.inventory.update({
        where: { variantId: primaryVariant.id },
        data: { quantityOnHand: -1 },
      }),
    );

    await expectDatabaseRejection('negative reserved inventory', () =>
      prisma.inventory.update({
        where: { variantId: primaryVariant.id },
        data: { quantityReserved: -1 },
      }),
    );

    await expectDatabaseRejection('reserved inventory above on-hand inventory', () =>
      prisma.inventory.update({
        where: { variantId: primaryVariant.id },
        data: { quantityOnHand: 5, quantityReserved: 6 },
      }),
    );

    await expectDatabaseRejection('a rating above five stars', () =>
      prisma.product.update({
        where: { id: product.id },
        data: { ratingAverageBasisPoints: 501 },
      }),
    );
    await expectDatabaseRejection('a negative rating count', () =>
      prisma.product.update({
        where: { id: product.id },
        data: { ratingCount: -1 },
      }),
    );
    await expectDatabaseRejection('a negative sold count', () =>
      prisma.product.update({
        where: { id: product.id },
        data: { soldCount: -1 },
      }),
    );

    await expectDatabaseRejection('an image associated with a variant of another product', () =>
      prisma.productImage.create({
        data: {
          id: '00000000-0000-4000-8000-000000009005',
          productId: product.id,
          variantId: otherVariant.id,
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
