import { ProductRetentionCleanupService } from '../src/product-retention/product-retention-cleanup.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest = process.env.RUN_PRODUCT_RETENTION_DATABASE_TESTS === '1' ? describe : describe.skip;

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('product retention cleanup PostgreSQL behavior', () => {
  let prisma: PrismaService;
  let service: ProductRetentionCleanupService;
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    service = new ProductRetentionCleanupService(prisma, { remove: jest.fn().mockResolvedValue(undefined) } as never);
    const shop = await prisma.shop.findFirstOrThrow({ where: { deletedAt: null, status: 'ACTIVE', onboardingStatus: 'APPROVED' } });
    const category = await prisma.category.findFirstOrThrow({ where: { deletedAt: null, isActive: true, children: { none: { isActive: true, deletedAt: null } } } });
    for (const [label, offset] of [['boundary', "- interval '7 days' + interval '30 seconds'"], ['eligible', "- interval '7 days' - interval '1 second'"]] as const) {
      const product = await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          slug: `retention-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: `Retention ${label}`,
          description: '',
          status: 'DRAFT',
          variants: { create: { shopId: shop.id, sku: `RET-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`, combinationKey: '', name: 'Mặc định', priceMinor: 1n, weightGrams: 1, inventory: { create: { quantityOnHand: 0 } } } },
        },
      });
      const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: product.id } });
      await prisma.inventoryAdjustment.create({
        data: {
          variantId: variant.id,
          shopId: shop.id,
          actorUserId: null,
          reason: 'INITIAL_STOCK',
          note: 'retention fixture',
          delta: 1,
          quantityOnHandBefore: 0,
          quantityOnHandAfter: 1,
          quantityReserved: 0,
          quantitySold: 0,
          inventoryVersion: 0,
        },
      });
      await prisma.$executeRawUnsafe(`UPDATE products SET deleted_at = clock_timestamp() ${offset} WHERE id = $1::uuid`, product.id);
      createdProductIds.push(product.id);
    }
  });

  afterAll(async () => {
    const variants = await prisma.productVariant.findMany({ where: { productId: { in: createdProductIds } }, select: { id: true } });
    await prisma.inventoryAdjustment.deleteMany({ where: { variantId: { in: variants.map(({ id }) => id) } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: createdProductIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.onModuleDestroy();
  });

  it('uses a strict seven-day boundary and purges only the older authoring graph', async () => {
    await service.run();
    const remaining = await prisma.product.findMany({ where: { id: { in: createdProductIds } }, select: { name: true } });
    expect(remaining.map((product) => product.name)).toEqual(['Retention boundary']);
  });
});
