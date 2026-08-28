import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrderHistoryModule } from '../order-history/order-history.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CarrierOperationsController } from './carrier-operations.controller';
import { CarrierOperationsService } from './carrier-operations.service';
import { CarrierWebhookController } from './carrier-webhook.controller';
import { CarrierDispatchService } from './carrier-dispatch.service';

@Module({
  imports: [AuthModule, OrderHistoryModule, NotificationsModule],
  controllers: [CarrierOperationsController, CarrierWebhookController],
  providers: [CarrierOperationsService, CarrierDispatchService],
  exports: [CarrierOperationsService],
})
export class CarrierModule {}
