import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AuthenticationFailedError,
  AuthOriginDeniedError,
  AuthorizationDeniedError,
} from '../auth/auth.errors';

@Catch()
export class SellerModerationNoticesExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (
      exception instanceof AuthenticationFailedError ||
      (exception instanceof HttpException && exception.getStatus() === HttpStatus.UNAUTHORIZED)
    ) {
      return response.status(HttpStatus.UNAUTHORIZED).json({
        type: 'https://errors.shopee.test/unauthorized',
        title: 'Unauthorized',
        status: HttpStatus.UNAUTHORIZED,
        detail: 'Authentication required',
      });
    }

    if (
      exception instanceof AuthorizationDeniedError ||
      (exception instanceof HttpException && exception.getStatus() === HttpStatus.FORBIDDEN)
    ) {
      return response.status(HttpStatus.FORBIDDEN).json({
        type: 'https://errors.shopee.test/forbidden',
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail: 'Seller role required',
      });
    }

    if (
      exception instanceof AuthOriginDeniedError
    ) {
      return response.status(HttpStatus.FORBIDDEN).json({
        type: 'https://errors.shopee.test/forbidden',
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail: 'Origin not allowed',
      });
    }

    if (
      exception instanceof NotFoundException ||
      (exception instanceof HttpException && exception.getStatus() === HttpStatus.NOT_FOUND)
    ) {
      return response.status(HttpStatus.NOT_FOUND).json({
        type: 'https://errors.shopee.test/not-found',
        title: 'Not Found',
        status: HttpStatus.NOT_FOUND,
        detail: 'Moderation notice not found',
      });
    }

    if (exception instanceof HttpException) {
      return response.status(exception.getStatus()).json(exception.getResponse());
    }

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      type: 'https://errors.shopee.test/internal-server-error',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred',
    });
  }
}
