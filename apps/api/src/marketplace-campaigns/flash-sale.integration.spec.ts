import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from 'redis';
import { describe, expect, it, afterAll, beforeAll } from '@jest/globals';
import { createPrismaClient } from '../../prisma/create-prisma-client';

for (const path of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env'), resolve(__dirname, '../../../.env')]) dotenv.config({ path });

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const prisma = databaseUrl ? createPrismaClient(databaseUrl) : null;
const redis = createClient({ url: redisUrl });

describe('Flash Sale local PostgreSQL/Redis integration', () => {
  beforeAll(async () => { if (!prisma) return; await redis.connect(); });
  afterAll(async () => { await prisma?.$disconnect(); if (redis.isOpen) await redis.quit(); });

  it('reads seeded SKU authority and preserves the database constraints', async () => {
    if (!prisma) return;
    const sku = await prisma.flashSaleSku.findFirst({ orderBy: { createdAt: 'asc' }, select: { campaignId: true, allocatedQuantity: true, remainingQuantity: true, salePriceMinor: true, referencePriceMinor: true } });
    expect(sku).not.toBeNull();
    expect(sku!.remainingQuantity).toBeGreaterThanOrEqual(0);
    expect(sku!.remainingQuantity).toBeLessThanOrEqual(sku!.allocatedQuantity);
    expect(sku!.salePriceMinor).toBeLessThan(sku!.referencePriceMinor);
  });

  it('uses Redis for a bounded versioned script and cleans the probe key', async () => {
    if (!redis.isOpen) return;
    const key = `flash-sale:test:${Date.now()}`;
    expect(await redis.set(key, '1', { PX: 2_000 })).toBe('OK');
    const result = await redis.eval("return redis.call('INCR', KEYS[1])", { keys: [key], arguments: [] });
    expect(Number(result)).toBe(2);
    await redis.del(key);
    expect(await redis.get(key)).toBeNull();
  });
});
