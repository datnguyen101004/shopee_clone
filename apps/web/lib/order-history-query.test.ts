import { describe, expect, it } from 'vitest';

import { buyerOrdersHref, pickBuyerOrderFilter } from './order-history-query';

describe('buyer order-history filter navigation', () => {
  it('normalizes the legacy awaiting-pickup link to shipping', () => {
    expect(pickBuyerOrderFilter({ filter: 'AWAITING_PICKUP' })).toBe('SHIPPING');
    expect(buyerOrdersHref('SHIPPING')).toBe('/account/orders?filter=SHIPPING');
  });

  it('supports the canonical pending-payment tab', () => {
    expect(pickBuyerOrderFilter({ filter: 'PENDING_PAYMENT' })).toBe('PENDING_PAYMENT');
    expect(buyerOrdersHref('PENDING_PAYMENT')).toBe('/account/orders?filter=PENDING_PAYMENT');
  });

  it('keeps canonical filters strict and rejects ambiguous query strings', () => {
    expect(pickBuyerOrderFilter({ filter: 'SHIPPING' })).toBe('SHIPPING');
    expect(pickBuyerOrderFilter({ filter: ['SHIPPING', 'DELIVERED'] })).toBeNull();
    expect(pickBuyerOrderFilter({ filter: 'SHIPPING', page: '2' })).toBeNull();
    expect(pickBuyerOrderFilter({ filter: 'AWAITING_PICKUP', page: '2' })).toBeNull();
  });
});
