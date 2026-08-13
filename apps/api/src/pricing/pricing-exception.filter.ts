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
  PricingAddressNotFoundError,
  PricingConflictError,
  PricingUnavailableError,
  PricingValidationError,
} from './pricing.errors';

@Catch()
export class PricingExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    if (exception instanceof BrowserMutationSecurityError) {
      sendBrowserMutationProblem(response, exception);
      return;
    }
    if (exception instanceof PricingValidationError || exception instanceof BadRequestException) {
      this.problem(
        response,
        400,
        'invalid-pricing-request',
        'Invalid pricing request',
        'One or more quote parameters are invalid.',
        {
          invalidParameters:
            exception instanceof PricingValidationError ? exception.invalidParameters : ['request'],
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
    if (exception instanceof PricingAddressNotFoundError) {
      this.problem(
        response,
        404,
        'pricing-address-not-found',
        'Shipping address unavailable',
        'The requested shipping address is unavailable.',
      );
      return;
    }
    if (exception instanceof PricingConflictError) {
      this.problem(
        response,
        409,
        'pricing-conflict',
        'Cart changed',
        'Reload the cart and request another quote.',
      );
      return;
    }
    if (exception instanceof PricingUnavailableError) {
      this.unavailable(response);
      return;
    }
    this.unavailable(response);
  }

  private unavailable(response: Response): void {
    this.problem(
      response,
      503,
      'pricing-unavailable',
      'Pricing temporarily unavailable',
      'A quote could not be calculated safely. Please try again.',
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
