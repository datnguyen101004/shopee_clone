import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { createPrismaClient } from '../prisma/create-prisma-client';
import { importCanonicalDataset } from '../prisma/dataset/importer';
import { deterministicUuid } from '../prisma/dataset/identifiers';
import {
  ProductStatus,
  ShopStatus,
  UserStatus,
  VariantStatus,
} from '../src/generated/prisma/enums';

const databaseTest = process.env.RUN_DATASET_DATABASE_TESTS === '1' ? describe : describe.skip;

jest.setTimeout(180_000);

loadRepositoryEnvironment();

databaseTest('Canonical dataset import with isolated PostgreSQL', () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required for dataset integration tests.');
  const prisma = createPrismaClient(databaseUrl);

  afterAll(async () => prisma.$disconnect());

  it('is idempotent and retains raw provenance with canonical relationships', async () => {
    const importedAt = new Date('2026-08-13T12:00:00.000Z');
    const first = await importCanonicalDataset(prisma, { importedAt });
    const before = await canonicalSnapshot();
    const second = await importCanonicalDataset(prisma, { importedAt });
    const after = await canonicalSnapshot();

    expect(second).toEqual(first);
    expect(after).toEqual(before);
    expect(after).toMatchObject({
      sources: 6,
      records: 1_377,
      activeProducts: 1_377,
      variants: 1_377,
      images: 1_377,
      inventory: 1_377,
    });
    const record = await prisma.datasetProductRecord.findFirstOrThrow({
      where: { isActive: true },
      include: { source: true, product: { include: { variants: true, images: true } } },
    });
    expect(record.rawPayload).toEqual(expect.objectContaining({ name: record.product.name }));
    expect(record.source.rootMetadata).not.toHaveProperty('records');
    expect(record.product.variants).toHaveLength(1);
    expect(record.product.images).toHaveLength(1);
  });

  it('rejects invalid input before mutation', async () => {
    const emptyDirectory = await mkdtemp(path.join(os.tmpdir(), 'shopee-empty-dataset-'));
    const before = await canonicalSnapshot();
    try {
      await expect(importCanonicalDataset(prisma, { directory: emptyDirectory })).rejects.toThrow(
        'Required dataset file',
      );
      expect(await canonicalSnapshot()).toEqual(before);
    } finally {
      await rm(emptyDirectory, { recursive: true, force: true });
    }
  });

  it('rolls back earlier source writes when a later database write fails', async () => {
    const source = await prisma.datasetSource.findUniqueOrThrow({ where: { key: 'bachhoa' } });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: 'dataset.bachhoa@shopee-clone.local' },
    });
    const conflictingUserId = deterministicUuid('dataset-integration-email-conflict');
    const displacedEmail = 'dataset.bachhoa.displaced@shopee-clone.local';
    try {
      await prisma.user.update({ where: { id: owner.id }, data: { email: displacedEmail } });
      await prisma.user.create({
        data: {
          id: conflictingUserId,
          email: 'dataset.bachhoa@shopee-clone.local',
          displayName: 'Dataset Conflict Fixture',
        },
      });
      await expect(
        importCanonicalDataset(prisma, { importedAt: new Date('2099-01-01T00:00:00.000Z') }),
      ).rejects.toThrow();
      expect(
        (await prisma.datasetSource.findUniqueOrThrow({ where: { key: 'bachhoa' } })).importedAt,
      ).toEqual(source.importedAt);
    } finally {
      await prisma.user.deleteMany({ where: { id: conflictingUserId } });
      await prisma.user.update({
        where: { id: owner.id },
        data: { email: 'dataset.bachhoa@shopee-clone.local' },
      });
    }
  });

  it('does not overwrite or delete an unrelated user-created product', async () => {
    const suffix = deterministicUuid('dataset-unrelated-fixture');
    const ownerId = deterministicUuid('dataset-unrelated-owner');
    const shopId = deterministicUuid('dataset-unrelated-shop');
    const categoryId = deterministicUuid('dataset-unrelated-category');
    const productId = deterministicUuid('dataset-unrelated-product');
    const variantId = deterministicUuid('dataset-unrelated-variant');
    try {
      await prisma.user.create({
        data: {
          id: ownerId,
          email: `unrelated.${suffix}@example.test`,
          displayName: 'Unrelated Seller',
          status: UserStatus.ACTIVE,
        },
      });
      await prisma.shop.create({
        data: {
          id: shopId,
          ownerId,
          slug: `unrelated-${suffix}`,
          name: 'Unrelated Shop',
          status: ShopStatus.ACTIVE,
        },
      });
      await prisma.category.create({
        data: { id: categoryId, slug: `unrelated-${suffix}`, name: 'Unrelated Category' },
      });
      await prisma.product.create({
        data: {
          id: productId,
          shopId,
          categoryId,
          slug: 'unrelated-product',
          name: 'Unrelated Product',
          description: 'Must survive the canonical import.',
          status: ProductStatus.ACTIVE,
          variants: {
            create: {
              id: variantId,
              sku: `UNRELATED-${suffix.slice(0, 12)}`,
              name: 'Default',
              priceMinor: 100n,
              status: VariantStatus.ACTIVE,
              inventory: { create: { quantityOnHand: 1, quantityReserved: 0 } },
            },
          },
        },
      });

      await importCanonicalDataset(prisma, { importedAt: new Date('2026-08-13T13:00:00.000Z') });
      expect(await prisma.product.findUnique({ where: { id: productId } })).toMatchObject({
        name: 'Unrelated Product',
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      });
      expect(await prisma.datasetProductRecord.count({ where: { productId } })).toBe(0);
    } finally {
      await prisma.productVariant.deleteMany({ where: { id: variantId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.shop.deleteMany({ where: { id: shopId } });
      await prisma.user.deleteMany({ where: { id: ownerId } });
    }
  });

  async function canonicalSnapshot() {
    const [sources, records, activeProducts, variants, images, inventory] = await Promise.all([
      prisma.datasetSource.count(),
      prisma.datasetProductRecord.count(),
      prisma.datasetProductRecord.count({
        where: { isActive: true, product: { status: ProductStatus.ACTIVE, deletedAt: null } },
      }),
      prisma.productVariant.count({ where: { product: { datasetRecord: { isActive: true } } } }),
      prisma.productImage.count({ where: { product: { datasetRecord: { isActive: true } } } }),
      prisma.inventory.count({
        where: { variant: { product: { datasetRecord: { isActive: true } } } },
      }),
    ]);
    return { sources, records, activeProducts, variants, images, inventory };
  }
});
