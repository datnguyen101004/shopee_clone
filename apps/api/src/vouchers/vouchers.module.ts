import { Module } from '@nestjs/common';

import { VoucherConsumptionService } from './voucher-consumption.service';
import { VoucherPricingCalculator } from './voucher-pricing.calculator';
import { SystemUtcClock } from './utc-clock';

@Module({
  providers: [SystemUtcClock, VoucherPricingCalculator, VoucherConsumptionService],
  exports: [SystemUtcClock, VoucherPricingCalculator, VoucherConsumptionService],
})
export class VouchersModule {}
