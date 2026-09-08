import { InventoryInsufficientError } from '../src/inventory/inventory.errors';
import { InventoryService } from '../src/inventory/inventory.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest = process.env.RUN_CART_DATABASE_TESTS === '1' ? describe : describe.skip;
const buyerA = '00000000-0000-4000-8000-000000009970';
const buyerB = '00000000-0000-4000-8000-000000009971';
const keyA = '00000000-0000-4000-8000-000000009972';
const keyB = '00000000-0000-4000-8000-000000009973';
const adjustmentKeyA = '00000000-0000-4000-8000-000000009974';
const adjustmentKeyB = '00000000-0000-4000-8000-000000009975';
const finalizationKey = '00000000-0000-4000-8000-000000009976';

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('inventory PostgreSQL concurrency', () => {
  let prisma: PrismaService;
  let service: InventoryService;
  let variantId: string;
  let sellerId: string;
  let productId: string;
  let original: { quantityOnHand: number; quantityReserved: number; quantitySold: number; version: number };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    service = new InventoryService(prisma, { enqueue: jest.fn().mockResolvedValue(undefined) } as never);
    const variant = await prisma.productVariant.findFirst({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        product: {
          deletedAt: null,
          status: 'ACTIVE',
          moderationStatus: 'ACTIVE',
          category: { isActive: true, deletedAt: null },
          shop: { deletedAt: null, status: 'ACTIVE', onboardingStatus: 'APPROVED' },
        },
      },
      include: { inventory: true, product: { include: { shop: true } } },
    });
    if (!variant?.inventory) throw new Error('Seed inventory is required');
    variantId = variant.id;
    sellerId = variant.product.shop.ownerId;
    productId = variant.product.id;
    original = { quantityOnHand: variant.inventory.quantityOnHand, quantityReserved: variant.inventory.quantityReserved, quantitySold: variant.inventory.quantitySold, version: variant.inventory.version };
    await prisma.inventory.update({ where: { variantId }, data: { quantityOnHand: 1, quantityReserved: 0, quantitySold: 0, version: { increment: 1 } } });
    await prisma.user.createMany({ data: [{ id: buyerA, email: 'inventory-race-a@example.test', displayName: 'Inventory Race A', status: 'ACTIVE' }, { id: buyerB, email: 'inventory-race-b@example.test', displayName: 'Inventory Race B', status: 'ACTIVE' } ], skipDuplicates: true });
  });

  afterAll(async () => {
    const reservations = await prisma.inventoryReservation.findMany({ where: { buyerId: { in: [buyerA, buyerB] } }, select: { id: true } });
    if (reservations.length) {
      await prisma.inventoryReservationLine.deleteMany({ where: { reservationId: { in: reservations.map(({ id }) => id) } } });
      await prisma.inventoryReservation.deleteMany({ where: { id: { in: reservations.map(({ id }) => id) } } });
    }
    await prisma.inventoryAdjustment.deleteMany({ where: { idempotencyKey: { in: [adjustmentKeyA, adjustmentKeyB] } } });
    await prisma.inventory.update({ where: { variantId }, data: original });
    await prisma.user.deleteMany({ where: { id: { in: [buyerA, buyerB] } } });
    await prisma.onModuleDestroy();
  });

  it('allows exactly one reservation for the final unit and never makes reserved exceed on-hand', async () => {
    const attempt = (buyerId: string, idempotencyKey: string) => prisma.$transaction((tx) => service.reserveForCheckout(tx, buyerId, 1, idempotencyKey, 'a'.repeat(64), [{ variantId, quantity: 1 }]));
    const results = await Promise.allSettled([attempt(buyerA, keyA), attempt(buyerB, keyB)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected').map((result) => result.reason)).toEqual([expect.any(InventoryInsufficientError)]);
    const balance = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(balance.quantityReserved).toBe(1);
    expect(balance.quantityReserved).toBeLessThanOrEqual(balance.quantityOnHand);
  });

  it('releases a reservation exactly once when finalizers race with the same key', async () => {
    const reservation = await prisma.inventoryReservation.findFirstOrThrow({
      where: { buyerId: { in: [buyerA, buyerB] }, status: 'ACTIVE' },
    });
    const before = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });

    const results = await Promise.all([
      service.release(reservation.id, 'payment-failed', finalizationKey),
      service.release(reservation.id, 'payment-failed', finalizationKey),
    ]);

    expect(results.every((result) => result?.status === 'RELEASED')).toBe(true);
    const after = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(after.quantityReserved).toBe(before.quantityReserved - 1);
    expect(after.quantityOnHand).toBe(before.quantityOnHand);
    expect(after.quantitySold).toBe(before.quantitySold);
    expect(
      await prisma.inventoryReservation.findUniqueOrThrow({ where: { id: reservation.id } }),
    ).toMatchObject({
      status: 'RELEASED',
      terminalReason: 'payment-failed',
      terminalIdempotencyKey: finalizationKey,
    });
  });

  it('lists published inventory with the primary image projection before pagination', async () => {
    const page = await service.list(sellerId, { page: 1, productId, lowStock: null });
    expect(page.items).toEqual(expect.arrayContaining([expect.objectContaining({ variantId })]));
    expect(page.items[0]).toHaveProperty('productImageUrl');
  });

  it('allows one of two concurrent adjustments against the same version', async () => {
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: { include: { shop: true } } } });
    const current = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
    const attempt = (idempotencyKey: string) => service.adjust(variant.product.shop.ownerId, variantId, current.version, idempotencyKey, { delta: 1, reason: 'RESTOCK', note: null });
    const results = await Promise.allSettled([attempt(adjustmentKeyA), attempt(adjustmentKeyB)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { variantId } })).quantityOnHand).toBe(current.quantityOnHand + 1);
  });
});
