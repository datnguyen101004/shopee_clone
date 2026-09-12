import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SellerAnalyticsController } from './seller-analytics.controller';
import { SellerAnalyticsExceptionFilter } from './seller-analytics.exception-filter';
import { SellerAnalyticsService } from './seller-analytics.service';
import { SellerShopScopeService } from '../seller-scope/seller-shop-scope.service';
import { CLICKSTREAM_ANALYTICS_CONFIG, loadClickstreamAnalyticsConfig } from '../clickstream-analytics/clickstream-analytics.config';
import { AthenaEngagementQueryAdapter } from '../clickstream-analytics/athena-engagement.adapter';

@Module({ imports: [AuthModule], controllers: [SellerAnalyticsController], providers: [SellerAnalyticsService, SellerAnalyticsExceptionFilter, SellerShopScopeService, { provide: CLICKSTREAM_ANALYTICS_CONFIG, useFactory: loadClickstreamAnalyticsConfig }, { provide: AthenaEngagementQueryAdapter, useFactory: (config: ReturnType<typeof loadClickstreamAnalyticsConfig>) => new AthenaEngagementQueryAdapter(config), inject: [CLICKSTREAM_ANALYTICS_CONFIG] }], exports: [SellerAnalyticsService] })
export class SellerAnalyticsModule {}
