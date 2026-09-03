import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { AuthenticationFailedError, AuthOriginDeniedError } from '../auth/auth.errors';
import {
  BrowserMutationSecurityError,
  sendBrowserMutationProblem,
} from '../security/browser-mutation.error';
import {
  NotificationNotFoundError,
  NotificationPreferenceForbiddenError,
  NotificationUnavailableError,
  NotificationValidationError,
} from './notification.errors';

@Catch()
export class NotificationExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof BrowserMutationSecurityError) {
      sendBrowserMutationProblem(response, exception);
      return;
    }
    if (exception instanceof NotificationValidationError) {
      response.status(400).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/invalid-notification-request',
        title: 'Invalid notification request',
        status: 400,
        detail: 'One or more notification parameters are invalid.',
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
        type: 'https://shopee-clone.local/problems/notification-origin-denied',
        title: 'Origin denied',
        status: 403,
        detail: 'This browser origin cannot change notification data.',
      });
      return;
    }
    if (exception instanceof NotificationPreferenceForbiddenError) {
      response.status(403).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/notification-preference-forbidden',
        title: 'Preference cannot be disabled',
        status: 403,
        detail: 'Mandatory transactional notification channels cannot be turned off.',
        invalidParameters: exception.invalidParameters,
      });
      return;
    }
    if (exception instanceof NotificationNotFoundError) {
      response.status(404).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/notification-not-found',
        title: 'Notification not found',
        status: 404,
        detail: 'The requested notification does not exist for this account.',
      });
      return;
    }
    if (!(exception instanceof NotificationUnavailableError)) {
      console.error('[notifications]', exception);
    }
    response.status(503).type('application/problem+json').json({
      type: 'https://shopee-clone.local/problems/notifications-unavailable',
      title: 'Notifications temporarily unavailable',
      status: 503,
      detail: 'Notification data could not be processed. Please try again.',
    });
  }
}
