import type { SellerCampaignDetail, SellerCampaignPage, CampaignParticipationResponse, FlashSaleSellerSnapshot } from '@shopee-clone/contracts';
import { Body, Controller, Get, Header, Headers, Inject, Param, Patch, Post, Put, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { MarketplaceCampaignExceptionFilter } from './marketplace-campaigns.exception-filter';
import { MarketplaceCampaignsService } from './marketplace-campaigns.service';
import { FlashSaleService } from './flash-sale.service';
// DTO classes are required at runtime by Nest's ValidationPipe metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { FlashSaleEndDto, FlashSaleQuotaDto, FlashSaleRegisterDto, FlashSaleReplenishDto } from './flash-sale.dto';
// DTO classes must remain runtime values for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CampaignParticipationDto, SellerCampaignPageQueryDto } from './marketplace-campaigns.dto';

@ApiTags('seller campaigns') @ApiBearerAuth() @Controller('seller/campaigns')
@UseFilters(MarketplaceCampaignExceptionFilter) @UseGuards(AuthGuard, RolesGuard) @RequireRoles('seller')
export class SellerMarketplaceCampaignsController {
  constructor(@Inject(MarketplaceCampaignsService) private readonly campaigns: MarketplaceCampaignsService, @Inject(FlashSaleService) private readonly flashSales: FlashSaleService) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(@Req() request: AuthenticatedRequest, @Query() query: SellerCampaignPageQueryDto): Promise<SellerCampaignPage> { return this.campaigns.listSeller(request.authUser!.id, query); }
  @Get(':campaignId') @Header('Cache-Control', 'private, no-store') detail(@Req() request: AuthenticatedRequest, @Param('campaignId') id: string): Promise<SellerCampaignDetail> { return this.campaigns.sellerDetail(request.authUser!.id, id); }
  @Put(':campaignId/participation') @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Canonical UUID for safe retries.' }) @Header('Cache-Control', 'private, no-store') @ApiOperation({ summary: 'Join or decline a marketplace campaign' }) participate(@Req() request: AuthenticatedRequest, @Param('campaignId') id: string, @Body() input: CampaignParticipationDto): Promise<CampaignParticipationResponse> { return this.campaigns.participate(request.authUser!.id, id, input, request.headers['idempotency-key']?.toString()); }
  @Post(':campaignId/participation/withdraw') @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Canonical UUID for safe retries.' }) @Header('Cache-Control', 'private, no-store') withdraw(@Req() request: AuthenticatedRequest, @Param('campaignId') id: string, @Body() input: { version: number }, @Headers('idempotency-key') idempotencyKey?: string): Promise<CampaignParticipationResponse> { return this.campaigns.withdraw(request.authUser!.id, id, input.version, request.authUser!.id, idempotencyKey); }
  @Get(':campaignId/flash-sale') @Header('Cache-Control', 'private, no-store') flashSale(@Req() request: AuthenticatedRequest, @Param('campaignId') id: string): Promise<FlashSaleSellerSnapshot> { return this.flashSales.sellerSnapshot(request.authUser!.id, id); }
  @Put(':campaignId/flash-sale/skus') @ApiHeader({ name: 'Idempotency-Key', required: true }) @Header('Cache-Control', 'private, no-store') registerFlashSale(@Req() request: AuthenticatedRequest, @Param('campaignId') id: string, @Body() input: FlashSaleRegisterDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<FlashSaleSellerSnapshot> { return this.flashSales.register(request.authUser!.id, id, input, idempotencyKey); }
  @Patch(':campaignId/flash-sale/skus/:variantId/quota') @Header('Cache-Control', 'private, no-store') updateFlashSaleQuota(@Req() request: AuthenticatedRequest, @Param('campaignId') id: string, @Param('variantId') variantId: string, @Body() input: FlashSaleQuotaDto): Promise<FlashSaleSellerSnapshot> { return this.flashSales.updateQuota(request.authUser!.id, id, variantId, input); }
  @Post(':campaignId/flash-sale/skus/:variantId/replenish') @Header('Cache-Control', 'private, no-store') replenishFlashSale(@Req() request: AuthenticatedRequest, @Param('campaignId') id: string, @Param('variantId') variantId: string, @Body() input: FlashSaleReplenishDto): Promise<FlashSaleSellerSnapshot> { return this.flashSales.replenish(request.authUser!.id, id, variantId, input); }
  @Post(':campaignId/flash-sale/skus/:variantId/end') @Header('Cache-Control', 'private, no-store') endFlashSale(@Req() request: AuthenticatedRequest, @Param('campaignId') id: string, @Param('variantId') variantId: string, @Body() input: FlashSaleEndDto): Promise<FlashSaleSellerSnapshot> { return this.flashSales.end(request.authUser!.id, id, variantId, input); }
}
