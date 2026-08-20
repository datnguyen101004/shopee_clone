import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticationFailedError, AuthOriginDeniedError, AuthorizationDeniedError } from '../auth/auth.errors';
import { BrowserMutationSecurityError, sendBrowserMutationProblem } from '../security/browser-mutation.error';
import { SellerPromotionConflictError, SellerPromotionIdempotencyConflictError, SellerPromotionNotFoundError, SellerPromotionStaleError, SellerPromotionValidationError } from './seller-promotions.errors';

@Catch()
export class SellerPromotionsExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>(); response.setHeader('Cache-Control', 'no-store');
    if (error instanceof BrowserMutationSecurityError) return sendBrowserMutationProblem(response, error);
    let status = 503; let title = 'Seller promotion unavailable'; let detail = 'Seller promotion data is temporarily unavailable.'; const body: Record<string, unknown> = { code: 'SELLER_PROMOTION_UNAVAILABLE' };
    if (error instanceof SellerPromotionValidationError) { status = 400; title = 'Invalid seller promotion request'; detail = error.message || 'One or more promotion fields are invalid.'; body.code = 'INVALID_SELLER_PROMOTION_REQUEST'; body.invalidParameters = error.invalidParameters; }
    else if (error instanceof AuthenticationFailedError) { status = 401; title = 'Authentication failed'; detail = 'The account session could not be verified.'; body.code = 'AUTHENTICATION_FAILED'; }
    else if (error instanceof AuthorizationDeniedError) { status = 403; title = 'Authorization denied'; detail = 'The current account cannot manage seller promotions.'; body.code = 'AUTHORIZATION_DENIED'; }
    else if (error instanceof AuthOriginDeniedError) { status = 403; title = 'Origin denied'; detail = 'The mutation origin is not allowed.'; body.code = 'ORIGIN_DENIED'; }
    else if (error instanceof SellerPromotionNotFoundError) { status = 404; title = 'Seller promotion unavailable'; detail = 'The requested promotion is unavailable.'; body.code = 'SELLER_PROMOTION_NOT_FOUND'; }
    else if (error instanceof SellerPromotionStaleError) { status = 412; title = 'Seller promotion version mismatch'; detail = 'Refresh the promotion before editing it.'; body.code = 'SELLER_PROMOTION_STALE'; body.currentVersion = error.currentVersion; }
    else if (error instanceof SellerPromotionIdempotencyConflictError) { status = 409; title = 'Idempotency conflict'; detail = 'This idempotency key was already used with different input.'; body.code = 'IDEMPOTENCY_CONFLICT'; }
    else if (error instanceof SellerPromotionConflictError) { status = 409; title = 'Promotion conflict'; detail = error.message; body.code = error.code; }
    response.header('Content-Type', 'application/problem+json').status(status).json({ type: `https://shopee-clone.local/problems/${title.toLowerCase().replaceAll(' ', '-')}`, title, status, detail, ...body });
  }
}
