import { fulfillmentStatusAfterPaymentObservation } from './payment-observation.service';

describe('payment observation fulfillment projection', () => {
  it('maps VNPAY terminal results to the canonical order state', () => {
    expect(
      fulfillmentStatusAfterPaymentObservation('VNPAY', 'CANCELLED', true, 'PENDING_PAYMENT'),
    ).toBe('CANCELLED');
    expect(
      fulfillmentStatusAfterPaymentObservation('VNPAY', 'PAID', false, 'PENDING_PAYMENT'),
    ).toBe('PENDING_CONFIRMATION');
    expect(fulfillmentStatusAfterPaymentObservation('VNPAY', 'CANCELLED', true, 'SHIPPING')).toBe(
      'SHIPPING',
    );
  });

  it('preserves the existing MoMo terminal-failure cancellation behavior', () => {
    expect(
      fulfillmentStatusAfterPaymentObservation('MOMO', 'FAILED', true, 'PENDING_CONFIRMATION'),
    ).toBe('CANCELLED');
    expect(
      fulfillmentStatusAfterPaymentObservation('MOMO', 'PAID', false, 'PENDING_CONFIRMATION'),
    ).toBe('PENDING_CONFIRMATION');
  });
});
