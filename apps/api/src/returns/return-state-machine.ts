import type { ReturnActorType, ReturnStatus } from '@shopee-clone/contracts';

export type ReturnDomainAction =
  | 'CANCEL'
  | 'SUBMIT_SHIPMENT'
  | 'ACCEPT_RETURN'
  | 'REJECT_AND_ESCALATE'
  | 'ESCALATE'
  | 'CONFIRM_RECEIPT'
  | 'APPROVE_RETURN'
  | 'APPROVE_REFUND'
  | 'REJECT'
  | 'SELLER_RESPONSE_DEADLINE'
  | 'SHIPMENT_DEADLINE'
  | 'RECEIPT_DEADLINE';

interface Transition {
  actor: ReturnActorType;
  action: ReturnDomainAction;
  target: ReturnStatus;
}

const matrix: Readonly<Record<ReturnStatus, readonly Transition[]>> = {
  REQUESTED: [
    { actor: 'BUYER', action: 'CANCEL', target: 'CANCELLED' },
    { actor: 'SELLER', action: 'ACCEPT_RETURN', target: 'AWAITING_RETURN' },
    { actor: 'SELLER', action: 'REJECT_AND_ESCALATE', target: 'ESCALATED' },
    { actor: 'SELLER', action: 'ESCALATE', target: 'ESCALATED' },
    { actor: 'SYSTEM', action: 'SELLER_RESPONSE_DEADLINE', target: 'ESCALATED' },
  ],
  AWAITING_RETURN: [
    { actor: 'BUYER', action: 'SUBMIT_SHIPMENT', target: 'IN_TRANSIT' },
    { actor: 'SYSTEM', action: 'SHIPMENT_DEADLINE', target: 'EXPIRED' },
  ],
  IN_TRANSIT: [
    { actor: 'SELLER', action: 'CONFIRM_RECEIPT', target: 'REFUNDED' },
    { actor: 'SELLER', action: 'ESCALATE', target: 'ESCALATED' },
    { actor: 'SYSTEM', action: 'RECEIPT_DEADLINE', target: 'ESCALATED' },
  ],
  ESCALATED: [
    { actor: 'ADMIN', action: 'APPROVE_RETURN', target: 'AWAITING_RETURN' },
    { actor: 'ADMIN', action: 'APPROVE_REFUND', target: 'REFUNDED' },
    { actor: 'ADMIN', action: 'REJECT', target: 'REJECTED' },
  ],
  CANCELLED: [],
  EXPIRED: [],
  REJECTED: [],
  REFUNDED: [],
};

export function transitionFor(
  status: ReturnStatus,
  actor: ReturnActorType,
  action: ReturnDomainAction,
): ReturnStatus | null {
  return (
    matrix[status].find((entry) => entry.actor === actor && entry.action === action)?.target ?? null
  );
}

export function canExecuteReturnAction(
  status: ReturnStatus,
  actor: ReturnActorType,
  action: ReturnDomainAction,
): boolean {
  return transitionFor(status, actor, action) !== null;
}

export function isTerminalReturnStatus(status: ReturnStatus): boolean {
  return matrix[status].length === 0;
}
