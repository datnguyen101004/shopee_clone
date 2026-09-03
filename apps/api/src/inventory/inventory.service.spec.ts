import { InventoryService } from './inventory.service';
import {
  InventoryIdempotencyConflictError,
  InventoryStaleError,
} from './inventory.errors';

const variantId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const shopId = '00000000-0000-4000-8000-000000000003';
const idempotencyKey = '00000000-0000-4000-8000-000000000004';

function fixture() {
  const inventory = {
    variantId,
    quantityOnHand: 10,
    quantityReserved: 2,
    quantitySold: 3,
    version: 4,
    updatedAt: new Date('2026-08-18T00:00:00.000Z'),
  };
  const variant = {
    id: variantId,
    deletedAt: null,
    status: 'ACTIVE',
    updatedAt: inventory.updatedAt,
    productId: '00000000-0000-4000-8000-000000000005',
    product: { id: '00000000-0000-4000-8000-000000000005', name: 'Product', shopId },
  };
  const tx = {
    productVariant: { findFirst: jest.fn().mockResolvedValue(variant) },
    inventoryAdjustment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'audit', ...data, occurredAt: new Date('2026-08-18T00:00:00.000Z') })),
    },
    inventory: {
      findUnique: jest.fn().mockResolvedValue(inventory),
      update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...inventory,
        quantityOnHand: typeof data.quantityOnHand === 'number' ? data.quantityOnHand : inventory.quantityOnHand,
        quantityReserved: typeof data.quantityReserved === 'number' ? data.quantityReserved : inventory.quantityReserved,
        quantitySold: typeof data.quantitySold === 'number' ? data.quantitySold : inventory.quantitySold,
        version: inventory.version + 1,
        updatedAt: new Date('2026-08-18T00:00:00.000Z'),
      })),
      create: jest.fn(),
    },
    inventoryReservation: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'reservation', status: 'RELEASED' }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const service = new InventoryService(prisma as never, { enqueue: jest.fn() } as never);
  return { service, tx, prisma, inventory };
}

describe('InventoryService', () => {
  it('filters before pagination, keeps stable cursor order, and projects the primary image', async () => {
    const rows = [
      {
        variantId: '00000000-0000-4000-8000-000000000011',
        quantityOnHand: 2,
        quantityReserved: 0,
        quantitySold: 0,
        version: 1,
        updatedAt: new Date('2026-08-18T00:00:00.000Z'),
        variant: {
          id: '00000000-0000-4000-8000-000000000011',
          productId: '00000000-0000-4000-8000-000000000012',
          name: 'Đỏ',
          sku: 'RED-1',
          status: 'ACTIVE',
          deletedAt: null,
          updatedAt: new Date('2026-08-18T00:00:00.000Z'),
          product: {
            id: '00000000-0000-4000-8000-000000000012',
            name: 'Sản phẩm công khai',
            shopId,
            images: [{ url: 'https://cdn.example.test/primary.png', sortOrder: 0, id: 'image-1' }],
          },
        },
      },
      {
        variantId: '00000000-0000-4000-8000-000000000013',
        quantityOnHand: 10,
        quantityReserved: 0,
        quantitySold: 0,
        version: 1,
        updatedAt: new Date('2026-08-18T00:00:00.000Z'),
        variant: {
          id: '00000000-0000-4000-8000-000000000013',
          productId: '00000000-0000-4000-8000-000000000014',
          name: 'Xanh',
          sku: 'BLUE-1',
          status: 'ACTIVE',
          deletedAt: null,
          updatedAt: new Date('2026-08-18T00:00:00.000Z'),
          product: {
            id: '00000000-0000-4000-8000-000000000014',
            name: 'Sản phẩm không ảnh',
            shopId,
            images: [],
          },
        },
      },
    ];
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(rows.map(({ variantId }) => ({ variantId }))),
      inventory: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const service = new InventoryService(prisma as never, { enqueue: jest.fn() } as never);

    const result = await service.list(userId, { cursor: null, limit: 1, productId: null, lowStock: true });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String(prisma.$queryRaw.mock.calls[0][0].sql)).toContain('ORDER BY i."variant_id" ASC');
    expect(String(prisma.$queryRaw.mock.calls[0][0].sql)).toContain('LIMIT');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ variantId: rows[0]!.variantId, productImageUrl: 'https://cdn.example.test/primary.png', lowStock: true });
    expect(result.nextCursor).toBe(rows[0]!.variantId);
  });

  it('shows low-stock and normal rows by default instead of excluding low-stock rows', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ variantId }]),
      inventory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // Keep the assertion focused on the SQL predicate; the response projection
    // is covered by the preceding list test.
    const service = new InventoryService(prisma as never, { enqueue: jest.fn() } as never);
    await service.list(userId, { cursor: null, limit: 20, productId: null, lowStock: false });
    const sql = String(prisma.$queryRaw.mock.calls[0][0].sql);
    expect(sql).not.toContain('quantity_on_hand" - i."quantity_reserved") >');
  });

  it('projects available quantity as on-hand minus reserved and writes an immutable audit', async () => {
    const { service, tx } = fixture();
    const result = await service.adjust(userId, variantId, 4, idempotencyKey, {
      delta: 5,
      reason: 'RESTOCK',
      note: 'restock',
    });
    expect(result.availableQuantity).toBe(13);
    expect(result.quantityOnHandBefore).toBe(10);
    expect(result.quantityOnHandAfter).toBe(15);
    expect(tx.inventoryAdjustment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantityReserved: 2, quantitySold: 3, inventoryVersion: 5 }),
    }));
  });

  it('rejects stale versions and reductions below reserved stock', async () => {
    const stale = fixture();
    await expect(stale.service.adjust(userId, variantId, 3, idempotencyKey, { delta: 1, reason: 'RESTOCK', note: null })).rejects.toBeInstanceOf(InventoryStaleError);

    const protectedStock = fixture();
    await expect(protectedStock.service.adjust(userId, variantId, 4, idempotencyKey, { delta: -9, reason: 'DAMAGE', note: null })).rejects.toMatchObject({ availableQuantity: 8 });
    expect(protectedStock.tx.inventory.update).not.toHaveBeenCalled();
  });

  it('replays an identical idempotency key and rejects key reuse with a different digest', async () => {
    const replay = fixture();
    await replay.service.adjust(userId, variantId, 4, idempotencyKey, { delta: 1, reason: 'RESTOCK', note: null });
    const requestDigest = replay.tx.inventoryAdjustment.create.mock.calls[0][0].data.requestDigest;
    const previous = { id: 'audit', requestDigest, variantId, actorUserId: userId, reason: 'RESTOCK', note: null, delta: 1, quantityOnHandBefore: 10, quantityOnHandAfter: 11, quantityReserved: 2, quantitySold: 3, inventoryVersion: 5, idempotencyKey, occurredAt: new Date('2026-08-18T00:00:00.000Z') };
    replay.tx.inventoryAdjustment.findFirst.mockResolvedValueOnce(previous);
    await expect(replay.service.adjust(userId, variantId, 4, idempotencyKey, { delta: 1, reason: 'RESTOCK', note: null })).resolves.toMatchObject({ id: 'audit' });

    const conflict = fixture();
    conflict.tx.inventoryAdjustment.findFirst.mockResolvedValueOnce({ ...previous, requestDigest: 'different' });
    await expect(conflict.service.adjust(userId, variantId, 4, idempotencyKey, { delta: 1, reason: 'RESTOCK', note: null })).rejects.toBeInstanceOf(InventoryIdempotencyConflictError);
  });

  it('serializes row-locking through a sorted parameterized query', async () => {
    const { service, tx } = fixture();
    await service.adjust(userId, variantId, 4, idempotencyKey, { delta: 1, reason: 'RESTOCK', note: null });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String(tx.$queryRaw.mock.calls[0][0].sql)).toContain('FOR UPDATE');
  });

  it('keeps terminal reservations idempotent and does not reacquire an active hold', async () => {
    const { service, tx } = fixture();
    const reservation = { id: 'reservation', buyerId: userId, status: 'ACTIVE', lines: [] };
    tx.inventoryReservation.findUnique.mockResolvedValueOnce(reservation);
    await expect(service.reacquireForPendingOrder(tx as never, userId, reservation.id, 1, idempotencyKey, 'a'.repeat(64), [])).resolves.toBe(reservation);

    tx.inventoryReservation.findUnique.mockResolvedValueOnce({ ...reservation, status: 'RELEASED', lines: [] });
    await expect(service.release(reservation.id, 'payment-failed', idempotencyKey)).resolves.toEqual({ ...reservation, status: 'RELEASED' });
    tx.inventoryReservation.findUnique.mockResolvedValueOnce({ ...reservation, status: 'CONSUMED', lines: [] });
    await expect(service.release(reservation.id, 'expired', idempotencyKey)).resolves.toEqual({ ...reservation, status: 'CONSUMED' });
  });
});
