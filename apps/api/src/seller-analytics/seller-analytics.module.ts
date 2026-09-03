import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SellerAnalyticsController } from './seller-analytics.controller';
import { SellerAnalyticsExceptionFilter } from './seller-analytics.exception-filter';
import { SellerAnalyticsService } from './seller-analytics.service';
import { SellerShopScopeService } from '../seller-scope/seller-shop-scope.service';

@Module({ imports: [AuthModule], controllers: [SellerAnalyticsController], providers: [SellerAnalyticsService, SellerAnalyticsExceptionFilter, SellerShopScopeService], exports: [SellerAnalyticsService] })
export class SellerAnalyticsModule {}
