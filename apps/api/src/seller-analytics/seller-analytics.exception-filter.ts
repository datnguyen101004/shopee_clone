import { Catch, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticationFailedError, AuthorizationDeniedError } from '../auth/auth.errors';
import { SellerAnalyticsNotFoundError, SellerAnalyticsUnavailableError, SellerAnalyticsValidationError } from './seller-analytics.errors';

@Catch()
export class SellerAnalyticsExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.SERVICE_UNAVAILABLE;
    let title = 'Seller analytics unavailable';
    let detail = 'Seller analytics data is temporarily unavailable.';
    const body: Record<string, unknown> = { code: 'SELLER_ANALYTICS_UNAVAILABLE' };
    if (error instanceof SellerAnalyticsValidationError) {
      status = 400; title = 'Invalid seller analytics request'; detail = 'One or more analytics fields are invalid.'; body.code = 'INVALID_SELLER_ANALYTICS_REQUEST'; body.invalidParameters = error.invalidParameters;
    } else if (error instanceof AuthenticationFailedError) {
      status = 401; title = 'Authentication failed'; detail = 'The account session could not be verified.'; body.code = 'AUTHENTICATION_FAILED';
    } else if (error instanceof AuthorizationDeniedError) {
      status = 403; title = 'Authorization denied'; detail = 'The current account cannot access seller analytics.'; body.code = 'AUTHORIZATION_DENIED';
    } else if (error instanceof SellerAnalyticsNotFoundError) {
      status = 404; title = 'Seller analytics unavailable'; detail = 'The seller analytics resource is unavailable.'; body.code = 'SELLER_ANALYTICS_NOT_FOUND';
    } else if (!(error instanceof SellerAnalyticsUnavailableError)) {
      title = 'Seller analytics unavailable';
    }
    response.header('Content-Type', 'application/problem+json').header('Cache-Control', 'private, no-store').status(status).json({ type: `https://shopee-clone.local/problems/${title.toLowerCase().replaceAll(' ', '-')}`, title, status, detail, ...body });
  }
}
