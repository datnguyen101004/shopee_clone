import type { CampaignTypeSummary } from '@shopee-clone/contracts';
import { Controller, Get, Header, Inject, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { MarketplaceCampaignExceptionFilter } from './marketplace-campaigns.exception-filter';
import { MarketplaceCampaignsService } from './marketplace-campaigns.service';

@ApiTags('admin campaign types') @ApiBearerAuth() @Controller('admin/campaign-types')
@UseFilters(MarketplaceCampaignExceptionFilter) @UseGuards(AuthGuard, RolesGuard) @RequireRoles('admin')
export class AdminCampaignTypesController {
  constructor(@Inject(MarketplaceCampaignsService) private readonly campaigns: MarketplaceCampaignsService) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(): Promise<CampaignTypeSummary[]> { return this.campaigns.listTypes(); }
}
