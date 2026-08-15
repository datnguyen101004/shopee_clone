import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, Patch, Query, Req, Res, UploadedFile, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { formatReviewVersionEtag, parseCreateProductReviewRequest, parseProductReviewQuery, parseReviewIdempotencyKey, parseReviewVersionEtag, parseUpdateProductReviewRequest, type AuthorProductReview, type PublicProductReviewPage, type ReviewMediaStageResponse } from '@shopee-clone/contracts';

import { AuthenticationFailedError } from '../auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { ReviewMediaStorage } from './review-media.storage';
import { ReviewsExceptionFilter } from './reviews-exception.filter';
import { ReviewMediaError, ReviewValidationError } from './reviews.errors';
import { ReviewsService } from './reviews.service';

function dimensions(data: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === 'image/png' && data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  if (mimeType === 'image/jpeg' && data[0] === 0xff && data[1] === 0xd8) {
    for (let index = 2; index + 9 < data.length;) { if (data[index] !== 0xff) { index += 1; continue; } const marker = data[index + 1]!; const length = data.readUInt16BE(index + 2); if ([0xc0, 0xc1, 0xc2].includes(marker) && index + 9 < data.length) return { height: data.readUInt16BE(index + 5), width: data.readUInt16BE(index + 7) }; index += Math.max(length + 2, 2); }
  }
  if (mimeType === 'image/webp' && data.length >= 30 && data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP' && data.subarray(12, 16).toString() === 'VP8X') return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  return null;
}

@ApiTags('product reviews')
@Controller()
@UseFilters(ReviewsExceptionFilter)
export class ReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService, @Inject(ReviewMediaStorage) private readonly storage: ReviewMediaStorage) {}

  @Get('catalog/products/:productId/reviews')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Public verified product reviews' })
  async publicPage(@Param('productId') productId: string, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: Response): Promise<PublicProductReviewPage> {
    const parsed = parseProductReviewQuery(query);
    if (!parsed) throw new ReviewValidationError(['query']);
    response.setHeader('Cache-Control', 'public, max-age=30');
    return this.reviews.publicPage(productId, parsed);
  }

  @Get('review-media/:mediaId')
  async media(@Param('mediaId') mediaId: string, @Res() response: Response): Promise<void> {
    const media = await this.reviews.attachedMedia(mediaId);
    if (!media) { response.status(404).end(); return; }
    const data = await this.storage.read(media.storageKey);
    if (!data) { response.status(404).end(); return; }
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.type(media.mimeType).send(data);
  }

  @Post('account/review-media')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 5 * 1024 * 1024 } }))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Stage one authenticated review image for 24 hours' })
  async stage(@Req() request: AuthenticatedRequest, @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined): Promise<ReviewMediaStageResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) || file.size < 1) throw new ReviewMediaError('invalid-review-media');
    const size = dimensions(file.buffer, file.mimetype);
    if (!size || size.width < 1 || size.height < 1 || size.width > 5_000 || size.height > 5_000) throw new ReviewMediaError('invalid-review-media');
    const storageKey = await this.storage.write(file.mimetype, file.buffer);
    let media;
    try {
      media = await this.reviews.stage(request.authUser.id, { buffer: file.buffer, mimeType: file.mimetype, width: size.width, height: size.height, storageKey });
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
    return { id: media.id, mimeType: media.mimeType as ReviewMediaStageResponse['mimeType'], width: media.width, height: media.height, expiresAt: media.expiresAt!.toISOString() };
  }

  @Get('account/reviews/:reviewId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async detail(@Req() request: AuthenticatedRequest, @Param('reviewId') reviewId: string, @Res({ passthrough: true }) response: Response): Promise<AuthorProductReview> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const review = await this.reviews.authorDetail(request.authUser.id, reviewId);
    response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('ETag', formatReviewVersionEtag(review.version));
    return review;
  }

  @Post('account/orders/:orderReference/lines/:lineId/review')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: { example: { rating: 5, text: 'Sản phẩm tốt.', mediaIds: [] } } })
  async create(
    @Req() request: AuthenticatedRequest,
    @Param('orderReference') orderReference: string,
    @Param('lineId') lineId: string,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthorProductReview> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const key = parseReviewIdempotencyKey(rawKey);
    const input = parseCreateProductReviewRequest(body);
    if (!key || !input) throw new ReviewValidationError([...(key ? [] : ['idempotencyKey']), ...(input ? [] : ['request'])]);
    const review = await this.reviews.create(request.authUser.id, orderReference, lineId, key, input);
    response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('ETag', formatReviewVersionEtag(review.version));
    return review;
  }

  @Patch('account/reviews/:reviewId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'If-Match', required: true })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('reviewId') reviewId: string,
    @Headers('if-match') rawEtag: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthorProductReview> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const version = parseReviewVersionEtag(rawEtag);
    const input = parseUpdateProductReviewRequest(body);
    if (version === null || !input) throw new ReviewValidationError([...(version === null ? ['ifMatch'] : []), ...(input ? [] : ['request'])]);
    const review = await this.reviews.update(request.authUser.id, reviewId, version, input);
    response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('ETag', formatReviewVersionEtag(review.version));
    return review;
  }
}
