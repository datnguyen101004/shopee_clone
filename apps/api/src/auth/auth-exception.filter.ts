import {
  BadRequestException,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';

import {
  AuthenticationFailedError,
  AccountSuspendedError,
  AuthorizationDeniedError,
  AuthInputError,
  AuthOriginDeniedError,
  AuthRateLimitedError,
  PasswordResetFailedError,
  RecoveryDeliveryFailedError,
  RefreshSessionFailedError,
  RegistrationUnavailableError,
  RoleConflictError,
  RoleRequestError,
  RoleTargetUnavailableError,
} from './auth.errors';
import {
  BrowserMutationSecurityError,
  sendBrowserMutationProblem,
} from '../security/browser-mutation.error';

@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    response.setHeader('Cache-Control', 'no-store');
    if (exception instanceof BrowserMutationSecurityError) {
      sendBrowserMutationProblem(response, exception);
      return;
    }
    if (exception instanceof AuthRateLimitedError) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      this.problem(
        response,
        429,
        'authentication-rate-limited',
        'Too many requests',
        'Please wait before trying this authentication action again.',
        {
          retryAfterSeconds: exception.retryAfterSeconds,
        },
      );
      return;
    }
    if (
      exception instanceof AuthInputError ||
      exception instanceof BadRequestException ||
      exception instanceof RoleRequestError
    ) {
      const roleRequest = request.path.startsWith('/api/v1/admin');
      this.problem(
        response,
        400,
        roleRequest ? 'invalid-role-request' : 'invalid-authentication-request',
        'Invalid request',
        roleRequest
          ? 'One or more role command fields are invalid.'
          : 'One or more authentication fields are invalid.',
        {
          invalidParameters:
            exception instanceof AuthInputError ? exception.invalidParameters : ['request'],
        },
      );
      return;
    }
    if (exception instanceof RegistrationUnavailableError) {
      this.problem(
        response,
        409,
        'registration-unavailable',
        'Registration unavailable',
        'The account could not be created with the submitted details.',
      );
      return;
    }
    if (
      exception instanceof AuthenticationFailedError ||
      exception instanceof RefreshSessionFailedError
    ) {
      this.problem(
        response,
        401,
        'authentication-failed',
        'Authentication failed',
        'The credentials or session could not be verified.',
      );
      return;
    }
    if (exception instanceof AccountSuspendedError) {
      this.problem(
        response,
        403,
        'account-and-shop-disabled',
        'Account and shop disabled',
        'The account and its shop have been disabled. Please contact support if you need assistance.',
      );
      return;
    }
    if (exception instanceof PasswordResetFailedError) {
      this.problem(
        response,
        400,
        'password-reset-failed',
        'Password reset failed',
        'The password reset request is invalid or has expired.',
      );
      return;
    }
    if (exception instanceof AuthOriginDeniedError) {
      this.problem(
        response,
        403,
        'authentication-origin-denied',
        'Origin denied',
        'This browser origin is not allowed to perform authentication actions.',
      );
      return;
    }
    if (exception instanceof AuthorizationDeniedError) {
      this.problem(
        response,
        403,
        'authorization-denied',
        'Authorization denied',
        'The authenticated account is not allowed to perform this operation.',
      );
      return;
    }
    if (exception instanceof RoleTargetUnavailableError) {
      this.problem(
        response,
        404,
        'role-target-unavailable',
        'Role target unavailable',
        'The requested role target is unavailable.',
      );
      return;
    }
    if (exception instanceof RoleConflictError) {
      this.problem(
        response,
        409,
        'role-conflict',
        'Role change conflict',
        'The requested role change conflicts with the current authorization state.',
      );
      return;
    }
    if (exception instanceof RecoveryDeliveryFailedError) {
      this.problem(
        response,
        503,
        'recovery-unavailable',
        'Recovery temporarily unavailable',
        'Password recovery could not be delivered. Please try again later.',
      );
      return;
    }
    this.problem(
      response,
      503,
      'authentication-unavailable',
      'Authentication unavailable',
      'Authentication is temporarily unavailable. Please try again.',
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
