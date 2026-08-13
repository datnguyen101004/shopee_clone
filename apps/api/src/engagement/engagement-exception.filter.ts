import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { AuthenticationFailedError, AuthOriginDeniedError } from '../auth/auth.errors';

import {
  EngagementOwnerUnavailableError,
  EngagementProductNotFoundError,
  EngagementValidationError,
} from './engagement.errors';

@Catch()
export class EngagementExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof EngagementValidationError) {
      response.status(400).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/invalid-engagement-request',
        title: 'Invalid engagement request',
        status: 400,
        detail: 'One or more engagement parameters are invalid.',
        invalidParameters: exception.invalidParameters,
      });
      return;
    }
    if (exception instanceof AuthenticationFailedError) {
      response.status(401).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/authentication-failed',
        title: 'Authentication failed',
        status: 401,
        detail: 'The bearer session could not be verified.',
      });
      return;
    }
    if (exception instanceof AuthOriginDeniedError) {
      response.status(403).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/engagement-origin-denied',
        title: 'Origin denied',
        status: 403,
        detail: 'This browser origin cannot change engagement data.',
      });
      return;
    }
    if (exception instanceof EngagementProductNotFoundError) {
      response.status(404).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/product-not-found',
        title: 'Product not found',
        status: 404,
        detail: 'The requested product is not available.',
      });
      return;
    }
    if (exception instanceof EngagementOwnerUnavailableError) {
      response.status(401).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/authentication-required',
        title: 'Authentication required',
        status: 401,
        detail: 'The buyer session is no longer active.',
      });
      return;
    }
    response.status(503).type('application/problem+json').json({
      type: 'https://shopee-clone.local/problems/engagement-unavailable',
      title: 'Engagement temporarily unavailable',
      status: 503,
      detail: 'Favorite or recently viewed data could not be processed. Please try again.',
    });
  }
}
