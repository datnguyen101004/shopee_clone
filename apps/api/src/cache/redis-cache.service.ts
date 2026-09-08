import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

type RedisResult = string | number | Array<string | number> | null;

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: RedisClientType | null = null;
  private readonly timeoutMs = Math.max(25, Number(process.env.REDIS_COMMAND_TIMEOUT_MS ?? 250));
  private readonly scriptShas = new Map<string, string>();

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL?.trim();
    if (!url) return;
    const client = createClient({ url, socket: { connectTimeout: Math.max(250, Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 1_000)), reconnectStrategy: (retries) => Math.min(1_000, Math.max(50, retries * 100)) } });
    client.on('error', (error) => this.logger.warn(`Redis cache unavailable: ${error instanceof Error ? error.message : String(error)}`));
    try { await client.connect(); this.client = client as RedisClientType; }
    catch (error) { this.logger.warn(`Redis cache connection failed: ${error instanceof Error ? error.message : String(error)}`); await client.quit().catch(() => undefined); }
  }

  async onModuleDestroy(): Promise<void> { if (this.client?.isOpen) await this.client.quit(); }

  isReady(): boolean { return Boolean(this.client?.isReady); }

  private async bounded<T>(operation: Promise<T>): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([operation, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), this.timeoutMs); })]);
    } catch { return null; }
    finally { if (timer) clearTimeout(timer); }
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client?.isReady) return null;
    const value = await this.bounded(this.client.get(key));
    if (typeof value !== 'string' || !value) return null;
    try { return JSON.parse(value) as T; } catch { return null; }
  }

  async setJson(key: string, value: unknown, ttlMs: number): Promise<void> {
    if (!this.client?.isReady) return;
    await this.bounded(this.client.set(key, JSON.stringify(value), { PX: Math.max(1, ttlMs) }));
  }

  async setValue(key: string, value: string, ttlMs?: number): Promise<void> {
    if (!this.client?.isReady) return;
    await this.bounded(this.client.set(key, value, ttlMs ? { PX: ttlMs } : undefined));
  }

  async setNxValue(key: string, value: string, ttlMs?: number): Promise<boolean> {
    if (!this.client?.isReady) return false;
    const result = await this.bounded(
      this.client.set(
        key,
        value,
        ttlMs === undefined ? { NX: true } : { PX: Math.max(1, ttlMs), NX: true },
      ),
    );
    return result === 'OK';
  }

  async getValue(key: string): Promise<string | null> {
    if (!this.client?.isReady) return null;
    const value = await this.bounded(this.client.get(key));
    return typeof value === 'string' ? value : null;
  }

  async incrementValue(key: string, delta: number): Promise<void> {
    if (!this.client?.isReady) return;
    await this.bounded(this.client.incrBy(key, delta));
  }

  async incrementValueResult(key: string, delta = 1): Promise<number | null> {
    if (!this.client?.isReady) return null;
    const value = await this.bounded(this.client.incrBy(key, delta));
    return typeof value === 'number' ? value : null;
  }

  async zAdd(key: string, score: number, member: string): Promise<void> {
    if (!this.client?.isReady) return;
    await this.bounded(this.client.zAdd(key, [{ score, value: member }]));
  }

  async zRange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client?.isReady) return [];
    const value = await this.bounded(this.client.zRange(key, start, stop));
    return Array.isArray(value) ? value : [];
  }

  async zRangeByScore(key: string, min: number | string, max: number | string): Promise<string[]> {
    if (!this.client?.isReady) return [];
    const value = await this.bounded(this.client.zRangeByScore(key, String(min), String(max)));
    return Array.isArray(value) ? value : [];
  }

  async zCard(key: string): Promise<number | null> {
    if (!this.client?.isReady) return null;
    const value = await this.bounded(this.client.zCard(key));
    return typeof value === 'number' ? value : null;
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client?.isReady) return false;
    const value = await this.bounded(this.client.exists(key));
    return value === 1;
  }

  async zRem(key: string, member: string): Promise<void> {
    if (!this.client?.isReady) return;
    await this.bounded(this.client.zRem(key, member));
  }

  async del(key: string): Promise<void> { if (this.client?.isReady) await this.bounded(this.client.del(key)); }

  async delByPrefix(prefix: string): Promise<void> {
    if (!this.client?.isReady) return;
    const keys = await this.bounded(this.client.keys(`${prefix}*`));
    if (Array.isArray(keys) && keys.length) await this.bounded(this.client.del(keys));
  }

  async eval(script: string, keys: string[], args: string[]): Promise<RedisResult> {
    if (!this.client?.isReady) return null;
    const result = await this.bounded(this.client.eval(script, { keys, arguments: args }));
    return result as RedisResult;
  }

  async evalVersioned(name: string, script: string, keys: string[], args: string[]): Promise<RedisResult> {
    if (!this.client?.isReady) return null;
    let sha = this.scriptShas.get(name);
    if (!sha) {
      const loaded = await this.bounded(this.client.scriptLoad(script));
      if (typeof loaded !== 'string') return this.eval(script, keys, args);
      sha = loaded;
      this.scriptShas.set(name, sha);
    }
    const result = await this.bounded(this.client.evalSha(sha, { keys, arguments: args }));
    if (result === null) return this.eval(script, keys, args);
    return result as RedisResult;
  }

  async consumeRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number; available: boolean }> {
    if (!this.client?.isReady) return { allowed: false, retryAfterSeconds: 1, available: false };
    const script = `local current = redis.call('INCR', KEYS[1]) if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end local ttl = redis.call('PTTL', KEYS[1]) if current > tonumber(ARGV[2]) then return {0, math.max(1, math.ceil(ttl / 1000))} end return {1, 0}`;
    const result = await this.eval(script, [key], [String(Math.max(1, windowMs)), String(Math.max(1, limit))]);
    if (!Array.isArray(result)) return { allowed: false, retryAfterSeconds: 1, available: false };
    return { allowed: Number(result[0]) === 1, retryAfterSeconds: Math.max(0, Number(result[1]) || 0), available: true };
  }
}
