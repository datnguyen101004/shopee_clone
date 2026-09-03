import {
  allocateReturnLine,
  allocateReturnLines,
  projectReturnMoney,
  returnAllocationTotal,
} from './return-calculation';
import {
  deterministicReturnReason,
  returnCreateDigest,
  returnDigestsEqual,
} from './return-canonical';
import {
  initialReturnDeadlines,
  isPastDeadline,
  receiptDeadline,
  shipmentDeadline,
} from './return-policy';
import {
  canExecuteReturnAction,
  isTerminalReturnStatus,
  transitionFor,
} from './return-state-machine';

describe('return domain policy and state machine', () => {
  it('enforces exact UTC deadline boundaries and derives policy deadlines', () => {
    const delivered = new Date('2026-08-01T00:00:00.000Z');
    const requested = new Date('2026-08-02T00:00:00.000Z');
    const deadlines = initialReturnDeadlines(delivered, requested);
    expect(deadlines.eligibilityAt.toISOString()).toBe('2026-08-08T00:00:00.000Z');
    expect(deadlines.sellerResponseAt?.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    expect(isPastDeadline(deadlines.sellerResponseAt!, deadlines.sellerResponseAt!)).toBe(false);
    expect(isPastDeadline(new Date('2026-08-04T00:00:00.001Z'), deadlines.sellerResponseAt!)).toBe(
      true,
    );
    expect(shipmentDeadline(requested).toISOString()).toBe('2026-08-07T00:00:00.000Z');
    expect(receiptDeadline(requested).toISOString()).toBe('2026-08-09T00:00:00.000Z');
  });

  it('allows only the documented actor and state transitions', () => {
    expect(transitionFor('REQUESTED', 'SELLER', 'ACCEPT_RETURN')).toBe('AWAITING_RETURN');
    expect(transitionFor('ESCALATED', 'ADMIN', 'APPROVE_REFUND')).toBe('REFUNDED');
    expect(transitionFor('IN_TRANSIT', 'BUYER', 'CANCEL')).toBeNull();
    expect(canExecuteReturnAction('AWAITING_RETURN', 'BUYER', 'SUBMIT_SHIPMENT')).toBe(true);
    expect(canExecuteReturnAction('AWAITING_RETURN', 'SELLER', 'CONFIRM_RECEIPT')).toBe(false);
    expect(isTerminalReturnStatus('REFUNDED')).toBe(true);
    expect(isTerminalReturnStatus('ESCALATED')).toBe(false);
  });

  it('allocates only committed net-paid line amounts with safe floor rounding', () => {
    const partial = allocateReturnLine({
      lineReference: 'line-a',
      purchasedQuantity: 3,
      requestedQuantity: 2,
      payableMerchandiseMinor: 100_000n,
    });
    const full = allocateReturnLine({
      lineReference: 'line-b',
      purchasedQuantity: 3,
      requestedQuantity: 3,
      payableMerchandiseMinor: 100_000n,
    });
    expect(partial.refundMinor).toBe(66_666n);
    expect(full.refundMinor).toBe(100_000n);
    expect(returnAllocationTotal([partial, full])).toBe(166_666n);
    expect(projectReturnMoney(166_666n)).toBe(166_666);
    expect(() =>
      allocateReturnLines([
        { ...partial, payableMerchandiseMinor: 100_000n },
        { ...partial, payableMerchandiseMinor: 100_000n },
      ]),
    ).toThrow();
  });

  it('binds canonical create commands and uses deterministic event codes', () => {
    const input = {
      reasonCode: 'DAMAGED' as const,
      description: 'Sản phẩm bị hỏng khi giao tới',
      items: [
        { lineReference: 'b', quantity: 1 },
        { lineReference: 'a', quantity: 2 },
      ],
      evidenceIds: ['second', 'first'],
    };
    const first = returnCreateDigest('order', 4, input);
    const reordered = returnCreateDigest('order', 4, {
      ...input,
      items: [...input.items].reverse(),
      evidenceIds: [...input.evidenceIds].reverse(),
    });
    expect(returnDigestsEqual(first, reordered)).toBe(true);
    expect(returnCreateDigest('order', 5, input)).not.toBe(first);
    expect(deterministicReturnReason('ACCEPT_RETURN')).toBe('RETURN_ACCEPT_RETURN');
  });
});
