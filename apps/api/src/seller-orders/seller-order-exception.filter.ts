import {
  BadRequestException,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AuthenticationFailedError,
  AuthOriginDeniedError,
  AuthorizationDeniedError,
} from '../auth/auth.errors';
import {
  BrowserMutationSecurityError,
  sendBrowserMutationProblem,
} from '../security/browser-mutation.error';
import {
  OrderHistoryUnavailableError,
  OrderIdempotencyConflictError,
  OrderInventoryHoldConflictError,
  OrderStaleConflictError,
  OrderTransitionConflictError,
} from '../order-history/order-history.errors';
import {
  SellerOrderCompensationConflictError,
  SellerOrderIdempotencyConflictError,
  SellerOrderInventoryInvariantError,
  SellerOrderNotFoundError,
  SellerOrderStaleError,
  SellerOrderTransitionError,
  SellerOrderUnavailableError,
  SellerOrderValidationError,
} from './seller-order.errors';

@Catch()
export class SellerOrderExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    if (exception instanceof BrowserMutationSecurityError)
      return sendBrowserMutationProblem(response, exception);
    if (exception instanceof AuthOriginDeniedError)
      return this.problem(
        response,
        403,
        'origin-denied',
        'Origin denied',
        'The mutation origin is not allowed.',
      );
    if (
      exception instanceof SellerOrderValidationError ||
      exception instanceof BadRequestException
    ) {
      return this.problem(
        response,
        400,
        'invalid-seller-order-request',
        'Invalid seller order request',
        'One or more seller order fields are invalid.',
        {
          invalidParameters:
            exception instanceof SellerOrderValidationError
              ? exception.invalidParameters
              : ['request'],
        },
      );
    }
    if (exception instanceof AuthenticationFailedError)
      return this.problem(
        response,
        401,
        'authentication-failed',
        'Authentication failed',
        'The account session could not be verified.',
      );
    if (exception instanceof AuthorizationDeniedError)
      return this.problem(
        response,
        403,
        'authorization-denied',
        'Authorization denied',
        'The current account cannot manage seller orders.',
      );
    if (exception instanceof SellerOrderNotFoundError)
      return this.problem(
        response,
        404,
        'seller-order-not-found',
        'Order unavailable',
        'The requested seller order is unavailable.',
      );
    if (
      exception instanceof SellerOrderStaleError ||
      exception instanceof OrderStaleConflictError
    ) {
      const body =
        exception instanceof SellerOrderStaleError
          ? {
              currentOrderVersion: exception.currentOrderVersion,
              currentFulfillmentVersion: exception.currentFulfillmentVersion,
            }
          : { currentOrderVersion: exception.currentVersion };
      return this.problem(
        response,
        409,
        'seller-order-stale',
        'Order has changed',
        'Refresh the seller order before retrying the action.',
        body,
      );
    }
    if (
      exception instanceof SellerOrderTransitionError ||
      exception instanceof OrderTransitionConflictError ||
      exception instanceof OrderInventoryHoldConflictError
    )
      return this.problem(
        response,
        409,
        'seller-order-transition-conflict',
        'Action is not available',
        'The order state no longer allows this action.',
      );
    if (
      exception instanceof SellerOrderIdempotencyConflictError ||
      exception instanceof OrderIdempotencyConflictError ||
      exception instanceof SellerOrderCompensationConflictError
    )
      return this.problem(
        response,
        409,
        'seller-order-idempotency-conflict',
        'Idempotency conflict',
        'This idempotency key was already used with different input.',
      );
    if (exception instanceof SellerOrderInventoryInvariantError)
      return this.problem(
        response,
        409,
        'seller-order-inventory-conflict',
        'Inventory conflict',
        'The order inventory could not be compensated safely.',
      );
    if (
      exception instanceof SellerOrderUnavailableError ||
      exception instanceof OrderHistoryUnavailableError
    )
      return this.problem(
        response,
        503,
        'seller-order-unavailable',
        'Seller order unavailable',
        'Seller order data is temporarily unavailable.',
      );
    return this.problem(
      response,
      503,
      'seller-order-unavailable',
      'Seller order unavailable',
      'Seller order data is temporarily unavailable.',
    );
  }

  private problem(
    response: Response,
    status: number,
    code: string,
    title: string,
    detail: string,
    extra: Record<string, unknown> = {},
  ): void {
    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://shopee-clone.local/problems/${code}`,
        title,
        status,
        detail,
        ...extra,
      });
  }
}
