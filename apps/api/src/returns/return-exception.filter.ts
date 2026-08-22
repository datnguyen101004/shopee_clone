import {
  BadRequestException,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthenticationFailedError, AuthorizationDeniedError } from '../auth/auth.errors';
import {
  BrowserMutationSecurityError,
  sendBrowserMutationProblem,
} from '../security/browser-mutation.error';
import {
  ReturnActionConflictError,
  ReturnDeadlineConflictError,
  ReturnEligibilityConflictError,
  ReturnIdempotencyConflictError,
  ReturnNotFoundError,
  ReturnStaleError,
  ReturnUnavailableError,
  ReturnValidationError,
} from './return-errors';

@Catch()
export class ReturnExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    if (exception instanceof BrowserMutationSecurityError)
      return sendBrowserMutationProblem(response, exception);
    if (exception instanceof AuthenticationFailedError)
      return this.problem(
        response,
        401,
        'authentication-failed',
        'Authentication failed',
        'A valid session is required.',
      );
    if (exception instanceof AuthorizationDeniedError)
      return this.problem(
        response,
        403,
        'return-forbidden',
        'Access denied',
        'This return is unavailable.',
      );
    if (exception instanceof ReturnNotFoundError)
      return this.problem(
        response,
        404,
        'return-not-found',
        'Return unavailable',
        'The requested return is unavailable.',
      );
    if (exception instanceof ReturnValidationError || exception instanceof BadRequestException)
      return this.problem(
        response,
        400,
        'invalid-return-request',
        'Invalid return request',
        'One or more return parameters are invalid.',
        {
          invalidParameters:
            exception instanceof ReturnValidationError ? exception.invalidParameters : ['request'],
        },
      );
    if (exception instanceof ReturnStaleError)
      return this.problem(
        response,
        409,
        'return-stale',
        'Return changed',
        'Reload the latest return before retrying.',
        { code: exception.code, currentVersion: exception.currentVersion },
      );
    if (
      exception instanceof ReturnActionConflictError ||
      exception instanceof ReturnEligibilityConflictError ||
      exception instanceof ReturnDeadlineConflictError
    )
      return this.problem(
        response,
        409,
        exception.code.toLowerCase().replaceAll('_', '-'),
        'Return action unavailable',
        'The requested return action is no longer available.',
        { code: exception.code, currentVersion: exception.currentVersion },
      );
    if (exception instanceof ReturnIdempotencyConflictError)
      return this.problem(
        response,
        409,
        'return-idempotency-conflict',
        'Idempotency key conflict',
        'This key was already used for a different return command.',
        { code: exception.code },
      );
    this.problem(
      response,
      503,
      'returns-unavailable',
      'Returns temporarily unavailable',
      'Return data could not be safely processed. Please retry.',
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
        code: code.toUpperCase().replaceAll('-', '_'),
        ...extra,
      });
  }
}
