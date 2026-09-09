import { createHash } from 'node:crypto';
import { resolveAdmissionMaxLeases, TrafficAdmissionService } from './traffic-admission.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisCacheService } from '../cache/redis-cache.service';

describe('TrafficAdmissionService lease lifecycle', () => {
  const ticketId = '00000000-0000-4000-8000-000000000001';
  const browserId = '00000000-0000-4000-8000-000000000002';
  const leaseId = '00000000-0000-4000-8000-000000000003';
  const token = 'opaque-token';
  const tokenHash = createHash('sha256').update(token).digest('hex');

  function harness() {
    const ticket = {
      ticketId,
      userId: 'buyer-1',
      sessionId: 'session-1',
      gateId: 'checkout',
      idempotencyKey: 'join-key-1234567890',
      requestDigest: 'digest',
      sequence: 1,
      state: 'ADMITTED' as const,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      leaseExpiresAt: Date.now() + 300_000,
      leaseId,
      token,
      tokenHash,
    };
    const record = {
      ticketId,
      gateId: 'checkout' as const,
      userId: 'buyer-1',
      sessionId: 'session-1',
      leaseId,
      tokenHash,
      expiresAt: Date.now() + 300_000,
      scope: 'checkout' as const,
    };
    const redis = {
      isReady: jest.fn().mockReturnValue(true),
      getJson: jest.fn((key: string) => Promise.resolve(key.includes('ticket:') ? ticket : record)),
      getValue: jest.fn((key: string) => Promise.resolve(key.includes('state:') ? 'ADMITTED' : null)),
      evalVersioned: jest.fn().mockResolvedValue(2),
      consumeRateLimit: jest.fn(),
      zRem: jest.fn(),
      zRange: jest.fn().mockResolvedValue([]),
      zCard: jest.fn().mockResolvedValue(0),
      setJson: jest.fn(),
      setValue: jest.fn(),
      del: jest.fn(),
    } as unknown as RedisCacheService;
    const service = new TrafficAdmissionService({} as PrismaService, redis);
    return { service, redis, ticket, record };
  }

  beforeEach(() => {
    process.env.TRAFFIC_ADMISSION_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.TRAFFIC_ADMISSION_ENABLED;
  });

  it('schedules page-leave release with the matching lease and browser instance', async () => {
    const { service, redis } = harness();

    await service.relinquish('buyer-1', 'session-1', ticketId, browserId, token, 'PAGE_LEAVE');

    const [, script, keys, args] = (redis.evalVersioned as jest.Mock).mock.calls[0]!;
    expect(script).toContain("ARGV[5] == 'PAGE_LEAVE'");
    expect(keys).toEqual(expect.arrayContaining([expect.stringContaining('pending-release')]))
    expect(args).toEqual(expect.arrayContaining([leaseId, browserId, 'PAGE_LEAVE']));
    expect(redis.evalVersioned).toHaveBeenCalledWith(
      'admission-relinquish-v1',
      expect.any(String),
      expect.any(Array),
      expect.any(Array),
    );
  });

  it('lets another live tab cancel the current lease pending release without renewing it', async () => {
    const { service, redis } = harness();

    await service.heartbeat('buyer-1', 'session-1', ticketId, browserId, token);

    expect(redis.evalVersioned).toHaveBeenCalledWith(
      'admission-heartbeat-v1',
      expect.stringContaining("GET', KEYS[3]"),
      expect.arrayContaining([expect.stringContaining('pending-release')]),
      [leaseId, ticketId, browserId],
    );
    const heartbeatScript = (redis.evalVersioned as jest.Mock).mock.calls[0]?.[1] as string;
    expect(heartbeatScript).not.toContain("GET', KEYS[4]");
    expect(heartbeatScript).not.toContain("PEXPIRE");
  });

  it('fences pending cleanup to the current lease and compare-deletes buyer and token indexes', () => {
    const { service } = harness();
    const pendingScript = (service as unknown as { PENDING_REAP_SCRIPT: string }).PENDING_REAP_SCRIPT;

    expect(pendingScript).toContain('currentLease == pendingLease');
    expect(pendingScript).toContain("redis.call('GET', ARGV[4] .. ticket.userId) == id");
    expect(pendingScript).toContain("ARGV[9] .. token.tokenHash");
    expect(pendingScript).toContain("ARGV[11] .. id");
  });

  it('uses the declared pending index key and token hash when reaping expired leases', () => {
    const { service } = harness();
    const reapScript = (service as unknown as { REAP_SCRIPT: string }).REAP_SCRIPT;

    expect(reapScript).toContain("redis.call('ZREM', KEYS[2], id)");
    expect(reapScript).not.toContain('KEYS[6]');
    expect(reapScript).toContain("ARGV[8] .. token.tokenHash");
  });

  it('grants waiting tickets immediately when the periodic reaper reclaims an expired lease', async () => {
    const { service, redis } = harness();
    (redis.evalVersioned as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    try {
      await (
        service as unknown as { reapAndReschedule(): Promise<void> }
      ).reapAndReschedule();

      expect(redis.zRange).toHaveBeenCalledWith('admission:checkout:waiting', 0, 19);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('marks confirmation execution and does not renew the admission deadline', async () => {
    const { service, redis } = harness();
    const lease = {
      ticketId,
      gateId: 'checkout',
      userId: 'buyer-1',
      sessionId: 'session-1',
      leaseId,
      tokenHash,
      expiresAt: Date.now() + 300_000,
    };

    (redis.evalVersioned as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await service.beginConfirmation(lease);
    await service.finishConfirmation(lease);

    expect(redis.evalVersioned).toHaveBeenNthCalledWith(
      1,
      'admission-confirmation-begin-v1',
      expect.stringContaining("SET', KEYS[3]"),
      expect.any(Array),
      [leaseId, '900000'],
    );
    expect(redis.evalVersioned).toHaveBeenNthCalledWith(
      2,
      'admission-confirmation-finish-v1',
      expect.stringContaining("DEL', KEYS[1]"),
      expect.any(Array),
      [leaseId],
    );
  });

  it('keeps the production pool at 20 and allows only the local POC ceiling of 40', () => {
    expect(resolveAdmissionMaxLeases({ NODE_ENV: 'production', T35_POC_MAX_LEASES: '40' })).toBe(20);
    expect(resolveAdmissionMaxLeases({ NODE_ENV: 'development', T35_POC_MAX_LEASES: '40' })).toBe(40);
    expect(resolveAdmissionMaxLeases({ NODE_ENV: 'test', T35_POC_MAX_LEASES: '100' })).toBe(40);
    expect(resolveAdmissionMaxLeases({ NODE_ENV: 'development', T35_POC_MAX_LEASES: '10' })).toBe(20);
  });
});
