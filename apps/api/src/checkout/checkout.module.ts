import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PricingModule } from '../pricing/pricing.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CheckoutAssembler } from './checkout-assembler';
import { CheckoutController } from './checkout.controller';
import { CheckoutExceptionFilter } from './checkout-exception.filter';
import { CheckoutService } from './checkout.service';
import { OrderWriter } from './order-writer';
import { PurchaseProjector } from './purchase-projector';

@Module({
  imports: [AuthModule, PricingModule, VouchersModule, InventoryModule],
  controllers: [CheckoutController],
  providers: [
    CheckoutExceptionFilter,
    CheckoutAssembler,
    CheckoutService,
    OrderWriter,
    PurchaseProjector,
  ],
  exports: [CheckoutService, OrderWriter],
})
export class CheckoutModule {}
