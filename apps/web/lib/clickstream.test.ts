import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clickstreamImpressionKey,
  createClickstreamCorrelationId,
  createClickstreamImpressionDeduper,
  getClickstreamSessionId,
  submitClickstreamEvent,
} from './clickstream';

describe('clickstream browser client', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });
  it('keeps an opaque per-tab session and deduplicates page impressions', () => {
    const first = getClickstreamSessionId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    const correlation = createClickstreamCorrelationId();
    expect(correlation).toMatch(/^[0-9a-f-]{36}$/);
    expect(correlation).not.toBe(first);
    expect(getClickstreamSessionId()).toBe(first);
    const deduper = createClickstreamImpressionDeduper();
    const key = clickstreamImpressionKey({
      requestId: first,
      placement: 'results',
      productId: first,
      position: 0,
    });
    expect(deduper.seen(key)).toBe(true);
    expect(deduper.seen(key)).toBe(false);
    deduper.clear();
    expect(deduper.seen(key)).toBe(true);
  });
  it('posts only to the first-party application and swallows failures', async () => {
    const fetcher = vi.spyOn(window, 'fetch').mockRejectedValue(new Error('offline'));
    submitClickstreamEvent({
      eventType: 'search_submitted',
      surface: 'search',
      query: 'phone',
      properties: {},
    });
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/api/v1/clickstream/events' }),
      expect.objectContaining({ credentials: 'include', keepalive: true }),
    );
  });
  it('uses the supplied non-refreshing first-party fetcher without exposing token data', async () => {
    const browserFetch = vi.spyOn(window, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    const sessionFetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    submitClickstreamEvent(
      {
        eventType: 'product_clicked',
        surface: 'search',
        productId: '11111111-1111-4111-8111-111111111111',
        placement: 'results',
        position: 0,
        requestId: '22222222-2222-4222-8222-222222222222',
        properties: {},
      },
      1_500,
      sessionFetch,
    );
    await Promise.resolve();
    expect(sessionFetch).toHaveBeenCalledTimes(1);
    expect(browserFetch).not.toHaveBeenCalled();
    expect(String(sessionFetch.mock.calls[0]?.[1]?.body)).not.toContain('Authorization');
  });
});
