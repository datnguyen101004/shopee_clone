import {
  BadRequestException,
  Catch,
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
  SellerOnboardingInputError,
  SellerShopConflictError,
  SellerShopNotFoundError,
} from './seller-onboarding.errors';

@Catch()
export class SellerOnboardingExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    if (exception instanceof BrowserMutationSecurityError) {
      sendBrowserMutationProblem(response, exception);
      return;
    }
    if (
      exception instanceof SellerOnboardingInputError ||
      exception instanceof BadRequestException
    ) {
      this.problem(
        response,
        400,
        'invalid-seller-shop-request',
        'Invalid request',
        'One or more shop fields are invalid.',
        {
          invalidParameters:
            exception instanceof SellerOnboardingInputError
              ? exception.invalidParameters
              : ['request'],
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
    if (exception instanceof AuthorizationDeniedError) {
      this.problem(
        response,
        403,
        'authorization-denied',
        'Authorization denied',
        'The current account cannot perform this seller shop action.',
      );
      return;
    }
    if (exception instanceof AuthOriginDeniedError) {
      this.problem(
        response,
        403,
        'seller-shop-origin-denied',
        'Origin denied',
        'This browser origin is not allowed to change seller shop data.',
      );
      return;
    }
    if (exception instanceof SellerShopNotFoundError) {
      this.problem(
        response,
        404,
        'seller-shop-not-found',
        'Shop unavailable',
        'The requested shop is unavailable.',
      );
      return;
    }
    if (exception instanceof SellerShopConflictError) {
      this.problem(
        response,
        409,
        'seller-shop-conflict',
        'Shop state conflict',
        'The shop change conflicts with the current ownership or identity state.',
        { invalidParameters: exception.invalidParameters },
      );
      return;
    }
    this.problem(
      response,
      503,
      'seller-shop-unavailable',
      'Shop unavailable',
      'Seller shop data is temporarily unavailable. Please try again.',
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

