import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { CommercePricingCalculator } from './commerce-pricing.calculator';
import { MockShippingCalculator } from './mock-shipping.calculator';
import { DemoCarrierCalculator } from './demo-carrier.calculator';
import { PricingController } from './pricing.controller';
import { PricingExceptionFilter } from './pricing-exception.filter';
import { PricingQuoteService } from './pricing-quote.service';
import { ScheduledDiscountService } from './scheduled-discount.service';
import { BuyerBestPriceRepository } from './buyer-best-price.repository';
import { BuyerBestPriceService } from './buyer-best-price.service';

@Module({
  imports: [AuthModule, VouchersModule],
  controllers: [PricingController],
  providers: [
    PricingExceptionFilter,
    MockShippingCalculator,
    DemoCarrierCalculator,
    CommercePricingCalculator,
    PricingQuoteService,
    ScheduledDiscountService,
    BuyerBestPriceRepository,
    BuyerBestPriceService,
  ],
  exports: [
    CommercePricingCalculator,
    MockShippingCalculator,
    PricingQuoteService,
    ScheduledDiscountService,
    BuyerBestPriceService,
  ],
})
export class PricingModule {}
