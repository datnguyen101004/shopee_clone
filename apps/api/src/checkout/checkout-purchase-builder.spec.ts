import type { CheckoutConfirmationRequest } from '@shopee-clone/contracts';

import { CheckoutPurchaseBuilder } from './checkout-purchase-builder';
import { CheckoutPreviewChangedError } from './checkout.errors';

const confirmation: CheckoutConfirmationRequest = {
  shippingAddressId: '00000000-0000-4000-8000-000000006001',
  services: [],
  notes: [],
  checkoutFingerprint: 'a'.repeat(64),
};

function harness(checkoutFingerprint = confirmation.checkoutFingerprint) {
  const preview = {
    ready: true,
    checkoutFingerprint,
    evaluatedAt: '2026-08-28T00:00:00.000Z',
    shops: [],
    summary: { payableTotalMinor: 150_000 },
  };
  const assembler = {
    assembleInTransaction: jest.fn().mockResolvedValue({ preview, applied: [] }),
  };
  const writer = {
    write: jest.fn().mockResolvedValue({ byVoucherId: new Map() }),
    linkRedemptions: jest.fn().mockResolvedValue(undefined),
  };
  const clock = { now: jest.fn().mockReturnValue(new Date('2026-08-28T00:00:00.000Z')) };
  const inventory = {
    reserveForCheckout: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
    attachToPurchaseInTransaction: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
  };
  const builder = new CheckoutPurchaseBuilder(
    assembler as never,
    writer as never,
    clock as never,
    inventory as never,
  );
  return { builder, assembler, writer, clock, inventory, preview };
}

describe('CheckoutPurchaseBuilder', () => {
  it.each([
    ['COD', 'UNPAID'],
    ['MOMO', 'PENDING'],
  ] as const)(
    'uses the same authoritative construction for %s',
    async (paymentMethod, paymentStatus) => {
      const { builder, assembler, writer, clock, inventory, preview } = harness();
      const transaction = {} as never;
      const result = await builder.buildInTransaction(transaction, {
        userId: 'buyer-1',
        expectedVersion: 2,
        idempotencyKey: 'idempotency-1',
        requestDigest: 'b'.repeat(64),
        confirmation,
        paymentMethod,
        paymentStatus,
      });

      expect(assembler.assembleInTransaction).toHaveBeenCalledWith(
        transaction,
        'buyer-1',
        2,
        confirmation,
        clock.now.mock.results[0]?.value,
      );
      expect(inventory.reserveForCheckout).toHaveBeenCalledWith(
        transaction,
        'buyer-1',
        2,
        'idempotency-1',
        'b'.repeat(64),
        [],
      );
      expect(writer.write).toHaveBeenCalledWith(
        transaction,
        expect.objectContaining({
          buyerId: 'buyer-1',
          paymentMethod,
          paymentStatus,
          preview,
        }),
      );
      expect(inventory.attachToPurchaseInTransaction).toHaveBeenCalledWith(
        transaction,
        'reservation-1',
        'buyer-1',
        expect.any(String),
      );
      expect(result).toMatchObject({
        reservationId: 'reservation-1',
        evaluatedAt: new Date('2026-08-28T00:00:00.000Z'),
        cartLineIds: [],
      });
    },
  );

  it('rejects a stale client fingerprint before reserving or writing', async () => {
    const { builder, writer, inventory } = harness('c'.repeat(64));
    await expect(
      builder.buildInTransaction({} as never, {
        userId: 'buyer-1',
        expectedVersion: 2,
        idempotencyKey: 'idempotency-1',
        requestDigest: 'b'.repeat(64),
        confirmation,
        paymentMethod: 'COD',
        paymentStatus: 'UNPAID',
      }),
    ).rejects.toBeInstanceOf(CheckoutPreviewChangedError);
    expect(inventory.reserveForCheckout).not.toHaveBeenCalled();
    expect(writer.write).not.toHaveBeenCalled();
  });
});
