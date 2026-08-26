import {
  MANDATORY_NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_VERSION,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationChannelPreference,
  type NotificationPreferencesResponse,
  type NotificationType,
  type UpdateNotificationPreferenceRequest,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationPreferenceForbiddenError,
  NotificationUnavailableError,
  NotificationValidationError,
} from './notification.errors';

const MANDATORY_CATEGORIES = new Set<NotificationCategory>(
  MANDATORY_NOTIFICATION_TYPES.map((type) => {
    const map: Record<(typeof MANDATORY_NOTIFICATION_TYPES)[number], NotificationCategory> = {
      ORDER_CONFIRMED: 'ORDERS',
      ORDER_CANCELLED: 'ORDERS',
      DISPUTE_ESCALATED: 'ORDERS',
      REFUNDED: 'ORDERS',
    };
    return map[type];
  }),
);

@Injectable()
export class NotificationPreferenceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<NotificationPreferencesResponse> {
    try {
      const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
      const byKey = new Map(rows.map((row) => [`${row.category}:${row.channel}`, row.enabled]));
      const preferences: NotificationChannelPreference[] = [];
      for (const category of NOTIFICATION_CATEGORIES) {
        for (const channel of NOTIFICATION_CHANNELS) {
          const mandatory = this.isMandatoryPair(category);
          preferences.push({
            category,
            channel,
            enabled: byKey.get(`${category}:${channel}`) ?? true,
            mandatory,
          });
        }
      }
      return { notificationVersion: NOTIFICATION_VERSION, preferences };
    } catch {
      throw new NotificationUnavailableError();
    }
  }

  async update(
    userId: string,
    input: UpdateNotificationPreferenceRequest,
  ): Promise<NotificationPreferencesResponse> {
    if (!NOTIFICATION_CATEGORIES.includes(input.category)) {
      throw new NotificationValidationError(['category']);
    }
    if (!NOTIFICATION_CHANNELS.includes(input.channel)) {
      throw new NotificationValidationError(['channel']);
    }
    if (!input.enabled && this.isMandatoryPair(input.category)) {
      throw new NotificationPreferenceForbiddenError(['enabled']);
    }
    try {
      await this.prisma.notificationPreference.upsert({
        where: {
          userId_category_channel: {
            userId,
            category: input.category,
            channel: input.channel,
          },
        },
        create: {
          userId,
          category: input.category,
          channel: input.channel,
          enabled: input.enabled,
        },
        update: { enabled: input.enabled },
      });
      return this.list(userId);
    } catch (error) {
      if (
        error instanceof NotificationPreferenceForbiddenError ||
        error instanceof NotificationValidationError
      ) {
        throw error;
      }
      throw new NotificationUnavailableError();
    }
  }

  async isChannelEnabled(
    userId: string,
    category: NotificationCategory,
    channel: NotificationChannel,
    type: NotificationType,
  ): Promise<boolean> {
    if (
      MANDATORY_NOTIFICATION_TYPES.includes(type as (typeof MANDATORY_NOTIFICATION_TYPES)[number])
    ) {
      return true;
    }
    if (this.isMandatoryPair(category)) return true;
    const row = await this.prisma.notificationPreference.findUnique({
      where: {
        userId_category_channel: { userId, category, channel },
      },
    });
    return row?.enabled ?? true;
  }

  private isMandatoryPair(category: NotificationCategory): boolean {
    return MANDATORY_CATEGORIES.has(category) && category === 'ORDERS';
  }
}
