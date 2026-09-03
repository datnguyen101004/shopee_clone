import type { ReporterReportDetail, ReporterReportListResponse } from '@shopee-clone/contracts';
import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
// DTO classes must remain runtime values for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ReporterReportQueryDto } from './reporting.dto';
import { ReportingExceptionFilter } from './reporting-exception.filter';
import { ReportingService } from './reporting.service';

@ApiTags('account')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Invalid query parameters' })
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Forbidden' })
@ApiResponse({ status: 404, description: 'Report not found' })
@Controller('account/reports')
@UseFilters(ReportingExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('buyer')
export class AccountReportsController {
  constructor(@Inject(ReportingService) private readonly reportingService: ReportingService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List submitted reports for the authenticated account' })
  @ApiResponse({ status: 200, description: 'Report summary list' })
  listReports(
    @Req() req: AuthenticatedRequest,
    @Query() query: ReporterReportQueryDto,
  ): Promise<ReporterReportListResponse> {
    return this.reportingService.listReporterReports(req.authUser!.id, query);
  }

  @Get(':reportId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Get details of an owned violation report' })
  @ApiParam({ name: 'reportId', format: 'uuid', description: 'Report identifier' })
  @ApiResponse({ status: 200, description: 'Report detail' })
  getReport(
    @Req() req: AuthenticatedRequest,
    @Param('reportId') reportId: string,
  ): Promise<ReporterReportDetail> {
    return this.reportingService.getReporterReportDetail(req.authUser!.id, reportId);
  }
}
