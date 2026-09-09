import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import {
  AdmissionExpiredError,
  AdmissionIdempotencyConflictError,
  AdmissionInvalidError,
  AdmissionRateLimitError,
  AdmissionRequiredError,
  AdmissionUnavailableError,
  WaitingRoomFullError,
} from './traffic-admission.errors';
import { handleAdmissionQueueEvent, type AdmissionGrantResult } from './admission-lambda';

export type AdmissionState = 'WAITING' | 'ADMITTED' | 'EXPIRED' | 'CLOSED';

export interface AdmissionStatus {
  gateId: string;
  ticketId: string;
  state: AdmissionState;
  retryAfterSeconds: number;
  leaseExpiresAt: string | null;
  token?: string;
  message?: string;
}

export interface AdmissionLease {
  ticketId: string;
  gateId: string;
  userId: string;
  sessionId: string;
  leaseId: string;
  tokenHash: string;
  expiresAt: number;
}

export type AdmissionRelinquishMode = 'EXPLICIT' | 'PAGE_LEAVE';

interface Ticket {
  ticketId: string;
  userId: string;
  sessionId: string;
  gateId: string;
  idempotencyKey: string;
  requestDigest: string;
  sequence: number;
  state: AdmissionState;
  createdAt: number;
  lastSeenAt: number;
  leaseExpiresAt: number | null;
  leaseId: string | null;
  token: string | null;
  tokenHash: string | null;
  terminalReason?: 'SUCCESS' | 'EXPIRED' | 'CANCELLED' | 'CLOSED';
}

interface TokenRecord {
  ticketId: string;
  gateId: string;
  userId: string;
  sessionId: string;
  leaseId: string;
  tokenHash: string;
  expiresAt: number;
  scope: 'checkout';
}

const TICKET_TTL_MS = 15 * 60_000;
const LEASE_TTL_MS = 5 * 60_000;
const configuredPocLeaseTtl = Number(process.env.T35_POC_LEASE_TTL_MS);
const EFFECTIVE_LEASE_TTL_MS = Number.isFinite(configuredPocLeaseTtl)
  ? Math.max(1_000, Math.min(LEASE_TTL_MS, configuredPocLeaseTtl))
  : LEASE_TTL_MS;
const MAX_QUEUE = 5_000;
const MAX_LEASES = 20;
// The production/default pool remains 20. A larger pool is permitted only
// for the local T35 load harness and cannot be enabled in production.
export function resolveAdmissionMaxLeases(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.T35_POC_MAX_LEASES);
  if (env.NODE_ENV !== 'production' && Number.isFinite(configured))
    return Math.max(MAX_LEASES, Math.min(40, Math.floor(configured)));
  return MAX_LEASES;
}
const GRANT_VISIBILITY_MS = 30_000;
const PAGE_LEAVE_GRACE_MS = Math.max(
  5_000,
  Math.min(10_000, Number(process.env.ADMISSION_PAGE_LEAVE_GRACE_MS ?? 7_500)),
);

/** Redis backed waiting-room control plane. SQS Standard is at-least-once;
 * ticket state and the atomic Redis grant script make duplicates harmless. */
@Injectable()
export class TrafficAdmissionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrafficAdmissionService.name);
  /**
   * Local POC-only shortening keeps expiry/race checks bounded in a developer
   * run. Production retains the design's five-minute lease by default.
   */
  private readonly leaseTtlMs = EFFECTIVE_LEASE_TTL_MS;
  private readonly enabled = process.env.TRAFFIC_ADMISSION_ENABLED === 'true';
  private readonly maxQueue = Math.max(
    1,
    Number(process.env.TRAFFIC_ADMISSION_MAX_QUEUE ?? MAX_QUEUE),
  );
  private readonly maxLeases = Math.max(
    1,
    Math.min(
      resolveAdmissionMaxLeases(),
      Number(process.env.TRAFFIC_ADMISSION_MAX_OUTSTANDING ?? resolveAdmissionMaxLeases()),
    ),
  );
  private readonly queueUrl = process.env.ADMISSION_SQS_QUEUE_URL?.trim() ?? '';
  private readonly sqsEnabled =
    process.env.ADMISSION_SQS_ENABLED === 'true' && this.queueUrl.length > 0;
  /** Lambda owns queue consumption when explicitly enabled; Nest remains the local fallback. */
  private readonly sqsConsumerEnabled =
    this.sqsEnabled &&
    process.env.ADMISSION_SQS_CONSUMER_ENABLED !== 'false' &&
    process.env.ADMISSION_LAMBDA_ENABLED !== 'true';
  private readonly sqsPollMs = Math.max(100, Number(process.env.ADMISSION_SQS_POLL_MS ?? 1_000));
  private readonly sqs: SQSClient | null = this.sqsEnabled
    ? new SQSClient({
        region: process.env.AWS_REGION ?? 'ap-southeast-1',
        endpoint: process.env.ADMISSION_SQS_ENDPOINT?.trim() || undefined,
        credentials: process.env.AWS_ACCESS_KEY_ID
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
            }
          : undefined,
      })
    : null;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private reaperTimer: ReturnType<typeof setTimeout> | undefined;
  private polling = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisCacheService) private readonly redis: RedisCacheService,
  ) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    if (this.sqsConsumerEnabled) this.schedulePoll(0);
    this.scheduleReaper(1_000);
  }
  onModuleDestroy(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.reaperTimer) clearTimeout(this.reaperTimer);
    this.sqs?.destroy();
  }

  private schedulePoll(delayMs: number): void {
    if (this.sqsConsumerEnabled) this.pollTimer = setTimeout(() => void this.pollQueue(), delayMs);
  }
  private scheduleReaper(delayMs: number): void {
    this.reaperTimer = setTimeout(() => void this.reapAndReschedule(), delayMs);
  }
  private async reapAndReschedule(): Promise<void> {
    try {
      if (this.redis.isReady()) {
        const expiredCount = await this.reapExpired('checkout');
        if (expiredCount > 0) await this.grantWaiting('checkout');
        await this.reapPendingRelinquishments('checkout');
      }
    } catch (error) {
      this.logger.warn(
        `Admission lease reaper failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (this.enabled) this.scheduleReaper(1_000);
    }
  }
  private key(gateId: string, suffix: string): string {
    return `admission:${gateId}:${suffix}`;
  }
  private ticketKey(gateId: string, ticketId: string): string {
    return this.key(gateId, `ticket:${ticketId}`);
  }
  private stateKey(gateId: string, ticketId: string): string {
    return this.key(gateId, `state:${ticketId}`);
  }
  private tokenKey(gateId: string, ticketId: string): string {
    return this.key(gateId, `token:${ticketId}`);
  }
  private leaseKey(gateId: string, ticketId: string): string {
    return this.key(gateId, `lease:${ticketId}`);
  }
  private confirmationKey(gateId: string, ticketId: string): string {
    return this.key(gateId, `confirmation:${ticketId}`);
  }
  private pendingReleaseLeaseKey(gateId: string, ticketId: string): string {
    return this.key(gateId, `pending-release:${ticketId}`);
  }
  private pendingReleaseBrowserKey(gateId: string, ticketId: string): string {
    return this.key(gateId, `pending-release-browser:${ticketId}`);
  }
  private pendingReleaseIndexKey(gateId: string): string {
    return this.key(gateId, 'pending-releases');
  }
  private tokenIndexKey(tokenHash: string): string {
    return `admission:token:${tokenHash}`;
  }
  private joinKey(gateId: string, userId: string, idempotencyKey: string): string {
    return this.key(gateId, `join:${userId}:${idempotencyKey}`);
  }
  private buyerKey(gateId: string, userId: string): string {
    return this.key(gateId, `buyer:${userId}`);
  }
  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  private joinDigest(userId: string, sessionId: string, gateId: string, key: string): string {
    return createHash('sha256').update(`${userId}:${sessionId}:${gateId}:${key}`).digest('hex');
  }
  private async ensureRedis(): Promise<void> {
    if (!this.redis.isReady()) throw new AdmissionUnavailableError();
  }

  async requiresAdmission(userId: string, expectedCartVersion: number): Promise<boolean> {
    if (!this.enabled) return false;
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: {
        version: true,
        lines: { where: { isSelected: true }, select: { variantId: true } },
      },
    });
    if (!cart || cart.version !== expectedCartVersion || cart.lines.length === 0) return false;
    const now = new Date();
    return (
      (await this.prisma.flashSaleSku.count({
        where: {
          variantId: { in: cart.lines.map((line: { variantId: string }) => line.variantId) },
          endedAt: null,
          campaign: {
            cancelledAt: null,
            startsAt: { lte: now },
            endsAt: { gt: now },
            type: { code: 'FLASH_SALE' },
          },
        },
      })) > 0
    );
  }

  async requiresAdmissionForCurrentCart(userId: string): Promise<boolean> {
    if (!this.enabled) return false;
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: { lines: { where: { isSelected: true }, select: { variantId: true } } },
    });
    if (!cart || cart.lines.length === 0) return false;
    const now = new Date();
    return (
      (await this.prisma.flashSaleSku.count({
        where: {
          variantId: { in: cart.lines.map((line: { variantId: string }) => line.variantId) },
          endedAt: null,
          campaign: {
            cancelledAt: null,
            startsAt: { lte: now },
            endsAt: { gt: now },
            type: { code: 'FLASH_SALE' },
          },
        },
      })) > 0
    );
  }

  private async readTicket(gateId: string, ticketId: string): Promise<Ticket | null> {
    const ticket = await this.redis.getJson<Ticket>(this.ticketKey(gateId, ticketId));
    if (!ticket) return null;
    const state = await this.redis.getValue(this.stateKey(gateId, ticketId));
    if (state === 'WAITING' || state === 'ADMITTED' || state === 'EXPIRED' || state === 'CLOSED')
      ticket.state = state;
    if (
      ticket.state === 'ADMITTED' &&
      (!ticket.leaseExpiresAt || ticket.leaseExpiresAt <= Date.now())
    )
      ticket.state = 'EXPIRED';
    return ticket;
  }

  private async writeWaitingTicket(ticket: Ticket): Promise<void> {
    await this.redis.setJson(this.ticketKey(ticket.gateId, ticket.ticketId), ticket, TICKET_TTL_MS);
    await this.redis.setValue(
      this.stateKey(ticket.gateId, ticket.ticketId),
      'WAITING',
      TICKET_TTL_MS,
    );
    await this.redis.zAdd(this.key(ticket.gateId, 'waiting'), ticket.sequence, ticket.ticketId);
  }

  private async publishTicket(ticket: Ticket): Promise<void> {
    if (!this.sqsEnabled) {
      await this.grantWaiting(ticket.gateId);
      return;
    }
    try {
      await this.sqs!.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify({
            ticketId: ticket.ticketId,
            gateId: ticket.gateId,
            issuedAt: Date.now(),
          }),
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Admission ticket publication failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new AdmissionUnavailableError();
    }
  }

  async enqueue(
    userId: string,
    sessionId: string,
    gateId = 'checkout',
    idempotencyKey: string = randomUUID(),
  ): Promise<AdmissionStatus> {
    if (!this.enabled)
      return {
        gateId,
        ticketId: 'disabled',
        state: 'ADMITTED',
        retryAfterSeconds: 0,
        leaseExpiresAt: null,
        message: 'Admission is disabled.',
      };
    await this.ensureRedis();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))
      throw new AdmissionIdempotencyConflictError();
    const digest = this.joinDigest(userId, sessionId, gateId, idempotencyKey);
    const joinKey = this.joinKey(gateId, userId, idempotencyKey);
    const existingJoin = await this.redis.getJson<{ ticketId: string; digest: string }>(joinKey);
    if (existingJoin) {
      if (existingJoin.digest !== digest) throw new AdmissionIdempotencyConflictError();
      const existing = await this.readTicket(gateId, existingJoin.ticketId);
      if (existing) {
        // A transient SQS publication error must be retryable with the same key.
        // Re-publishing the same ticket is safe because the grant is idempotent.
        if (existing.state === 'WAITING' && this.sqsEnabled) await this.publishTicket(existing);
        return this.toStatus(existing);
      }
    }
    const existingTicketId = await this.redis.getValue(this.buyerKey(gateId, userId));
    if (existingTicketId) {
      const existing = await this.readTicket(gateId, existingTicketId);
      if (
        existing &&
        existing.sessionId === sessionId &&
        (existing.state === 'WAITING' || existing.state === 'ADMITTED')
      ) {
        await this.redis.setJson(joinKey, { ticketId: existing.ticketId, digest }, TICKET_TTL_MS);
        if (existing.state === 'WAITING' && this.sqsEnabled) await this.publishTicket(existing);
        return this.toStatus(existing);
      }
    }
    const waiting = await this.redis.zCard(this.key(gateId, 'waiting'));
    if ((waiting ?? 0) >= this.maxQueue) throw new WaitingRoomFullError();
    const sequence =
      (await this.redis.incrementValueResult(this.key(gateId, 'sequence'))) ?? Date.now();
    const now = Date.now();
    const ticket: Ticket = {
      ticketId: randomUUID(),
      userId,
      sessionId,
      gateId,
      idempotencyKey,
      requestDigest: digest,
      sequence,
      state: 'WAITING',
      createdAt: now,
      lastSeenAt: now,
      leaseExpiresAt: null,
      leaseId: null,
      token: null,
      tokenHash: null,
    };
    await this.writeWaitingTicket(ticket);
    await this.redis.setJson(joinKey, { ticketId: ticket.ticketId, digest }, TICKET_TTL_MS);
    await this.redis.setValue(this.buyerKey(gateId, userId), ticket.ticketId, TICKET_TTL_MS);
    // Keep the WAITING ticket and its join record if publication fails. A retry
    // with the same idempotency key can publish it again without creating a
    // second buyer ticket.
    await this.publishTicket(ticket);
    return this.toStatus((await this.readTicket(gateId, ticket.ticketId)) ?? ticket);
  }

  private retrySeconds(ticketId: string): number {
    const n = Number.parseInt(ticketId.slice(0, 2), 16);
    return 5 + (Number.isFinite(n) ? n % 6 : 0);
  }
  private toStatus(ticket: Ticket): AdmissionStatus {
    const now = Date.now();
    if (ticket.state === 'WAITING')
      return {
        gateId: ticket.gateId,
        ticketId: ticket.ticketId,
        state: 'WAITING',
        retryAfterSeconds: this.retrySeconds(ticket.ticketId),
        leaseExpiresAt: null,
        message:
          'Bạn đang chờ lượt truy cập; hệ thống không cam kết vị trí FIFO hoặc giữ sản phẩm.',
      };
    if (ticket.state === 'ADMITTED' && ticket.leaseExpiresAt && ticket.leaseExpiresAt > now)
      return {
        gateId: ticket.gateId,
        ticketId: ticket.ticketId,
        state: 'ADMITTED',
        retryAfterSeconds: 0,
        leaseExpiresAt: new Date(ticket.leaseExpiresAt).toISOString(),
        token: ticket.token ?? undefined,
        message: 'Lượt truy cập có thời hạn 5 phút; admission không giữ quota sản phẩm.',
      };
    return {
      gateId: ticket.gateId,
      ticketId: ticket.ticketId,
      state: ticket.state === 'CLOSED' ? 'CLOSED' : 'EXPIRED',
      retryAfterSeconds: 5,
      leaseExpiresAt: null,
      message:
        ticket.terminalReason === 'SUCCESS'
          ? 'Lượt truy cập đã được sử dụng.'
          : ticket.state === 'CLOSED'
            ? 'Lượt truy cập đã được đóng.'
            : 'Lượt truy cập đã hết hạn.',
    };
  }

  private async closeWaitingTicket(ticket: Ticket): Promise<void> {
    ticket.state = 'CLOSED';
    ticket.terminalReason = 'CANCELLED';
    ticket.lastSeenAt = Date.now();
    await this.redis.setJson(this.ticketKey(ticket.gateId, ticket.ticketId), ticket, TICKET_TTL_MS);
    await this.redis.setValue(
      this.stateKey(ticket.gateId, ticket.ticketId),
      'CLOSED',
      TICKET_TTL_MS,
    );
    await this.redis.zRem(this.key(ticket.gateId, 'waiting'), ticket.ticketId);
    await this.redis.del(this.buyerKey(ticket.gateId, ticket.userId));
  }

  private readonly GRANT_SCRIPT = `
local state = redis.call('GET', KEYS[1])
if state ~= 'WAITING' then return 2 end
local now = tonumber(ARGV[3])
for _, id in ipairs(redis.call('ZRANGEBYSCORE', KEYS[4], '-inf', now)) do
  redis.call('ZREM', KEYS[4], id)
  redis.call('SET', ARGV[7] .. id, 'EXPIRED', 'PX', ARGV[6])
  redis.call('DEL', ARGV[8] .. id, ARGV[9] .. id)
end
-- Capacity is the number of active leases, not the number of waiting tickets.
if redis.call('ZCARD', KEYS[4]) >= tonumber(ARGV[4]) then return 0 end
redis.call('SET', KEYS[1], 'ADMITTED', 'PX', ARGV[6])
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[6])
redis.call('SET', KEYS[5], ARGV[5], 'PX', ARGV[12])
redis.call('SET', KEYS[6], ARGV[10], 'PX', ARGV[12])
redis.call('SET', KEYS[7], ARGV[11], 'PX', ARGV[12])
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('ZADD', KEYS[4], tonumber(ARGV[3]) + tonumber(ARGV[12]), ARGV[1])
return 1`;

  private readonly RELEASE_SCRIPT = `
local state = redis.call('GET', KEYS[1])
if state ~= 'ADMITTED' then return 0 end
if redis.call('GET', KEYS[5]) ~= ARGV[1] then return -1 end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[4])
redis.call('ZREM', KEYS[2], ARGV[3])
redis.call('ZREM', KEYS[9], ARGV[3])
redis.call('DEL', KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8])
return 1`;

  private readonly REAP_SCRIPT = `
local count = 0
for _, id in ipairs(redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])) do
  redis.call('ZREM', KEYS[1], id)
  redis.call('ZREM', KEYS[2], id)
  redis.call('SET', ARGV[2] .. id, 'EXPIRED', 'PX', ARGV[5])
  local tokenJson = redis.call('GET', ARGV[3] .. id)
  if tokenJson then
    local ok, token = pcall(cjson.decode, tokenJson)
    if ok and token.tokenHash then redis.call('DEL', ARGV[8] .. token.tokenHash) end
  end
  redis.call('DEL', ARGV[3] .. id, ARGV[4] .. id, ARGV[6] .. id, ARGV[7] .. id, ARGV[9] .. id)
  count = count + 1
end
return count`;

  private readonly RELINQUISH_SCRIPT = `
local state = redis.call('GET', KEYS[1])
if state ~= 'ADMITTED' then return 0 end
if redis.call('GET', KEYS[5]) ~= ARGV[1] then return -1 end
local confirmation = redis.call('EXISTS', KEYS[6]) == 1
if ARGV[5] == 'PAGE_LEAVE' or confirmation then
  redis.call('SET', KEYS[7], ARGV[1], 'PX', ARGV[4])
  redis.call('SET', KEYS[8], ARGV[6], 'PX', ARGV[4])
  redis.call('ZADD', KEYS[9], tonumber(ARGV[7]), ARGV[3])
  return 2
end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[4])
redis.call('ZREM', KEYS[2], ARGV[3])
redis.call('ZREM', KEYS[9], ARGV[3])
redis.call('DEL', KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8])
return 1`;

  private readonly HEARTBEAT_SCRIPT = `
local state = redis.call('GET', KEYS[1])
if state ~= 'ADMITTED' then return 0 end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return -1 end
if redis.call('GET', KEYS[3]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[3], KEYS[4])
redis.call('ZREM', KEYS[5], ARGV[2])
return 1`;

  private readonly CONFIRMATION_BEGIN_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= 'ADMITTED' then return 0 end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return -1 end
redis.call('SET', KEYS[3], ARGV[1], 'PX', ARGV[2])
return 1`;

  private readonly CONFIRMATION_FINISH_SCRIPT = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1`;

  private readonly PENDING_REAP_SCRIPT = `
local count = 0
for _, id in ipairs(redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])) do
  redis.call('ZREM', KEYS[1], id)
  local state = redis.call('GET', ARGV[2] .. id)
  local pendingLease = redis.call('GET', ARGV[6] .. id)
  local currentLease = redis.call('GET', ARGV[11] .. id)
  if state == 'ADMITTED' and pendingLease and currentLease == pendingLease then
    if redis.call('EXISTS', ARGV[7] .. id) == 1 then
      redis.call('ZADD', KEYS[1], tonumber(ARGV[1]) + 1000, id)
    else
      redis.call('SET', ARGV[2] .. id, 'CLOSED', 'PX', ARGV[5])
      redis.call('ZREM', KEYS[2], id)
      local ticketJson = redis.call('GET', ARGV[3] .. id)
      if ticketJson then
        local ok, ticket = pcall(cjson.decode, ticketJson)
        if ok and ticket.userId and redis.call('GET', ARGV[4] .. ticket.userId) == id then
          redis.call('DEL', ARGV[4] .. ticket.userId)
        end
      end
      local tokenJson = redis.call('GET', ARGV[8] .. id)
      if tokenJson then
        local ok, token = pcall(cjson.decode, tokenJson)
        if ok and token.tokenHash then redis.call('DEL', ARGV[9] .. token.tokenHash) end
      end
      redis.call('DEL', ARGV[8] .. id, ARGV[6] .. id, ARGV[10] .. id, ARGV[7] .. id, ARGV[11] .. id)
      count = count + 1
    end
  else
    redis.call('DEL', ARGV[6] .. id, ARGV[10] .. id)
  end
end
return count`;

  private async grantTicket(ticket: Ticket): Promise<boolean> {
    if (ticket.state !== 'WAITING') return true;
    const now = Date.now();
    const token = randomBytes(32).toString('base64url');
    const hash = this.tokenHash(token);
    const leaseId = randomUUID();
    const leaseExpiresAt = now + this.leaseTtlMs;
    const next: Ticket = {
      ...ticket,
      state: 'ADMITTED',
      leaseExpiresAt,
      leaseId,
      token,
      tokenHash: hash,
      lastSeenAt: now,
    };
    const record: TokenRecord = {
      ticketId: ticket.ticketId,
      gateId: ticket.gateId,
      userId: ticket.userId,
      sessionId: ticket.sessionId,
      leaseId,
      tokenHash: hash,
      expiresAt: leaseExpiresAt,
      scope: 'checkout',
    };
    const result = await this.redis.evalVersioned(
      'admission-grant-v2',
      this.GRANT_SCRIPT,
      [
        this.stateKey(ticket.gateId, ticket.ticketId),
        this.ticketKey(ticket.gateId, ticket.ticketId),
        this.key(ticket.gateId, 'waiting'),
        this.key(ticket.gateId, 'admitted'),
        this.tokenKey(ticket.gateId, ticket.ticketId),
        this.tokenIndexKey(hash),
        this.leaseKey(ticket.gateId, ticket.ticketId),
      ],
      [
        ticket.ticketId,
        JSON.stringify(next),
        String(now),
        String(this.maxLeases),
        JSON.stringify(record),
        String(TICKET_TTL_MS),
        this.key(ticket.gateId, 'state:'),
        this.key(ticket.gateId, 'token:'),
        this.key(ticket.gateId, 'lease:'),
        JSON.stringify(record),
        leaseId,
        String(this.leaseTtlMs),
      ],
    );
    return result === 1;
  }

  private async grantWaiting(gateId: string): Promise<void> {
    await this.ensureRedis();
    await this.reapExpired(gateId);
    for (const ticketId of await this.redis.zRange(
      this.key(gateId, 'waiting'),
      0,
      this.maxLeases - 1,
    )) {
      const ticket = await this.readTicket(gateId, ticketId);
      if (ticket) await this.grantTicket(ticket);
    }
  }

  private async reapExpired(gateId: string): Promise<number> {
    const result = await this.redis.evalVersioned(
      'admission-reap-v2',
      this.REAP_SCRIPT,
      [this.key(gateId, 'admitted'), this.pendingReleaseIndexKey(gateId)],
      [
        String(Date.now()),
        this.key(gateId, 'state:'),
        this.key(gateId, 'token:'),
        this.key(gateId, 'lease:'),
        String(TICKET_TTL_MS),
        this.key(gateId, 'pending-release:'),
        this.key(gateId, 'confirmation:'),
        'admission:token:',
        this.key(gateId, 'pending-release-browser:'),
      ],
    );
    return Number(result ?? 0);
  }

  private async reapPendingRelinquishments(gateId: string): Promise<void> {
    const result = await this.redis.evalVersioned(
      'admission-pending-release-v1',
      this.PENDING_REAP_SCRIPT,
      [this.pendingReleaseIndexKey(gateId), this.key(gateId, 'admitted')],
      [
        String(Date.now()),
        this.key(gateId, 'state:'),
        this.key(gateId, 'ticket:'),
        this.key(gateId, 'buyer:'),
        String(TICKET_TTL_MS),
        this.key(gateId, 'pending-release:'),
        this.key(gateId, 'confirmation:'),
        this.key(gateId, 'token:'),
        'admission:token:',
        this.key(gateId, 'pending-release-browser:'),
        this.key(gateId, 'lease:'),
      ],
    );
    if (Number(result) > 0) await this.grantWaiting(gateId);
  }

  async processQueueTicket(ticketId: string, gateId: string): Promise<AdmissionGrantResult> {
    await this.ensureRedis();
    const ticket = await this.readTicket(gateId, ticketId);
    if (!ticket || ticket.state !== 'WAITING') return 'TERMINAL';
    return (await this.grantTicket(ticket)) ? 'GRANTED' : 'WAITING';
  }

  private async pollQueue(): Promise<void> {
    if (!this.sqs || this.polling) return;
    this.polling = true;
    try {
      const result = await this.sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 1,
          VisibilityTimeout: Math.ceil(GRANT_VISIBILITY_MS / 1_000),
        }),
      );
      const messages = result.Messages ?? [];
      const lambdaResult = await handleAdmissionQueueEvent(
        {
          Records: messages.map((message) => ({
            messageId: message.MessageId,
            body: message.Body,
          })),
        },
        (ticketId, gateId) => this.processQueueTicket(ticketId, gateId),
      );
      const failedIds = new Set(
        lambdaResult.batchItemFailures.map((failure) => failure.itemIdentifier),
      );
      for (const message of messages) {
        if (!failedIds.has(message.MessageId ?? 'unknown-message') && message.ReceiptHandle)
          await this.sqs.send(
            new DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
      }
    } catch (error) {
      this.logger.warn(
        `Admission queue poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.polling = false;
      this.schedulePoll(this.sqsPollMs);
    }
  }

  async getStatus(
    userId: string,
    sessionId: string,
    ticketId?: string,
    gateId = 'checkout',
  ): Promise<AdmissionStatus> {
    if (!this.enabled)
      return {
        gateId,
        ticketId: ticketId ?? 'disabled',
        state: 'ADMITTED',
        retryAfterSeconds: 0,
        leaseExpiresAt: null,
        message: 'Admission is disabled.',
      };
    await this.ensureRedis();
    if (!ticketId) throw new AdmissionRequiredError();
    const ticket = await this.readTicket(gateId, ticketId);
    if (!ticket || ticket.userId !== userId || ticket.sessionId !== sessionId)
      throw new AdmissionRequiredError();
    if (
      ticket.state === 'ADMITTED' &&
      (!ticket.leaseExpiresAt || ticket.leaseExpiresAt <= Date.now())
    )
      await this.expireLease(ticket);
    return this.toStatus((await this.readTicket(gateId, ticketId)) ?? ticket);
  }

  async leave(
    userId: string,
    sessionId: string,
    ticketId: string,
    gateId = 'checkout',
  ): Promise<void> {
    if (!this.enabled) return;
    await this.ensureRedis();
    const ticket = await this.readTicket(gateId, ticketId);
    if (ticket?.userId === userId && ticket.sessionId === sessionId && ticket.state === 'WAITING')
      await this.closeWaitingTicket(ticket);
  }

  private async expireLease(ticket: Ticket): Promise<void> {
    const result = await this.redis.evalVersioned(
      'admission-release-v3',
      this.RELEASE_SCRIPT,
      [
        this.stateKey(ticket.gateId, ticket.ticketId),
        this.key(ticket.gateId, 'admitted'),
        this.tokenKey(ticket.gateId, ticket.ticketId),
        this.tokenIndexKey(ticket.tokenHash ?? ''),
        this.leaseKey(ticket.gateId, ticket.ticketId),
        this.confirmationKey(ticket.gateId, ticket.ticketId),
        this.pendingReleaseLeaseKey(ticket.gateId, ticket.ticketId),
        this.pendingReleaseBrowserKey(ticket.gateId, ticket.ticketId),
        this.pendingReleaseIndexKey(ticket.gateId),
      ],
      [ticket.leaseId ?? '', 'EXPIRED', ticket.ticketId, String(TICKET_TTL_MS)],
    );
    if (result === 1) await this.grantWaiting(ticket.gateId);
  }

  async releaseLease(
    lease: AdmissionLease | undefined,
    reason: 'SUCCESS' | 'EXPIRED' | 'RELINQUISHED' = 'SUCCESS',
  ): Promise<void> {
    if (!lease || !this.enabled || !this.redis.isReady()) return;
    const result = await this.redis.evalVersioned(
      'admission-release-v3',
      this.RELEASE_SCRIPT,
      [
        this.stateKey(lease.gateId, lease.ticketId),
        this.key(lease.gateId, 'admitted'),
        this.tokenKey(lease.gateId, lease.ticketId),
        this.tokenIndexKey(lease.tokenHash),
        this.leaseKey(lease.gateId, lease.ticketId),
        this.confirmationKey(lease.gateId, lease.ticketId),
        this.pendingReleaseLeaseKey(lease.gateId, lease.ticketId),
        this.pendingReleaseBrowserKey(lease.gateId, lease.ticketId),
        this.pendingReleaseIndexKey(lease.gateId),
      ],
      [
        lease.leaseId,
        reason === 'EXPIRED' ? 'EXPIRED' : 'CLOSED',
        lease.ticketId,
        String(TICKET_TTL_MS),
      ],
    );
    if (result === 1) await this.grantWaiting(lease.gateId);
  }

  private async ownedLease(
    token: string | undefined,
    userId: string,
    sessionId: string,
    ticketId: string,
    gateId = 'checkout',
  ): Promise<AdmissionLease> {
    if (!token) throw new AdmissionRequiredError();
    const hash = this.tokenHash(token);
    const record = await this.redis.getJson<TokenRecord>(this.tokenIndexKey(hash));
    if (
      !record ||
      record.scope !== 'checkout' ||
      record.ticketId !== ticketId ||
      record.userId !== userId ||
      record.sessionId !== sessionId ||
      record.gateId !== gateId ||
      record.tokenHash !== hash
    )
      throw new AdmissionInvalidError();
    const ticket = await this.readTicket(gateId, record.ticketId);
    if (!ticket || ticket.state !== 'ADMITTED' || ticket.leaseId !== record.leaseId)
      throw new AdmissionInvalidError();
    if (
      record.expiresAt <= Date.now() ||
      !ticket.leaseExpiresAt ||
      ticket.leaseExpiresAt <= Date.now()
    ) {
      await this.expireLease(ticket);
      throw new AdmissionExpiredError();
    }
    return {
      ticketId: record.ticketId,
      gateId,
      userId,
      sessionId,
      leaseId: record.leaseId,
      tokenHash: hash,
      expiresAt: record.expiresAt,
    };
  }

  async relinquish(
    userId: string,
    sessionId: string,
    ticketId: string,
    browserInstanceId: string,
    token: string | undefined,
    mode: AdmissionRelinquishMode = 'EXPLICIT',
    gateId = 'checkout',
  ): Promise<void> {
    if (!this.enabled) return;
    await this.ensureRedis();
    const ticket = await this.readTicket(gateId, ticketId);
    if (!ticket || ticket.userId !== userId || ticket.sessionId !== sessionId) return;
    if (ticket.state === 'WAITING') {
      if (mode === 'EXPLICIT') await this.closeWaitingTicket(ticket);
      return;
    }
    if (ticket.state !== 'ADMITTED') return;
    const lease = await this.ownedLease(token, userId, sessionId, ticketId, gateId);
    const now = Date.now();
    const dueAt = now + (mode === 'PAGE_LEAVE' ? PAGE_LEAVE_GRACE_MS : 1_000);
    const result = await this.redis.evalVersioned(
      'admission-relinquish-v1',
      this.RELINQUISH_SCRIPT,
      [
        this.stateKey(gateId, ticketId),
        this.key(gateId, 'admitted'),
        this.tokenKey(gateId, ticketId),
        this.tokenIndexKey(lease.tokenHash),
        this.leaseKey(gateId, ticketId),
        this.confirmationKey(gateId, ticketId),
        this.pendingReleaseLeaseKey(gateId, ticketId),
        this.pendingReleaseBrowserKey(gateId, ticketId),
        this.pendingReleaseIndexKey(gateId),
      ],
      [
        lease.leaseId,
        'CLOSED',
        ticketId,
        String(TICKET_TTL_MS),
        mode,
        browserInstanceId,
        String(dueAt),
      ],
    );
    if (result === 1) await this.grantWaiting(gateId);
  }

  async heartbeat(
    userId: string,
    sessionId: string,
    ticketId: string,
    browserInstanceId: string,
    token: string | undefined,
    gateId = 'checkout',
  ): Promise<void> {
    if (!this.enabled) return;
    await this.ensureRedis();
    const ticket = await this.readTicket(gateId, ticketId);
    if (!ticket || ticket.userId !== userId || ticket.sessionId !== sessionId || ticket.state !== 'ADMITTED') return;
    const lease = await this.ownedLease(token, userId, sessionId, ticketId, gateId);
    await this.redis.evalVersioned(
      'admission-heartbeat-v1',
      this.HEARTBEAT_SCRIPT,
      [
        this.stateKey(gateId, ticketId),
        this.leaseKey(gateId, ticketId),
        this.pendingReleaseLeaseKey(gateId, ticketId),
        this.pendingReleaseBrowserKey(gateId, ticketId),
        this.pendingReleaseIndexKey(gateId),
      ],
      [lease.leaseId, ticketId, browserInstanceId],
    );
  }

  async beginConfirmation(lease: AdmissionLease | undefined): Promise<void> {
    if (!lease || !this.enabled) return;
    const result = await this.redis.evalVersioned(
      'admission-confirmation-begin-v1',
      this.CONFIRMATION_BEGIN_SCRIPT,
      [
        this.stateKey(lease.gateId, lease.ticketId),
        this.leaseKey(lease.gateId, lease.ticketId),
        this.confirmationKey(lease.gateId, lease.ticketId),
      ],
      [lease.leaseId, String(TICKET_TTL_MS)],
    );
    if (result !== 1) throw new AdmissionInvalidError();
  }

  async finishConfirmation(lease: AdmissionLease | undefined): Promise<void> {
    if (!lease || !this.enabled || !this.redis.isReady()) return;
    await this.redis.evalVersioned(
      'admission-confirmation-finish-v1',
      this.CONFIRMATION_FINISH_SCRIPT,
      [this.confirmationKey(lease.gateId, lease.ticketId), this.leaseKey(lease.gateId, lease.ticketId)],
      [lease.leaseId],
    );
    if ((await this.redis.getValue(this.pendingReleaseLeaseKey(lease.gateId, lease.ticketId))) === lease.leaseId) {
      await this.releaseLease(lease, 'RELINQUISHED');
    }
  }

  async verify(
    token: string | undefined,
    userId: string,
    sessionId: string,
    gateId = 'checkout',
  ): Promise<AdmissionLease> {
    if (!this.enabled)
      return {
        ticketId: 'disabled',
        gateId,
        userId,
        sessionId,
        leaseId: 'disabled',
        tokenHash: 'disabled',
        expiresAt: Number.MAX_SAFE_INTEGER,
      };
    await this.ensureRedis();
    const hash = this.tokenHash(token ?? '');
    const record = await this.redis.getJson<TokenRecord>(this.tokenIndexKey(hash));
    if (!record) throw new AdmissionInvalidError();
    const lease = await this.ownedLease(token, userId, sessionId, record.ticketId, gateId);
    const budget = await this.redis.consumeRateLimit(
      `admission:token-budget:${hash}`,
      Number(process.env.TRAFFIC_ADMISSION_REQUESTS_PER_TOKEN ?? 30),
      1_000,
    );
    if (!budget.available) throw new AdmissionUnavailableError();
    if (!budget.allowed) throw new AdmissionRateLimitError(budget.retryAfterSeconds);
    return lease;
  }
}
