import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PRODUCT_RETENTION_CRON, PRODUCT_RETENTION_TIME_ZONE } from './product-retention.constants';
import { ProductRetentionCleanupService } from './product-retention-cleanup.service';

@Injectable()
export class ProductRetentionSchedulerService {
  constructor(@Inject(ProductRetentionCleanupService) private readonly cleanup: ProductRetentionCleanupService) {}

  @Cron(PRODUCT_RETENTION_CRON, {
    name: 'product-retention-cleanup',
    timeZone: PRODUCT_RETENTION_TIME_ZONE,
  })
  async runDailyCleanup(): Promise<void> {
    await this.cleanup.run();
  }
}
