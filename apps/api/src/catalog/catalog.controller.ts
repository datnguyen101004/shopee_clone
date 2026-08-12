import { Controller, Get, Header, Inject, Query, UseFilters } from '@nestjs/common';
import type { CatalogProductsResponse } from '@shopee-clone/contracts';

import { CatalogExceptionFilter } from './catalog-exception.filter';
import { parseCatalogQuery } from './catalog-query';
import { CatalogService } from './catalog.service';

@Controller('catalog/products')
@UseFilters(CatalogExceptionFilter)
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly service: CatalogService) {}

  /** Public, deterministic product discovery across the displayable catalogue. */
  @Get()
  @Header('Cache-Control', 'no-store')
  getProducts(@Query() query: Record<string, unknown>): Promise<CatalogProductsResponse> {
    return this.service.getProducts(parseCatalogQuery(query));
  }
}
