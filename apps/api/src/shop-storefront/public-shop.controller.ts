import { Controller, Get, Header, Inject, Param, Query, UseFilters } from '@nestjs/common';
import type { PublicShopCatalogPage, PublicShopProfile } from '@shopee-clone/contracts';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ShopStorefrontExceptionFilter } from './shop-storefront-exception.filter';
import { parsePublicShopCatalogQuery, parsePublicShopSlug } from './shop-storefront-input';
import { ShopStorefrontService } from './shop-storefront.service';

@ApiTags('public shops')
@ApiResponse({ status: 404, description: 'Shop is unknown, inactive, or deleted' })
@ApiResponse({ status: 503, description: 'Shop storefront is temporarily unavailable' })
@Controller('shops')
@UseFilters(ShopStorefrontExceptionFilter)
export class PublicShopController {
  constructor(@Inject(ShopStorefrontService) private readonly storefront: ShopStorefrontService) {}

  @Get(':shopSlug/products')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Browse the displayable products belonging to one public shop' })
  @ApiQuery({ name: 'q', required: false, maxLength: 120 })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['relevance', 'newest', 'best-selling', 'price-asc', 'price-desc'],
  })
  @ApiQuery({ name: 'page', required: false, minimum: 1 })
  @ApiQuery({ name: 'pageSize', required: false, minimum: 1, maximum: 48 })
  @ApiResponse({ status: 400, description: 'Strict shop catalog query validation failed' })
  @ApiOkResponse({
    description: 'Canonical shop-scoped catalog page',
    schema: {
      type: 'object',
      required: ['shopId', 'query', 'pagination', 'categories', 'items'],
      properties: {
        shopId: { type: 'string', format: 'uuid' },
        query: { type: 'object' },
        pagination: { type: 'object' },
        categories: { type: 'array', items: { type: 'object' } },
        items: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  products(
    @Param('shopSlug') shopSlug: string,
    @Query() query: Record<string, unknown>,
  ): Promise<PublicShopCatalogPage> {
    return this.storefront.products(
      parsePublicShopSlug(shopSlug),
      parsePublicShopCatalogQuery(query),
    );
  }

  @Get(':shopSlug')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read a public shop profile and its aggregate marketplace metrics' })
  @ApiOkResponse({
    description: 'Public shop profile with marketplace aggregates',
    schema: {
      type: 'object',
      required: [
        'id',
        'slug',
        'name',
        'location',
        'joinedAt',
        'activeProductCount',
        'ratingAverageBasisPoints',
        'ratingCount',
        'soldCount',
        'followerCount',
        'responseMetadata',
        'categories',
      ],
      properties: {
        id: { type: 'string', format: 'uuid' },
        slug: { type: 'string' },
        name: { type: 'string' },
        location: { type: 'string' },
        joinedAt: { type: 'string', format: 'date-time' },
        activeProductCount: { type: 'integer', minimum: 0 },
        ratingAverageBasisPoints: { type: 'integer', minimum: 0, maximum: 500 },
        ratingCount: { type: 'integer', minimum: 0 },
        soldCount: { type: 'integer', minimum: 0 },
        followerCount: { type: 'integer', minimum: 0 },
        responseMetadata: { type: 'object' },
        categories: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  profile(@Param('shopSlug') shopSlug: string): Promise<PublicShopProfile> {
    return this.storefront.profile(parsePublicShopSlug(shopSlug));
  }
}
