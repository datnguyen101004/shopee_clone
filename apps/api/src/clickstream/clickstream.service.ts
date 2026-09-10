import { createHash, createHmac, randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  CLICKSTREAM_EVENT_TYPES,
  parseClickstreamEvent,
  type ClickstreamAcceptanceResponse,
  type ClickstreamEvent,
  type ClickstreamEventType,
  type ClickstreamExportEvent,
} from '@shopee-clone/contracts';

import { PrismaService } from '../prisma/prisma.service';
import { CLICKSTREAM_CONFIG, type ClickstreamConfig } from './clickstream.config';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUniqueError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
    )
    .join(',')}}`;
}
function hash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

@Injectable()
export class ClickstreamService {
  private readonly logger = new Logger(ClickstreamService.name);
  private readonly counters = {
    accepted: 0,
    delivered: 0,
    retried: 0,
    rejected: 0,
    terminal: 0,
    dropped: 0,
    lastErrorAt: null as Date | null,
  };

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLICKSTREAM_CONFIG) private readonly config: ClickstreamConfig,
  ) {}

  async capture(
    input: unknown,
    identity?: { userId?: string; authSessionId?: string },
  ): Promise<ClickstreamAcceptanceResponse> {
    if (!this.config.captureEnabled) {
      const candidateEventId =
        typeof input === 'object' &&
        input !== null &&
        'eventId' in input &&
        typeof input.eventId === 'string'
          ? input.eventId
          : null;
      const eventId = candidateEventId && UUID.test(candidateEventId) ? candidateEventId : randomUUID();
      return { eventId, disposition: 'disabled' };
    }
    const event = parseClickstreamEvent(input);
    if (!event)
      throw new BadRequestException({
        code: 'CLICKSTREAM_VALIDATION_ERROR',
        detail: 'The clickstream event is invalid.',
      });
    if (
      event.eventType === 'favorite_changed' ||
      event.eventType === 'cart_changed' ||
      event.eventType === 'order_completed'
    )
      throw new BadRequestException({
        code: 'CLICKSTREAM_SERVER_ONLY_EVENT',
        detail: 'This clickstream event must be emitted by the application server.',
      });
    return this.accept(event, identity);
  }

  async captureAuthoritativeOutcome(input: {
    eventType: 'favorite_changed' | 'cart_changed' | 'order_completed';
    surface: 'favorite' | 'cart' | 'checkout' | 'order_history';
    userId: string;
    authSessionId?: string;
    productId?: string;
    placement?: string;
    properties: Record<string, string | number | boolean | null>;
    requestId?: string;
  }): Promise<ClickstreamAcceptanceResponse | null> {
    if (!this.config.captureEnabled) return null;
    const event = parseClickstreamEvent({
      eventId: randomUUID(),
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      sessionId:
        input.authSessionId && UUID.test(input.authSessionId)
          ? input.authSessionId
          : randomUUID(),
      eventType: input.eventType,
      surface: input.surface,
      productId: input.productId,
      placement: input.placement,
      requestId: input.requestId,
      properties: input.properties,
    });
    if (!event) {
      this.recordFailure('authoritative_contract');
      return null;
    }
    try {
      return await this.accept(event, { userId: input.userId, authSessionId: input.authSessionId });
    } catch {
      this.recordFailure('authoritative_persistence');
      return null;
    }
  }

  private async accept(
    event: ClickstreamEvent,
    identity?: { userId?: string; authSessionId?: string },
  ): Promise<ClickstreamAcceptanceResponse> {
    const isAuthoritative =
      event.eventType === 'favorite_changed' ||
      event.eventType === 'cart_changed' ||
      event.eventType === 'order_completed';
    const policyKey = `${event.surface}:${event.eventType}`;
    const rate =
      this.config.sampling[policyKey] ??
      this.config.sampling[event.eventType] ??
      (isAuthoritative ? this.config.authoritativeSampleRate : this.config.defaultSampleRate);
    if (!this.sample(event.eventId, policyKey, rate))
      return { eventId: event.eventId, disposition: 'sampled_out' };
    if (!this.config.pseudonymSecret)
      throw new Error('Clickstream pseudonymization is not configured');
    const payload = this.exportPayload(event, identity);
    const payloadHash = hash(payload);
    const now = new Date();
    try {
      await this.prisma.clickstreamOutbox.create({
        data: {
          eventId: event.eventId,
          schemaVersion: event.schemaVersion,
          eventType: event.eventType,
          surface: event.surface,
          payload: payload as object,
          payloadHash,
          acceptedAt: now,
          expiresAt: new Date(now.getTime() + this.config.retentionSeconds * 1_000),
        },
      });
      this.counters.accepted += 1;
      return { eventId: event.eventId, disposition: 'accepted' };
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      const existing = await this.prisma.clickstreamOutbox.findUnique({
        where: { eventId: event.eventId },
        select: { payloadHash: true },
      });
      if (existing?.payloadHash === payloadHash)
        return { eventId: event.eventId, disposition: 'idempotent' };
      throw new ConflictException({
        code: 'CLICKSTREAM_EVENT_CONFLICT',
        detail: 'Event ID is already associated with different content.',
      });
    }
  }

  private exportPayload(
    event: ClickstreamEvent,
    identity?: { userId?: string; authSessionId?: string },
  ): ClickstreamExportEvent {
    const pseudonym = (prefix: string, value: string): string =>
      createHmac('sha256', this.config.pseudonymSecret!)
        .update(`${prefix}:${value}`, 'utf8')
        .digest('hex');
    const { sessionId, ...withoutSession } = event;
    return {
      ...withoutSession,
      sessionPseudonym: pseudonym('session', sessionId),
      buyerPseudonym: identity?.userId ? pseudonym('buyer', identity.userId) : null,
      pseudonymKeyId: this.config.pseudonymKeyId,
    };
  }
  private sample(eventId: string, policyKey: string, rate: number): boolean {
    if (rate <= 0) return false;
    if (rate >= 1) return true;
    const bucket =
      Number.parseInt(
        createHash('sha256').update(`${eventId}:${policyKey}`).digest('hex').slice(0, 12),
        16,
      ) / 0x1000000000000;
    return bucket < rate;
  }
  private recordFailure(code: string): void {
    this.counters.lastErrorAt = new Date();
    this.logger.warn(`clickstream capture failed: ${code}`);
  }

  getMetrics() {
    return { ...this.counters, lastErrorAt: this.counters.lastErrorAt?.toISOString() ?? null };
  }
  isKnownEventType(value: string): value is ClickstreamEventType {
    return (CLICKSTREAM_EVENT_TYPES as readonly string[]).includes(value);
  }
}
