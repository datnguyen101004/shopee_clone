import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SellerModerationNoticesController } from './seller-moderation-notices.controller';
import { SellerModerationNoticesRepository } from './seller-moderation-notices.repository';
import { SellerModerationNoticesService } from './seller-moderation-notices.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SellerModerationNoticesController],
  providers: [SellerModerationNoticesRepository, SellerModerationNoticesService],
  exports: [SellerModerationNoticesService, SellerModerationNoticesRepository],
})
export class SellerModerationNoticesModule {}
