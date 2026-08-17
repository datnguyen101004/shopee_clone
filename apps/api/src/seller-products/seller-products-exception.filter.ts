import { BadRequestException, Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticationFailedError, AuthorizationDeniedError } from '../auth/auth.errors';
import { BrowserMutationSecurityError, sendBrowserMutationProblem } from '../security/browser-mutation.error';
import { SellerProductConflictError, SellerProductInputError, SellerProductMediaError, SellerProductNotFoundError } from './seller-products.errors';

@Catch()
export class SellerProductsExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    if (exception instanceof BrowserMutationSecurityError) return sendBrowserMutationProblem(response, exception);
    if (exception instanceof SellerProductInputError || exception instanceof BadRequestException) return this.problem(response, 400, 'invalid-seller-product-request', 'Invalid request', 'One or more product fields are invalid.', { invalidParameters: exception instanceof SellerProductInputError ? exception.invalidParameters : ['request'] });
    if (exception instanceof SellerProductMediaError) return this.problem(response, 400, exception.code, 'Invalid product media', 'The product media reference or upload is not available for this seller.');
    if (exception instanceof AuthenticationFailedError) return this.problem(response, 401, 'authentication-failed', 'Authentication failed', 'The account session could not be verified.');
    if (exception instanceof AuthorizationDeniedError) return this.problem(response, 403, 'authorization-denied', 'Authorization denied', 'The current account cannot manage seller products.');
    if (exception instanceof SellerProductNotFoundError) return this.problem(response, 404, 'seller-product-not-found', 'Product unavailable', 'The requested seller product is unavailable.');
    if (exception instanceof SellerProductConflictError) return this.problem(response, 409, 'seller-product-conflict', 'Product state conflict', 'The product change conflicts with its current state.', { invalidParameters: exception.invalidParameters });
    return this.problem(response, 503, 'seller-product-unavailable', 'Product unavailable', 'Seller product data is temporarily unavailable.');
  }
  private problem(response: Response, status: number, type: string, title: string, detail: string, extensions: Record<string, unknown> = {}) { response.status(status).type('application/problem+json').json({ type: `https://shopee-clone.local/problems/${type}`, title, status, detail, ...extensions }); }
}
