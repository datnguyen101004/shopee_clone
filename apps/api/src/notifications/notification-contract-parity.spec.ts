import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
} from '@shopee-clone/contracts';

import {
  NotificationCategory as PrismaNotificationCategory,
  NotificationType as PrismaNotificationType,
} from '../generated/prisma/enums';

describe('notification persistence and transport contract parity', () => {
  it('keeps every persisted category available to API consumers', () => {
    expect([...NOTIFICATION_CATEGORIES].sort()).toEqual(
      Object.values(PrismaNotificationCategory).sort(),
    );
  });

  it('keeps every persisted notification type available to API consumers', () => {
    expect([...NOTIFICATION_TYPES].sort()).toEqual(Object.values(PrismaNotificationType).sort());
  });
});
