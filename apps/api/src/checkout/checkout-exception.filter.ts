import {
  BadRequestException,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthenticationFailedError } from '../auth/auth.errors';
import {
  PricingAddressNotFoundError,
  PricingConflictError,
  PricingValidationError,
} from '../pricing/pricing.errors';
import {
  BrowserMutationSecurityError,
  sendBrowserMutationProblem,
} from '../security/browser-mutation.error';
import {
  CheckoutCartConflictError,
  CheckoutIdempotencyConflictError,
  CheckoutInventoryConflictError,
  CheckoutNotReadyError,
  CheckoutPreviewChangedError,
  CheckoutPurchaseNotFoundError,
  CheckoutUnavailableError,
  CheckoutValidationError,
} from './checkout.errors';

@Catch()
export class CheckoutExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    if (exception instanceof BrowserMutationSecurityError) {
      sendBrowserMutationProblem(response, exception);
      return;
    }
    if (exception instanceof AuthenticationFailedError) {
      this.problem(
        response,
        401,
        'authentication-failed',
        'Authentication failed',
        'A valid buyer session is required.',
      );
      return;
    }
    if (
      exception instanceof CheckoutValidationError ||
      exception instanceof PricingValidationError ||
      exception instanceof BadRequestException
    ) {
      this.problem(
        response,
        400,
        'invalid-checkout-request',
        'Invalid checkout request',
        'One or more checkout parameters are invalid.',
        {
          invalidParameters:
            exception instanceof CheckoutValidationError ||
            exception instanceof PricingValidationError
              ? exception.invalidParameters
              : ['request'],
        },
      );
      return;
    }
    if (exception instanceof PricingAddressNotFoundError) {
      this.problem(
        response,
        404,
        'checkout-address-not-found',
        'Shipping address unavailable',
        'The requested shipping address is unavailable.',
      );
      return;
    }
    if (exception instanceof CheckoutPurchaseNotFoundError) {
      this.problem(
        response,
        404,
        'purchase-not-found',
        'Purchase unavailable',
        'The requested purchase is unavailable.',
      );
      return;
    }
    if (
      exception instanceof CheckoutCartConflictError ||
      exception instanceof PricingConflictError
    ) {
      this.problem(
        response,
        409,
        'checkout-cart-conflict',
        'Cart changed',
        'Reload the cart and request another checkout preview.',
        {
          ...(exception instanceof CheckoutCartConflictError &&
          exception.currentCartVersion !== undefined
            ? { currentCartVersion: exception.currentCartVersion }
            : {}),
        },
      );
      return;
    }
    if (exception instanceof CheckoutNotReadyError) {
      this.problem(
        response,
        409,
        'checkout-not-ready',
        'Checkout is not ready',
        'Resolve the reported checkout blockers and preview again.',
        {
          ...(exception.preview ? { preview: exception.preview } : {}),
        },
      );
      return;
    }
    if (exception instanceof CheckoutPreviewChangedError) {
      this.problem(
        response,
        409,
        'checkout-preview-changed',
        'Checkout changed',
        'Review the latest totals and confirm again.',
        { preview: exception.preview },
      );
      return;
    }
    if (exception instanceof CheckoutIdempotencyConflictError) {
      this.problem(
        response,
        409,
        'checkout-idempotency-conflict',
        'Idempotency key conflict',
        'This idempotency key was already used for a different checkout request.',
      );
      return;
    }
    if (exception instanceof CheckoutInventoryConflictError) {
      this.problem(response, 409, 'checkout-inventory-conflict', 'Inventory changed', 'Some selected items no longer have enough available stock. Refresh the checkout preview and try again.', { code: 'INVENTORY_INSUFFICIENT', availableQuantity: exception.availableQuantity });
      return;
    }
    if (exception instanceof CheckoutUnavailableError) {
      this.unavailable(response);
      return;
    }
    this.unavailable(response);
  }

  private unavailable(response: Response): void {
    this.problem(
      response,
      503,
      'checkout-unavailable',
      'Checkout temporarily unavailable',
      'The checkout could not be completed safely. Please retry.',
    );
  }

  private problem(
    response: Response,
    status: number,
    code: string,
    title: string,
    detail: string,
    extensions: Record<string, unknown> = {},
  ): void {
    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://shopee-clone.local/problems/${code}`,
        title,
        status,
        detail,
        ...extensions,
      });
  }
}
