import type { Prisma } from '../../src/generated/prisma/client';
import {
  HomepageModuleType,
  MarketplaceRole,
  ProductStatus,
  RoleAuditAction,
  RoleAuditSource,
  ShopStatus,
  UserStatus,
  VariantStatus,
} from '../../src/generated/prisma/enums';
import { deterministicUuid } from './identifiers';
import { createCanonicalDatasetPlan } from './normalizer';
import { loadCanonicalDataset } from './loader';
import type { CanonicalDatasetPlan, DatasetImportSummary } from './types';

const NORMALIZED_AT = new Date('2026-08-13T00:00:00.000Z');
const TRANSACTION_TIMEOUT_MS = 120_000;
const PRODUCT_BATCH_SIZE = 50;
const PRODUCT_MODULE_KEYS = ['flash-sale', 'top-selling', 'mall', 'daily'] as const;
const LEGACY_PRODUCT_IDS = Array.from(
  { length: 13 },
  (_, index) => `00000000-0000-4000-8000-${String(301 + index).padStart(12, '0')}`,
);

function asPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function ranking(plan: CanonicalDatasetPlan) {
  return plan.sources
    .flatMap((source) => source.products)
    .sort(
      (left, right) =>
        right.ratingAverageBasisPoints - left.ratingAverageBasisPoints ||
        right.soldCount - left.soldCount ||
        left.id.localeCompare(right.id),
    );
}

async function importSource(
  transaction: Prisma.TransactionClient,
  source: CanonicalDatasetPlan['sources'][number],
  importedAt: Date,
): Promise<void> {
  await transaction.datasetSource.upsert({
    where: { id: source.id },
    create: {
      id: source.id,
      key: source.key,
      fileName: source.fileName,
      sourceUrl: source.sourceUrl,
      checksum: source.checksum,
      recordCount: source.recordCount,
      rootMetadata: asPrismaJson(source.rootMetadata),
      policyVersion: source.policyVersion,
      importedAt,
    },
    update: {
      key: source.key,
      fileName: source.fileName,
      sourceUrl: source.sourceUrl,
      checksum: source.checksum,
      recordCount: source.recordCount,
      rootMetadata: asPrismaJson(source.rootMetadata),
      policyVersion: source.policyVersion,
      importedAt,
    },
  });

  await transaction.user.upsert({
    where: { id: source.owner.id },
    create: {
      ...source.owner,
      passwordHash: null,
      status: UserStatus.ACTIVE,
    },
    update: {
      email: source.owner.email,
      displayName: source.owner.displayName,
      passwordHash: null,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  });

  await transaction.userRoleAssignment.createMany({
    data: [
      {
        userId: source.owner.id,
        role: MarketplaceRole.BUYER,
        source: RoleAuditSource.SEED,
      },
      {
        userId: source.owner.id,
        role: MarketplaceRole.SELLER,
        source: RoleAuditSource.SEED,
      },
    ],
    skipDuplicates: true,
  });
  await transaction.roleAuditEvent.createMany({
    data: [MarketplaceRole.BUYER, MarketplaceRole.SELLER].map((role) => ({
      id: deterministicUuid(`dataset-role-audit:${source.key}:${role}`),
      targetUserId: source.owner.id,
      role,
      action: RoleAuditAction.GRANT,
      source: RoleAuditSource.SEED,
      reason: `TS01 canonical dataset ${role.toLowerCase()} role`,
      createdAt: NORMALIZED_AT,
    })),
    skipDuplicates: true,
  });

  await transaction.shop.upsert({
    where: { id: source.shop.id },
    create: { ...source.shop, status: ShopStatus.ACTIVE },
    update: {
      ownerId: source.shop.ownerId,
      slug: source.shop.slug,
      name: source.shop.name,
      location: source.shop.location,
      status: ShopStatus.ACTIVE,
      deletedAt: null,
    },
  });
  await transaction.category.upsert({
    where: { id: source.category.id },
    create: {
      id: source.category.id,
      parentId: null,
      slug: source.category.slug,
      name: source.category.name,
      sortOrder: source.category.sortOrder,
      isActive: true,
    },
    update: {
      parentId: null,
      slug: source.category.slug,
      name: source.category.name,
      sortOrder: source.category.sortOrder,
      isActive: true,
      deletedAt: null,
    },
  });

  const activeKeys = source.products.map(({ stableRecordKey }) => stableRecordKey);
  const missingRecords = await transaction.datasetProductRecord.findMany({
    where: { sourceId: source.id, stableRecordKey: { notIn: activeKeys }, isActive: true },
    select: { productId: true },
  });
  if (missingRecords.length) {
    const productIds = missingRecords.map(({ productId }) => productId);
    await transaction.homepageModuleProduct.deleteMany({
      where: { productId: { in: productIds } },
    });
    await transaction.product.updateMany({
      where: { id: { in: productIds }, datasetRecord: { sourceId: source.id } },
      data: { status: ProductStatus.ARCHIVED, deletedAt: importedAt },
    });
    await transaction.datasetProductRecord.updateMany({
      where: { sourceId: source.id, productId: { in: productIds } },
      data: { isActive: false, normalizedAt: NORMALIZED_AT },
    });
  }

  for (let offset = 0; offset < source.products.length; offset += PRODUCT_BATCH_SIZE) {
    const batch = source.products.slice(offset, offset + PRODUCT_BATCH_SIZE);
    for (const product of batch) {
      await transaction.product.upsert({
        where: { id: product.id },
        create: {
          id: product.id,
          shopId: product.shopId,
          categoryId: product.categoryId,
          slug: product.slug,
          name: product.name,
          description: product.description,
          status: ProductStatus.ACTIVE,
          ratingAverageBasisPoints: product.ratingAverageBasisPoints,
          ratingCount: product.ratingCount,
          soldCount: product.soldCount,
          createdAt: product.createdAt,
          variants: {
            create: {
              id: product.variant.id,
              sku: product.variant.sku,
              name: product.variant.name,
              priceMinor: product.variant.priceMinor,
              compareAtPriceMinor: product.variant.compareAtPriceMinor,
              weightGrams: product.variant.weightGrams,
              status: VariantStatus.ACTIVE,
              inventory: {
                create: {
                  quantityOnHand: product.variant.quantityOnHand,
                  quantityReserved: product.variant.quantityReserved,
                },
              },
            },
          },
          images: {
            create: {
              id: product.image.id,
              url: product.image.url,
              altText: product.image.altText,
              sortOrder: 0,
            },
          },
          datasetRecord: {
            create: {
              id: product.sourceRecordId,
              sourceId: source.id,
              stableRecordKey: product.stableRecordKey,
              sourceIdentity: product.sourceIdentity,
              sourceIndex: product.sourceIndex,
              sourceProductUrl: product.sourceProductUrl,
              sourcePageUrl: product.sourcePageUrl,
              rawNotes: product.rawNotes,
              rawPayload: asPrismaJson(product.rawPayload),
              generatedFields: asPrismaJson(product.generatedFields),
              isActive: true,
              normalizedAt: NORMALIZED_AT,
            },
          },
        },
        update: {
          shopId: product.shopId,
          categoryId: product.categoryId,
          slug: product.slug,
          name: product.name,
          description: product.description,
          status: ProductStatus.ACTIVE,
          ratingAverageBasisPoints: product.ratingAverageBasisPoints,
          ratingCount: product.ratingCount,
          soldCount: product.soldCount,
          createdAt: product.createdAt,
          deletedAt: null,
          variants: {
            upsert: {
              where: { id: product.variant.id },
              create: {
                id: product.variant.id,
                sku: product.variant.sku,
                name: product.variant.name,
                priceMinor: product.variant.priceMinor,
                compareAtPriceMinor: product.variant.compareAtPriceMinor,
                weightGrams: product.variant.weightGrams,
                status: VariantStatus.ACTIVE,
                inventory: {
                  create: {
                    quantityOnHand: product.variant.quantityOnHand,
                    quantityReserved: product.variant.quantityReserved,
                  },
                },
              },
              update: {
                sku: product.variant.sku,
                name: product.variant.name,
                priceMinor: product.variant.priceMinor,
                compareAtPriceMinor: product.variant.compareAtPriceMinor,
                weightGrams: product.variant.weightGrams,
                status: VariantStatus.ACTIVE,
                deletedAt: null,
                inventory: {
                  upsert: {
                    create: {
                      quantityOnHand: product.variant.quantityOnHand,
                      quantityReserved: product.variant.quantityReserved,
                    },
                    update: {
                      quantityOnHand: product.variant.quantityOnHand,
                      quantityReserved: product.variant.quantityReserved,
                    },
                  },
                },
              },
            },
          },
          images: {
            upsert: {
              where: { id: product.image.id },
              create: {
                id: product.image.id,
                url: product.image.url,
                altText: product.image.altText,
                sortOrder: 0,
              },
              update: {
                variantId: null,
                url: product.image.url,
                altText: product.image.altText,
                sortOrder: 0,
              },
            },
          },
          datasetRecord: {
            upsert: {
              create: {
                id: product.sourceRecordId,
                sourceId: source.id,
                stableRecordKey: product.stableRecordKey,
                sourceIdentity: product.sourceIdentity,
                sourceIndex: product.sourceIndex,
                sourceProductUrl: product.sourceProductUrl,
                sourcePageUrl: product.sourcePageUrl,
                rawNotes: product.rawNotes,
                rawPayload: asPrismaJson(product.rawPayload),
                generatedFields: asPrismaJson(product.generatedFields),
                isActive: true,
                normalizedAt: NORMALIZED_AT,
              },
              update: {
                sourceId: source.id,
                stableRecordKey: product.stableRecordKey,
                sourceIdentity: product.sourceIdentity,
                sourceIndex: product.sourceIndex,
                sourceProductUrl: product.sourceProductUrl,
                sourcePageUrl: product.sourcePageUrl,
                rawNotes: product.rawNotes,
                rawPayload: asPrismaJson(product.rawPayload),
                generatedFields: asPrismaJson(product.generatedFields),
                isActive: true,
                normalizedAt: NORMALIZED_AT,
              },
            },
          },
        },
      });
    }
  }
}

async function rebuildHomepage(
  transaction: Prisma.TransactionClient,
  plan: CanonicalDatasetPlan,
): Promise<void> {
  const categoryModule = await transaction.homepageModule.findUnique({
    where: { key: 'categories' },
    select: { id: true },
  });
  if (categoryModule) {
    await transaction.homepageModuleCategory.deleteMany({
      where: { moduleId: categoryModule.id },
    });
    await transaction.homepageModuleCategory.createMany({
      data: plan.sources.map((source, index) => ({
        id: deterministicUuid(`dataset-homepage-category:${source.key}`),
        moduleId: categoryModule.id,
        categoryId: source.category.id,
        label: source.category.name,
        iconKey: source.category.iconKey,
        sortOrder: (index + 1) * 10,
      })),
    });
  }

  const products = ranking(plan);
  const modules = await transaction.homepageModule.findMany({
    where: { key: { in: [...PRODUCT_MODULE_KEYS] } },
    select: { id: true, key: true, type: true },
  });
  for (const module of modules) {
    await transaction.homepageModuleProduct.deleteMany({ where: { moduleId: module.id } });
    const offset = PRODUCT_MODULE_KEYS.indexOf(module.key as (typeof PRODUCT_MODULE_KEYS)[number]);
    const selected = products.slice(offset * 6, offset * 6 + 6);
    await transaction.homepageModuleProduct.createMany({
      data: selected.map((product, index) => ({
        id: deterministicUuid(`dataset-homepage-product:${module.key}:${product.id}`),
        moduleId: module.id,
        productId: product.id,
        label:
          module.type === HomepageModuleType.MALL
            ? 'Mall'
            : module.type === HomepageModuleType.FLASH_SALE
              ? 'Flash Sale'
              : module.type === HomepageModuleType.TOP_SELLING
                ? 'Bán chạy'
                : 'Gợi ý',
        soldCount: product.soldCount,
        sortOrder: (index + 1) * 10,
      })),
    });
  }
}

export function summarizeDatasetPlan(plan: CanonicalDatasetPlan): DatasetImportSummary {
  return {
    policyVersion: plan.policyVersion,
    totalRecords: plan.totalRecords,
    generatedPriceCount: plan.generatedPriceCount,
    generatedRatingCount: plan.generatedRatingCount,
    sources: plan.sources.map((source) => ({
      key: source.key,
      category: source.category.slug,
      recordCount: source.recordCount,
      checksumPrefix: source.checksum.slice(0, 12),
    })),
  };
}

export async function importCanonicalDataset(
  prisma: {
    $transaction: <T>(
      callback: (transaction: Prisma.TransactionClient) => Promise<T>,
      options?: { maxWait?: number; timeout?: number },
    ) => Promise<T>;
  },
  options?: { directory?: string; importedAt?: Date },
): Promise<DatasetImportSummary> {
  const plan = createCanonicalDatasetPlan(
    await loadCanonicalDataset(options?.directory ? { directory: options.directory } : undefined),
  );
  const importedAt = options?.importedAt ?? new Date();

  await prisma.$transaction(
    async (transaction) => {
      await transaction.homepageModuleProduct.deleteMany({
        where: { productId: { in: LEGACY_PRODUCT_IDS } },
      });
      await transaction.product.updateMany({
        where: { id: { in: LEGACY_PRODUCT_IDS }, datasetRecord: null },
        data: { status: ProductStatus.ARCHIVED, deletedAt: importedAt },
      });
      for (const source of plan.sources) await importSource(transaction, source, importedAt);
      await rebuildHomepage(transaction, plan);
    },
    { maxWait: 10_000, timeout: TRANSACTION_TIMEOUT_MS },
  );

  return summarizeDatasetPlan(plan);
}

export async function getCanonicalDatasetCounts(transaction: Prisma.TransactionClient) {
  const [sources, records, activeProducts, variants, images, inventory] = await Promise.all([
    transaction.datasetSource.count(),
    transaction.datasetProductRecord.count(),
    transaction.datasetProductRecord.count({
      where: { isActive: true, product: { status: ProductStatus.ACTIVE, deletedAt: null } },
    }),
    transaction.productVariant.count({
      where: { product: { datasetRecord: { isActive: true } } },
    }),
    transaction.productImage.count({
      where: { product: { datasetRecord: { isActive: true } } },
    }),
    transaction.inventory.count({
      where: { variant: { product: { datasetRecord: { isActive: true } } } },
    }),
  ]);
  return { sources, records, activeProducts, variants, images, inventory };
}
