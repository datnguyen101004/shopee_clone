import { Controller, Get, Header, Inject, Param, Req, UseFilters, UseGuards } from '@nestjs/common';
import { CHECKOUT_IDEMPOTENCY_KEY_PATTERN, type PurchaseResult } from '@shopee-clone/contracts';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CheckoutService } from './checkout.service';
import { CheckoutValidationError } from './checkout.errors';
import { CheckoutExceptionFilter } from './checkout-exception.filter';
import { TrafficAdmissionFilter } from '../traffic-admission/traffic-admission.filter';

@Controller('admission/checkout/results')
@UseFilters(CheckoutExceptionFilter, TrafficAdmissionFilter)
@UseGuards(AuthGuard)
export class AdmissionResultController {
  constructor(@Inject(CheckoutService) private readonly checkout: CheckoutService) {}
  @Get(':idempotencyKey')
  @Header('Cache-Control', 'private, no-store')
  result(@Req() request: AuthenticatedRequest, @Param('idempotencyKey') idempotencyKey: string): Promise<PurchaseResult> {
    if (!CHECKOUT_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) throw new CheckoutValidationError(['idempotencyKey']);
    return this.checkout.getPurchaseByIdempotency(request.authUser!.id, idempotencyKey);
  }
}
