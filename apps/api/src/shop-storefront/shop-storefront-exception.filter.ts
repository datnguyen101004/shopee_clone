import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { AuthenticationFailedError, AuthOriginDeniedError } from '../auth/auth.errors';
import {
  PublicShopNotFoundError,
  ShopFollowOwnerUnavailableError,
  ShopSelfFollowConflictError,
  ShopStorefrontValidationError,
} from './shop-storefront.errors';
import {
  BrowserMutationSecurityError,
  sendBrowserMutationProblem,
} from '../security/browser-mutation.error';

@Catch()
export class ShopStorefrontExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof BrowserMutationSecurityError) {
      sendBrowserMutationProblem(response, exception);
      return;
    }
    if (exception instanceof ShopStorefrontValidationError) {
      response.status(400).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/invalid-shop-request',
        title: 'Invalid shop request',
        status: 400,
        detail: 'One or more shop parameters are invalid.',
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
        type: 'https://shopee-clone.local/problems/shop-origin-denied',
        title: 'Origin denied',
        status: 403,
        detail: 'This browser origin cannot change followed shops.',
      });
      return;
    }
    if (exception instanceof PublicShopNotFoundError) {
      response.status(404).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/shop-not-found',
        title: 'Shop not found',
        status: 404,
        detail: 'The requested shop is not available.',
      });
      return;
    }
    if (exception instanceof ShopSelfFollowConflictError) {
      response.status(409).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/shop-self-follow-conflict',
        title: 'Shop follow conflict',
        status: 409,
        detail: 'You cannot follow your own shop.',
      });
      return;
    }
    if (exception instanceof ShopFollowOwnerUnavailableError) {
      response.status(401).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/authentication-required',
        title: 'Authentication required',
        status: 401,
        detail: 'The buyer session is no longer active.',
      });
      return;
    }
    response.status(503).type('application/problem+json').json({
      type: 'https://shopee-clone.local/problems/shop-storefront-unavailable',
      title: 'Shop storefront temporarily unavailable',
      status: 503,
      detail: 'Shop data could not be processed. Please try again.',
    });
  }
}
