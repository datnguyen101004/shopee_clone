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
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { OnlinePaymentCheckoutResponse, PaymentStatusResponse } from '@shopee-clone/contracts';
import {
  CHECKOUT_IDEMPOTENCY_KEY_PATTERN,
  parseOnlinePaymentCheckoutRequest,
  parsePaymentRetryRequest,
} from '@shopee-clone/contracts';
import type { Response } from 'express';

import { AuthenticationFailedError } from '../auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CheckoutExceptionFilter } from '../checkout/checkout-exception.filter';
import {
  CheckoutCartConflictError,
  CheckoutValidationError,
  PaymentRetryNotAllowedError,
} from '../checkout/checkout.errors';
import { OnlinePaymentService } from './online-payment.service';
import { OnlinePaymentCheckoutDto, PaymentRetryDto, VnpayReturnDto } from './payments.dto';
import { TrafficAdmissionGuard } from '../traffic-admission/traffic-admission.guard';
import { TrafficAdmissionFilter } from '../traffic-admission/traffic-admission.filter';

function expectedVersion(value: string | undefined): number {
  const match = /^"cart-(0|[1-9][0-9]*)"$/.exec(value ?? '');
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version)) throw new CheckoutCartConflictError();
  return version;
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
@UseFilters(CheckoutExceptionFilter, TrafficAdmissionFilter)
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(@Inject(OnlinePaymentService) private readonly payments: OnlinePaymentService) {}

  @Post('checkout/online-payments')
  @UseGuards(TrafficAdmissionGuard)
  @ApiBody({ type: OnlinePaymentCheckoutDto })
  @ApiOperation({ summary: 'Create or replay an online sandbox checkout' })
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
    const result =
      parsed.provider === 'VNPAY'
        ? await this.payments.checkoutWithVnpay(
            request.authUser.id,
            expectedVersion(ifMatch),
            idempotencyKey,
            parsed,
            request.ip,
          )
        : await this.payments.checkoutWithMomo(
            request.authUser.id,
            expectedVersion(ifMatch),
            idempotencyKey,
            parsed,
            request.ip,
          );
    response.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    response.setHeader('Cache-Control', 'private, no-store');
    return result;
  }

  @Get('payments/vnpay/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'vnp_TxnRef', required: true, pattern: '^[A-Za-z0-9_-]{1,100}$' })
  @ApiOperation({ summary: 'Resolve an owner-scoped VNPAY transaction reference' })
  async resolveVnpay(
    @Req() request: AuthenticatedRequest,
    @Query('vnp_TxnRef') transactionReference: string | undefined,
  ): Promise<{ paymentReference: string; purchaseReference: string }> {
    if (!request.authUser) throw new AuthenticationFailedError();
    if (!transactionReference || !/^[A-Za-z0-9_-]{1,100}$/.test(transactionReference)) {
      throw new CheckoutValidationError(['vnp_TxnRef']);
    }
    return this.payments.resolveVnpayPayment(request.authUser.id, transactionReference);
  }

  @Post('payments/vnpay/return')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: VnpayReturnDto })
  @ApiOperation({ summary: 'Apply a signed terminal VNPAY ReturnUrl failure or cancellation' })
  async applyVnpayReturn(
    @Req() request: AuthenticatedRequest,
    @Body() input: VnpayReturnDto,
  ): Promise<PaymentStatusResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    return this.payments.applyVnpayReturn(request.authUser.id, input.fields);
  }

  @Post('payments/:paymentReference/retry')
  @UseGuards(TrafficAdmissionGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: PaymentRetryDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Create a new attempt for an unpaid online payment' })
  async retry(
    @Req() request: AuthenticatedRequest,
    @Param('paymentReference') paymentReference: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: PaymentRetryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OnlinePaymentCheckoutResponse> {
    if (!request.authUser) throw new AuthenticationFailedError();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(paymentReference)) {
      throw new CheckoutValidationError(['paymentReference']);
    }
    if (!idempotencyKey || !CHECKOUT_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new CheckoutValidationError(['idempotencyKey']);
    }
    const parsed = parsePaymentRetryRequest(body);
    if (!parsed) throw new CheckoutValidationError(['request']);
    if (parsed.provider !== 'VNPAY') throw new PaymentRetryNotAllowedError();
    const result = await this.payments.retryVnpayPayment(
      request.authUser.id,
      paymentReference,
      idempotencyKey,
      request.ip,
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
