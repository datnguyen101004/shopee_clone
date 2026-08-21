import type { AdminReportedReviewListResponse, AdminReviewActionResult, AdminReviewDetail } from '@shopee-clone/contracts';
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createHash } from 'node:crypto';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { ReviewsService } from '../reviews/reviews.service';
import { AdminExceptionFilter } from './admin-exception.filter';
import type { AdminReviewActionDto } from './admin-reviews.dto';
import { AdminInvalidInputError } from './admin.errors';

@ApiTags('admin-reviews')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Invalid review action request' })
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Admin role required' })
@ApiResponse({ status: 404, description: 'Review not found' })
@ApiResponse({ status: 409, description: 'Stale version conflict or idempotency mismatch' })
@Controller('admin/reviews')
@UseFilters(AdminExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('admin')
export class AdminReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviewsService: ReviewsService) {}

  @Get('reported')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List reviews currently reported by their seller' })
  async listReportedReviews(): Promise<AdminReportedReviewListResponse> {
    return { items: await this.reviewsService.adminListReportedReviews() };
  }

  @Get(':reviewId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Get full review details and moderation event history for admin' })
  @ApiParam({ name: 'reviewId', format: 'uuid', description: 'Review identifier' })
  @ApiResponse({ status: 200, description: 'Admin review detail' })
  async getReview(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ): Promise<AdminReviewDetail> {
    return this.reviewsService.adminGetReview(reviewId);
  }

  @Post(':reviewId/actions')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Hide or restore a product review and refresh aggregates' })
  @ApiParam({ name: 'reviewId', format: 'uuid', description: 'Review identifier' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID idempotency key' })
  @ApiResponse({ status: 200, description: 'Review action result with refreshed aggregates' })
  async executeReviewAction(
    @Req() req: AuthenticatedRequest,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() input: AdminReviewActionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<AdminReviewActionResult> {
    if (!idempotencyKey) {
      throw new AdminInvalidInputError('Valid UUID Idempotency-Key header is required', {
        invalidParameters: ['Idempotency-Key'],
      });
    }

    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          actorAdminId: req.authUser!.id,
          reviewId,
          action: input.action,
          reason: input.reason.trim(),
          expectedVersion: input.expectedVersion,
        }),
      )
      .digest('hex');

    return this.reviewsService.adminExecuteReviewAction(
      req.authUser!.id,
      reviewId,
      input.action,
      input.reason,
      input.expectedVersion,
      idempotencyKey,
      digest,
    );
  }
}
