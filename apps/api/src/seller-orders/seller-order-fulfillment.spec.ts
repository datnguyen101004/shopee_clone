import {
  availableSellerActions,
  canExecuteSellerAction,
  canTransitionSellerFulfillment,
  deadlineIsLate,
  resultingOrderStatus,
} from './seller-order-fulfillment';

describe('seller order fulfillment state machine', () => {
  it('allows only the documented seller edges', () => {
    expect(canTransitionSellerFulfillment('PENDING_CONFIRMATION', 'READY_FOR_PICKUP')).toBe(true);
    expect(canTransitionSellerFulfillment('PENDING_CONFIRMATION', 'CONFIRMED')).toBe(false);
    expect(canTransitionSellerFulfillment('CONFIRMED', 'READY_FOR_PICKUP')).toBe(false);
    expect(canTransitionSellerFulfillment('READY_FOR_PICKUP', 'HANDED_OFF')).toBe(true);
    expect(canTransitionSellerFulfillment('HANDED_OFF', 'PREPARING')).toBe(false);
  });

  it('exposes actions from the combined order and fulfillment state', () => {
    expect(
      availableSellerActions({
        orderStatus: 'PENDING_CONFIRMATION',
        fulfillmentState: 'PENDING_CONFIRMATION',
        shipmentExists: false,
      }),
    ).toEqual(['CONFIRM', 'REJECT']);
    expect(
      availableSellerActions({
        orderStatus: 'AWAITING_PICKUP',
        fulfillmentState: 'PREPARING',
        shipmentExists: false,
      }),
    ).toEqual([]);
    expect(
      canExecuteSellerAction(
        {
          orderStatus: 'AWAITING_PICKUP',
          fulfillmentState: 'READY_FOR_PICKUP',
          shipmentExists: true,
        },
        'HAND_OFF',
      ),
    ).toBe(false);
    expect(
      availableSellerActions({
        orderStatus: 'AWAITING_PICKUP',
        fulfillmentState: 'READY_FOR_PICKUP',
        shipmentExists: true,
      }),
    ).toEqual([]);
  });

  it('maps lifecycle-changing actions and marks late commands', () => {
    expect(resultingOrderStatus('CONFIRM')).toBe('AWAITING_PICKUP');
    expect(resultingOrderStatus('HAND_OFF')).toBe('SHIPPING');
    expect(resultingOrderStatus('START_PREPARING')).toBeNull();
    const created = new Date('2026-08-01T00:00:00.000Z');
    expect(deadlineIsLate('CONFIRM', new Date('2026-08-02T00:00:01.000Z'), created, null)).toBe(
      true,
    );
    expect(
      deadlineIsLate(
        'HAND_OFF',
        new Date('2026-08-02T00:00:01.000Z'),
        created,
        new Date('2026-08-03T00:00:00.000Z'),
      ),
    ).toBe(false);
  });
});
