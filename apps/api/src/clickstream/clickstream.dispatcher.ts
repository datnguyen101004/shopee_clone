import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  parseClickstreamAcknowledgement,
  type ClickstreamBatch,
  type ClickstreamExportEvent,
  type ClickstreamHealthResponse,
} from '@shopee-clone/contracts';
import { Prisma } from '../generated/prisma/client';
import { ClickstreamOutboxStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CLICKSTREAM_CONFIG, type ClickstreamConfig } from './clickstream.config';

export interface ClickstreamHttpResponse {
  status: number;
  body: unknown;
}
export interface ClickstreamHttpAdapter {
  post(
    url: string,
    body: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<ClickstreamHttpResponse>;
}

@Injectable()
export class FetchClickstreamHttpAdapter implements ClickstreamHttpAdapter {
  async post(
    url: string,
    body: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<ClickstreamHttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        body,
        headers,
        signal: controller.signal,
        redirect: 'error',
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      return { status: response.status, body: parsed };
    } finally {
      clearTimeout(timer);
    }
  }
}

type ClaimedRow = {
  id: string;
  event_id: string;
  payload: ClickstreamExportEvent;
  attempt_count: number;
  expires_at: Date;
  lease_owner: string;
  accepted_at: Date;
};
type DispatchResult = {
  accepted: number;
  rejected: number;
  retried: number;
  terminal: number;
  dropped: number;
};

function stableError(code: string): string {
  return code.replace(/[^A-Z0-9_]/g, '_').slice(0, 64) || 'DISPATCH_FAILED';
}
function backoff(config: ClickstreamConfig, attempts: number): number {
  const exponential = Math.min(
    config.retryCapMs,
    config.retryBaseMs * 2 ** Math.max(0, attempts - 1),
  );
  return Math.floor(Math.random() * Math.max(1, exponential));
}
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

@Injectable()
export class ClickstreamDispatcher implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly logger = new Logger(ClickstreamDispatcher.name);
  private readonly metrics = {
    accepted: 0,
    delivered: 0,
    retried: 0,
    rejected: 0,
    terminal: 0,
    dropped: 0,
    lastPollAt: null as Date | null,
    lastErrorAt: null as Date | null,
    deliveryLatencies: [] as number[],
  };

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLICKSTREAM_CONFIG) private readonly config: ClickstreamConfig,
    @Inject(FetchClickstreamHttpAdapter) private readonly http: ClickstreamHttpAdapter,
  ) {}

  onModuleInit(): void {
    if (!this.config.dispatchEnabled) return;
    this.timer = setInterval(() => void this.flush(), this.config.pollIntervalMs);
    this.timer.unref?.();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async flush(limit = this.config.batchSize): Promise<DispatchResult> {
    if (this.running) return { accepted: 0, rejected: 0, retried: 0, terminal: 0, dropped: 0 };
    this.running = true;
    this.metrics.lastPollAt = new Date();
    try {
      const claimed = await this.claim(Math.min(limit, this.config.batchSize));
      const rows = claimed.rows;
      if (rows.length === 0)
        return { accepted: 0, rejected: 0, retried: 0, terminal: 0, dropped: claimed.dropped };
      if (!this.config.endpoint || !this.config.hmacKeyId || !this.config.hmacSecret) {
        await Promise.all(rows.map((row) => this.transition(row, 'retry', 'NOT_CONFIGURED')));
        return { accepted: 0, rejected: 0, retried: rows.length, terminal: 0, dropped: claimed.dropped };
      }
      const batchId = randomUUID();
      const body: ClickstreamBatch = {
        contractVersion: '1',
        batchId,
        producer: 'shopee-clone-api',
        sentAt: new Date().toISOString(),
        events: rows.map((row) => row.payload),
      };
      const serializedBody = JSON.stringify(body);
      const sentAt = new Date().toISOString();
      const bodyHash = createHash('sha256').update(serializedBody, 'utf8').digest('hex');
      const signature = createHmac('sha256', this.config.hmacSecret)
        .update(`${sentAt}.${bodyHash}`, 'utf8')
        .digest('hex');
      let response: ClickstreamHttpResponse;
      try {
        response = await this.http.post(
          this.config.endpoint,
          serializedBody,
          {
            'content-type': 'application/json',
            'X-Clickstream-Key-Id': this.config.hmacKeyId,
            'X-Clickstream-Timestamp': sentAt,
            'X-Clickstream-Signature': signature,
          },
          this.config.timeoutMs,
        );
      } catch {
        response = { status: 599, body: null };
      }
      const eventIds = rows.map((row) => row.event_id);
      if (response.status !== 200 && response.status !== 202) {
        const retry = response.status === 599 || isTransientStatus(response.status);
        await Promise.all(
          rows.map((row) =>
            this.transition(row, retry ? 'retry' : 'terminal', `HTTP_${response.status}`),
          ),
        );
        return {
          accepted: 0,
          rejected: 0,
          retried: retry ? rows.length : 0,
          terminal: retry ? 0 : rows.length,
          dropped: claimed.dropped,
        };
      }
      const ack = parseClickstreamAcknowledgement(response.body, batchId, eventIds);
      if (!ack) {
        await Promise.all(rows.map((row) => this.transition(row, 'retry', 'AMBIGUOUS_ACK')));
        return { accepted: 0, rejected: 0, retried: rows.length, terminal: 0, dropped: claimed.dropped };
      }
      const accepted = new Set(ack.acceptedEventIds);
      const rejected = new Map(ack.rejectedEvents.map((item) => [item.eventId, item]));
      this.metrics.rejected += rejected.size;
      await Promise.all(
        rows.map(async (row) => {
          if (accepted.has(row.event_id)) return this.transition(row, 'delivered', null);
          const rejection = rejected.get(row.event_id);
          return this.transition(
            row,
            rejection?.retryable ? 'retry' : 'terminal',
            stableError(`REJECTED_${rejection?.code ?? 'REJECTED'}`),
          );
        }),
      );
      return {
        accepted: accepted.size,
        rejected: rejected.size,
        retried: [...rejected.values()].filter((item) => item.retryable).length,
        terminal: [...rejected.values()].filter((item) => !item.retryable).length,
        dropped: claimed.dropped,
      };
    } catch {
      this.metrics.lastErrorAt = new Date();
      this.logger.warn('clickstream dispatcher poll failed');
      return { accepted: 0, rejected: 0, retried: 0, terminal: 0, dropped: 0 };
    } finally {
      this.running = false;
    }
  }

  private async claim(limit: number): Promise<{ rows: ClaimedRow[]; dropped: number }> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + this.config.leaseSeconds * 1_000);
    const owner = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const expired = await tx.clickstreamOutbox.updateMany({
        where: {
          status: { in: [ClickstreamOutboxStatus.PENDING, ClickstreamOutboxStatus.LEASED] },
          OR: [{ expiresAt: { lte: now } }, { attemptCount: { gte: this.config.maxAttempts } }],
        },
        data: {
          status: ClickstreamOutboxStatus.DROPPED,
          terminalAt: now,
          leaseOwner: null,
          leaseUntil: null,
          lastErrorCode: 'RETENTION_OR_ATTEMPT_LIMIT',
        },
      });
      this.metrics.dropped += expired.count;
      const rows = await tx.$queryRaw<ClaimedRow[]>(Prisma.sql`
        SELECT id, event_id, payload, attempt_count, expires_at, accepted_at,
          ${owner}::text AS lease_owner
        FROM clickstream_outbox
        WHERE ((status = 'pending' AND next_attempt_at <= ${now})
          OR (status = 'leased' AND lease_until < ${now}))
          AND expires_at > ${now} AND attempt_count < ${this.config.maxAttempts}
        ORDER BY accepted_at ASC FOR UPDATE SKIP LOCKED LIMIT ${limit}`);
      for (const row of rows)
        await tx.clickstreamOutbox.update({
          where: { id: row.id },
          data: {
            status: ClickstreamOutboxStatus.LEASED,
            leaseOwner: owner,
            leaseUntil,
            attemptCount: { increment: 1 },
          },
        });
      return { rows, dropped: expired.count };
    });
  }

  private async transition(
    row: ClaimedRow,
    result: 'delivered' | 'retry' | 'terminal',
    errorCode: string | null,
  ): Promise<void> {
    const now = new Date();
    const shouldDrop = row.expires_at <= now || row.attempt_count + 1 >= this.config.maxAttempts;
    const where = {
      id: row.id,
      status: ClickstreamOutboxStatus.LEASED,
      leaseOwner: row.lease_owner,
    };
    if (result === 'delivered') {
      const started =
        row.accepted_at?.getTime() ?? this.metrics.lastPollAt?.getTime() ?? now.getTime();
      const update = await this.prisma.clickstreamOutbox.updateMany({
        where,
        data: {
          status: ClickstreamOutboxStatus.DELIVERED,
          deliveredAt: now,
          leaseOwner: null,
          leaseUntil: null,
          lastErrorCode: null,
        },
      });
      if (update.count > 0) {
        this.metrics.delivered += 1;
        this.metrics.deliveryLatencies.push(Math.max(0, now.getTime() - started));
      }
      return;
    }
    const terminal = result === 'terminal' || shouldDrop;
    const status = terminal
      ? shouldDrop
        ? ClickstreamOutboxStatus.DROPPED
        : ClickstreamOutboxStatus.TERMINAL
      : ClickstreamOutboxStatus.PENDING;
    const update = await this.prisma.clickstreamOutbox.updateMany({
      where,
      data: {
        status,
        nextAttemptAt: terminal
          ? now
          : new Date(now.getTime() + backoff(this.config, row.attempt_count + 1)),
        leaseOwner: null,
        leaseUntil: null,
        terminalAt: terminal ? now : null,
        lastErrorCode: errorCode,
      },
    });
    if (update.count === 0) return;
    if (status === ClickstreamOutboxStatus.PENDING) this.metrics.retried += 1;
    else if (status === ClickstreamOutboxStatus.TERMINAL) this.metrics.terminal += 1;
    else this.metrics.dropped += 1;
  }

  async health(): Promise<ClickstreamHealthResponse> {
    const empty: Record<string, number> = {
      PENDING: 0,
      LEASED: 0,
      DELIVERED: 0,
      TERMINAL: 0,
      DROPPED: 0,
    };
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          status: string;
          count: bigint;
          oldest: Date | null;
          retries: bigint;
          rejected: bigint;
        }>
      >(
        Prisma.sql`SELECT status, count(*)::bigint AS count, min(accepted_at) AS oldest,
          coalesce(sum(greatest(attempt_count - 1, 0)), 0)::bigint AS retries,
          count(*) FILTER (WHERE last_error_code LIKE 'REJECTED_%')::bigint AS rejected
          FROM clickstream_outbox GROUP BY status`,
      );
      let oldest: Date | null = null;
      let persistedRetries = 0;
      let persistedRejected = 0;
      for (const row of rows) {
        if (row.status.toUpperCase() in empty) empty[row.status.toUpperCase()] = Number(row.count);
        persistedRetries += Number(row.retries ?? 0);
        persistedRejected += Number(row.rejected ?? 0);
        if (
          (row.status === 'pending' || row.status === 'leased') &&
          row.oldest &&
          (!oldest || row.oldest < oldest)
        )
          oldest = row.oldest;
      }
      const now = new Date();
      const backlogAge = oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 1_000))
        : null;
      const configured = Boolean(
        this.config.endpoint && this.config.hmacKeyId && this.config.hmacSecret,
      );
      const pollFresh =
        this.metrics.lastPollAt !== null &&
        now.getTime() - this.metrics.lastPollAt.getTime() <=
          this.config.readinessMaxAgeSeconds * 1_000;
      const latencies = [...this.metrics.deliveryLatencies].sort((a, b) => a - b);
      return {
        ready:
          !this.config.dispatchEnabled ||
          (configured &&
            pollFresh &&
            (backlogAge === null || backlogAge <= this.config.readinessMaxAgeSeconds)),
        configured,
        captureEnabled: this.config.captureEnabled,
        dispatchEnabled: this.config.dispatchEnabled,
        statusCounts: empty as ClickstreamHealthResponse['statusCounts'],
        oldestEligibleBacklogAgeSeconds: backlogAge,
        accepted: Object.values(empty).reduce((sum, count) => sum + count, 0),
        delivered: empty.DELIVERED ?? 0,
        retried: persistedRetries,
        rejected: persistedRejected,
        terminal: empty.TERMINAL ?? 0,
        dropped: empty.DROPPED ?? 0,
        deliveryLatencyMs: {
          count: latencies.length,
          average: latencies.length
            ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
            : null,
          p95: latencies.length
            ? (latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ??
              null)
            : null,
        },
        lastPollAt: this.metrics.lastPollAt?.toISOString() ?? null,
        lastErrorAt: this.metrics.lastErrorAt?.toISOString() ?? null,
      };
    } catch {
      return {
        ready: false,
        configured: false,
        captureEnabled: this.config.captureEnabled,
        dispatchEnabled: this.config.dispatchEnabled,
        statusCounts: empty as ClickstreamHealthResponse['statusCounts'],
        oldestEligibleBacklogAgeSeconds: null,
        accepted: this.metrics.accepted,
        delivered: this.metrics.delivered,
        retried: this.metrics.retried,
        rejected: this.metrics.rejected,
        terminal: this.metrics.terminal,
        dropped: this.metrics.dropped,
        deliveryLatencyMs: { count: 0, average: null, p95: null },
        lastPollAt: this.metrics.lastPollAt?.toISOString() ?? null,
        lastErrorAt: new Date().toISOString(),
      };
    }
  }

  async replay(
    status: 'TERMINAL' | 'DROPPED',
    ageSeconds: number,
    limit: number,
  ): Promise<{ scheduled: number; status: string }> {
    if (
      !Number.isSafeInteger(ageSeconds) ||
      ageSeconds < 0 ||
      ageSeconds > this.config.replayMaxAgeSeconds
    )
      throw new Error('Invalid replay age');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > this.config.replayMaxRows)
      throw new Error('Invalid replay limit');
    const cutoff = new Date(Date.now() - ageSeconds * 1_000);
    const dbStatus =
      status === 'TERMINAL' ? ClickstreamOutboxStatus.TERMINAL : ClickstreamOutboxStatus.DROPPED;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM clickstream_outbox WHERE status = ${dbStatus} AND accepted_at >= ${cutoff} ORDER BY accepted_at ASC LIMIT ${limit}`,
    );
    if (ids.length === 0) return { scheduled: 0, status };
    const now = new Date();
    const update = await this.prisma.clickstreamOutbox.updateMany({
      where: { id: { in: ids.map((item) => item.id) }, status: dbStatus },
      data: {
        status: ClickstreamOutboxStatus.PENDING,
        attemptCount: 0,
        nextAttemptAt: now,
        terminalAt: null,
        leaseOwner: null,
        leaseUntil: null,
        expiresAt: new Date(now.getTime() + this.config.retentionSeconds * 1_000),
        lastErrorCode: 'REPLAY_SCHEDULED',
      },
    });
    this.logger.log(`clickstream replay scheduled ${update.count} records`);
    return { scheduled: update.count, status };
  }
}
