import {
  BadRequestException,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  AuthenticationFailedError,
  AuthInputError,
  AuthOriginDeniedError,
  AuthRateLimitedError,
  PasswordResetFailedError,
  RecoveryDeliveryFailedError,
  RefreshSessionFailedError,
  RegistrationUnavailableError,
} from './auth.errors';

@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
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
    if (exception instanceof AuthInputError || exception instanceof BadRequestException) {
      this.problem(
        response,
        400,
        'invalid-authentication-request',
        'Invalid request',
        'One or more authentication fields are invalid.',
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
