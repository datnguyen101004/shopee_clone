import {
  BadRequestException,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthenticationFailedError, AuthOriginDeniedError } from '../auth/auth.errors';
import {
  AccountAddressNotFoundError,
  AccountInputError,
  AccountInvariantConflictError,
} from './account.errors';

@Catch()
export class AccountExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    if (exception instanceof AccountInputError || exception instanceof BadRequestException) {
      this.problem(
        response,
        400,
        'invalid-account-request',
        'Invalid request',
        'One or more account fields are invalid.',
        {
          invalidParameters:
            exception instanceof AccountInputError ? exception.invalidParameters : ['request'],
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
        'The account session could not be verified.',
      );
      return;
    }
    if (exception instanceof AuthOriginDeniedError) {
      this.problem(
        response,
        403,
        'account-origin-denied',
        'Origin denied',
        'This browser origin is not allowed to change account data.',
      );
      return;
    }
    if (exception instanceof AccountAddressNotFoundError) {
      this.problem(
        response,
        404,
        'address-not-found',
        'Address unavailable',
        'The requested address is unavailable.',
      );
      return;
    }
    if (exception instanceof AccountInvariantConflictError) {
      this.problem(
        response,
        409,
        'address-state-conflict',
        'Address state conflict',
        'The address change conflicts with the current default-address state.',
      );
      return;
    }
    this.problem(
      response,
      503,
      'account-unavailable',
      'Account unavailable',
      'Account data is temporarily unavailable. Please try again.',
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
