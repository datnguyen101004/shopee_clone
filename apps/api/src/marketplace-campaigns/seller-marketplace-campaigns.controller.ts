import type { SellerCampaignDetail, SellerCampaignPage, CampaignParticipationResponse } from '@shopee-clone/contracts';
import { Body, Controller, Get, Header, Headers, Inject, Param, Post, Put, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { MarketplaceCampaignExceptionFilter } from './marketplace-campaigns.exception-filter';
import { MarketplaceCampaignsService } from './marketplace-campaigns.service';
// DTO classes must remain runtime values for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CampaignCursorQueryDto, CampaignParticipationDto } from './marketplace-campaigns.dto';

@ApiTags('seller campaigns') @ApiBearerAuth() @Controller('seller/campaigns')
@UseFilters(MarketplaceCampaignExceptionFilter) @UseGuards(AuthGuard, RolesGuard) @RequireRoles('seller')
export class SellerMarketplaceCampaignsController {
  constructor(@Inject(MarketplaceCampaignsService) private readonly campaigns: MarketplaceCampaignsService) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(@Req() request: AuthenticatedRequest, @Query() query: CampaignCursorQueryDto): Promise<SellerCampaignPage> { return this.campaigns.listSeller(request.authUser!.id, query); }
  @Get(':campaignId') @Header('Cache-Control', 'private, no-store') detail(@Req() request: AuthenticatedRequest, @Param('campaignId') id: string): Promise<SellerCampaignDetail> { return this.campaigns.sellerDetail(request.authUser!.id, id); }
  @Put(':campaignId/participation') @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Canonical UUID for safe retries.' }) @Header('Cache-Control', 'private, no-store') @ApiOperation({ summary: 'Join or decline a marketplace campaign' }) participate(@Req() request: AuthenticatedRequest, @Param('campaignId') id: string, @Body() input: CampaignParticipationDto): Promise<CampaignParticipationResponse> { return this.campaigns.participate(request.authUser!.id, id, input, request.headers['idempotency-key']?.toString()); }
  @Post(':campaignId/participation/withdraw') @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Canonical UUID for safe retries.' }) @Header('Cache-Control', 'private, no-store') withdraw(@Req() request: AuthenticatedRequest, @Param('campaignId') id: string, @Body() input: { version: number }, @Headers('idempotency-key') idempotencyKey?: string): Promise<CampaignParticipationResponse> { return this.campaigns.withdraw(request.authUser!.id, id, input.version, request.authUser!.id, idempotencyKey); }
}
