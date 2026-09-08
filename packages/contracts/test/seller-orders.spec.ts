import { describe, expect, it } from 'vitest';
import {
  formatSellerOrderVersionEtag,
  parseSellerOrderActionRequest,
  parseSellerOrderQueueQuery,
  parseSellerOrderVersionEtag,
} from '../src/seller-orders';

describe('seller order contracts', () => {
  it('normalizes the queue query and rejects unsafe filters', () => {
    expect(parseSellerOrderQueueQuery({ status: 'PENDING_CONFIRMATION', fulfillment: 'PENDING_CONFIRMATION', page: '2', from: '2026-08-01', to: '2026-08-18' })).toEqual({ status: 'PENDING_CONFIRMATION', fulfillment: 'PENDING_CONFIRMATION', from: '2026-08-01', to: '2026-08-18', orderReference: null, page: 2 });
    expect(parseSellerOrderQueueQuery({ from: '2026-08-20', to: '2026-08-01' })).toBeNull();
    expect(parseSellerOrderQueueQuery({ status: ['ALL'] })).toBeNull();
    expect(parseSellerOrderQueueQuery({ unknown: 'value' })).toBeNull();
  });

  it('requires rejection reasons and normalizes notes', () => {
    expect(parseSellerOrderActionRequest({ action: 'REJECT' })).toBeNull();
    expect(parseSellerOrderActionRequest({ action: 'REJECT', reasonCode: 'OTHER', reasonNote: '  Không  thể giao  ' })).toEqual({ action: 'REJECT', reasonCode: 'OTHER', reasonNote: 'Không thể giao' });
    expect(parseSellerOrderActionRequest({ action: 'CONFIRM', reasonCode: 'OTHER' })).toBeNull();
  });

  it('binds both versions in the strong ETag', () => {
    const etag = formatSellerOrderVersionEtag(3, 5);
    expect(etag).toBe('"seller-order-3-5"');
    expect(parseSellerOrderVersionEtag(etag)).toEqual({ orderVersion: 3, fulfillmentVersion: 5 });
    expect(parseSellerOrderVersionEtag('"seller-order-3"')).toBeNull();
  });
});
