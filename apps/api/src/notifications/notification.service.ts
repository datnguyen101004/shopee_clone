import { randomUUID } from 'node:crypto';

import {
  NOTIFICATION_CATEGORY_BY_TYPE,
  parseNotificationListQuery,
  type NotificationCategory,
  type NotificationListResponse,
  type NotificationMetadata,
  type NotificationType,
  type NotificationUnreadCountResponse,
  type ArchiveNotificationResponse,
  type MarkAllNotificationsReadResponse,
  type MarkNotificationReadResponse,
  type NotificationPreferencesResponse,
  type UpdateNotificationPreferenceRequest,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  compileNotificationEmail,
  createNotificationEmailTransporter,
  type NotificationEmailTransporter,
} from './notification-email.adapter';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationRepository } from './notification.repository';
import {
  NotificationUnavailableError,
  NotificationValidationError,
} from './notification.errors';

export const NOTIFICATION_EMAIL_TRANSPORTER = Symbol('NOTIFICATION_EMAIL_TRANSPORTER');

export interface NotificationRecipientInput {
  userId: string;
  roleTag: string;
  title: string;
  body: string;
  metadata: NotificationMetadata;
}

export interface NotifyEventInput {
  type: NotificationType;
  referenceKey: string;
  recipients: NotificationRecipientInput[];
}

const MAX_EMAIL_ATTEMPTS = 8;

@Injectable()
export class NotificationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationRepository) private readonly repository: NotificationRepository,
    @Inject(NotificationPreferenceService)
    private readonly preferences: NotificationPreferenceService,
    @Inject(NOTIFICATION_EMAIL_TRANSPORTER)
    private readonly emailTransporter: NotificationEmailTransporter,
  ) {}

  list(
    userId: string,
    query: Record<string, unknown>,
  ): Promise<NotificationListResponse> {
    const parsed = parseNotificationListQuery(query);
    if (!parsed) throw new NotificationValidationError(['category', 'limit', 'cursor']);
    return this.repository.list(userId, parsed.category, parsed.limit, parsed.cursor);
  }

  unreadCount(userId: string): Promise<NotificationUnreadCountResponse> {
    return this.repository.unreadCount(userId);
  }

  markRead(userId: string, notificationId: string): Promise<MarkNotificationReadResponse> {
    return this.repository.markRead(userId, notificationId);
  }

  markAllRead(userId: string): Promise<MarkAllNotificationsReadResponse> {
    return this.repository.markAllRead(userId);
  }

  archive(userId: string, notificationId: string): Promise<ArchiveNotificationResponse> {
    return this.repository.archive(userId, notificationId);
  }

  listPreferences(userId: string): Promise<NotificationPreferencesResponse> {
    return this.preferences.list(userId);
  }

  updatePreference(
    userId: string,
    input: UpdateNotificationPreferenceRequest,
  ): Promise<NotificationPreferencesResponse> {
    return this.preferences.update(userId, input);
  }

  /**
   * Idempotent multi-recipient fanout. In-app rows are created immediately;
   * email delivery attempts are queued for the outbox worker.
   */
  async notify(event: NotifyEventInput): Promise<{ created: number; skipped: number }> {
    const category = NOTIFICATION_CATEGORY_BY_TYPE[event.type];
    let created = 0;
    let skipped = 0;
    for (const recipient of event.recipients) {
      const deduplicationKey = `${event.referenceKey}:${event.type}:${recipient.roleTag}:${recipient.userId}`.slice(
        0,
        240,
      );
      try {
        const inAppEnabled = await this.preferences.isChannelEnabled(
          recipient.userId,
          category,
          'IN_APP',
          event.type,
        );
        const emailEnabled = await this.preferences.isChannelEnabled(
          recipient.userId,
          category,
          'EMAIL',
          event.type,
        );
        if (!inAppEnabled && !emailEnabled) {
          skipped += 1;
          continue;
        }

        const existing = await this.prisma.notification.findUnique({
          where: { deduplicationKey },
          select: { id: true },
        });
        if (existing) {
          skipped += 1;
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          if (!inAppEnabled && emailEnabled) {
            // Still persist an archived/read in-app record so dedupe + email attempt attach to a row.
          }
          const notification = await tx.notification.create({
            data: {
              id: randomUUID(),
              recipientId: recipient.userId,
              category,
              type: event.type,
              title: recipient.title.slice(0, 160),
              body: recipient.body.slice(0, 500),
              metadata: recipient.metadata as unknown as Prisma.InputJsonValue,
              deduplicationKey,
              isRead: !inAppEnabled,
              readAt: inAppEnabled ? null : new Date(),
              isArchived: !inAppEnabled,
            },
          });
          if (emailEnabled) {
            await tx.notificationDeliveryAttempt.create({
              data: {
                id: randomUUID(),
                notificationId: notification.id,
                channel: 'EMAIL',
                status: 'PENDING',
                attemptCount: 0,
                nextRetryAt: new Date(),
              },
            });
          }
        });
        created += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          skipped += 1;
          continue;
        }
        console.error('[notifications] notify failed', {
          deduplicationKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { created, skipped };
  }

  async processOutbox(limit = 50): Promise<number> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 5 * 60_000);
    const claimed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          notification_id: string;
          attempt_count: number;
        }>
      >(Prisma.sql`
        SELECT "id", "notification_id", "attempt_count"
        FROM "notification_delivery_attempts"
        WHERE "channel" = 'email'
          AND "attempt_count" < ${MAX_EMAIL_ATTEMPTS}
          AND (
            ("status" = 'pending' AND ("next_retry_at" IS NULL OR "next_retry_at" <= ${now}))
            OR ("status" = 'failed' AND "next_retry_at" IS NOT NULL AND "next_retry_at" <= ${now})
          )
        ORDER BY "created_at" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `);
      for (const row of rows) {
        await tx.notificationDeliveryAttempt.update({
          where: { id: row.id },
          data: { nextRetryAt: leaseUntil, updatedAt: now },
        });
      }
      return rows;
    });

    let processed = 0;
    for (const row of claimed) {
      try {
        await this.dispatchEmailAttempt(row.id, row.notification_id, row.attempt_count);
        processed += 1;
      } catch (error) {
        console.error('[notifications] outbox item failed', {
          attemptId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return processed;
  }

  private async dispatchEmailAttempt(
    attemptId: string,
    notificationId: string,
    attemptCount: number,
  ): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { recipient: { select: { email: true, displayName: true } } },
    });
    if (!notification) {
      await this.prisma.notificationDeliveryAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'FAILED',
          attemptCount: attemptCount + 1,
          lastError: 'Notification missing',
          nextRetryAt: null,
        },
      });
      return;
    }

    const metadata = notification.metadata as unknown as NotificationMetadata;
    const compiled = compileNotificationEmail({
      title: notification.title,
      body: notification.body,
      targetUrl: metadata.targetUrl,
      displayName: notification.recipient.displayName,
    });

    try {
      await this.emailTransporter.send({
        to: notification.recipient.email,
        toName: notification.recipient.displayName,
        subject: compiled.subject,
        htmlBody: compiled.htmlBody,
        textBody: compiled.textBody,
        notificationId: notification.id,
        type: notification.type,
      });
      await this.prisma.notificationDeliveryAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'DELIVERED',
          attemptCount: attemptCount + 1,
          deliveredAt: new Date(),
          lastError: null,
          nextRetryAt: null,
        },
      });
    } catch (error) {
      const nextAttempt = attemptCount + 1;
      const retryMinutes = Math.min(2 ** nextAttempt, 120);
      const nextRetryAt =
        nextAttempt >= MAX_EMAIL_ATTEMPTS
          ? null
          : new Date(Date.now() + retryMinutes * 60_000);
      await this.prisma.notificationDeliveryAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'FAILED',
          attemptCount: nextAttempt,
          lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
          nextRetryAt,
        },
      });
      if (nextAttempt < MAX_EMAIL_ATTEMPTS) {
        // Transient failures stay FAILED with nextRetryAt for the next sweep.
      }
    }
  }
}

export function createDefaultEmailTransporter(): NotificationEmailTransporter {
  try {
    return createNotificationEmailTransporter();
  } catch (error) {
    console.warn(
      '[notifications] email transporter fallback to console:',
      error instanceof Error ? error.message : String(error),
    );
    return createNotificationEmailTransporter({ NOTIFICATION_EMAIL_MODE: 'console' });
  }
}

export function assertAvailable<T>(value: T | null | undefined): T {
  if (value == null) throw new NotificationUnavailableError();
  return value;
}

export type { NotificationCategory };
