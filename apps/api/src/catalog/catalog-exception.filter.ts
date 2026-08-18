import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { CatalogQueryValidationError } from './catalog-query';
import { CatalogProductDeletedError, CatalogProductIdValidationError, CatalogProductNotFoundError } from './catalog-product-id';

@Catch()
export class CatalogExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof CatalogQueryValidationError) {
      response.status(400).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/invalid-catalog-query',
        title: 'Invalid catalogue query',
        status: 400,
        detail: 'One or more catalogue query parameters are invalid.',
        invalidParameters: exception.invalidParameters,
      });
      return;
    }
    if (exception instanceof CatalogProductIdValidationError) {
      response.status(400).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/invalid-product-id',
        title: 'Invalid product identifier',
        status: 400,
        detail: 'The product identifier must be a canonical UUID.',
      });
      return;
    }
    if (exception instanceof CatalogProductNotFoundError) {
      response.status(404).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/product-not-found',
        title: 'Product not found',
        status: 404,
        detail: 'The requested product is not available.',
      });
      return;
    }
    if (exception instanceof CatalogProductDeletedError) {
      response.setHeader('Cache-Control', 'no-store');
      response.status(410).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/product-deleted',
        title: 'Product deleted',
        status: 410,
        detail: 'The requested product has been deleted and is no longer available for purchase.',
        code: 'PRODUCT_DELETED',
      });
      return;
    }
    response.status(503).type('application/problem+json').json({
      type: 'https://shopee-clone.local/problems/catalog-unavailable',
      title: 'Catalogue temporarily unavailable',
      status: 503,
      detail: 'Catalogue products could not be loaded. Please try again.',
    });
  }
}
