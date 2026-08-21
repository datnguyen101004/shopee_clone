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
  ReviewIdempotencyConflictError,
  ReviewNotFoundError,
  ReviewStaleError,
} from '../reviews/reviews.errors';
import {
  AdminError,
  AdminInvalidInputError,
  AdminNotFoundError,
  CategoryCycleConflictError,
  CategoryIntegrityConflictError,
  LastAdminConflictError,
  SelfActionForbiddenError,
  ShopRestoreNotApprovedError,
} from './admin.errors';

@Catch()
export class AdminExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');

    if (exception instanceof BrowserMutationSecurityError) {
      sendBrowserMutationProblem(response, exception);
      return;
    }

    if (
      exception instanceof AdminInvalidInputError ||
      exception instanceof BadRequestException
    ) {
      this.problem(
        response,
        400,
        'invalid-admin-request',
        'Invalid request',
        (exception as Error).message || 'One or more admin fields are invalid.',
        exception instanceof AdminInvalidInputError ? exception.details : undefined,
      );
      return;
    }

    if (exception instanceof SelfActionForbiddenError) {
      this.problem(
        response,
        400,
        'self-action-forbidden',
        'Action forbidden',
        exception.message,
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
        'authentication-failed',
        'Authentication failed',
        'The admin session could not be verified.',
      );
      return;
    }

    if (
      exception instanceof AuthorizationDeniedError ||
      exception instanceof ForbiddenException
    ) {
      this.problem(
        response,
        403,
        'authorization-denied',
        'Authorization denied',
        'The current account does not have required administrator privileges.',
      );
      return;
    }

    if (exception instanceof AuthOriginDeniedError) {
      this.problem(
        response,
        403,
        'admin-origin-denied',
        'Origin denied',
        'This browser origin is not allowed to execute admin mutations.',
      );
      return;
    }

    if (
      exception instanceof AdminNotFoundError ||
      exception instanceof NotFoundException ||
      exception instanceof ReviewNotFoundError
    ) {
      this.problem(
        response,
        404,
        'admin-resource-not-found',
        'Resource not found',
        (exception as Error).message || 'The requested admin resource was not found.',
      );
      return;
    }

    if (exception instanceof ReviewStaleError) {
      this.problem(
        response,
        409,
        'review-version-conflict',
        'Review changed',
        'Reload the latest review before retrying.',
        { currentVersion: exception.currentVersion },
      );
      return;
    }

    if (exception instanceof ReviewIdempotencyConflictError) {
      this.problem(
        response,
        409,
        'review-idempotency-conflict',
        'Idempotency key conflict',
        'This key was already used for a different review action.',
      );
      return;
    }

    if (exception instanceof LastAdminConflictError) {
      this.problem(
        response,
        409,
        'last-admin-conflict',
        'Last administrator protected',
        exception.message,
      );
      return;
    }

    if (exception instanceof ShopRestoreNotApprovedError) {
      this.problem(
        response,
        409,
        'shop-not-approved',
        'Shop restore rejected',
        exception.message,
      );
      return;
    }

    if (exception instanceof CategoryIntegrityConflictError) {
      this.problem(
        response,
        409,
        'category-integrity-conflict',
        'Category integrity conflict',
        exception.message,
        exception.details,
      );
      return;
    }

    if (exception instanceof CategoryCycleConflictError) {
      this.problem(
        response,
        409,
        'category-cycle-conflict',
        'Category cycle conflict',
        exception.message,
      );
      return;
    }

    if (
      (exception as Error)?.name === 'ModerationConflictError' ||
      (exception as Error)?.name === 'ModerationIdempotencyConflictError'
    ) {
      this.problem(
        response,
        409,
        (exception as Error).name === 'ModerationIdempotencyConflictError'
          ? 'idempotency-conflict'
          : 'case-version-conflict',
        'Moderation conflict',
        (exception as Error).message,
      );
      return;
    }

    if (exception instanceof AdminError) {
      this.problem(
        response,
        exception.status,
        exception.code.toLowerCase().replace(/_/g, '-'),
        'Admin operation failed',
        exception.message,
        exception.details,
      );
      return;
    }

    this.problem(
      response,
      503,
      'admin-service-unavailable',
      'Admin service unavailable',
      'Admin console service is temporarily unavailable. Please try again.',
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
