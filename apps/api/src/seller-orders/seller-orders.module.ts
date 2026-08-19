import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrderHistoryModule } from '../order-history/order-history.module';
import { SellerOrderCompensationModule } from './seller-order-compensation.module';
import { SellerOrderExceptionFilter } from './seller-order-exception.filter';
import { SellerOrdersController } from './seller-orders.controller';
import { SellerOrderProjector } from './seller-order.projector';
import { SellerOrderRepository } from './seller-order.repository';
import { SellerOrderService } from './seller-order.service';

@Module({
  imports: [AuthModule, OrderHistoryModule, SellerOrderCompensationModule],
  controllers: [SellerOrdersController],
  providers: [
    SellerOrderExceptionFilter,
    SellerOrderProjector,
    SellerOrderRepository,
    SellerOrderService,
  ],
  exports: [SellerOrderService],
})
export class SellerOrdersModule {}
