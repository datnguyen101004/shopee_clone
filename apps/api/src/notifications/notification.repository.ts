import {
  NOTIFICATION_VERSION,
  type ArchiveNotificationResponse,
  type MarkAllNotificationsReadResponse,
  type MarkNotificationReadResponse,
  type NotificationCategory,
  type NotificationItem,
  type NotificationListResponse,
  type NotificationMetadata,
  type NotificationType,
  type NotificationUnreadCountResponse,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from './notification-cursor';
import { NotificationNotFoundError, NotificationValidationError } from './notification.errors';

type NotificationRow = {
  id: string;
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Prisma.JsonValue;
  isRead: boolean;
  readAt: Date | null;
  isArchived: boolean;
  createdAt: Date;
  activityAt: Date;
};

@Injectable()
export class NotificationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async unreadCount(recipientId: string): Promise<NotificationUnreadCountResponse> {
    const unreadCount = await this.prisma.notification.count({
      where: { recipientId, isRead: false, isArchived: false },
    });
    return { unreadCount };
  }

  async list(
    recipientId: string,
    category: NotificationCategory | 'ALL',
    limit: number,
    cursor: string | null,
  ): Promise<NotificationListResponse> {
    const position = cursor ? decodeNotificationCursor(cursor, category) : null;
    if (cursor && !position) throw new NotificationValidationError(['cursor']);

    const where: Prisma.NotificationWhereInput = {
      recipientId,
      isArchived: false,
      ...(category === 'ALL' ? {} : { category }),
      ...(position
        ? {
            OR: [
              { activityAt: { lt: position.activityAt } },
              { activityAt: position.activityAt, id: { lt: position.id } },
            ],
          }
        : {}),
    };

    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ activityAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.prisma.notification.count({
        where: { recipientId, isRead: false, isArchived: false },
      }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    return {
      notificationVersion: NOTIFICATION_VERSION,
      items: page.map((row) => this.toItem(row as NotificationRow)),
      nextCursor:
        hasMore && last
          ? encodeNotificationCursor(category, { activityAt: last.activityAt, id: last.id })
          : null,
      unreadCount,
    };
  }

  async markRead(recipientId: string, notificationId: string): Promise<MarkNotificationReadResponse> {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, recipientId, isArchived: false },
    });
    if (!existing) throw new NotificationNotFoundError();
    if (existing.isRead && existing.readAt) {
      return { id: existing.id, isRead: true, readAt: existing.readAt.toISOString() };
    }
    const readAt = new Date();
    const updated = await this.prisma.notification.update({
      where: { id: existing.id },
      data: { isRead: true, readAt },
    });
    return { id: updated.id, isRead: true, readAt: readAt.toISOString() };
  }

  async markAllRead(recipientId: string): Promise<MarkAllNotificationsReadResponse> {
    const readAt = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { recipientId, isRead: false, isArchived: false },
      data: { isRead: true, readAt },
    });
    return { updatedCount: result.count, readAt: readAt.toISOString() };
  }

  async archive(recipientId: string, notificationId: string): Promise<ArchiveNotificationResponse> {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, recipientId },
    });
    if (!existing) throw new NotificationNotFoundError();
    if (existing.isArchived) return { id: existing.id, isArchived: true };
    await this.prisma.notification.update({
      where: { id: existing.id },
      data: { isArchived: true },
    });
    return { id: existing.id, isArchived: true };
  }

  private toItem(row: NotificationRow): NotificationItem {
    return {
      id: row.id,
      category: row.category,
      type: row.type,
      title: row.title,
      body: row.body,
      metadata: row.metadata as unknown as NotificationMetadata,
      isRead: row.isRead,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      isArchived: row.isArchived,
      createdAt: row.createdAt.toISOString(),
      activityAt: row.activityAt.toISOString(),
    };
  }
}
