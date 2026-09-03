import { Controller, Get, Header, Inject, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { HomepageResponse } from '@shopee-clone/contracts';

import { HomepageExceptionFilter } from './homepage-exception.filter';
import { HomepageService } from './homepage.service';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.guard';

@Controller('homepage')
@UseFilters(HomepageExceptionFilter)
@UseGuards(OptionalAuthGuard)
export class HomepageController {
  constructor(@Inject(HomepageService) private readonly service: HomepageService) {}

  /** Public aggregate consumed by the server-rendered marketplace homepage. */
  @Get()
  @Header('Cache-Control', 'no-store')
  getHomepage(@Req() request: AuthenticatedRequest): Promise<HomepageResponse> {
    return this.service.getHomepage(request.authUser?.id ?? null);
  }
}
