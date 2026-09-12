import { describe, expect, it } from 'vitest';
import {
  RAW_CLICKSTREAM_HAPPY_PATH_BATCH,
  parseRawClickstreamBatch,
  parseRawClickstreamEvent,
} from '../src/clickstream-pipeline';

describe('raw clickstream pipeline contract', () => {
  it('accepts a server-enriched product detail view without changing legacy labels', () => {
    expect(parseRawClickstreamEvent({
      eventId: '00000000-0000-4000-8000-000000000099',
      schemaVersion: 1,
      eventType: 'product_viewed',
      occurredAt: '2026-09-10T16:59:12.000Z',
      shopId: '00000000-0000-4000-8000-000000000101',
      productId: '00000000-0000-4000-8000-000000000201',
      surface: 'product_detail',
      sessionPseudonym: 'session-hash-01',
      buyerPseudonym: null,
      pseudonymKeyId: 'clickstream-prod-2026',
      properties: {},
    })).not.toBeNull();
  });
  it('accepts the shared happy-path fixture', () => {
    expect(parseRawClickstreamBatch(RAW_CLICKSTREAM_HAPPY_PATH_BATCH)).toEqual(
      RAW_CLICKSTREAM_HAPPY_PATH_BATCH,
    );
  });

  it('rejects direct identity and credential fields', () => {
    const event = {
      ...RAW_CLICKSTREAM_HAPPY_PATH_BATCH.events[0],
      email: 'buyer@example.test',
    };
    expect(parseRawClickstreamEvent(event)).toBeNull();
  });

  it('requires a request context for product events', () => {
    const event = { ...RAW_CLICKSTREAM_HAPPY_PATH_BATCH.events[0], requestId: undefined };
    expect(parseRawClickstreamEvent(event)).toBeNull();
  });

  it('accepts the established dispatcher v1 export shape, including anonymous buyers', () => {
    const event = {
      ...RAW_CLICKSTREAM_HAPPY_PATH_BATCH.events[0],
      buyerPseudonym: null,
      pseudonymKeyId: 'clickstream-prod-2026',
      properties: {},
    };
    const batch = {
      ...RAW_CLICKSTREAM_HAPPY_PATH_BATCH,
      producer: 'shopee-clone-api',
      events: [event],
    };
    expect(parseRawClickstreamBatch(batch)).toMatchObject({ producer: 'shopee-clone-api' });
  });
});
