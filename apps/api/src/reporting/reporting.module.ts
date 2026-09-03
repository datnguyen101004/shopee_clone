import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountReportsController } from './account-reports.controller';
import { ReportingController } from './reporting.controller';
import { ReportingRepository } from './reporting.repository';
import { ReportingService } from './reporting.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ReportingController, AccountReportsController],
  providers: [ReportingRepository, ReportingService],
  exports: [ReportingService, ReportingRepository],
})
export class ReportingModule {}
