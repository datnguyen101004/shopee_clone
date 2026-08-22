/**
 * End-to-end API case catalog for T29.
 * Used by PostgreSQL suites and documentation; cases must go through lifecycle
 * commands (create → seller/admin/system actions) rather than writing terminal
 * statuses directly into return_requests.
 */
export const RETURN_E2E_CASES = [
  {
    id: 'accepted',
    description: 'Buyer create → seller ACCEPT_RETURN → buyer SUBMIT_SHIPMENT → seller CONFIRM_RECEIPT → REFUNDED',
    terminalStatus: 'REFUNDED',
    orderTerminalStatus: 'REFUNDED',
  },
  {
    id: 'expired',
    description: 'Buyer create → AWAITING_RETURN → shipment deadline → EXPIRED with order reversal to DELIVERED',
    terminalStatus: 'EXPIRED',
    orderTerminalStatus: 'DELIVERED',
  },
  {
    id: 'escalated',
    description: 'Buyer create → seller REJECT_AND_ESCALATE or response deadline → ESCALATED',
    terminalStatus: 'ESCALATED',
    orderTerminalStatus: 'RETURN_REQUESTED',
  },
  {
    id: 'rejected',
    description: 'Escalated case → admin REJECT → REJECTED with order reversal to DELIVERED',
    terminalStatus: 'REJECTED',
    orderTerminalStatus: 'DELIVERED',
  },
  {
    id: 'returned-refunded',
    description: 'Physical receipt path records RETURNED then REFUNDED on the shop order',
    terminalStatus: 'REFUNDED',
    orderTerminalStatus: 'REFUNDED',
  },
  {
    id: 'refund-only',
    description: 'Escalated case → admin APPROVE_REFUND without shipment → REFUNDED',
    terminalStatus: 'REFUNDED',
    orderTerminalStatus: 'REFUNDED',
  },
] as const;

export type ReturnE2ECaseId = (typeof RETURN_E2E_CASES)[number]['id'];
