import { Module } from '@nestjs/common';

import { CarrierOperationsController } from './carrier-operations.controller';
import { CarrierQuoteController } from './carrier-quote.controller';
import { DemoCarrierService } from './demo-carrier.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, CarrierQuoteController, CarrierOperationsController],
  providers: [DemoCarrierService],
  exports: [DemoCarrierService],
})
export class AppModule {}
