import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationRepository } from './notification.repository';
import {
  NOTIFICATION_EMAIL_TRANSPORTER,
  NotificationService,
  createDefaultEmailTransporter,
} from './notification.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationRepository,
    NotificationPreferenceService,
    {
      provide: NOTIFICATION_EMAIL_TRANSPORTER,
      useFactory: () => createDefaultEmailTransporter(),
    },
    NotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
