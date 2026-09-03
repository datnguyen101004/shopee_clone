import type { SellerShopReviewListResponse } from '@shopee-clone/contracts';
import { parseCreateSellerReviewReportRequest, SELLER_REVIEW_REPORT_REASON_CODES } from '@shopee-clone/contracts';
import { Body, Controller, Get, Header, Headers, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { ReviewsExceptionFilter } from './reviews-exception.filter';
import { ReviewValidationError } from './reviews.errors';
import { ReviewsService } from './reviews.service';

@ApiTags('seller-review-reports')
@ApiBearerAuth()
@Controller('seller/reviews')
@UseFilters(ReviewsExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('seller')
export class SellerReviewReportsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List reviews for products in the authenticated seller shop' })
  async list(@Req() request: AuthenticatedRequest): Promise<SellerShopReviewListResponse> {
    return this.reviews.listSellerShopReviews(request.authUser!.id);
  }

  @Post(':reviewId/reports')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Report a review belonging to the authenticated seller shop' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID idempotency key' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reasonCode'],
      additionalProperties: false,
      properties: {
        reasonCode: { type: 'string', enum: [...SELLER_REVIEW_REPORT_REASON_CODES] },
        details: { type: 'string', minLength: 1, maxLength: 1000 },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Seller review report receipt' })
  async report(
    @Req() request: AuthenticatedRequest,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      throw new ReviewValidationError(['Idempotency-Key']);
    }
    const input = parseCreateSellerReviewReportRequest(body);
    if (!input) throw new ReviewValidationError(['request']);
    const digest = createHash('sha256').update(JSON.stringify({ reviewId, reasonCode: input.reasonCode, details: input.details?.trim() ?? '' })).digest('hex');
    return this.reviews.submitSellerReviewReport(request.authUser!.id, reviewId, input, idempotencyKey, digest);
  }
}
