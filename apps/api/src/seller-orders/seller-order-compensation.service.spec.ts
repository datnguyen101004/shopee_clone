import { SellerOrderCompensationService } from './seller-order-compensation.service';
import { SellerOrderInventoryInvariantError } from './seller-order.errors';

const orderId = '00000000-0000-4000-8000-000000000001';
const variantA = '00000000-0000-4000-8000-000000000002';
const variantB = '00000000-0000-4000-8000-000000000003';
const productId = '00000000-0000-4000-8000-000000000004';

function fixture() {
  const balances = new Map([
    [variantA, { variantId: variantA, quantityOnHand: 2, quantityReserved: 0, quantitySold: 5, version: 4 }],
    [variantB, { variantId: variantB, quantityOnHand: 1, quantityReserved: 0, quantitySold: 3, version: 2 }],
  ]);
  const tx = {
    sellerOrderInventoryCompensation: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    shopOrder: { findUnique: jest.fn().mockResolvedValue({ shopId: 'shop', purchase: { inventoryReservation: { status: 'CONSUMED' } } }) },
    orderLine: { findMany: jest.fn().mockResolvedValue([{ variantId: variantA, productId, quantity: 2 }, { variantId: variantA, productId, quantity: 1 }, { variantId: variantB, productId, quantity: 1 }]) },
    inventory: {
      findMany: jest.fn().mockImplementation(async () => [...balances.values()]),
      updateMany: jest.fn().mockImplementation(async ({ where, data }: { where: { variantId: string }; data: { quantityOnHand: { increment: number }; quantitySold: { decrement: number }; version: { increment: number } } }) => {
        const balance = balances.get(where.variantId)!;
        balance.quantityOnHand += data.quantityOnHand.increment;
        balance.quantitySold -= data.quantitySold.decrement;
        balance.version += data.version.increment;
        return { count: 1 };
      }),
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { variantId: string } }) => balances.get(where.variantId)),
    },
    product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    inventoryAdjustment: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    sellerOrderFulfillment: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    sellerOrderFulfillmentEvent: { create: jest.fn() },
  };
  return { service: new SellerOrderCompensationService(), tx, balances };
}

describe('SellerOrderCompensationService', () => {
  it('aggregates shared-product lines and restores each variant exactly once', async () => {
    const { service, tx, balances } = fixture();
    await service.compensateConsumedInventory(tx as never, { orderId, actorUserId: 'seller', actorType: 'SELLER', state: 'REJECTED', action: 'REJECT', reasonCode: 'OUT_OF_STOCK', reasonNote: null, idempotencyKey: '00000000-0000-4000-8000-000000000005', requestDigest: 'a'.repeat(64) });
    expect(balances.get(variantA)).toMatchObject({ quantityOnHand: 5, quantitySold: 2, version: 5 });
    expect(balances.get(variantB)).toMatchObject({ quantityOnHand: 2, quantitySold: 2, version: 3 });
    expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: productId, soldCount: { gte: 4 } } }));
    expect(tx.inventoryAdjustment.create).toHaveBeenCalledTimes(2);
    expect(tx.sellerOrderInventoryCompensation.create).toHaveBeenCalledTimes(1);
  });

  it('fails safely when sold quantity cannot cover compensation', async () => {
    const { service, tx } = fixture();
    tx.inventory.findMany.mockResolvedValueOnce([{ variantId: variantA, quantityOnHand: 2, quantityReserved: 0, quantitySold: 1, version: 4 }, { variantId: variantB, quantityOnHand: 1, quantityReserved: 0, quantitySold: 3, version: 2 }]);
    await expect(service.compensateConsumedInventory(tx as never, { orderId, actorUserId: null, actorType: 'BUYER', state: 'CANCELLED', action: 'BUYER_CANCELLED', reasonCode: 'BUYER_CANCELLED', reasonNote: null, idempotencyKey: '00000000-0000-4000-8000-000000000006', requestDigest: 'b'.repeat(64) })).rejects.toBeInstanceOf(SellerOrderInventoryInvariantError);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});
