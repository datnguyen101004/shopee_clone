import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TrafficAdmissionController } from './traffic-admission.controller';
import { TrafficAdmissionGuard } from './traffic-admission.guard';
import { TrafficAdmissionService } from './traffic-admission.service';
import { TrafficAdmissionFilter } from './traffic-admission.filter';
import { AdmissionInternalController } from './admission-internal.controller';

@Module({
  imports: [AuthModule],
  controllers: [TrafficAdmissionController, AdmissionInternalController],
  providers: [TrafficAdmissionService, TrafficAdmissionGuard, TrafficAdmissionFilter],
  exports: [TrafficAdmissionService, TrafficAdmissionGuard],
})
export class TrafficAdmissionModule {}
