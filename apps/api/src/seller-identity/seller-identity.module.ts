import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SellerIdentityLifecycleService } from './seller-identity-lifecycle.service';

@Module({
  imports: [PrismaModule],
  providers: [SellerIdentityLifecycleService],
  exports: [SellerIdentityLifecycleService],
})
export class SellerIdentityModule {}
