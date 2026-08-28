import { Controller, Get, NotFoundException } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return { status: 'ok', service: 'demo-carrier', simulation: true };
  }
}
