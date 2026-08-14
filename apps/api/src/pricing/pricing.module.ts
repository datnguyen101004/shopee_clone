import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { CommercePricingCalculator } from './commerce-pricing.calculator';
import { MockShippingCalculator } from './mock-shipping.calculator';
import { PricingController } from './pricing.controller';
import { PricingExceptionFilter } from './pricing-exception.filter';
import { PricingQuoteService } from './pricing-quote.service';

@Module({
  imports: [AuthModule, VouchersModule],
  controllers: [PricingController],
  providers: [
    PricingExceptionFilter,
    MockShippingCalculator,
    CommercePricingCalculator,
    PricingQuoteService,
  ],
  exports: [CommercePricingCalculator, MockShippingCalculator, PricingQuoteService],
})
export class PricingModule {}
