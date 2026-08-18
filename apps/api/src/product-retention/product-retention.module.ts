import { Module } from '@nestjs/common';
import { SellerProductsModule } from '../seller-products/seller-products.module';

import { ProductRetentionCleanupService } from './product-retention-cleanup.service';
import { ProductRetentionSchedulerService } from './product-retention-scheduler.service';

@Module({
  imports: [SellerProductsModule],
  providers: [ProductRetentionCleanupService, ProductRetentionSchedulerService],
  exports: [ProductRetentionCleanupService],
})
export class ProductRetentionModule {}
