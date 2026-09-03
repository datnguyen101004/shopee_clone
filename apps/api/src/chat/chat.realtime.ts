import { randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  ConnectedSocket,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import { CHAT_VERSION } from '@shopee-clone/contracts';
import type { ChatOutboxHealthResponse } from '@shopee-clone/contracts';
import type { Server, Socket } from 'socket.io';
import { Prisma } from '../generated/prisma/client';
import { ChatOutboxStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AUTH_CONFIG, type AuthConfig } from '../auth/auth.config';
import { CHAT_CONFIG, type ChatConfig } from './chat.config';

type Ticket = { userId: string; sessionId: string; expiresAt: number };

@Injectable()
export class ChatTicketService {
  private readonly tickets = new Map<string, Ticket>();

  issue(userId: string, sessionId: string, ttlSeconds = 60): { ticket: string; expiresAt: Date } {
    const ticket = `${randomUUID()}-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);
    this.tickets.set(ticket, { userId, sessionId, expiresAt: expiresAt.getTime() });
    return { ticket, expiresAt };
  }

  consume(ticket: string): Ticket | null {
    const value = this.tickets.get(ticket);
    if (!value || value.expiresAt <= Date.now()) {
      this.tickets.delete(ticket);
      return null;
    }
    this.tickets.delete(ticket);
    return value;
  }
}

@Injectable()
export class ChatPresenceService {
  private readonly connections = new Map<string, number>();
  private readonly lastActivity = new Map<string, number>();
  private readonly inactiveTimers = new Map<string, NodeJS.Timeout>();
  private inactiveHandler: ((userId: string) => void) | undefined;

  constructor(
    @Inject(CHAT_CONFIG)
    private readonly config: ChatConfig = {
      ticketTtlSeconds: 60,
      presenceLeaseSeconds: 45,
      outboxBatch: 50,
      messageRatePerMinute: 30,
      outboxReadinessMaxAgeSeconds: 60,
    },
  ) {}

  onInactive(handler: (userId: string) => void): void {
    this.inactiveHandler = handler;
  }
  connect(userId: string): void {
    const timer = this.inactiveTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.inactiveTimers.delete(userId);
    }
    this.connections.set(userId, (this.connections.get(userId) ?? 0) + 1);
    this.lastActivity.set(userId, Date.now());
  }
  disconnect(userId: string): void {
    const count = (this.connections.get(userId) ?? 1) - 1;
    if (count > 0) {
      this.connections.set(userId, count);
      return;
    }
    this.connections.delete(userId);
    const existing = this.inactiveTimers.get(userId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.inactiveTimers.delete(userId);
      if ((this.connections.get(userId) ?? 0) > 0) return;
      this.lastActivity.delete(userId);
      this.inactiveHandler?.(userId);
    }, 5_000);
    timer.unref?.();
    this.inactiveTimers.set(userId, timer);
  }
  touch(userId: string): void {
    this.lastActivity.set(userId, Date.now());
  }
  state(userId: string): 'ACTIVE' | 'INACTIVE' {
    if ((this.connections.get(userId) ?? 0) > 0)
      return Date.now() - (this.lastActivity.get(userId) ?? 0) <
        this.config.presenceLeaseSeconds * 1_000
        ? 'ACTIVE'
        : 'INACTIVE';
    return this.inactiveTimers.has(userId) ? 'ACTIVE' : 'INACTIVE';
  }
}

@WebSocketGateway({ namespace: '/chat', cors: { origin: true, credentials: true } })
export class ChatRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatRealtimeGateway.name);

  constructor(
    @Inject(ChatTicketService) private readonly tickets: ChatTicketService,
    @Inject(ChatPresenceService) private readonly presence: ChatPresenceService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    this.presence.onInactive((userId) => {
      void this.broadcastPresence(userId, 'INACTIVE');
    });
  }

  handleConnection(@ConnectedSocket() client: Socket): void {
    const origin = client.handshake.headers.origin;
    if (origin && !this.config.allowedOrigins.includes(origin)) {
      client.disconnect(true);
      return;
    }
    const raw = client.handshake.auth?.ticket;
    const ticket = typeof raw === 'string' ? this.tickets.consume(raw) : null;
    if (!ticket) {
      client.disconnect(true);
      return;
    }
    void this.acceptConnection(client, ticket);
  }

  private async acceptConnection(client: Socket, ticket: Ticket): Promise<void> {
    if (!(await this.auth.isSessionActive(ticket.userId, ticket.sessionId))) {
      client.disconnect(true);
      return;
    }
    client.data.userId = ticket.userId;
    client.data.sessionId = ticket.sessionId;
    client.join(`chat-user:${ticket.userId}`);
    this.presence.connect(ticket.userId);
    client.on('chat.activity', () => {
      void this.auth
        .isSessionActive(ticket.userId, ticket.sessionId)
        .then((active) => {
          if (!active) {
            client.disconnect(true);
            return;
          }
          // A connected socket can outlive the presence lease. Refreshing the
          // lease must also re-project ACTIVE so peers recover from INACTIVE
          // without requiring a reconnect.
          const wasActive = this.presence.state(ticket.userId) === 'ACTIVE';
          this.presence.touch(ticket.userId);
          if (!wasActive) void this.broadcastPresence(ticket.userId, 'ACTIVE');
        })
        .catch(() => client.disconnect(true));
    });
    void this.broadcastPresence(ticket.userId, 'ACTIVE');
    this.logger.debug(`chat socket connected ${ticket.userId}`);
  }

  handleDisconnect(client: Socket): void {
    if (typeof client.data.userId !== 'string') return;
    this.presence.disconnect(client.data.userId);
  }

  private async broadcastPresence(userId: string, presence: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    try {
      const memberships = await this.prisma.chatMembership.findMany({
        where: { userId },
        select: {
          conversation: { select: { participantLowUserId: true, participantHighUserId: true } },
        },
      });
      const recipients = new Set<string>();
      for (const membership of memberships) {
        const other =
          membership.conversation.participantLowUserId === userId
            ? membership.conversation.participantHighUserId
            : membership.conversation.participantLowUserId;
        recipients.add(other);
      }
      for (const recipient of recipients)
        this.emitToUser(recipient, 'chat.presence.updated', {
          eventVersion: CHAT_VERSION,
          type: 'chat.presence.updated',
          userId,
          presence,
        });
    } catch {
      this.logger.warn('chat presence projection failed');
    }
  }

  emitToUser(userId: string, eventType: string, payload: unknown): void {
    this.server?.to(`chat-user:${userId}`).emit(eventType, payload);
  }
}

@Injectable()
export class ChatOutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly logger = new Logger(ChatOutboxDispatcher.name);
  private readonly counters = {
    claimed: 0,
    sent: 0,
    failed: 0,
    polls: 0,
    lastPollAt: null as Date | null,
    lastErrorAt: null as Date | null,
  };

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChatRealtimeGateway) private readonly gateway: ChatRealtimeGateway,
    @Inject(CHAT_CONFIG) private readonly config: ChatConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), 1_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async flush(limit = this.config.outboxBatch): Promise<void> {
    if (this.running) return;
    this.running = true;
    const now = new Date();
    this.counters.polls += 1;
    this.counters.lastPollAt = now;
    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            recipient_user_id: string;
            event_type: string;
            payload: unknown;
            attempt_count: number;
          }>
        >(Prisma.sql`
          SELECT id, recipient_user_id, event_type, payload, attempt_count
          FROM chat_user_outbox
          WHERE ((status = 'pending' AND attempt_count < 8) OR (status = 'failed' AND attempt_count < 8 AND COALESCE(next_attempt_at, ${now}) <= ${now}) OR (status = 'processing' AND attempt_count < 8 AND locked_until < ${now}))
            AND (locked_until IS NULL OR locked_until < ${now})
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        `);
        for (const row of rows) {
          await tx.chatOutbox.update({
            where: { id: row.id },
            data: {
              status: ChatOutboxStatus.PROCESSING,
              lockedUntil: new Date(now.getTime() + 15_000),
              attemptCount: { increment: 1 },
            },
          });
        }
        return rows;
      });
      this.counters.claimed += rows.length;
      for (const row of rows) {
        try {
          this.gateway.emitToUser(row.recipient_user_id, row.event_type, row.payload);
          await this.prisma.chatOutbox.update({
            where: { id: row.id },
            data: { status: ChatOutboxStatus.SENT, lockedUntil: null, lastError: null },
          });
          this.counters.sent += 1;
        } catch (error) {
          this.counters.failed += 1;
          this.counters.lastErrorAt = new Date();
          const attempts = row.attempt_count + 1;
          await this.prisma.chatOutbox.update({
            where: { id: row.id },
            data: {
              status: attempts >= 8 ? ChatOutboxStatus.FAILED : ChatOutboxStatus.PENDING,
              lockedUntil: null,
              nextAttemptAt: new Date(Date.now() + Math.min(60_000, 1_000 * 2 ** attempts)),
              lastError: error instanceof Error ? error.message.slice(0, 500) : 'dispatch failed',
            },
          });
          this.logger.warn('chat outbox dispatch failed');
        }
      }
    } catch {
      this.counters.lastErrorAt = new Date();
      this.logger.warn('chat outbox poll failed');
    } finally {
      this.running = false;
    }
  }

  async readiness(): Promise<ChatOutboxHealthResponse> {
    const now = new Date();
    const metrics = this.metrics();
    try {
      const [row] = await this.prisma.$queryRaw<
        Array<{
          pending: bigint;
          processing: bigint;
          failed: bigint;
          oldest_pending_at: Date | null;
        }>
      >(Prisma.sql`
        SELECT
          count(*) FILTER (WHERE status = 'pending')::bigint AS pending,
          count(*) FILTER (WHERE status = 'processing')::bigint AS processing,
          count(*) FILTER (WHERE status = 'failed')::bigint AS failed,
          min(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_at
        FROM chat_user_outbox
      `);
      const pending = Number(row?.pending ?? 0n);
      const processing = Number(row?.processing ?? 0n);
      const failed = Number(row?.failed ?? 0n);
      const oldestPendingAgeSeconds = row?.oldest_pending_at
        ? Math.max(
            0,
            Math.floor((now.getTime() - new Date(row.oldest_pending_at).getTime()) / 1_000),
          )
        : null;
      const pollFresh =
        metrics.lastPollAt !== null &&
        now.getTime() - new Date(metrics.lastPollAt).getTime() <=
          this.config.outboxReadinessMaxAgeSeconds * 1_000;
      const ready =
        pollFresh &&
        failed === 0 &&
        (oldestPendingAgeSeconds === null ||
          oldestPendingAgeSeconds <= this.config.outboxReadinessMaxAgeSeconds);
      return {
        ready,
        pending,
        processing,
        failed,
        oldestPendingAgeSeconds,
        claimed: metrics.claimed,
        sent: metrics.sent,
        failedAttempts: metrics.failed,
        polls: metrics.polls,
        lastPollAt: metrics.lastPollAt,
        lastErrorAt: metrics.lastErrorAt,
      };
    } catch {
      return {
        ready: false,
        pending: 0,
        processing: 0,
        failed: 0,
        oldestPendingAgeSeconds: null,
        claimed: metrics.claimed,
        sent: metrics.sent,
        failedAttempts: metrics.failed,
        polls: metrics.polls,
        lastPollAt: metrics.lastPollAt,
        lastErrorAt: now.toISOString(),
      };
    }
  }

  metrics(): {
    claimed: number;
    sent: number;
    failed: number;
    polls: number;
    lastPollAt: string | null;
    lastErrorAt: string | null;
  } {
    return {
      claimed: this.counters.claimed,
      sent: this.counters.sent,
      failed: this.counters.failed,
      polls: this.counters.polls,
      lastPollAt: this.counters.lastPollAt?.toISOString() ?? null,
      lastErrorAt: this.counters.lastErrorAt?.toISOString() ?? null,
    };
  }
}
