import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, Res, UploadedFile, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { AuthenticationFailedError } from '../auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { SellerProductMediaError } from './seller-products.errors';
import { SellerProductMediaStorage, imageDimensions } from './seller-product-media.storage';
import { SellerProductsExceptionFilter } from './seller-products-exception.filter';
import { SellerProductsService } from './seller-products.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SellerProductMediaCompleteDto, SellerProductMediaUploadIntentDto } from './seller-products.dto';

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

@ApiTags('seller product media')
@ApiBearerAuth()
@Controller()
@UseFilters(SellerProductsExceptionFilter)
export class SellerProductMediaController {
  constructor(
    @Inject(SellerProductsService) private readonly products: SellerProductsService,
    @Inject(SellerProductMediaStorage) private readonly storage: SellerProductMediaStorage,
  ) {}

  @Post('seller/products/media/upload-intents')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles('seller')
  @ApiOperation({ summary: 'Create a five-minute direct-to-private-S3 product image upload intent' })
  async createUploadIntent(@Req() request: AuthenticatedRequest, @Body() input: SellerProductMediaUploadIntentDto) {
    if (!request.authUser) throw new AuthenticationFailedError();
    return this.products.createMediaUploadIntent(request.authUser.id, input);
  }

  @Post('seller/products/media/:mediaId/complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles('seller')
  @ApiOperation({ summary: 'Verify a private S3 upload and stage it for product attachment' })
  async completeUpload(@Req() request: AuthenticatedRequest, @Param('mediaId') mediaId: string, @Body() _input: SellerProductMediaCompleteDto) {
    if (!request.authUser) throw new AuthenticationFailedError();
    void _input;
    return this.products.completeMediaUpload(request.authUser.id, mediaId);
  }

  @Post('seller/products/media')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles('seller')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Stage one seller product image for 24 hours' })
  async stage(@Req() request: AuthenticatedRequest, @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined) {
    if (!request.authUser) throw new AuthenticationFailedError();
    if (!file || !(allowedMimeTypes as readonly string[]).includes(file.mimetype) || file.size < 1) throw new SellerProductMediaError();
    const dimensions = imageDimensions(file.buffer, file.mimetype);
    if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 5_000 || dimensions.height > 5_000) throw new SellerProductMediaError();
    const storageKey = await this.storage.write(file.mimetype, file.buffer);
    try {
      const media = await this.products.stageMedia(request.authUser.id, { storageKey, mimeType: file.mimetype, byteSize: file.size, width: dimensions.width, height: dimensions.height });
      return { id: media.id, mimeType: media.mimeType, byteSize: media.byteSize, width: media.width, height: media.height, previewUrl: `/api/v1/seller/products/media/${media.id}/preview`, expiresAt: media.expiresAt!.toISOString() };
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  @Get('seller/products/media/:mediaId/preview')
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles('seller')
  @ApiOperation({ summary: 'Preview one seller-owned staged product image' })
  async preview(@Req() request: AuthenticatedRequest, @Param('mediaId') mediaId: string, @Res() response: Response): Promise<void> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const media = await this.products.stagedMedia(request.authUser.id, mediaId);
    if (!media) { response.status(404).end(); return; }
    const target = await this.storage.readTarget(media.storageKey);
    if (!target) { response.status(404).end(); return; }
    this.setPrivateMediaHeaders(response);
    if (target.kind === 'cloudfront') {
      response.status(HttpStatus.TEMPORARY_REDIRECT).setHeader('Location', target.url).end();
      return;
    }
    response.type(media.mimeType).send(target.data);
  }

  @Get('product-media/:mediaId')
  @ApiOperation({ summary: 'Read an attached seller product image' })
  async attached(@Param('mediaId') mediaId: string, @Res() response: Response): Promise<void> {
    const media = await this.products.attachedMedia(mediaId);
    if (!media) { response.status(404).end(); return; }
    const target = await this.storage.readTarget(media.storageKey, { allowPublic: true });
    if (!target) { response.status(404).end(); return; }
    this.setPrivateMediaHeaders(response);
    if (target.kind === 'cloudfront') {
      response.status(HttpStatus.TEMPORARY_REDIRECT).setHeader('Location', target.url).end();
      return;
    }
    response.type(media.mimeType).send(target.data);
  }

  private setPrivateMediaHeaders(response: Response): void {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Referrer-Policy', 'no-referrer');
  }
}
