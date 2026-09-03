import { ProductRetentionCleanupService } from './product-retention-cleanup.service';
import { isProductRetentionCleanupEnabled, PRODUCT_RETENTION_CRON, PRODUCT_RETENTION_DAYS, PRODUCT_RETENTION_TIME_ZONE } from './product-retention.constants';

const productId = '00000000-0000-4000-8000-000000000001';

function baseTx(flags: Record<string, unknown>) {
  return {
    $queryRaw: jest.fn()
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ id: productId }])
      .mockResolvedValueOnce([{ now: new Date('2026-08-18T04:00:00.000Z') }])
      .mockResolvedValueOnce([flags]),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    sellerProductMediaAsset: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn(), deleteMany: jest.fn() },
    productVariant: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    inventoryAdjustment: { deleteMany: jest.fn() },
    cartLine: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    cart: { updateMany: jest.fn() },
    productFavorite: { deleteMany: jest.fn() },
    recentlyViewedProduct: { deleteMany: jest.fn() },
    homepageModuleProduct: { deleteMany: jest.fn() },
    voucherProductScope: { deleteMany: jest.fn() },
    productImage: { deleteMany: jest.fn() },
    product: { update: jest.fn(), delete: jest.fn() },
  };
}

describe('ProductRetentionCleanupService', () => {
  it('keeps the seven-day Vietnam schedule explicit and supports a rollout switch', () => {
    expect(PRODUCT_RETENTION_DAYS).toBe(7);
    expect(PRODUCT_RETENTION_CRON).toBe('0 0 4 * * *');
    expect(PRODUCT_RETENTION_TIME_ZONE).toBe('Asia/Ho_Chi_Minh');
    const previous = process.env.PRODUCT_RETENTION_CLEANUP_ENABLED;
    process.env.PRODUCT_RETENTION_CLEANUP_ENABLED = 'false';
    expect(isProductRetentionCleanupEnabled()).toBe(false);
    if (previous === undefined) delete process.env.PRODUCT_RETENTION_CLEANUP_ENABLED;
    else process.env.PRODUCT_RETENTION_CLEANUP_ENABLED = previous;
  });

  it('uses a strict seven-day candidate boundary and purges authoring-only products', async () => {
    const tx = baseTx({ hasOrderLine: false, hasReview: false, hasReservation: false, hasDatasetRecord: false, hasSoldOrReservedInventory: false, hasCommerceAdjustment: false });
    const prisma = { $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)), $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]), sellerProductMediaAsset: { deleteMany: jest.fn() } };
    const service = new ProductRetentionCleanupService(prisma as never, { remove: jest.fn() } as never);
    await service.run();
    expect(tx.$queryRaw.mock.calls[1]?.[0].sql).toContain('deleted_at');
    expect(tx.$queryRaw.mock.calls[1]?.[0].sql).toContain('<');
    expect(tx.product.delete).toHaveBeenCalledWith({ where: { id: productId } });
    expect(service.getStatus()).toMatchObject({ deletedCount: 1, retainedCount: 0, failedCount: 0, remainingCount: 0, running: false });
  });

  it('marks durable history as a tombstone and does not delete its graph', async () => {
    const tx = baseTx({ hasOrderLine: true, hasReview: false, hasReservation: false, hasDatasetRecord: false, hasSoldOrReservedInventory: false, hasCommerceAdjustment: false });
    const prisma = { $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)), $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]), sellerProductMediaAsset: { deleteMany: jest.fn() } };
    const service = new ProductRetentionCleanupService(prisma as never, { remove: jest.fn() } as never);
    await service.run();
    expect(tx.product.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: productId }, data: expect.objectContaining({ purgeBlockReason: 'HISTORICAL_TOMBSTONE' }) }));
    expect(tx.product.delete).not.toHaveBeenCalled();
  });

  it('skips safely when another instance owns the advisory lock', async () => {
    const tx = baseTx({});
    tx.$queryRaw.mockReset().mockResolvedValueOnce([{ locked: false }]);
    const prisma = { $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)), $queryRaw: jest.fn().mockResolvedValue([{ count: 2n }]), sellerProductMediaAsset: { deleteMany: jest.fn() } };
    const service = new ProductRetentionCleanupService(prisma as never, { remove: jest.fn() } as never);
    await service.run();
    expect(tx.product.delete).not.toHaveBeenCalled();
    expect(service.getStatus()).toMatchObject({ deletedCount: 0, retainedCount: 0, remainingCount: 2 });
  });

  it('stages media in the transaction and removes storage only after commit', async () => {
    const tx = baseTx({ hasOrderLine: false, hasReview: false, hasReservation: false, hasDatasetRecord: false, hasSoldOrReservedInventory: false, hasCommerceAdjustment: false });
    tx.sellerProductMediaAsset.findMany.mockResolvedValue([{ id: 'media-1', storageKey: 'seller-product-media/media-1.png' }]);
    const prisma = { $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)), $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]), sellerProductMediaAsset: { deleteMany: jest.fn() } };
    const storage = { remove: jest.fn().mockResolvedValue(undefined) };
    const service = new ProductRetentionCleanupService(prisma as never, storage as never);

    await service.run();

    expect(tx.sellerProductMediaAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ productId: null, state: 'STAGED' }) }));
    expect(storage.remove).toHaveBeenCalledWith('seller-product-media/media-1.png');
    expect(prisma.sellerProductMediaAsset.deleteMany).toHaveBeenCalledWith({ where: { id: 'media-1', state: 'STAGED' } });
  });

  it('keeps staged metadata for retry when storage cleanup fails', async () => {
    const tx = baseTx({ hasOrderLine: false, hasReview: false, hasReservation: false, hasDatasetRecord: false, hasSoldOrReservedInventory: false, hasCommerceAdjustment: false });
    tx.sellerProductMediaAsset.findMany.mockResolvedValue([{ id: 'media-2', storageKey: 'seller-product-media/media-2.png' }]);
    const prisma = { $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)), $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]), sellerProductMediaAsset: { deleteMany: jest.fn() } };
    const storage = { remove: jest.fn().mockRejectedValue(new Error('storage unavailable')) };
    const service = new ProductRetentionCleanupService(prisma as never, storage as never);

    await service.run();

    expect(prisma.sellerProductMediaAsset.deleteMany).not.toHaveBeenCalled();
    expect(service.getStatus()).toMatchObject({ deletedCount: 1, failedCount: 1 });
  });

  it('rolls back a failed candidate to its savepoint and leaves it retryable', async () => {
    const tx = baseTx({ hasOrderLine: false, hasReview: false, hasReservation: false, hasDatasetRecord: false, hasSoldOrReservedInventory: false, hasCommerceAdjustment: false });
    tx.product.delete.mockRejectedValue(new Error('graph race'));
    const prisma = { $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)), $queryRaw: jest.fn().mockResolvedValue([{ count: 1n }]), sellerProductMediaAsset: { deleteMany: jest.fn() } };
    const service = new ProductRetentionCleanupService(prisma as never, { remove: jest.fn() } as never);

    await service.run();

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT product_retention_0');
    expect(service.getStatus()).toMatchObject({ deletedCount: 0, failedCount: 1, remainingCount: 1 });
  });
});
