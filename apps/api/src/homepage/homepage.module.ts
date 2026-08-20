import { Module } from '@nestjs/common';

import { HOMEPAGE_CLOCK, SystemHomepageClock } from './homepage.clock';
import { HomepageController } from './homepage.controller';
import { HomepageRepository } from './homepage.repository';
import { HomepageService } from './homepage.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PricingModule],
  controllers: [HomepageController],
  providers: [
    HomepageRepository,
    HomepageService,
    SystemHomepageClock,
    { provide: HOMEPAGE_CLOCK, useExisting: SystemHomepageClock },
  ],
})
export class HomepageModule {}
