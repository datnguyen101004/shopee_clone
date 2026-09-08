import { Module } from '@nestjs/common';

import { HOMEPAGE_CLOCK, SystemHomepageClock } from './homepage.clock';
import { HomepageController } from './homepage.controller';
import { HomepageRepository } from './homepage.repository';
import { HomepageService } from './homepage.service';
import { HomepageCmsService } from './homepage-cms.service';
import { PricingModule } from '../pricing/pricing.module';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SearchModule } from '../search/search.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SellerProductsModule } from '../seller-products/seller-products.module';
import { HomepageBannerMediaService } from './homepage-banner-media.service';

@Module({
  imports: [PricingModule, AuthModule, CatalogModule, SearchModule, NotificationsModule, SellerProductsModule],
  controllers: [HomepageController],
  providers: [
    HomepageRepository,
    HomepageService,
    HomepageCmsService,
    HomepageBannerMediaService,
    SystemHomepageClock,
    { provide: HOMEPAGE_CLOCK, useExisting: SystemHomepageClock },
  ],
  exports: [HomepageCmsService, HomepageBannerMediaService],
})
export class HomepageModule {}
