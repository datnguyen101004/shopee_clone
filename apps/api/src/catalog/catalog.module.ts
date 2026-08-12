import { Module } from '@nestjs/common';

import { CatalogController } from './catalog.controller';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogRepository, CatalogService],
})
export class CatalogModule {}
