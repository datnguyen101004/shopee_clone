import { Body, Controller, Delete, Get, Header, Headers, Inject, Param, Patch, Post, Query, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  formatSellerPromotionVersionEtag,
  inspectSellerDiscountCreateRequest,
  inspectSellerDiscountUpdateRequest,
  inspectSellerVoucherCreateRequest,
  inspectSellerVoucherUpdateRequest,
  parseSellerPromotionActionRequest,
  parseSellerPromotionIdempotencyKey,
  parseSellerPromotionListQuery,
  parseSellerPromotionVersionEtag,
  type SellerDiscountPage,
  type SellerDiscountSummary,
  type SellerPromotionRequestInspection,
  type SellerVoucherDeleteResult,
  type SellerVoucherPage,
  type SellerVoucherSummary,
} from '@shopee-clone/contracts';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthOriginGuard } from '../auth/auth-origin.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { AuthenticationFailedError } from '../auth/auth.errors';
import { SellerPromotionsExceptionFilter } from './seller-promotions.exception-filter';
import { SellerPromotionsService } from './seller-promotions.service';
import { SellerPromotionValidationError } from './seller-promotions.errors';

@ApiTags('seller promotions')
@ApiBearerAuth()
@Controller('seller/promotions')
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('seller')
@UseFilters(SellerPromotionsExceptionFilter)
export class SellerPromotionsController {
  constructor(@Inject(SellerPromotionsService) private readonly promotions: SellerPromotionsService) {}
  private user(request: AuthenticatedRequest): string { if (!request.authUser) throw new AuthenticationFailedError(); return request.authUser.id; }

  private requireInspected<T>(inspected: SellerPromotionRequestInspection<T>, extra: Array<{ ok: boolean; field: string; detail: string }> = []): T {
    const invalidParameters: string[] = [];
    const details: string[] = [];
    if (!inspected.ok) {
      invalidParameters.push(...inspected.invalidParameters);
      details.push(inspected.detail);
    }
    for (const item of extra) {
      if (item.ok) continue;
      if (!invalidParameters.includes(item.field)) invalidParameters.push(item.field);
      if (!details.includes(item.detail)) details.push(item.detail);
    }
    if (invalidParameters.length) throw new SellerPromotionValidationError(invalidParameters, details.join(' ') || 'One or more promotion fields are invalid.');
    return (inspected as { ok: true; value: T }).value;
  }

  @Get('vouchers') @Header('Cache-Control', 'no-store') async listVouchers(@Req() req: AuthenticatedRequest, @Query() raw: Record<string, string | string[] | undefined>): Promise<SellerVoucherPage> {
    const query = parseSellerPromotionListQuery(raw);
    if (!query) throw new SellerPromotionValidationError(['query'], 'List query is invalid.');
    return this.promotions.listVouchers(this.user(req), query);
  }

  @Post('vouchers') @UseGuards(AuthOriginGuard) async createVoucher(@Req() req: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<SellerVoucherSummary> {
    const idempotencyKey = parseSellerPromotionIdempotencyKey(key);
    const input = this.requireInspected(inspectSellerVoucherCreateRequest(body), [
      { ok: Boolean(idempotencyKey), field: 'idempotencyKey', detail: 'Idempotency-Key must be a UUID.' },
    ]);
    const result = await this.promotions.createVoucher(this.user(req), input, idempotencyKey!);
    response.setHeader('ETag', formatSellerPromotionVersionEtag(result.version));
    return result;
  }

  @Get('vouchers/:id') @Header('Cache-Control', 'no-store') async getVoucher(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Res({ passthrough: true }) response: Response): Promise<SellerVoucherSummary> {
    const result = await this.promotions.getVoucher(this.user(req), id);
    response.setHeader('ETag', formatSellerPromotionVersionEtag(result.version));
    return result;
  }

  @Patch('vouchers/:id') @UseGuards(AuthOriginGuard) async updateVoucher(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('if-match') etag: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<SellerVoucherSummary> {
    const version = parseSellerPromotionVersionEtag(etag);
    const input = this.requireInspected(inspectSellerVoucherUpdateRequest(body), [
      { ok: version !== null, field: 'ifMatch', detail: 'If-Match must be a seller-promotion ETag.' },
    ]);
    const result = await this.promotions.updateVoucher(this.user(req), id, version!, input);
    response.setHeader('ETag', formatSellerPromotionVersionEtag(result.version));
    return result;
  }

  @Post('vouchers/:id/actions') @UseGuards(AuthOriginGuard) async actionVoucher(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('if-match') etag: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<SellerVoucherSummary> {
    const version = parseSellerPromotionVersionEtag(etag);
    const idempotencyKey = parseSellerPromotionIdempotencyKey(key);
    const input = parseSellerPromotionActionRequest(body);
    const invalidParameters: string[] = [];
    const details: string[] = [];
    if (version === null) { invalidParameters.push('ifMatch'); details.push('If-Match must be a seller-promotion ETag.'); }
    if (!idempotencyKey) { invalidParameters.push('idempotencyKey'); details.push('Idempotency-Key must be a UUID.'); }
    if (!input) { invalidParameters.push('request'); details.push('Action request body is invalid.'); }
    if (invalidParameters.length) throw new SellerPromotionValidationError(invalidParameters, details.join(' '));
    const result = await this.promotions.actionVoucher(this.user(req), id, version!, input!.action, idempotencyKey!);
    response.setHeader('ETag', formatSellerPromotionVersionEtag(result.version));
    return result;
  }

  @Delete('vouchers/:id') @UseGuards(AuthOriginGuard) async deleteVoucher(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('if-match') etag: string | undefined): Promise<SellerVoucherDeleteResult> {
    const version = parseSellerPromotionVersionEtag(etag);
    if (version === null) throw new SellerPromotionValidationError(['ifMatch'], 'If-Match must be a seller-promotion ETag.');
    return this.promotions.deleteVoucher(this.user(req), id, version);
  }

  @Get('discounts') @Header('Cache-Control', 'no-store') async listDiscounts(@Req() req: AuthenticatedRequest, @Query() raw: Record<string, string | string[] | undefined>): Promise<SellerDiscountPage> {
    const query = parseSellerPromotionListQuery(raw);
    if (!query) throw new SellerPromotionValidationError(['query'], 'List query is invalid.');
    return this.promotions.listDiscounts(this.user(req), query);
  }

  @Post('discounts') @UseGuards(AuthOriginGuard) async createDiscount(@Req() req: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<SellerDiscountSummary> {
    const idempotencyKey = parseSellerPromotionIdempotencyKey(key);
    const input = this.requireInspected(inspectSellerDiscountCreateRequest(body), [
      { ok: Boolean(idempotencyKey), field: 'idempotencyKey', detail: 'Idempotency-Key must be a UUID.' },
    ]);
    const result = await this.promotions.createDiscount(this.user(req), input, idempotencyKey!);
    response.setHeader('ETag', formatSellerPromotionVersionEtag(result.version));
    return result;
  }

  @Get('discounts/:id') @Header('Cache-Control', 'no-store') async getDiscount(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Res({ passthrough: true }) response: Response): Promise<SellerDiscountSummary> {
    const result = await this.promotions.getDiscount(this.user(req), id);
    response.setHeader('ETag', formatSellerPromotionVersionEtag(result.version));
    return result;
  }

  @Patch('discounts/:id') @UseGuards(AuthOriginGuard) async updateDiscount(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('if-match') etag: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<SellerDiscountSummary> {
    const version = parseSellerPromotionVersionEtag(etag);
    const input = this.requireInspected(inspectSellerDiscountUpdateRequest(body), [
      { ok: version !== null, field: 'ifMatch', detail: 'If-Match must be a seller-promotion ETag.' },
    ]);
    const result = await this.promotions.updateDiscount(this.user(req), id, version!, input);
    response.setHeader('ETag', formatSellerPromotionVersionEtag(result.version));
    return result;
  }

  @Post('discounts/:id/actions') @UseGuards(AuthOriginGuard) async actionDiscount(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('if-match') etag: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<SellerDiscountSummary> {
    const version = parseSellerPromotionVersionEtag(etag);
    const idempotencyKey = parseSellerPromotionIdempotencyKey(key);
    const input = parseSellerPromotionActionRequest(body);
    const invalidParameters: string[] = [];
    const details: string[] = [];
    if (version === null) { invalidParameters.push('ifMatch'); details.push('If-Match must be a seller-promotion ETag.'); }
    if (!idempotencyKey) { invalidParameters.push('idempotencyKey'); details.push('Idempotency-Key must be a UUID.'); }
    if (!input) { invalidParameters.push('request'); details.push('Action request body is invalid.'); }
    if (invalidParameters.length) throw new SellerPromotionValidationError(invalidParameters, details.join(' '));
    const result = await this.promotions.actionDiscount(this.user(req), id, version!, input!.action, idempotencyKey!);
    response.setHeader('ETag', formatSellerPromotionVersionEtag(result.version));
    return result;
  }
}
