import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SellerPromotionsController } from './seller-promotions.controller';
import { SellerPromotionsExceptionFilter } from './seller-promotions.exception-filter';
import { SellerPromotionsService } from './seller-promotions.service';
import { SellerShopScopeService } from '../seller-scope/seller-shop-scope.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [SellerPromotionsController],
  providers: [SellerPromotionsExceptionFilter, SellerPromotionsService, SellerShopScopeService],
  exports: [SellerPromotionsService],
})
export class SellerPromotionsModule {}
