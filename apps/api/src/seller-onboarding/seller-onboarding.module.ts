import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminShopApprovalController } from './admin-shop-approval.controller';
import { SellerOnboardingExceptionFilter } from './seller-onboarding-exception.filter';
import { SellerOnboardingRepository } from './seller-onboarding.repository';
import { SellerOnboardingService } from './seller-onboarding.service';
import { SellerShopController } from './seller-shop.controller';

@Module({
  imports: [AuthModule],
  controllers: [SellerShopController, AdminShopApprovalController],
  providers: [SellerOnboardingExceptionFilter, SellerOnboardingRepository, SellerOnboardingService],
})
export class SellerOnboardingModule {}

