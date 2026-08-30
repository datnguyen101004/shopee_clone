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
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OnlinePaymentCheckoutResponse, PaymentStatusResponse } from '@shopee-clone/contracts';
import { CHECKOUT_IDEMPOTENCY_KEY_PATTERN, parseOnlinePaymentCheckoutRequest } from '@shopee-clone/contracts';
import type { Response } from 'express';

import { AuthenticationFailedError } from '../auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CheckoutExceptionFilter } from '../checkout/checkout-exception.filter';
import { CheckoutCartConflictError, CheckoutValidationError } from '../checkout/checkout.errors';
import { OnlinePaymentService } from './online-payment.service';
import { OnlinePaymentCheckoutDto } from './payments.dto';

function expectedVersion(value: string | undefined): number {
  const match = /^"cart-(0|[1-9][0-9]*)"$/.exec(value ?? '');
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version)) throw new CheckoutCartConflictError();
  return version;
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
@UseFilters(CheckoutExceptionFilter)
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(@Inject(OnlinePaymentService) private readonly payments: OnlinePaymentService) {}

  @Post('checkout/online-payments')
  @ApiOperation({ summary: 'Create or replay a MoMo sandbox checkout' })
  @ApiHeader({ name: 'If-Match', required: true, example: '"cart-7"' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async checkout(
    @Req() request: AuthenticatedRequest,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: OnlinePaymentCheckoutDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OnlinePaymentCheckoutResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    if (!idempotencyKey || !CHECKOUT_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new CheckoutValidationError(['idempotencyKey']);
    }
    const parsed = parseOnlinePaymentCheckoutRequest(body);
    if (!parsed) throw new CheckoutValidationError(['request']);
    const result = await this.payments.checkoutWithMomo(
      request.authUser.id,
      expectedVersion(ifMatch),
      idempotencyKey,
      parsed,
    );
    response.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    response.setHeader('Cache-Control', 'private, no-store');
    return result;
  }

  @Get('payments/:paymentReference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Read an owner-scoped normalized payment status' })
  async status(
    @Req() request: AuthenticatedRequest,
    @Param('paymentReference') paymentReference: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PaymentStatusResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(paymentReference)) {
      throw new CheckoutValidationError(['paymentReference']);
    }
    response.setHeader('Cache-Control', 'private, no-store');
    return this.payments.getPaymentStatus(request.authUser.id, paymentReference);
  }
}
