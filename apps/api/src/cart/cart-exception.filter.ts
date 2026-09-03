import {
  BadRequestException,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthenticationFailedError } from '../auth/auth.errors';
import {
  BrowserMutationSecurityError,
  sendBrowserMutationProblem,
} from '../security/browser-mutation.error';
import {
  CartCapacityError,
  CartConflictError,
  CartItemUnavailableError,
  CartLineNotFoundError,
  CartSelfPurchaseError,
  CartUnavailableError,
  CartValidationError,
} from './cart.errors';

@Catch()
export class CartExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    if (exception instanceof BrowserMutationSecurityError) {
      sendBrowserMutationProblem(response, exception);
      return;
    }
    if (exception instanceof CartValidationError || exception instanceof BadRequestException) {
      this.problem(
        response,
        400,
        'invalid-cart-request',
        'Invalid cart request',
        'One or more cart parameters are invalid.',
        {
          invalidParameters:
            exception instanceof CartValidationError ? exception.invalidParameters : ['request'],
        },
      );
      return;
    }
    if (exception instanceof AuthenticationFailedError) {
      this.problem(
        response,
        401,
        'authentication-failed',
        'Authentication failed',
        'The bearer session could not be verified.',
      );
      return;
    }
    if (exception instanceof CartLineNotFoundError) {
      this.problem(
        response,
        404,
        'cart-line-not-found',
        'Cart line unavailable',
        'The requested cart line is unavailable.',
      );
      return;
    }
    if (exception instanceof CartConflictError) {
      this.problem(
        response,
        409,
        'cart-conflict',
        'Cart changed',
        'Reload the cart and try the operation again.',
      );
      return;
    }
    if (exception instanceof CartSelfPurchaseError) {
      this.problem(
        response,
        409,
        'self-purchase-forbidden',
        'Self-purchase is not allowed',
        'Sellers cannot purchase products from their own shop.',
      );
      return;
    }
    if (exception instanceof CartCapacityError) {
      this.problem(
        response,
        409,
        'cart-capacity-reached',
        'Cart capacity reached',
        'The cart cannot contain more than 100 distinct products.',
      );
      return;
    }
    if (exception instanceof CartItemUnavailableError) {
      this.problem(
        response,
        409,
        'cart-item-unavailable',
        'Item unavailable',
        'The selected product option is not currently purchasable.',
      );
      return;
    }
    if (exception instanceof CartUnavailableError) {
      this.problem(
        response,
        503,
        'cart-unavailable',
        'Cart temporarily unavailable',
        'Cart data could not be processed safely. Please try again.',
      );
      return;
    }
    this.problem(
      response,
      503,
      'cart-unavailable',
      'Cart temporarily unavailable',
      'Cart data could not be processed safely. Please try again.',
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
