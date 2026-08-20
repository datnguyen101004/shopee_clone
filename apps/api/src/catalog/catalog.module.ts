import { Module } from '@nestjs/common';

import { CatalogController } from './catalog.controller';
import { CatalogPublicFacade } from './catalog-public.facade';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { CatalogProductDetailService } from './catalog-product-detail.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PricingModule],
  controllers: [CatalogController],
  providers: [
    CatalogRepository,
    CatalogService,
    CatalogProductDetailService,
    { provide: CatalogPublicFacade, useExisting: CatalogService },
  ],
  exports: [CatalogPublicFacade],
})
export class CatalogModule {}
