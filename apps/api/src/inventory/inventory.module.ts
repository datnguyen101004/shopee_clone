import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryExceptionFilter } from './inventory.exception-filter';
import { InventoryService } from './inventory.service';
import { InventoryReservationQueueService } from './inventory-reservation-queue.service';

@Module({ imports: [AuthModule], controllers: [InventoryController], providers: [InventoryService, InventoryExceptionFilter, InventoryReservationQueueService], exports: [InventoryService, InventoryReservationQueueService] })
export class InventoryModule {}
