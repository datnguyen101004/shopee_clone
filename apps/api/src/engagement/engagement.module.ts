import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EngagementClock } from './engagement-clock';
import { EngagementController } from './engagement.controller';
import { EngagementExceptionFilter } from './engagement-exception.filter';
import { EngagementRepository } from './engagement.repository';
import { EngagementService } from './engagement.service';

@Module({
  imports: [AuthModule],
  controllers: [EngagementController],
  providers: [EngagementClock, EngagementExceptionFilter, EngagementRepository, EngagementService],
})
export class EngagementModule {}
