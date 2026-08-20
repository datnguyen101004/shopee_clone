import { Controller, Get, Header, Inject, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { isSellerAnalyticsProductPage, isSellerDashboardResponse, parseSellerAnalyticsProductQuery, parseSellerAnalyticsQuery, type SellerAnalyticsProductPage, type SellerDashboardResponse } from '@shopee-clone/contracts';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { SellerAnalyticsExceptionFilter } from './seller-analytics.exception-filter';
import { SellerAnalyticsService } from './seller-analytics.service';
import { SellerAnalyticsUnavailableError, SellerAnalyticsValidationError } from './seller-analytics.errors';

@ApiTags('seller analytics')
@ApiBearerAuth()
@Controller('seller')
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('seller')
@UseFilters(SellerAnalyticsExceptionFilter)
export class SellerAnalyticsController {
  constructor(@Inject(SellerAnalyticsService) private readonly analytics: SellerAnalyticsService) {}

  @Get('dashboard')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read owner-scoped seller performance dashboard' })
  @ApiQuery({ name: 'from', required: true, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: true, example: '2026-08-31' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['DAY', 'WEEK', 'MONTH'] })
  async dashboard(@Req() request: AuthenticatedRequest, @Query() raw: Record<string, string | string[] | undefined>): Promise<SellerDashboardResponse> {
    if (!request.authUser) throw new SellerAnalyticsValidationError(['auth']);
    const query = parseSellerAnalyticsQuery(raw);
    if (!query) throw new SellerAnalyticsValidationError(['query']);
    const result = await this.analytics.dashboard(request.authUser.id, query);
    if (!isSellerDashboardResponse(result)) throw new SellerAnalyticsUnavailableError();
    return result;
  }

  @Get('analytics/products')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read paginated owner-scoped seller product performance' })
  async products(@Req() request: AuthenticatedRequest, @Query() raw: Record<string, string | string[] | undefined>): Promise<SellerAnalyticsProductPage> {
    if (!request.authUser) throw new SellerAnalyticsValidationError(['auth']);
    const query = parseSellerAnalyticsProductQuery(raw);
    if (!query) throw new SellerAnalyticsValidationError(['query']);
    const result = await this.analytics.products(request.authUser.id, query);
    if (!isSellerAnalyticsProductPage(result)) throw new SellerAnalyticsUnavailableError();
    return result;
  }
}
