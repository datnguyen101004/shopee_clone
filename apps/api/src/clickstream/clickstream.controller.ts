import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ClickstreamAcceptanceResponse } from '@shopee-clone/contracts';

import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { ClickstreamService } from './clickstream.service';
import { ClickstreamExceptionFilter } from './clickstream.exception-filter';

@ApiTags('clickstream')
@Controller('clickstream')
@UseGuards(OptionalAuthGuard)
@UseFilters(ClickstreamExceptionFilter)
export class ClickstreamController {
  constructor(@Inject(ClickstreamService) private readonly clickstream: ClickstreamService) {}

  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Accept a privacy-safe first-party clickstream event' })
  async capture(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ClickstreamAcceptanceResponse> {
    return this.clickstream.capture(body, {
      userId: request.authUser?.id,
      authSessionId: request.authSessionId,
    });
  }
}
