import { Module } from '@nestjs/common';

import { CatalogController } from './catalog.controller';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { CatalogProductDetailService } from './catalog-product-detail.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogRepository, CatalogService, CatalogProductDetailService],
})
export class CatalogModule {}
