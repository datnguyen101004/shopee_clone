import type { CampaignAdminPage, CampaignAdminSummary, CampaignBannerDetail, CampaignTypeSummary } from '@shopee-clone/contracts';
import { Body, Controller, Get, Header, Inject, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { MarketplaceCampaignExceptionFilter } from './marketplace-campaigns.exception-filter';
import { MarketplaceCampaignsService } from './marketplace-campaigns.service';
// DTO classes must remain runtime values for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CampaignCancelDto, CampaignCursorQueryDto, CampaignPlacementDto, CampaignPreviewDto, CampaignPublishDto, CreateCampaignDto, UpdateCampaignDto } from './marketplace-campaigns.dto';

@ApiTags('admin campaigns') @ApiBearerAuth() @Controller('admin/campaigns')
@UseFilters(MarketplaceCampaignExceptionFilter) @UseGuards(AuthGuard, RolesGuard) @RequireRoles('admin')
export class AdminMarketplaceCampaignsController {
  constructor(@Inject(MarketplaceCampaignsService) private readonly campaigns: MarketplaceCampaignsService) {}
  @Get('types') @Header('Cache-Control', 'private, no-store') @ApiOperation({ summary: 'List enabled campaign types' }) types(): Promise<CampaignTypeSummary[]> { return this.campaigns.listTypes(); }
  @Get() @Header('Cache-Control', 'private, no-store') list(@Query() query: CampaignCursorQueryDto): Promise<CampaignAdminPage> { return this.campaigns.listAdmin(query); }
  @Post() @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Canonical UUID for safe retries.' }) @Header('Cache-Control', 'private, no-store') create(@Body() input: CreateCampaignDto, @Req() request: AuthenticatedRequest): Promise<CampaignAdminSummary> { return this.campaigns.createAdmin(input as never, request.authUser!.id, request.headers['idempotency-key']?.toString()); }
  @Post('preview') @Header('Cache-Control', 'private, no-store') preview(@Body() input: CampaignPreviewDto): Promise<CampaignBannerDetail> { return this.campaigns.preview(input as never); }
  @Get(':campaignId') @Header('Cache-Control', 'private, no-store') read(@Param('campaignId') id: string): Promise<CampaignAdminSummary> { return this.campaigns.readAdmin(id); }
  @Patch(':campaignId') @Header('Cache-Control', 'private, no-store') update(@Param('campaignId') id: string, @Body() input: UpdateCampaignDto, @Req() request: AuthenticatedRequest): Promise<CampaignAdminSummary> { return this.campaigns.updateAdmin(id, input as never, request.authUser!.id); }
  @Post(':campaignId/placements') @Header('Cache-Control', 'private, no-store') placement(@Param('campaignId') id: string, @Body() input: CampaignPlacementDto, @Req() request: AuthenticatedRequest) { return this.campaigns.placeAdmin(id, input, request.authUser!.id); }
  @Get(':campaignId/participations') @Header('Cache-Control', 'private, no-store') participations(@Param('campaignId') id: string, @Query() query: CampaignCursorQueryDto) { return this.campaigns.participationReport(id, query); }
  @Post(':campaignId/publish') @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Canonical UUID for safe retries.' }) @Header('Cache-Control', 'private, no-store') publish(@Param('campaignId') id: string, @Body() input: CampaignPublishDto, @Req() request: AuthenticatedRequest): Promise<CampaignAdminSummary> { return this.campaigns.publish(id, input.version, request.authUser!.id, request.headers['idempotency-key']?.toString()); }
  @Post(':campaignId/cancel') @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Canonical UUID for safe retries.' }) @Header('Cache-Control', 'private, no-store') cancel(@Param('campaignId') id: string, @Body() input: CampaignCancelDto, @Req() request: AuthenticatedRequest): Promise<CampaignAdminSummary> { return this.campaigns.cancel(id, input.version, input.reason, request.authUser!.id, request.headers['idempotency-key']?.toString()); }
}
