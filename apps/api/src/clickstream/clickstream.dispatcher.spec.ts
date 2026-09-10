import { ClickstreamDispatcher, type ClickstreamHttpAdapter } from './clickstream.dispatcher';
import type { ClickstreamConfig } from './clickstream.config';

const eventId = '11111111-1111-4111-8111-111111111111';
const config: ClickstreamConfig = {
  captureEnabled: true,
  dispatchEnabled: true,
  endpoint: 'https://gateway.example/clickstream',
  hmacKeyId: 'key',
  hmacSecret: 'secret',
  pseudonymKeyId: 'pseudonym',
  pseudonymSecret: 'pseudonym-secret',
  sampling: {},
  defaultSampleRate: 1,
  authoritativeSampleRate: 1,
  batchSize: 10,
  timeoutMs: 500,
  pollIntervalMs: 1000,
  leaseSeconds: 30,
  retryBaseMs: 100,
  retryCapMs: 1000,
  maxAttempts: 8,
  retentionSeconds: 3600,
  readinessMaxAgeSeconds: 60,
  replayMaxRows: 10,
  replayMaxAgeSeconds: 3600,
};
function fake(
  rows: Array<{
    id: string;
    event_id: string;
    payload: unknown;
    attempt_count: number;
    expires_at: Date;
    accepted_at?: Date;
  }>,
  response: ClickstreamHttpAdapter['post'],
  expiredCount = 0,
): { prisma: Record<string, unknown>; http: ClickstreamHttpAdapter } {
  const updates: unknown[] = [];
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(
      rows.map((row) => ({ ...row, accepted_at: row.accepted_at ?? new Date(Date.now() - 1_000), lease_owner: 'owner' })),
    ),
    clickstreamOutbox: {
      update: jest.fn().mockImplementation((input) => {
        updates.push(input);
      }),
      updateMany: jest.fn().mockImplementation(async (input) => {
        updates.push(input);
        return { count: input.data?.status === 'DROPPED' ? expiredCount : 0 };
      }),
    },
  };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue(rows.map(({ id }) => ({ id }))),
    $transaction: jest.fn().mockImplementation(async (work: (tx: unknown) => unknown) => work(tx)),
    clickstreamOutbox: {
      updateMany: jest.fn().mockImplementation(async (input) => {
        updates.push(input);
        return { count: 1 };
      }),
      findUnique: jest.fn(),
    },
  };
  return { prisma: prisma as Record<string, unknown>, http: { post: response } };
}
describe('ClickstreamDispatcher', () => {
  it('signs and delivers an acknowledged batch', async () => {
    const fakeEnv = fake(
      [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          event_id: eventId,
          payload: { eventId },
          attempt_count: 0,
          expires_at: new Date(Date.now() + 10_000),
        },
      ],
      async (_url, body, headers) => {
        expect(headers['X-Clickstream-Signature']).toMatch(/^[a-f0-9]{64}$/);
        const batch = JSON.parse(body) as { batchId: string };
        return {
          status: 202,
          body: { batchId: batch.batchId, acceptedEventIds: [eventId], rejectedEvents: [] },
        };
      },
    );
    const result = await new ClickstreamDispatcher(
      fakeEnv.prisma as never,
      config,
      fakeEnv.http,
    ).flush();
    expect(result.accepted).toBe(1);
    expect(
      (fakeEnv.prisma.clickstreamOutbox as { updateMany: jest.Mock }).updateMany,
    ).toHaveBeenCalled();
  });
  it('retries malformed acknowledgements and terminally handles 4xx', async () => {
    const row = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      event_id: eventId,
      payload: { eventId },
      attempt_count: 0,
      expires_at: new Date(Date.now() + 10_000),
    };
    const malformed = fake(
      [row],
      jest.fn().mockResolvedValue({ status: 202, body: { nope: true } }),
    );
    await expect(
      new ClickstreamDispatcher(malformed.prisma as never, config, malformed.http).flush(),
    ).resolves.toMatchObject({ retried: 1 });
    const terminal = fake([row], jest.fn().mockResolvedValue({ status: 401, body: null }));
    await expect(
      new ClickstreamDispatcher(terminal.prisma as never, config, terminal.http).flush(),
    ).resolves.toMatchObject({ terminal: 1 });
  });
  it.each([408, 429, 500, 503])('retries transient HTTP %s responses', async (status) => {
    const env = fake(
      [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          event_id: eventId,
          payload: { eventId },
          attempt_count: 0,
          expires_at: new Date(Date.now() + 10_000),
        },
      ],
      jest.fn().mockResolvedValue({ status, body: null }),
    );
    await expect(
      new ClickstreamDispatcher(env.prisma as never, config, env.http).flush(),
    ).resolves.toMatchObject({ retried: 1, terminal: 0 });
  });
  it('partitions partial acknowledgement by retryability', async () => {
    const ids = [eventId, '33333333-3333-4333-8333-333333333333'];
    const env = fake(
      ids.map((id, index) => ({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
        event_id: id,
        payload: { eventId: id },
        attempt_count: 0,
        expires_at: new Date(Date.now() + 10_000),
      })),
      async (_url, body) => {
        const batch = JSON.parse(body) as { batchId: string };
        return {
          status: 200,
          body: {
            batchId: batch.batchId,
            acceptedEventIds: [ids[0]],
            rejectedEvents: [{ eventId: ids[1], code: 'TEMPORARY', retryable: true }],
          },
        };
      },
    );
    await expect(
      new ClickstreamDispatcher(env.prisma as never, config, env.http).flush(),
    ).resolves.toMatchObject({ accepted: 1, rejected: 1, retried: 1 });
  });
  it('keeps health aggregate safe when the database is unavailable and bounds replay', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('offline')) };
    const dispatcher = new ClickstreamDispatcher(prisma as never, config, { post: jest.fn() });
    await expect(dispatcher.health()).resolves.toMatchObject({
      ready: false,
      statusCounts: { PENDING: 0 },
    });
    await expect(dispatcher.replay('TERMINAL', 999_999, 1)).rejects.toThrow('Invalid replay age');
    await expect(dispatcher.replay('DROPPED', 1, 99)).rejects.toThrow('Invalid replay limit');
  });

  it('reports persisted healthy and stale aggregate health without payloads', async () => {
    const rows = [
      { status: 'pending', count: 2n, oldest: new Date(Date.now() - 1_000), retries: 3n },
      { status: 'delivered', count: 4n, oldest: null, retries: 1n },
      { status: 'terminal', count: 1n, oldest: null, retries: 2n },
    ];
    const prisma = { $queryRaw: jest.fn().mockResolvedValue(rows) };
    const dispatcher = new ClickstreamDispatcher(prisma as never, config, { post: jest.fn() });
    (dispatcher as unknown as { metrics: { lastPollAt: Date | null } }).metrics.lastPollAt = new Date();
    await expect(dispatcher.health()).resolves.toMatchObject({
      ready: true,
      accepted: 7,
      delivered: 4,
      retried: 6,
      terminal: 1,
      statusCounts: expect.objectContaining({ PENDING: 2, DELIVERED: 4, TERMINAL: 1 }),
    });
    (dispatcher as unknown as { metrics: { lastPollAt: Date | null } }).metrics.lastPollAt = new Date(
      Date.now() - 120_000,
    );
    await expect(dispatcher.health()).resolves.toMatchObject({ ready: false });
  });
  it('replays a bounded terminal selection without replacing event IDs', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const env = fake([{ id, event_id: eventId, payload: { eventId }, attempt_count: 3, expires_at: new Date(Date.now() + 10_000) }], jest.fn());
    const result = await new ClickstreamDispatcher(env.prisma as never, config, env.http).replay('TERMINAL', 60, 1);
    expect(result).toEqual({ scheduled: 1, status: 'TERMINAL' });
    expect((env.prisma.clickstreamOutbox as { updateMany: jest.Mock }).updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [id] } }) }));
  });

  it('drops expired or exhausted rows before claiming and scopes updates to the lease owner', async () => {
    const expired = fake([], jest.fn(), 2);
    await expect(
      new ClickstreamDispatcher(expired.prisma as never, config, expired.http).flush(),
    ).resolves.toMatchObject({ accepted: 0 });
    expect((expired.prisma.$transaction as jest.Mock).mock.calls).toHaveLength(1);
    const exhausted = fake(
      [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          event_id: eventId,
          payload: { eventId },
          attempt_count: config.maxAttempts - 1,
          expires_at: new Date(Date.now() + 10_000),
        },
      ],
      async (_url, body) => {
        const batch = JSON.parse(body) as { batchId: string };
        return { status: 202, body: { batchId: batch.batchId, acceptedEventIds: [eventId], rejectedEvents: [] } };
      },
    );
    await new ClickstreamDispatcher(exhausted.prisma as never, config, exhausted.http).flush();
    expect((exhausted.prisma.clickstreamOutbox as { updateMany: jest.Mock }).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ leaseOwner: 'owner' }) }),
    );
  });

  it('resets attempts, leases, expiry, and terminal state when replaying', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const env = fake(
      [{ id, event_id: eventId, payload: { eventId }, attempt_count: 7, expires_at: new Date() }],
      jest.fn(),
    );
    await new ClickstreamDispatcher(env.prisma as never, config, env.http).replay('DROPPED', 60, 1);
    expect((env.prisma.clickstreamOutbox as { updateMany: jest.Mock }).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          attemptCount: 0,
          leaseOwner: null,
          leaseUntil: null,
          terminalAt: null,
          expiresAt: expect.any(Date),
        }),
      }),
    );
  });
});
