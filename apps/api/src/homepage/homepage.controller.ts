import { Controller, Get, Header, Inject, UseFilters } from '@nestjs/common';
import type { HomepageResponse } from '@shopee-clone/contracts';

import { HomepageExceptionFilter } from './homepage-exception.filter';
import { HomepageService } from './homepage.service';

@Controller('homepage')
@UseFilters(HomepageExceptionFilter)
export class HomepageController {
  constructor(@Inject(HomepageService) private readonly service: HomepageService) {}

  /** Public aggregate consumed by the server-rendered marketplace homepage. */
  @Get()
  @Header('Cache-Control', 'no-store')
  getHomepage(): Promise<HomepageResponse> {
    return this.service.getHomepage();
  }
}
