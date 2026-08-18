import { InventoryReservationQueueService } from './inventory-reservation-queue.service';

const reservationId = '00000000-0000-4000-8000-000000000001';
const variantId = '00000000-0000-4000-8000-000000000002';
const generationToken = '00000000-0000-4000-8000-000000000003';

describe('InventoryReservationQueueService expiry worker', () => {
  function fixture(reservation: Record<string, unknown>, now = new Date('2026-08-18T00:15:00.000Z')) {
    const tx = {
      inventoryReservation: {
        findUnique: jest.fn().mockResolvedValue(reservation),
        update: jest.fn().mockResolvedValue({ ...reservation, status: 'EXPIRED' }),
      },
      inventory: { update: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ now }]),
    };
    const prisma = { $transaction: jest.fn().mockImplementation(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)) };
    const service = new InventoryReservationQueueService(prisma as never);
    return { service, tx };
  }

  const active = (overrides: Record<string, unknown> = {}) => ({
    id: reservationId,
    generationToken,
    status: 'ACTIVE',
    expiresAt: new Date('2026-08-18T00:15:00.000Z'),
    lines: [{ variantId, quantity: 1 }],
    ...overrides,
  });

  it('expires exactly at the database boundary and records a terminal reason', async () => {
    const { service, tx } = fixture(active());
    await (service as never as { expire: (id: string, token: string) => Promise<void> }).expire(reservationId, generationToken);
    expect(tx.inventory.update).toHaveBeenCalledWith({ where: { variantId }, data: { quantityReserved: { decrement: 1 }, version: { increment: 1 } } });
    expect(tx.inventoryReservation.update).toHaveBeenCalledWith({ where: { id: reservationId }, data: { status: 'EXPIRED', releasedAt: new Date('2026-08-18T00:15:00.000Z'), terminalReason: 'expired' } });
  });

  it('no-ops early delivery, stale generation, and already terminal reservations', async () => {
    const early = fixture(active({ expiresAt: new Date('2026-08-18T00:16:00.000Z') }));
    await (early.service as never as { expire: (id: string, token: string) => Promise<void> }).expire(reservationId, generationToken);
    expect(early.tx.inventory.update).not.toHaveBeenCalled();

    const stale = fixture(active({ generationToken: '00000000-0000-4000-8000-000000000004' }));
    await (stale.service as never as { expire: (id: string, token: string) => Promise<void> }).expire(reservationId, generationToken);
    expect(stale.tx.inventory.update).not.toHaveBeenCalled();

    const consumed = fixture(active({ status: 'CONSUMED' }));
    await (consumed.service as never as { expire: (id: string, token: string) => Promise<void> }).expire(reservationId, generationToken);
    expect(consumed.tx.inventory.update).not.toHaveBeenCalled();
  });

  it('fails closed when the scheduler is unavailable instead of silently committing a hold', async () => {
    const { service } = fixture(active());
    await expect(service.enqueue({} as never, reservationId, generationToken, new Date())).rejects.toMatchObject({ message: 'Inventory is temporarily unavailable' });
  });
});
