import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductRetentionModule } from '../product-retention/product-retention.module';
import { ChatModule } from '../chat/chat.module';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
  imports: [InventoryModule, ProductRetentionModule, ChatModule],
})
export class HealthModule {}
