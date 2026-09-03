import { PURCHASE_PAYMENT_STATUSES, type PurchasePaymentStatus } from '@shopee-clone/contracts';

export type PaymentTransitionDecision = 'APPLY' | 'NOOP' | 'REJECT';

export const PAYMENT_STATE_PRECEDENCE: Readonly<Record<PurchasePaymentStatus, number>> = {
  UNPAID: 0,
  PENDING: 10,
  UNKNOWN: 20,
  PENDING_RECONCILIATION: 30,
  FAILED: 100,
  CANCELLED: 100,
  EXPIRED: 100,
  PAID: 200,
  REFUND_PENDING: 300,
  PARTIALLY_REFUNDED: 400,
  REFUNDED: 500,
};

const transitions: Readonly<Record<PurchasePaymentStatus, ReadonlySet<PurchasePaymentStatus>>> = {
  UNPAID: new Set(['PENDING']),
  PENDING: new Set([
    'UNKNOWN',
    'PENDING_RECONCILIATION',
    'PAID',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
    'REFUND_PENDING',
  ]),
  UNKNOWN: new Set([
    'PENDING_RECONCILIATION',
    'PAID',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
    'REFUND_PENDING',
  ]),
  PENDING_RECONCILIATION: new Set(['PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUND_PENDING']),
  PAID: new Set(['REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED']),
  FAILED: new Set(['REFUND_PENDING']),
  CANCELLED: new Set(['REFUND_PENDING']),
  EXPIRED: new Set(['REFUND_PENDING']),
  REFUND_PENDING: new Set(['PARTIALLY_REFUNDED', 'REFUNDED']),
  PARTIALLY_REFUNDED: new Set(['REFUNDED']),
  REFUNDED: new Set(),
};

export function decidePaymentTransition(
  current: PurchasePaymentStatus,
  next: PurchasePaymentStatus,
): PaymentTransitionDecision {
  if (current === next) return 'NOOP';
  return transitions[current].has(next) ? 'APPLY' : 'REJECT';
}

export function isKnownPaymentStatus(value: string): value is PurchasePaymentStatus {
  return (PURCHASE_PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function isUncertainPaymentStatus(status: PurchasePaymentStatus): boolean {
  return status === 'PENDING' || status === 'UNKNOWN' || status === 'PENDING_RECONCILIATION';
}

export function isTerminalPaymentStatus(status: PurchasePaymentStatus): boolean {
  return (
    status === 'PAID' ||
    status === 'FAILED' ||
    status === 'CANCELLED' ||
    status === 'EXPIRED' ||
    status === 'PARTIALLY_REFUNDED' ||
    status === 'REFUNDED'
  );
}
