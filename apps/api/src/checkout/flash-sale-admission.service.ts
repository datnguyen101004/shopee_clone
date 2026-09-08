import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import {
  CheckoutFlashSaleBusyError,
  CheckoutFlashSaleLimitError,
  CheckoutFlashSaleSoldOutError,
  CheckoutNotReadyError,
  CheckoutRateLimitedError,
  CheckoutUnavailableError,
} from './checkout.errors';

export interface FlashSaleAdmission {
  token: string | null;
  skuIds: string[];
  redisBacked?: boolean;
  claimKeys?: string[];
  operationKey?: string;
  replayed?: boolean;
}

// T35_POC_ADMISSION_TTL_MS is intentionally local-only; the normal checkout
// attempt TTL remains the existing 120-second default.
const configuredAdmissionTtl = Number(
  process.env.T35_POC_ADMISSION_TTL_MS ?? process.env.FLASH_SALE_ADMISSION_TTL_MS ?? 120_000,
);
const ADMISSION_TTL_MS = Number.isFinite(configuredAdmissionTtl)
  ? Math.max(1_000, Math.min(120_000, configuredAdmissionTtl))
  : 120_000;
const OPERATION_TTL_MS = 5 * 60_000;
const MAX_CONFIRMATIONS = 5;

// The slot key has no expiry. An expired attempt is compensated only by its
// owner; Redis key TTL must never reset a running confirmation budget.
const ADMIT_SCRIPT = `
local token = ARGV[1]
local ttl = ARGV[2]
local skuCount = tonumber(ARGV[3])
local slotKey = KEYS[skuCount * 3 + 1]
local operationKey = KEYS[skuCount * 3 + 2]
if redis.call('EXISTS', operationKey) == 1 then return 2 end
if redis.call('EXISTS', slotKey) == 0 then redis.call('SET', slotKey, ARGV[4]) end
for i = 1, skuCount do
  if redis.call('EXISTS', KEYS[i]) == 0 then return -2 end
  if tonumber(redis.call('GET', KEYS[i]) or '0') < 1 then return 0 end
end
for i = 1, skuCount do if redis.call('GET', KEYS[skuCount * 2 + i]) ~= ARGV[4 + i] then return -5 end end
for i = 1, skuCount do if redis.call('EXISTS', KEYS[skuCount + i]) == 1 then return -3 end end
if tonumber(redis.call('GET', slotKey) or '0') < 1 then return -4 end
for i = 1, skuCount do redis.call('DECR', KEYS[i]); redis.call('SET', KEYS[skuCount + i], token, 'PX', ttl) end
redis.call('DECR', slotKey)
local payload = slotKey
for i = 1, skuCount * 2 do payload = payload .. '|' .. KEYS[i] end
redis.call('SET', 'flash-sale:attempt:' .. token, payload, 'PX', ttl)
redis.call('SET', operationKey, token, 'PX', ARGV[4 + skuCount + 1])
return 1`;

const RELEASE_SCRIPT = `
local token = ARGV[1]
local attemptKey = 'flash-sale:attempt:' .. token
local payload = redis.call('GET', attemptKey)
if not payload then return 0 end
local keys = {}
for key in string.gmatch(payload, '[^|]+') do table.insert(keys, key) end
local slotKey = keys[1]
table.remove(keys, 1)
local count = #keys / 2
for i = 1, count do redis.call('INCR', keys[i]) end
for i = count + 1, #keys do redis.call('DEL', keys[i]) end
redis.call('INCR', slotKey)
redis.call('DEL', attemptKey)
return 1`;

const FINALIZE_SCRIPT = `
local token = ARGV[1]
local attemptKey = 'flash-sale:attempt:' .. token
local payload = redis.call('GET', attemptKey)
if not payload then return 0 end
local keys = {}
for key in string.gmatch(payload, '[^|]+') do table.insert(keys, key) end
local slotKey = keys[1]
table.remove(keys, 1)
local count = #keys / 2
for i = count + 1, #keys do redis.call('DEL', keys[i]) end
redis.call('INCR', slotKey)
redis.call('DEL', attemptKey)
return 1`;

@Injectable()
export class FlashSaleAdmissionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisCacheService) private readonly redis: RedisCacheService,
  ) {}

  private operationKey(userId: string, idempotencyKey: string): string {
    const digest = createHash('sha256').update(`${userId}:${idempotencyKey}`).digest('hex');
    return `flash-sale:operation:${digest}`;
  }

  private async holdForPocIfConfigured(): Promise<void> {
    const holdMs = Number(process.env.T35_POC_HOLD_MS ?? 0);
    if (!Number.isFinite(holdMs) || holdMs <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(holdMs, 120_000)));
  }

  /**
   * PostgreSQL is authoritative for quota and management epoch. Redis is only
   * the coordination cache, so a cold cache after restart must be hydrated
   * before the atomic admission script is evaluated.
   */
  private async warmAdmissionKeys(
    skus: readonly {
      id: string;
      remainingQuantity: number;
      managementEpoch: number;
    }[],
  ): Promise<void> {
    await Promise.all(
      skus.flatMap((sku) => [
        this.redis.setNxValue(
          `flash-sale:admission:sku:${sku.id}`,
          String(sku.remainingQuantity),
        ),
        this.redis.setNxValue(
          `flash-sale:admission:epoch:${sku.id}`,
          String(sku.managementEpoch),
          86_400_000,
        ),
      ]),
    );
  }

  async admit(
    userId: string,
    expectedVersion: number,
    idempotencyKey: string = randomUUID(),
  ): Promise<FlashSaleAdmission> {
    if (process.env.FLASH_SALE_SKU_ENABLED === 'false') return { token: null, skuIds: [] };
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: {
        version: true,
        lines: { where: { isSelected: true }, select: { variantId: true, quantity: true } },
      },
    });
    if (!cart || cart.version !== expectedVersion) return { token: null, skuIds: [] };
    const variantIds = cart.lines.map((line) => line.variantId);
    if (!variantIds.length) return { token: null, skuIds: [] };
    const now = new Date();
    const skus = await this.prisma.flashSaleSku.findMany({
      where: {
        variantId: { in: variantIds },
        endedAt: null,
        campaign: {
          cancelledAt: null,
          startsAt: { lte: now },
          endsAt: { gt: now },
          type: { code: 'FLASH_SALE' },
        },
      },
      select: {
        id: true,
        variantId: true,
        productId: true,
        campaignId: true,
        remainingQuantity: true,
        managementEpoch: true,
      },
    });
    // Ordinary-only carts bypass Flash Sale admission entirely, including its
    // Redis rate limiter and five-confirmation budget.
    if (!skus.length) return { token: null, skuIds: [] };
    if (!this.redis.isReady()) throw new CheckoutUnavailableError();
    const budget = await this.redis.consumeRateLimit(
      `flash-sale:checkout-rate:${userId}`,
      20,
      1_000,
    );
    if (!budget.available) throw new CheckoutUnavailableError();
    if (!budget.allowed) throw new CheckoutRateLimitedError(budget.retryAfterSeconds || 1);
    if (skus.some((sku) => sku.remainingQuantity < 1)) throw new CheckoutFlashSaleSoldOutError();
    if (
      cart.lines.some(
        (line) => skus.some((sku) => sku.variantId === line.variantId) && line.quantity !== 1,
      )
    )
      throw new CheckoutFlashSaleLimitError();
    if (new Set(skus.map((sku) => `${sku.campaignId}:${sku.productId}`)).size !== skus.length)
      throw new CheckoutFlashSaleLimitError();
    const existingClaims = await this.prisma.flashSaleBuyerClaim.findMany({
      where: {
        buyerId: userId,
        OR: skus.map((sku) => ({ campaignId: sku.campaignId, productId: sku.productId })),
      },
      select: { campaignId: true, productId: true },
    });
    if (existingClaims.length) throw new CheckoutFlashSaleLimitError();
    const operationKey = this.operationKey(userId, idempotencyKey);
    const prior = await this.redis.getValue(operationKey);
    if (prior?.startsWith('done:'))
      return {
        token: null,
        skuIds: skus.map((sku) => sku.id),
        operationKey,
        replayed: true,
        redisBacked: true,
      };
    if (prior)
      return {
        token: prior,
        skuIds: skus.map((sku) => sku.id),
        operationKey,
        redisBacked: true,
        claimKeys: skus.map(
          (sku) => `flash-sale:admission:claim:${sku.campaignId}:${userId}:${sku.productId}`,
        ),
      };
    const token = randomUUID();
    const skuKeys = skus.map((sku) => `flash-sale:admission:sku:${sku.id}`);
    const claimKeys = skus.map(
      (sku) => `flash-sale:admission:claim:${sku.campaignId}:${userId}:${sku.productId}`,
    );
    const epochKeys = skus.map((sku) => `flash-sale:admission:epoch:${sku.id}`);
    const slotKey = 'flash-sale:admission:global-slots-v5';
    const scriptKeys = [...skuKeys, ...claimKeys, ...epochKeys, slotKey, operationKey];
    const scriptArgs = [
      token,
      String(ADMISSION_TTL_MS),
      String(skus.length),
      String(MAX_CONFIRMATIONS),
      ...skus.map((sku) => String(sku.managementEpoch)),
      String(OPERATION_TTL_MS),
    ];
    await this.warmAdmissionKeys(skus);
    let result = await this.redis.evalVersioned(
      'flash-sale-admit-v3',
      ADMIT_SCRIPT,
      scriptKeys,
      scriptArgs,
    );
    // A concurrent cache eviction can happen between hydration and the Lua
    // call. Rehydrate from the same DB snapshot once and retry atomically.
    if (result === -2 || result === -5) {
      await this.warmAdmissionKeys(skus);
      result = await this.redis.evalVersioned('flash-sale-admit-v3', ADMIT_SCRIPT, scriptKeys, scriptArgs);
    }
    if (result === 0) throw new CheckoutNotReadyError();
    if (result === -3) throw new CheckoutFlashSaleLimitError();
    if (result === -4) throw new CheckoutFlashSaleBusyError(1);
    if (result === -5) throw new CheckoutNotReadyError();
    if (result === -2 || result === null) throw new CheckoutUnavailableError();
    if (result === 2) {
      const existing = await this.redis.getValue(operationKey);
      if (existing?.startsWith('done:'))
        return {
          token: null,
          skuIds: skus.map((sku) => sku.id),
          operationKey,
          replayed: true,
          redisBacked: true,
        };
      if (existing)
        return {
          token: existing,
          skuIds: skus.map((sku) => sku.id),
          operationKey,
          redisBacked: true,
          claimKeys,
        };
      throw new CheckoutNotReadyError();
    }
    // Test-only deterministic overlap point. It is disabled by default and
    // sits after the Redis budget is acquired, so a sixth confirmation can
    // observe the five-slot 429 without changing the business algorithm.
    await this.holdForPocIfConfigured();
    return { token, skuIds: skus.map((sku) => sku.id), redisBacked: true, claimKeys, operationKey };
  }

  async finalize(admission: FlashSaleAdmission): Promise<void> {
    if (!admission.token) return;
    if (admission.redisBacked)
      await this.redis.evalVersioned(
        'flash-sale-finalize-v3',
        FINALIZE_SCRIPT,
        [],
        [admission.token],
      );
    if (admission.operationKey)
      await this.redis.setValue(
        admission.operationKey,
        `done:${admission.token}`,
        OPERATION_TTL_MS,
      );
    await this.redis.del(`flash-sale:attempt:${admission.token}`);
  }

  async release(admission: FlashSaleAdmission): Promise<void> {
    if (!admission.token) return;
    if (admission.redisBacked)
      await this.redis.evalVersioned(
        'flash-sale-release-v3',
        RELEASE_SCRIPT,
        [],
        [admission.token],
      );
    if (admission.operationKey) await this.redis.del(admission.operationKey);
    await this.redis.del(`flash-sale:attempt:${admission.token}`);
  }
}
