import { Module } from '@nestjs/common';

import { OrderHistoryModule } from '../order-history/order-history.module';
import { AuthModule } from '../auth/auth.module';
import { ReturnsController } from './returns.controller';
import { SystemReturnClock } from './return-clock';
import { ReturnEvidenceStorage } from './return-evidence.storage';
import { ReturnExceptionFilter } from './return-exception.filter';
import { ReturnProjector } from './return-projector';
import { ReturnRepository } from './return-repository';
import { ReturnService } from './return.service';

@Module({
  imports: [AuthModule, OrderHistoryModule],
  controllers: [ReturnsController],
  providers: [
    SystemReturnClock,
    ReturnEvidenceStorage,
    ReturnExceptionFilter,
    ReturnProjector,
    ReturnRepository,
    ReturnService,
  ],
  exports: [ReturnService, ReturnEvidenceStorage],
})
export class ReturnsModule {}
