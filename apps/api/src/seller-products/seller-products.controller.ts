import { parseSellerProductPageQuery } from '@shopee-clone/contracts';
import type { SellerProductDetail, SellerProductPage } from '@shopee-clone/contracts';
import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SellerProductLifecycleDto, SellerProductUpsertDto } from './seller-products.dto';
import { SellerProductsExceptionFilter } from './seller-products-exception.filter';
import { SellerProductsService } from './seller-products.service';
import { SellerProductMediaStorage } from './seller-product-media.storage';
import { SellerProductInputError } from './seller-products.errors';

@ApiTags('seller products')
@ApiBearerAuth()
@Controller('seller/products')
@UseFilters(SellerProductsExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('seller')
export class SellerProductsController {
  constructor(
    @Inject(SellerProductsService) private readonly products: SellerProductsService,
    @Inject(SellerProductMediaStorage) private readonly mediaStorage: SellerProductMediaStorage,
  ) {}

  @Get('categories') @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'List active categories available to seller listings' })
  categories() { return this.products.categories(); }

  @Get() @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'List products owned by the authenticated seller shop' })
  list(@Req() request: AuthenticatedRequest, @Query() query: Record<string, string | string[] | undefined>): Promise<SellerProductPage> {
    const parsed = parseSellerProductPageQuery(query);
    if (!parsed) throw new SellerProductInputError(['query']);
    return this.products.list(request.authUser!.id, parsed);
  }

  @Get(':productId') @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'Read one seller-owned product' })
  read(@Req() request: AuthenticatedRequest, @Param('productId') productId: string): Promise<SellerProductDetail> { return this.products.read(request.authUser!.id, productId); }

  @Post() @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'Create a seller product draft' })
  create(@Req() request: AuthenticatedRequest, @Body() input: SellerProductUpsertDto): Promise<SellerProductDetail> { return this.products.create(request.authUser!.id, input); }

  @Patch(':productId') @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'Replace a seller-owned product draft or listing' })
  update(@Req() request: AuthenticatedRequest, @Param('productId') productId: string, @Body() input: SellerProductUpsertDto): Promise<SellerProductDetail> { return this.products.update(request.authUser!.id, productId, input); }

  @Delete(':productId') @HttpCode(HttpStatus.NO_CONTENT) @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'Delete a seller-owned draft product' })
  async remove(@Req() request: AuthenticatedRequest, @Param('productId') productId: string): Promise<void> {
    const storageKeys = await this.products.deleteDraft(request.authUser!.id, productId);
    await Promise.allSettled(storageKeys.map((storageKey) => this.mediaStorage.remove(storageKey)));
  }

  @Patch(':productId/lifecycle') @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'Publish, hide, or archive a seller product' })
  transition(@Req() request: AuthenticatedRequest, @Param('productId') productId: string, @Body() input: SellerProductLifecycleDto): Promise<SellerProductDetail> { return this.products.transition(request.authUser!.id, productId, input); }
}
