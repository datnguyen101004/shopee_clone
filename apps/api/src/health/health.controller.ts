import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@shopee-clone/contracts';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
