import {
  BadRequestException,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticationFailedError } from '../auth/auth.errors';
import {
  BrowserMutationSecurityError,
  sendBrowserMutationProblem,
} from '../security/browser-mutation.error';
import { ChatError } from './chat.errors';

@Catch()
export class ChatExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof BrowserMutationSecurityError) {
      sendBrowserMutationProblem(response, exception);
      return;
    }
    if (exception instanceof BadRequestException) {
      const body = exception.getResponse();
      response.status(400).type('application/problem+json').json({
        type: 'https://shopee-clone.local/problems/invalid-chat-request',
        title: 'Invalid chat request',
        status: 400,
        detail: 'One or more chat parameters are invalid.',
        validation: body,
      });
      return;
    }
    if (exception instanceof ChatError) {
      if (exception.retryAfterSeconds)
        response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      response
        .status(exception.status)
        .type('application/problem+json')
        .json({
          type: `https://shopee-clone.local/problems/${exception.code}`,
          title: 'Invalid chat request',
          status: exception.status,
          detail: exception.message,
          ...(exception.fields.length
            ? { errors: exception.fields.map((field) => ({ field, message: 'Invalid value.' })) }
            : {}),
          ...(exception.retryAfterSeconds
            ? { retryAfterSeconds: exception.retryAfterSeconds }
            : {}),
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
    console.error(
      '[chat] unexpected failure',
      exception instanceof Error ? exception.name : typeof exception,
    );
    response.status(503).type('application/problem+json').json({
      type: 'https://shopee-clone.local/problems/chat-unavailable',
      title: 'Chat temporarily unavailable',
      status: 503,
      detail: 'Chat data could not be processed. Please try again.',
    });
  }
}
