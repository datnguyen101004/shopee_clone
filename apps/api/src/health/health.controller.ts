import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse, ProductRetentionCleanupStatus } from '@shopee-clone/contracts';

import { HealthService } from './health.service';
import { InventoryReservationQueueService } from '../inventory/inventory-reservation-queue.service';
import { ProductRetentionCleanupService } from '../product-retention/product-retention-cleanup.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService, @Inject(InventoryReservationQueueService) private readonly reservationQueue: InventoryReservationQueueService, @Inject(ProductRetentionCleanupService) private readonly productRetention: ProductRetentionCleanupService) {}

  @Get()
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }

  @Get('inventory-reservations')
  async getInventoryReservationReadiness(): Promise<{
    schedulerReady: boolean;
    workerReady: boolean;
    backlog: number | null;
    active: number | null;
    failed: number | null;
    lastError: string | null;
  }> {
    return this.reservationQueue.getStatus();
  }

  @Get('product-retention')
  getProductRetentionStatus(): ProductRetentionCleanupStatus {
    return this.productRetention.getStatus();
  }
}
