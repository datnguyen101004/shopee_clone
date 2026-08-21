import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import type { CreateReportDto } from './reporting.dto';
import { ReportingExceptionFilter } from './reporting-exception.filter';
import { ReportingService } from './reporting.service';

@ApiTags('reports')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Invalid report request or parameters' })
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Forbidden or self-reporting prohibited' })
@ApiResponse({ status: 404, description: 'Target not found or unavailable' })
@ApiResponse({ status: 409, description: 'Idempotency key conflict' })
@ApiResponse({ status: 429, description: 'Rate limit exceeded' })
@Controller('reports')
@UseFilters(ReportingExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('buyer')
export class ReportingController {
  constructor(@Inject(ReportingService) private readonly reportingService: ReportingService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a violation report for a public product or shop' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID idempotency key' })
  @ApiResponse({ status: 201, description: 'Report created successfully' })
  @ApiResponse({ status: 200, description: 'Idempotent report replay' })
  async createReport(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Body() input: CreateReportDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<void> {
    const result = await this.reportingService.submitReport(
      req.authUser!.id,
      input,
      idempotencyKey,
    );

    res.setHeader('Cache-Control', 'private, no-store');
    res.status(result.isReplay ? HttpStatus.OK : HttpStatus.CREATED).json(result.response);
  }
}
