import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PricingModule } from '../pricing/pricing.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrafficAdmissionModule } from '../traffic-admission/traffic-admission.module';
import { CacheModule } from '../cache/cache.module';
import { FlashSaleAdmissionService } from './flash-sale-admission.service';
import { AdmissionResultController } from './admission-result.controller';
import { TrafficAdmissionFilter } from '../traffic-admission/traffic-admission.filter';
import { CheckoutAssembler } from './checkout-assembler';
import { CheckoutPurchaseBuilder } from './checkout-purchase-builder';
import { CheckoutController } from './checkout.controller';
import { CheckoutExceptionFilter } from './checkout-exception.filter';
import { CheckoutService } from './checkout.service';
import { OrderWriter } from './order-writer';
import { PurchaseProjector } from './purchase-projector';
import { ClickstreamModule } from '../clickstream/clickstream.module';

@Module({
  imports: [
    AuthModule,
    PricingModule,
    VouchersModule,
    InventoryModule,
    NotificationsModule,
    TrafficAdmissionModule,
    CacheModule,
    ClickstreamModule,
  ],
  controllers: [CheckoutController, AdmissionResultController],
  providers: [
    CheckoutExceptionFilter,
    CheckoutAssembler,
    CheckoutPurchaseBuilder,
    CheckoutService,
    OrderWriter,
    PurchaseProjector,
    FlashSaleAdmissionService,
    TrafficAdmissionFilter,
  ],
  exports: [CheckoutService, OrderWriter],
})
export class CheckoutModule {}
