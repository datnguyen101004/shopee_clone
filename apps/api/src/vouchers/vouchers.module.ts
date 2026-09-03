import { Module } from '@nestjs/common';

import { VoucherConsumptionService } from './voucher-consumption.service';
import { VoucherHoldService } from './voucher-hold.service';
import { VoucherPricingCalculator } from './voucher-pricing.calculator';
import { SystemUtcClock } from './utc-clock';

@Module({
  providers: [
    SystemUtcClock,
    VoucherPricingCalculator,
    VoucherConsumptionService,
    VoucherHoldService,
  ],
  exports: [
    SystemUtcClock,
    VoucherPricingCalculator,
    VoucherConsumptionService,
    VoucherHoldService,
  ],
})
export class VouchersModule {}
