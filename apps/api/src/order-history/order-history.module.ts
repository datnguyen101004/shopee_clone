import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrderHistoryController } from './order-history.controller';
import { OrderHistoryExceptionFilter } from './order-history-exception.filter';
import { OrderHistoryProjector } from './order-history.projector';
import { OrderHistoryRepository } from './order-history.repository';
import { OrderHistoryService } from './order-history.service';
import { OrderLifecycleService } from './order-lifecycle.service';

@Module({
  imports: [AuthModule],
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
