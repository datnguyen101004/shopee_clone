import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { CatalogProductsResponse, ProductDetailResponse } from '@shopee-clone/contracts';
import {
  CATALOG_DEFAULT_SUGGESTION_LIMIT,
  CATALOG_MAX_SUGGESTION_LIMIT,
  type CatalogSearchSuggestionsResponse,
} from '@shopee-clone/contracts';

import { CatalogExceptionFilter } from './catalog-exception.filter';
import { parseCatalogQuery } from './catalog-query';
import { CatalogPublicFacade } from './catalog-public.facade';
import { parseCatalogProductId } from './catalog-product-id';
import { CatalogProductDetailService } from './catalog-product-detail.service';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.guard';

@Controller('catalog/products')
@UseFilters(CatalogExceptionFilter)
@UseGuards(OptionalAuthGuard)
export class CatalogController {
  constructor(
    @Inject(CatalogPublicFacade) private readonly service: CatalogPublicFacade,
    @Inject(CatalogProductDetailService)
    private readonly productDetailService: CatalogProductDetailService,
  ) {}

  /** Public, deterministic product discovery across the displayable catalogue. */
  @Get()
  @Header('Cache-Control', 'no-store')
  getProducts(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ): Promise<CatalogProductsResponse> {
    return this.service.getProducts(parseCatalogQuery(query), request.authUser?.id ?? null);
  }

  /** Public, bounded product-name suggestions for the storefront search box. */
  @Get('suggestions')
  @Header('Cache-Control', 'no-store')
  getSearchSuggestions(
    @Query() query: Record<string, unknown>,
  ): Promise<CatalogSearchSuggestionsResponse> {
    const rawQuery = typeof query.q === 'string' ? query.q.trim().replace(/\s+/g, ' ') : '';
    if (!rawQuery) return Promise.resolve({ suggestions: [] });
    if (rawQuery.length > 120) return Promise.resolve({ suggestions: [] });

    const rawLimit = typeof query.limit === 'string' ? query.limit : '';
    const parsedLimit = /^[1-8]$/.test(rawLimit) ? Number(rawLimit) : CATALOG_DEFAULT_SUGGESTION_LIMIT;
    const limit = Math.min(parsedLimit, CATALOG_MAX_SUGGESTION_LIMIT);
    return this.service.getSearchSuggestions(rawQuery, limit);
  }

  /** Public, server-authoritative product detail for the storefront route. */
  @Get(':productId')
  @Header('Cache-Control', 'no-store')
  getProduct(
    @Req() request: AuthenticatedRequest,
    @Param('productId') productId: string,
  ): Promise<ProductDetailResponse> {
    return this.productDetailService.getProduct(
      parseCatalogProductId(productId),
      request.authUser?.id ?? null,
    );
  }
}
