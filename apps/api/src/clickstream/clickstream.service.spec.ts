import { ClickstreamService } from './clickstream.service';
import type { ClickstreamConfig } from './clickstream.config';
import { pseudonymize } from './pseudonym';

const config: ClickstreamConfig = {
  captureEnabled: true,
  dispatchEnabled: false,
  endpoint: null,
  hmacKeyId: null,
  hmacSecret: null,
  pseudonymKeyId: 'v1',
  pseudonymSecret: 'test-secret',
  sampling: {},
  defaultSampleRate: 1,
  authoritativeSampleRate: 1,
  batchSize: 10,
  timeoutMs: 500,
  pollIntervalMs: 1_000,
  leaseSeconds: 30,
  retryBaseMs: 100,
  retryCapMs: 1_000,
  maxAttempts: 8,
  retentionSeconds: 3600,
  readinessMaxAgeSeconds: 60,
  replayMaxRows: 10,
  replayMaxAgeSeconds: 3600,
};
const event = {
  eventId: '11111111-1111-4111-8111-111111111111',
  schemaVersion: 1,
  eventType: 'search_submitted',
  occurredAt: '2026-09-10T00:00:00.000Z',
  surface: 'search',
  sessionId: '22222222-2222-4222-8222-222222222222',
  query: 'phone',
  properties: {},
};
describe('ClickstreamService', () => {
  it('persists export-ready pseudonyms and never raw identities', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { clickstreamOutbox: { create, findUnique: jest.fn() } };
    const result = await new ClickstreamService(prisma as never, config).capture(event, {
      userId: '33333333-3333-4333-8333-333333333333',
    });
    expect(result.disposition).toBe('accepted');
    const payload = create.mock.calls[0]![0].data.payload as Record<string, unknown>;
    expect(payload.sessionPseudonym).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.buyerPseudonym).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.sessionPseudonym).toBe(
      pseudonymize(config.pseudonymSecret!, config.pseudonymKeyId, 'session', event.sessionId).pseudonym,
    );
    expect(payload.buyerPseudonym).toBe(
      pseudonymize(
        config.pseudonymSecret!,
        config.pseudonymKeyId,
        'buyer',
        '33333333-3333-4333-8333-333333333333',
      ).pseudonym,
    );
    expect(JSON.stringify(payload)).not.toContain('33333333-3333-4333-8333-333333333333');
    expect(JSON.stringify(payload)).not.toContain(event.sessionId);
  });
  it('derives the product shop from server-owned data for dispatcher exports', async () => {
    const create = jest.fn().mockResolvedValue({});
    const product = { findUnique: jest.fn().mockResolvedValue({ shopId: '55555555-5555-4555-8555-555555555555' }) };
    const prisma = { product, clickstreamOutbox: { create, findUnique: jest.fn() } };
    const productEvent = {
      eventId: '44444444-4444-4444-8444-444444444444',
      schemaVersion: 1,
      eventType: 'product_impression',
      occurredAt: '2026-09-10T00:00:00.000Z',
      surface: 'search',
      sessionId: event.sessionId,
      productId: '66666666-6666-4666-8666-666666666666',
      placement: 'search_results',
      position: 1,
      requestId: '77777777-7777-4777-8777-777777777777',
      properties: {},
    };
    await expect(new ClickstreamService(prisma as never, config).capture(productEvent)).resolves.toMatchObject({ disposition: 'accepted' });
    expect(product.findUnique).toHaveBeenCalledWith({
      where: { id: productEvent.productId },
      select: { shopId: true },
    });
    expect(create.mock.calls[0]![0].data.payload.shopId).toBe('55555555-5555-4555-8555-555555555555');
  });
  it('is disabled safely and samples deterministically', async () => {
    const disabled = { ...config, captureEnabled: false };
    await expect(new ClickstreamService({} as never, disabled).capture(event)).resolves.toEqual({
      eventId: event.eventId,
      disposition: 'disabled',
    });
    const sampled = { ...config, defaultSampleRate: 0 };
    const create = jest.fn();
    await expect(
      new ClickstreamService({ clickstreamOutbox: { create } } as never, sampled).capture(event),
    ).resolves.toEqual({ eventId: event.eventId, disposition: 'sampled_out' });
    expect(create).not.toHaveBeenCalled();
  });
  it('captures authoritative outcomes from server context only', async () => {
    const create = jest.fn().mockResolvedValue({});
    const service = new ClickstreamService(
      { clickstreamOutbox: { create, findUnique: jest.fn() } } as never,
      config,
    );
    await expect(
      service.captureAuthoritativeOutcome({
        eventType: 'favorite_changed',
        surface: 'favorite',
        userId: '33333333-3333-4333-8333-333333333333',
        productId: '44444444-4444-4444-8444-444444444444',
        properties: { isFavorite: true },
      }),
    ).resolves.toMatchObject({ disposition: 'accepted' });
    const payload = create.mock.calls[0]![0].data.payload as Record<string, unknown>;
    expect(payload.properties).toEqual({ isFavorite: true });
    expect(JSON.stringify(payload)).not.toContain('33333333-3333-4333-8333-333333333333');
  });
  it('deduplicates equivalent retries and rejects event-id content conflicts', async () => {
    let firstHash = '';
    const create = jest.fn().mockImplementation(async (input: { data: { payloadHash: string } }) => {
      if (!firstHash) { firstHash = input.data.payloadHash; return {}; }
      const error = { code: 'P2002' };
      throw error;
    });
    const prisma = { clickstreamOutbox: { create, findUnique: jest.fn().mockImplementation(async () => ({ payloadHash: firstHash })) } };
    const service = new ClickstreamService(prisma as never, config);
    await expect(service.capture(event)).resolves.toMatchObject({ disposition: 'accepted' });
    await expect(service.capture(event)).resolves.toMatchObject({ disposition: 'idempotent' });
    await expect(service.capture({ ...event, query: 'different' })).rejects.toMatchObject({ status: 409 });
  });
  it('does not throw when authoritative persistence is unavailable', async () => {
    const service = new ClickstreamService(
      { clickstreamOutbox: { create: jest.fn().mockRejectedValue(new Error('offline')) } } as never,
      config,
    );
    await expect(
      service.captureAuthoritativeOutcome({
        eventType: 'cart_changed',
        surface: 'cart',
        userId: '33333333-3333-4333-8333-333333333333',
        productId: '44444444-4444-4444-8444-444444444444',
        properties: { action: 'add', quantity: 1 },
      }),
    ).resolves.toBeNull();
  });
});
