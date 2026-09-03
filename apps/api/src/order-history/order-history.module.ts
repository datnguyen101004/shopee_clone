import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrderHistoryController } from './order-history.controller';
import { OrderHistoryExceptionFilter } from './order-history-exception.filter';
import { OrderHistoryProjector } from './order-history.projector';
import { OrderHistoryRepository } from './order-history.repository';
import { OrderHistoryService } from './order-history.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { SellerOrderCompensationModule } from '../seller-orders/seller-order-compensation.module';

@Module({
  imports: [AuthModule, SellerOrderCompensationModule, NotificationsModule],
  controllers: [OrderHistoryController],
  providers: [
    OrderHistoryExceptionFilter,
    OrderHistoryProjector,
    OrderHistoryRepository,
    OrderHistoryService,
    OrderLifecycleService,
  ],
  exports: [OrderHistoryService, OrderLifecycleService],
})
export class OrderHistoryModule {}
