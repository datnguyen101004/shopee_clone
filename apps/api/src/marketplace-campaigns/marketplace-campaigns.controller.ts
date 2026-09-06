import type { CampaignBannerDetail } from '@shopee-clone/contracts';
import { Controller, Get, Header, Inject, Param, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MarketplaceCampaignExceptionFilter } from './marketplace-campaigns.exception-filter';
import { MarketplaceCampaignsService } from './marketplace-campaigns.service';

@ApiTags('campaigns')
@Controller('campaigns')
@UseFilters(MarketplaceCampaignExceptionFilter)
export class MarketplaceCampaignsController {
  constructor(@Inject(MarketplaceCampaignsService) private readonly campaigns: MarketplaceCampaignsService) {}

  @Get('by-banner/:bannerId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read a public campaign detail by canonical banner id' })
  byBanner(@Param('bannerId') bannerId: string): Promise<CampaignBannerDetail> { return this.campaigns.publicByBanner(bannerId); }

  @Get(':campaignId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read a public campaign detail by campaign id' })
  byId(@Param('campaignId') campaignId: string): Promise<CampaignBannerDetail> {
    return this.campaigns.publicById(campaignId);
  }
}
