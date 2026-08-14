import {
  CHECKOUT_IDEMPOTENCY_KEY_PATTERN,
  parseCheckoutConfirmationRequest,
  parseCheckoutPreviewRequest,
  type CheckoutConfirmationResponse,
  type CheckoutPreviewResponse,
  type PurchaseResult,
} from '@shopee-clone/contracts';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { AuthenticationFailedError } from '../auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CheckoutConfirmationDto, CheckoutPreviewDto } from './checkout.dto';
import { CheckoutExceptionFilter } from './checkout-exception.filter';
import { CheckoutCartConflictError, CheckoutValidationError } from './checkout.errors';
import { CheckoutService } from './checkout.service';

function expectedVersion(value: string | undefined): number {
  const match = /^"cart-(0|[1-9][0-9]*)"$/.exec(value ?? '');
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version)) throw new CheckoutCartConflictError();
  return version;
}

@ApiTags('checkout')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Strict checkout validation failed' })
@ApiResponse({ status: 401, description: 'A valid buyer session is required' })
@ApiResponse({ status: 403, description: 'Mutation browser origin is not allowed' })
@ApiResponse({ status: 404, description: 'Owned address or purchase was not found' })
@ApiResponse({ status: 409, description: 'Cart, preview, readiness, or idempotency conflict' })
@ApiResponse({ status: 503, description: 'Checkout could not be completed safely' })
@Controller('checkout')
@UseFilters(CheckoutExceptionFilter)
@UseGuards(AuthGuard)
export class CheckoutController {
  constructor(@Inject(CheckoutService) private readonly checkout: CheckoutService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Build a server-authoritative COD checkout preview' })
  @ApiHeader({ name: 'If-Match', required: true, example: '"cart-7"' })
  @ApiBody({ type: CheckoutPreviewDto })
  @ApiOkResponse({ description: 'Itemized checkout-v1 preview with readiness and fingerprint' })
  async preview(
    @Req() request: AuthenticatedRequest,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: CheckoutPreviewDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CheckoutPreviewResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    const parsed = parseCheckoutPreviewRequest(input);
    if (!parsed) throw new CheckoutValidationError(['request']);
    const result = await this.checkout.preview(
      request.authUser.id,
      expectedVersion(ifMatch),
      parsed,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', `"cart-${result.cartVersion}"`);
    return result;
  }

  @Post('cod')
  @ApiOperation({ summary: 'Confirm COD and atomically create one order per shop' })
  @ApiHeader({ name: 'If-Match', required: true, example: '"cart-7"' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    example: '8b63c715-a17c-4da3-8cab-3ec56cf45964',
  })
  @ApiBody({ type: CheckoutConfirmationDto })
  @ApiCreatedResponse({ description: 'First successful purchase creation' })
  @ApiOkResponse({ description: 'Idempotent replay of the original purchase' })
  async confirmCod(
    @Req() request: AuthenticatedRequest,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CheckoutConfirmationDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CheckoutConfirmationResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    if (!idempotencyKey || !CHECKOUT_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new CheckoutValidationError(['idempotencyKey']);
    }
    const parsed = parseCheckoutConfirmationRequest(input);
    if (!parsed) throw new CheckoutValidationError(['request']);
    const result = await this.checkout.confirmCod(
      request.authUser.id,
      expectedVersion(ifMatch),
      idempotencyKey,
      parsed,
    );
    response.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', `"cart-${result.purchase.sourceCartVersion + 1}"`);
    return result;
  }

  @Get('purchases/:purchaseReference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the authenticated buyer checkout confirmation result' })
  @ApiParam({ name: 'purchaseReference', format: 'uuid' })
  @ApiOkResponse({ description: 'Immutable purchase and per-shop order snapshots' })
  async purchase(
    @Req() request: AuthenticatedRequest,
    @Param('purchaseReference') purchaseReference: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PurchaseResult> {
    if (!request.authUser) throw new AuthenticationFailedError();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(purchaseReference)) {
      throw new CheckoutValidationError(['purchaseReference']);
    }
    response.setHeader('Cache-Control', 'private, no-store');
    return this.checkout.getPurchase(request.authUser.id, purchaseReference);
  }
}
