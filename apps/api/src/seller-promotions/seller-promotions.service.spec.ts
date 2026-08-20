import { SellerPromotionsService } from './seller-promotions.service';
import { SellerPromotionValidationError } from './seller-promotions.errors';

const uuid = '00000000-0000-4000-8000-000000000001';
const date = (value: string) => new Date(value);

function voucher(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid, code: 'SHOP10', name: 'Shop sale', issuer: 'SHOP', shopId: 'shop-1',
    benefitType: 'FIXED_AMOUNT', fixedAmountMinor: 10000n, percentageBasisPoints: null,
    maximumDiscountMinor: null, minimumSpendMinor: 50000n,
    startsAt: date('2026-08-01T00:00:00.000Z'), endsAt: date('2026-08-31T00:00:00.000Z'),
    isEnabled: true, usageLimit: 10, perBuyerLimit: 1, usedCount: 1, version: 2,
    archivedAt: null, createdAt: date('2026-07-01T00:00:00.000Z'), updatedAt: date('2026-07-01T00:00:00.000Z'),
    productScopes: [], ...overrides,
  };
}

describe('SellerPromotionsService concurrency boundary', () => {
  it('updates scalar fields and product scope atomically with a version/usage predicate', async () => {
    const current = voucher({ usedCount: 0 });
    const saved = voucher({ name: 'Updated', version: 3 });
    const tx = {
      voucher: { findFirst: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(saved), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      voucherProductScope: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
    const scope = { resolve: jest.fn().mockResolvedValue({ id: 'shop-1', timeZone: 'Asia/Ho_Chi_Minh' }) };
    const service = new SellerPromotionsService(prisma as never, scope as never);

    await service.updateVoucher('owner-1', uuid, 2, { name: 'Updated', usageLimit: 2, productIds: [] });

    expect(tx.voucher.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ version: 2, usedCount: { lte: 2 } }),
    }));
    expect(tx.voucherProductScope.deleteMany).toHaveBeenCalledWith({ where: { voucherId: uuid } });
    expect(tx.voucherProductScope.createMany).not.toHaveBeenCalled();
  });

  it('rejects a stale seller update without touching product scopes', async () => {
    const tx = {
      voucher: {
        findFirst: jest.fn().mockResolvedValueOnce(voucher({ version: 2 })).mockResolvedValueOnce({ version: 3 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      voucherProductScope: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
    const scope = { resolve: jest.fn().mockResolvedValue({ id: 'shop-1', timeZone: 'Asia/Ho_Chi_Minh' }) };
    const service = new SellerPromotionsService(prisma as never, scope as never);

    await expect(service.updateVoucher('owner-1', uuid, 2, { name: 'Lost update' })).rejects.toMatchObject({ currentVersion: 3 });
    expect(tx.voucherProductScope.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a new limit below already consumed usage before issuing a write', async () => {
    const current = voucher({ usedCount: 4, version: 2 });
    const tx = { voucher: { findFirst: jest.fn().mockResolvedValue(current), updateMany: jest.fn() }, product: { findMany: jest.fn() } };
    const prisma = { $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
    const scope = { resolve: jest.fn().mockResolvedValue({ id: 'shop-1', timeZone: 'Asia/Ho_Chi_Minh' }) };
    const service = new SellerPromotionsService(prisma as never, scope as never);

    await expect(service.updateVoucher('owner-1', uuid, 2, { usageLimit: 3 })).rejects.toBeInstanceOf(SellerPromotionValidationError);
    expect(tx.voucher.updateMany).not.toHaveBeenCalled();
  });

  it('hard-deletes an unused paused voucher with an optimistic version check', async () => {
    const current = voucher({ isEnabled: false, usedCount: 0, version: 4 });
    const tx = {
      voucher: { findFirst: jest.fn().mockResolvedValue(current), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      voucherUserUsage: { count: jest.fn().mockResolvedValue(0) },
      voucherRedemption: { count: jest.fn().mockResolvedValue(0) },
      purchaseVoucher: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
    const scope = { resolve: jest.fn().mockResolvedValue({ id: 'shop-1', timeZone: 'Asia/Ho_Chi_Minh' }) };
    const service = new SellerPromotionsService(prisma as never, scope as never);

    await expect(service.deleteVoucher('owner-1', uuid, 4)).resolves.toEqual({ deleted: true });
    expect(tx.voucher.deleteMany).toHaveBeenCalledWith({ where: { id: uuid, shopId: 'shop-1', issuer: 'SHOP', version: 4, isEnabled: false } });
  });

  it('rejects deletion when the voucher is still enabled or has usage history', async () => {
    const activeTx = {
      voucher: { findFirst: jest.fn().mockResolvedValue(voucher({ isEnabled: true, version: 4 })), deleteMany: jest.fn() },
      voucherUserUsage: { count: jest.fn() },
      voucherRedemption: { count: jest.fn() },
      purchaseVoucher: { count: jest.fn() },
    };
    const activePrisma = { $transaction: jest.fn(async (callback: (value: typeof activeTx) => unknown) => callback(activeTx)) };
    const scope = { resolve: jest.fn().mockResolvedValue({ id: 'shop-1', timeZone: 'Asia/Ho_Chi_Minh' }) };
    const activeService = new SellerPromotionsService(activePrisma as never, scope as never);
    await expect(activeService.deleteVoucher('owner-1', uuid, 4)).rejects.toMatchObject({ code: 'PAUSED_REQUIRED' });
    expect(activeTx.voucher.deleteMany).not.toHaveBeenCalled();

    const usedTx = {
      voucher: { findFirst: jest.fn().mockResolvedValue(voucher({ isEnabled: false, usedCount: 0, version: 4 })), deleteMany: jest.fn() },
      voucherUserUsage: { count: jest.fn().mockResolvedValue(1) },
      voucherRedemption: { count: jest.fn().mockResolvedValue(0) },
      purchaseVoucher: { count: jest.fn().mockResolvedValue(0) },
    };
    const usedPrisma = { $transaction: jest.fn(async (callback: (value: typeof usedTx) => unknown) => callback(usedTx)) };
    const usedService = new SellerPromotionsService(usedPrisma as never, scope as never);
    await expect(usedService.deleteVoucher('owner-1', uuid, 4)).rejects.toMatchObject({ code: 'VOUCHER_IN_USE' });
    expect(usedTx.voucher.deleteMany).not.toHaveBeenCalled();
  });
});
