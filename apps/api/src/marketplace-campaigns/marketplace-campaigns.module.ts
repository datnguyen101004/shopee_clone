import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SellerShopScopeService } from '../seller-scope/seller-shop-scope.service';
import { AdminMarketplaceCampaignsController } from './admin-marketplace-campaigns.controller';
import { AdminCampaignTypesController } from './admin-campaign-types.controller';
import { MarketplaceCampaignsController } from './marketplace-campaigns.controller';
import { MarketplaceCampaignExceptionFilter } from './marketplace-campaigns.exception-filter';
import { MarketplaceCampaignsService } from './marketplace-campaigns.service';
import { SellerMarketplaceCampaignsController } from './seller-marketplace-campaigns.controller';
import { CampaignNotificationScheduler } from './campaign-notification.scheduler';
import { FlashSaleService } from './flash-sale.service';
import { CacheModule } from '../cache/cache.module';
import { FlashSaleOutboxProcessor } from './flash-sale-outbox.processor';

@Module({ imports: [AuthModule, NotificationsModule, CacheModule], controllers: [MarketplaceCampaignsController, AdminMarketplaceCampaignsController, AdminCampaignTypesController, SellerMarketplaceCampaignsController], providers: [MarketplaceCampaignsService, FlashSaleService, FlashSaleOutboxProcessor, MarketplaceCampaignExceptionFilter, SellerShopScopeService, CampaignNotificationScheduler], exports: [MarketplaceCampaignsService, FlashSaleService] })
export class MarketplaceCampaignsModule {}
