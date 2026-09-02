import { PURCHASE_PAYMENT_STATUSES, type PurchasePaymentStatus } from '@shopee-clone/contracts';

import {
  PAYMENT_STATE_PRECEDENCE,
  decidePaymentTransition,
  isTerminalPaymentStatus,
  isUncertainPaymentStatus,
} from './payment-state';

const allowed: Readonly<Record<PurchasePaymentStatus, readonly PurchasePaymentStatus[]>> = {
  UNPAID: ['PENDING'],
  PENDING: [
    'UNKNOWN',
    'PENDING_RECONCILIATION',
    'PAID',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
    'REFUND_PENDING',
  ],
  UNKNOWN: ['PENDING_RECONCILIATION', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUND_PENDING'],
  PENDING_RECONCILIATION: ['PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUND_PENDING'],
  PAID: ['REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: ['REFUND_PENDING'],
  CANCELLED: ['REFUND_PENDING'],
  EXPIRED: ['REFUND_PENDING'],
  REFUND_PENDING: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUNDED'],
  REFUNDED: [],
};

describe('payment state machine', () => {
  it('classifies every state pair as apply, noop, or reject', () => {
    for (const current of PURCHASE_PAYMENT_STATUSES) {
      for (const next of PURCHASE_PAYMENT_STATUSES) {
        const expected =
          current === next ? 'NOOP' : allowed[current].includes(next) ? 'APPLY' : 'REJECT';
        expect(decidePaymentTransition(current, next)).toBe(expected);
      }
    }
  });

  it('does not allow stale observations to regress paid or refunded state', () => {
    expect(decidePaymentTransition('PAID', 'PENDING')).toBe('REJECT');
    expect(decidePaymentTransition('PAID', 'FAILED')).toBe('REJECT');
    expect(decidePaymentTransition('REFUNDED', 'PAID')).toBe('REJECT');
    expect(PAYMENT_STATE_PRECEDENCE.REFUNDED).toBeGreaterThan(PAYMENT_STATE_PRECEDENCE.PAID);
  });

  it('requires the refund path for a success observed after resource release', () => {
    expect(decidePaymentTransition('EXPIRED', 'PAID')).toBe('REJECT');
    expect(decidePaymentTransition('EXPIRED', 'REFUND_PENDING')).toBe('APPLY');
    expect(decidePaymentTransition('REFUND_PENDING', 'REFUNDED')).toBe('APPLY');
  });

  it('identifies uncertain and terminal states for reconciliation', () => {
    expect(PURCHASE_PAYMENT_STATUSES.filter(isUncertainPaymentStatus)).toEqual([
      'PENDING',
      'PENDING_RECONCILIATION',
      'UNKNOWN',
    ]);
    expect(isTerminalPaymentStatus('PAID')).toBe(true);
    expect(isTerminalPaymentStatus('REFUND_PENDING')).toBe(false);
  });
});
