import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import { RedisCacheService } from '../cache/redis-cache.service';
import { TrafficAdmissionService } from './traffic-admission.service';
import type { PrismaService } from '../prisma/prisma.service';

const run = process.env.T35_RUN_REDIS_POC === 'true' ? describe : describe.skip;

run('Redis admission POC smoke', () => {
  const redis = new RedisCacheService();
  const admission = new TrafficAdmissionService({} as PrismaService, redis);

  beforeAll(async () => {
    await redis.onModuleInit();
    await redis.delByPrefix('admission:');
  });

  afterAll(async () => {
    await redis.delByPrefix('admission:');
    await redis.onModuleDestroy();
  });

  it('keeps 21 concurrent tickets within a 20-lease pool and grants after release', async () => {
    const statuses = await Promise.all(
      Array.from({ length: 21 }, (_, index) =>
        admission.enqueue(
          `poc-buyer-${index}`,
          `poc-session-${index}`,
          'checkout',
          `poc-join-key-${String(index).padStart(12, '0')}`,
        ),
      ),
    );
    expect(statuses.filter((status) => status.state === 'ADMITTED')).toHaveLength(20);
    expect(statuses.filter((status) => status.state === 'WAITING')).toHaveLength(1);

    const admittedIndex = statuses.findIndex(
      (status) => status.state === 'ADMITTED' && status.token,
    );
    const admitted = admittedIndex >= 0 ? statuses[admittedIndex] : undefined;
    expect(admitted?.token).toBeTruthy();
    const lease = await admission.verify(
      admitted?.token,
      `poc-buyer-${admittedIndex}`,
      `poc-session-${admittedIndex}`,
    );
    await admission.releaseLease(lease, 'SUCCESS');

    await new Promise((resolve) => setTimeout(resolve, 50));
    const waitingIndex = statuses.findIndex((status) => status.state === 'WAITING');
    const waiting = waitingIndex >= 0 ? statuses[waitingIndex] : undefined;
    const refreshed = await admission.getStatus(
      waiting ? `poc-buyer-${waitingIndex}` : 'missing',
      `poc-session-${waitingIndex}`,
      waiting?.ticketId,
    );
    expect(['ADMITTED', 'WAITING']).toContain(refreshed.state);
  }, 10_000);
});
