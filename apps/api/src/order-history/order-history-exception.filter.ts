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
  OrderHistoryUnavailableError,
  OrderHistoryValidationError,
  OrderIdempotencyConflictError,
  OrderNotFoundError,
  OrderStaleConflictError,
  OrderTransitionConflictError,
} from './order-history.errors';

@Catch()
export class OrderHistoryExceptionFilter implements ExceptionFilter {
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
      exception instanceof OrderHistoryValidationError ||
      exception instanceof BadRequestException
    ) {
      this.problem(
        response,
        400,
        'invalid-order-request',
        'Invalid order request',
        'One or more order parameters are invalid.',
        {
          invalidParameters:
            exception instanceof OrderHistoryValidationError
              ? exception.invalidParameters
              : ['request'],
        },
      );
      return;
    }
    if (exception instanceof OrderNotFoundError) {
      this.problem(
        response,
        404,
        'order-not-found',
        'Order unavailable',
        'The requested order is unavailable.',
      );
      return;
    }
    if (exception instanceof OrderStaleConflictError) {
      this.problem(
        response,
        409,
        'order-stale',
        'Order changed',
        'Reload the latest order before retrying.',
        { currentVersion: exception.currentVersion },
      );
      return;
    }
    if (exception instanceof OrderTransitionConflictError) {
      this.problem(
        response,
        409,
        'order-cancellation-not-allowed',
        'Cancellation unavailable',
        'This order can no longer be cancelled by the buyer.',
        { currentVersion: exception.currentVersion },
      );
      return;
    }
    if (exception instanceof OrderIdempotencyConflictError) {
      this.problem(
        response,
        409,
        'order-idempotency-conflict',
        'Idempotency key conflict',
        'This key was already used for a different cancellation request.',
      );
      return;
    }
    if (exception instanceof OrderHistoryUnavailableError) {
      this.unavailable(response);
      return;
    }
    this.unavailable(response);
  }

  private unavailable(response: Response): void {
    this.problem(
      response,
      503,
      'order-history-unavailable',
      'Orders temporarily unavailable',
      'Order data could not be returned safely. Please retry.',
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
