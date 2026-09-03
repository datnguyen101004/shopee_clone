import { OrderInventoryHoldConflictError } from './order-history.errors';
import { OrderLifecycleService } from './order-lifecycle.service';

const baseInput = {
  orderId: '00000000-0000-4000-8000-000000000001',
  currentStatus: 'PENDING_CONFIRMATION' as const,
  targetStatus: 'AWAITING_PICKUP' as const,
  expectedVersion: 0,
  actorType: 'SELLER' as const,
  actorUserId: '00000000-0000-4000-8000-000000000002',
  reasonCode: 'SELLER_CONFIRMED',
  reasonNote: null,
};

function transaction(hold: { status: string; expiresAt: Date } | null) {
  return {
    inventoryReservation: { findFirst: jest.fn().mockResolvedValue(hold) },
    shopOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    orderTimelineEvent: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([{ now: new Date('2026-08-18T00:15:00.000Z') }]),
  };
}

describe('OrderLifecycleService inventory hold guard', () => {
  it.each(['RELEASED', 'EXPIRED'] as const)('blocks fulfillment when hold is %s', async (status) => {
    const tx = transaction({ status, expiresAt: new Date('2026-08-18T00:10:00.000Z') });
    await expect(new OrderLifecycleService().transition(tx as never, baseInput)).rejects.toBeInstanceOf(OrderInventoryHoldConflictError);
    expect(tx.shopOrder.updateMany).not.toHaveBeenCalled();
  });

  it('blocks an active hold after the authoritative database expiry boundary', async () => {
    const tx = transaction({ status: 'ACTIVE', expiresAt: new Date('2026-08-18T00:15:00.000Z') });
    await expect(new OrderLifecycleService().transition(tx as never, baseInput)).rejects.toMatchObject({ holdStatus: 'EXPIRED' });
    expect(tx.shopOrder.updateMany).not.toHaveBeenCalled();
  });

  it('allows cancellation even when the inventory hold is terminal', async () => {
    const tx = transaction({ status: 'EXPIRED', expiresAt: new Date('2026-08-18T00:10:00.000Z') });
    await expect(new OrderLifecycleService().transition(tx as never, { ...baseInput, targetStatus: 'CANCELLED' })).resolves.toBeUndefined();
    expect(tx.shopOrder.updateMany).toHaveBeenCalledTimes(1);
  });
});
