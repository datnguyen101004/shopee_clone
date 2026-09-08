import type { CampaignBannerDetail, FlashSaleStatusResponse } from '@shopee-clone/contracts';
import { Controller, Get, Header, Inject, Param, Query, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MarketplaceCampaignExceptionFilter } from './marketplace-campaigns.exception-filter';
import { MarketplaceCampaignsService } from './marketplace-campaigns.service';
import { FlashSaleService } from './flash-sale.service';
// DTO class is required at runtime by Nest's ValidationPipe metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { FlashSaleStatusQueryDto } from './flash-sale.dto';

@ApiTags('campaigns')
@Controller('campaigns')
@UseFilters(MarketplaceCampaignExceptionFilter)
export class MarketplaceCampaignsController {
  constructor(@Inject(MarketplaceCampaignsService) private readonly campaigns: MarketplaceCampaignsService, @Inject(FlashSaleService) private readonly flashSales: FlashSaleService) {}

  @Get(':campaignId/flash-sale/status')
  @Header('Cache-Control', 'public, max-age=0, must-revalidate')
  @ApiOperation({ summary: 'Read batched public Flash Sale SKU status' })
  status(@Param('campaignId') campaignId: string, @Query() query: FlashSaleStatusQueryDto): Promise<FlashSaleStatusResponse> {
    const raw = query.variantIds;
    const ids = raw === undefined ? undefined : (Array.isArray(raw) ? raw : raw.split(',')).map((item) => item.trim()).filter(Boolean);
    return this.flashSales.publicStatus(campaignId, ids);
  }

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
