import { describe, expect, it } from 'vitest';
import {
  CLICKSTREAM_SCHEMA_VERSION,
  isClickstreamHealthResponse,
  parseClickstreamAcknowledgement,
  parseClickstreamEvent,
} from '../src/clickstream';
import type { ClickstreamBatch, ClickstreamExportEvent } from '../src/clickstream';

const base = {
  eventId: '11111111-1111-4111-8111-111111111111',
  schemaVersion: CLICKSTREAM_SCHEMA_VERSION,
  occurredAt: '2026-09-10T00:00:00.000Z',
  sessionId: '22222222-2222-4222-8222-222222222222',
  properties: {},
};
describe('clickstream contract', () => {
  it.each([
    'search_submitted',
    'product_impression',
    'product_clicked',
    'product_viewed',
    'recommendation_impression',
    'recommendation_clicked',
    'favorite_changed',
    'cart_changed',
    'order_completed',
  ])('accepts %s event', (eventType) => {
    const event =
      eventType === 'search_submitted'
        ? { ...base, eventType, surface: 'search', query: '  điện thoại  ' }
        : eventType.startsWith('recommendation')
          ? {
              ...base,
              eventType,
              surface: 'homepage',
              productId: '33333333-3333-4333-8333-333333333333',
              placement: 'feed',
              position: 0,
              recommendationId: '44444444-4444-4444-8444-444444444444',
            }
        : eventType === 'product_viewed'
          ? {
              ...base,
              eventType,
              surface: 'product_detail',
              productId: '33333333-3333-4333-8333-333333333333',
            }
          : eventType.startsWith('product_')
            ? {
                ...base,
                eventType,
                surface: 'search',
                productId: '33333333-3333-4333-8333-333333333333',
                placement: 'results',
                position: 0,
                requestId: '44444444-4444-4444-8444-444444444444',
              }
            : eventType === 'favorite_changed'
              ? {
                  ...base,
                  eventType,
                  surface: 'favorite',
                  productId: '33333333-3333-4333-8333-333333333333',
                  properties: { isFavorite: true },
                }
              : eventType === 'cart_changed'
                ? {
                    ...base,
                    eventType,
                    surface: 'cart',
                    productId: '33333333-3333-4333-8333-333333333333',
                    properties: { action: 'select', selected: false },
                  }
                : {
                    ...base,
                    eventType,
                    surface: 'checkout',
                    properties: { orderId: '33333333-3333-4333-8333-333333333333', itemCount: 1 },
                  };
    expect(parseClickstreamEvent(event)).not.toBeNull();
  });
  it('normalizes query and rejects unknown/prohibited fields', () => {
    const valid = { ...base, eventType: 'search_submitted', surface: 'search', query: '  foo  ' };
    expect(parseClickstreamEvent(valid)?.query).toBe('foo');
    expect(parseClickstreamEvent({ ...valid, unknown: true })).toBeNull();
    expect(parseClickstreamEvent({ ...valid, buyerId: 'secret' })).toBeNull();
  });
  it('enforces context and UTC', () => {
    expect(
      parseClickstreamEvent({ ...base, eventType: 'product_clicked', surface: 'search' }),
    ).toBeNull();
    expect(
      parseClickstreamEvent({ ...base, eventType: 'search_submitted', surface: 'homepage', query: 'q' }),
    ).toBeNull();
    expect(
      parseClickstreamEvent({
        ...base,
        eventType: 'search_submitted',
        surface: 'search',
        query: 'q',
        occurredAt: '2026-09-10T00:00:00+07:00',
      }),
    ).toBeNull();
  });
  it('validates acknowledgements as a complete partition', () => {
    const ids = [base.eventId, '33333333-3333-4333-8333-333333333333'];
    expect(
      parseClickstreamAcknowledgement(
        {
          batchId: '55555555-5555-4555-8555-555555555555',
          acceptedEventIds: [ids[0]],
          rejectedEvents: [{ eventId: ids[1], code: 'BAD_SCHEMA', retryable: false }],
        },
        '55555555-5555-4555-8555-555555555555',
        ids,
      ),
    ).not.toBeNull();
    expect(
      parseClickstreamAcknowledgement(
        {
          batchId: '55555555-5555-4555-8555-555555555555',
          acceptedEventIds: [],
          rejectedEvents: [],
        },
        '55555555-5555-4555-8555-555555555555',
        ids,
      ),
    ).toBeNull();
    expect(
      parseClickstreamAcknowledgement(
        {
          batchId: '55555555-5555-4555-8555-555555555555',
          acceptedEventIds: [ids[0]],
          rejectedEvents: [{ eventId: ids[1], code: 'BAD_SCHEMA', retryable: false }],
          unexpected: true,
        },
        '55555555-5555-4555-8555-555555555555',
        ids,
      ),
    ).toBeNull();
  });

  it('defines an export-only batch shape without raw identities', () => {
    const event: ClickstreamExportEvent = {
      eventId: base.eventId,
      schemaVersion: 1,
      eventType: 'product_clicked',
      occurredAt: base.occurredAt,
      surface: 'search',
      sessionPseudonym: 'a'.repeat(64),
      buyerPseudonym: 'b'.repeat(64),
      pseudonymKeyId: 'clickstream-prod-2026',
      productId: '33333333-3333-4333-8333-333333333333',
      placement: 'search_results',
      position: 0,
      requestId: '44444444-4444-4444-8444-444444444444',
      properties: {},
    };
    const batch: ClickstreamBatch = {
      contractVersion: '1',
      batchId: '55555555-5555-4555-8555-555555555555',
      producer: 'shopee-clone-api',
      sentAt: base.occurredAt,
      events: [event],
    };
    expect(batch.events[0]).not.toHaveProperty('sessionId');
    expect(batch.events[0]).not.toHaveProperty('buyerId');
    expect(JSON.stringify(batch)).not.toContain(base.sessionId);

    // @ts-expect-error Export events must never carry a raw browser session ID.
    const rawSession: ClickstreamExportEvent = { ...event, sessionId: base.sessionId };
    // @ts-expect-error Export events must never carry a raw buyer ID.
    const rawBuyer: ClickstreamExportEvent = { ...event, buyerId: 'buyer-raw' };
    void rawSession;
    void rawBuyer;
  });
  it('recognizes aggregate health without payload fields', () => {
    expect(
      isClickstreamHealthResponse({
        ready: true,
        configured: false,
        captureEnabled: false,
        dispatchEnabled: false,
        statusCounts: { PENDING: 0, LEASED: 0, DELIVERED: 0, TERMINAL: 0, DROPPED: 0 },
        oldestEligibleBacklogAgeSeconds: null,
        accepted: 0,
        delivered: 0,
        retried: 0,
        rejected: 0,
        terminal: 0,
        dropped: 0,
        deliveryLatencyMs: { count: 0, average: null, p95: null },
        lastPollAt: null,
        lastErrorAt: null,
      }),
    ).toBe(true);
  });
});
