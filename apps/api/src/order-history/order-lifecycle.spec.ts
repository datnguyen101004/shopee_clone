import { SHOP_ORDER_STATUSES } from '@shopee-clone/contracts';

import { cancellationRequestDigest, decodeOrderCursor, encodeOrderCursor } from './order-canonical';
import { canTransitionOrder, ORDER_TRANSITIONS } from './order-lifecycle';

describe('order lifecycle primitives', () => {
  it('allows exactly the documented transition matrix', () => {
    const expected = new Set([
      'PENDING_CONFIRMATION>AWAITING_PICKUP',
      'PENDING_CONFIRMATION>CANCELLED',
      'AWAITING_PICKUP>SHIPPING',
      'AWAITING_PICKUP>CANCELLED',
      'SHIPPING>DELIVERED',
      'DELIVERED>RETURN_REQUESTED',
      'RETURN_REQUESTED>DELIVERED',
      'RETURN_REQUESTED>RETURNED',
      'RETURN_REQUESTED>REFUNDED',
      'RETURNED>REFUNDED',
    ]);
    for (const current of SHOP_ORDER_STATUSES) {
      for (const target of SHOP_ORDER_STATUSES) {
        expect(canTransitionOrder(current, target)).toBe(expected.has(`${current}>${target}`));
      }
      expect(new Set(ORDER_TRANSITIONS[current]).size).toBe(ORDER_TRANSITIONS[current].length);
    }
  });

  it('binds opaque cursors to status filter and exact position', () => {
    const position = {
      createdAt: new Date('2026-08-14T01:02:03.000Z'),
      id: '00000000-0000-4000-8000-000000000001',
    };
    const cursor = encodeOrderCursor('SHIPPING', position);
    expect(decodeOrderCursor(cursor, 'SHIPPING')).toEqual(position);
    expect(decodeOrderCursor(cursor, 'ALL')).toBeNull();
    expect(decodeOrderCursor('not-json', 'SHIPPING')).toBeNull();
  });

  it('creates a canonical digest from normalized cancellation intent', () => {
    const first = cancellationRequestDigest(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      0,
      { reasonCode: 'CHANGE_ADDRESS', reasonNote: 'Đổi địa chỉ' },
    );
    const same = cancellationRequestDigest(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      0,
      { reasonCode: 'CHANGE_ADDRESS', reasonNote: 'Đổi địa chỉ' },
    );
    const different = cancellationRequestDigest(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      1,
      { reasonCode: 'CHANGE_ADDRESS', reasonNote: 'Đổi địa chỉ' },
    );
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(same).toBe(first);
    expect(different).not.toBe(first);
  });
});
