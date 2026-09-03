import { BadRequestException, Catch, ForbiddenException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { AuthenticationFailedError, AuthorizationDeniedError } from '../auth/auth.errors';
import { BrowserMutationSecurityError, sendBrowserMutationProblem } from '../security/browser-mutation.error';
import { ReviewDuplicateError, ReviewEligibilityError, ReviewIdempotencyConflictError, ReviewMediaError, ReviewNotFoundError, ReviewStaleError, ReviewUnavailableError, ReviewValidationError } from './reviews.errors';

@Catch()
export class ReviewsExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    if (exception instanceof BrowserMutationSecurityError) return sendBrowserMutationProblem(response, exception);
    if (exception instanceof AuthenticationFailedError) return this.problem(response, 401, 'authentication-failed', 'Authentication failed', 'A valid buyer session is required.');
    if (exception instanceof AuthorizationDeniedError || exception instanceof ForbiddenException) return this.problem(response, 403, 'authorization-denied', 'Authorization denied', 'The current account does not have permission to access this review resource.');
    if (exception instanceof ReviewValidationError || exception instanceof BadRequestException) return this.problem(response, 400, 'invalid-review-request', 'Invalid review request', 'One or more review parameters are invalid.', { invalidParameters: exception instanceof ReviewValidationError ? exception.invalidParameters : ['request'] });
    if (exception instanceof ReviewNotFoundError || exception instanceof ReviewEligibilityError) return this.problem(response, 404, 'review-unavailable', 'Review unavailable', 'The requested review or order line is unavailable.');
    if (exception instanceof ReviewDuplicateError) return this.problem(response, 409, 'review-already-exists', 'Review already exists', 'This delivered order line has already been reviewed.');
    if (exception instanceof ReviewIdempotencyConflictError) return this.problem(response, 409, 'review-idempotency-conflict', 'Idempotency key conflict', 'This key was already used for different review content.');
    if (exception instanceof ReviewStaleError) return this.problem(response, 409, 'review-stale', 'Review changed', 'Reload the latest review before retrying.', { currentVersion: exception.currentVersion });
    if (exception instanceof ReviewMediaError) return this.problem(response, 400, exception.code, 'Review media rejected', 'The supplied review media is invalid or unavailable.');
    return this.problem(response, 503, 'reviews-unavailable', 'Reviews temporarily unavailable', exception instanceof ReviewUnavailableError ? 'Review data could not be returned safely. Please retry.' : 'Review data is temporarily unavailable. Please retry.');
  }
  private problem(response: Response, status: number, code: string, title: string, detail: string, extensions: Record<string, unknown> = {}) {
    response.status(status).type('application/problem+json').json({ type: `https://shopee-clone.local/problems/${code}`, title, status, detail, ...extensions });
  }
}
