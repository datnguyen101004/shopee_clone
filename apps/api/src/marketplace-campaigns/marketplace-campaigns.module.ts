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

@Module({ imports: [AuthModule, NotificationsModule], controllers: [MarketplaceCampaignsController, AdminMarketplaceCampaignsController, AdminCampaignTypesController, SellerMarketplaceCampaignsController], providers: [MarketplaceCampaignsService, MarketplaceCampaignExceptionFilter, SellerShopScopeService, CampaignNotificationScheduler], exports: [MarketplaceCampaignsService] })
export class MarketplaceCampaignsModule {}
