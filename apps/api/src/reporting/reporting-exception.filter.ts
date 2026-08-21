import {
  BadRequestException,
  Catch,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  AuthenticationFailedError,
  AuthorizationDeniedError,
  AuthOriginDeniedError,
} from '../auth/auth.errors';
import {
  BrowserMutationSecurityError,
  sendBrowserMutationProblem,
} from '../security/browser-mutation.error';
import {
  ReportIdempotencyConflictError,
  ReportInvalidInputError,
  ReportNotFoundError,
  ReportRateLimitExceededError,
  ReportTargetNotFoundError,
  SelfReportForbiddenError,
} from './reporting.errors';

@Catch()
export class ReportingExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');

    if (exception instanceof BrowserMutationSecurityError) {
      sendBrowserMutationProblem(response, exception);
      return;
    }

    if (
      exception instanceof ReportInvalidInputError ||
      exception instanceof BadRequestException
    ) {
      const responseBody = exception instanceof BadRequestException ? exception.getResponse() : null;
      const validationMessages =
        typeof responseBody === 'object' && responseBody !== null && 'message' in responseBody
          ? (responseBody as { message?: string | string[] }).message
          : null;
      const detail = Array.isArray(validationMessages)
        ? validationMessages.join('; ')
        : typeof validationMessages === 'string'
          ? validationMessages
          : (exception as Error).message || 'One or more report parameters are invalid.';

      this.problem(
        response,
        400,
        'invalid-report-request',
        'Invalid request',
        detail,
        exception instanceof ReportInvalidInputError ? { invalidParameters: exception.invalidParameters } : undefined,
      );
      return;
    }

    if (
      exception instanceof AuthenticationFailedError ||
      exception instanceof UnauthorizedException
    ) {
      this.problem(
        response,
        401,
        'authentication-required',
        'Authentication required',
        'You must be signed in to submit or view reports.',
      );
      return;
    }

    if (
      exception instanceof AuthorizationDeniedError ||
      exception instanceof ForbiddenException ||
      exception instanceof SelfReportForbiddenError
    ) {
      this.problem(
        response,
        403,
        'forbidden',
        'Forbidden',
        'You do not have permission to perform this action.',
      );
      return;
    }

    if (exception instanceof AuthOriginDeniedError) {
      this.problem(
        response,
        403,
        'origin-denied',
        'Origin denied',
        'This browser origin is not allowed to submit reports.',
      );
      return;
    }

    if (
      exception instanceof ReportTargetNotFoundError ||
      exception instanceof ReportNotFoundError ||
      exception instanceof NotFoundException
    ) {
      this.problem(
        response,
        404,
        'not-found',
        'Resource not found',
        'The requested resource does not exist or is unavailable.',
      );
      return;
    }

    if (exception instanceof ReportIdempotencyConflictError) {
      this.problem(
        response,
        409,
        'idempotency-conflict',
        'Idempotency conflict',
        'The idempotency key has already been used with different request parameters.',
      );
      return;
    }

    if (exception instanceof ReportRateLimitExceededError) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      this.problem(
        response,
        429,
        'rate-limit-exceeded',
        'Too Many Requests',
        'Report submission rate limit exceeded. Please try again later.',
        { retryAfterSeconds: exception.retryAfterSeconds },
      );
      return;
    }

    this.problem(
      response,
      500,
      'internal-error',
      'Internal Server Error',
      'An unexpected error occurred while processing your request.',
    );
  }

  private problem(
    response: Response,
    status: number,
    type: string,
    title: string,
    detail: string,
    extensions: Record<string, unknown> = {},
  ): void {
    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://shopee-clone.local/problems/${type}`,
        title,
        status,
        detail,
        ...extensions,
      });
  }
}
