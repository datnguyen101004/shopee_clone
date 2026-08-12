import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HomepageExceptionFilter implements ExceptionFilter {
  catch(_exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(503).type('application/problem+json').json({
      type: 'https://shopee-clone.local/problems/homepage-unavailable',
      title: 'Homepage temporarily unavailable',
      status: 503,
      detail: 'Marketplace content could not be loaded. Please try again.',
    });
  }
}
