import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

type ProblemBody = { code?: unknown; detail?: unknown; errors?: unknown };

const SAFE_HTTP_STATUSES = new Set([400, 403, 409, 413, 415]);
const DEFAULT_PROBLEMS: Record<number, { code: string; title: string; detail: string }> = {
  400: {
    code: 'CLICKSTREAM_VALIDATION_ERROR',
    title: 'Invalid clickstream event',
    detail: 'The clickstream event is invalid.',
  },
  403: {
    code: 'CLICKSTREAM_FORBIDDEN',
    title: 'Clickstream request forbidden',
    detail: 'Clickstream collection is forbidden.',
  },
  409: {
    code: 'CLICKSTREAM_EVENT_CONFLICT',
    title: 'Clickstream event conflict',
    detail: 'Event ID is already associated with different content.',
  },
  413: {
    code: 'CLICKSTREAM_PAYLOAD_TOO_LARGE',
    title: 'Clickstream payload too large',
    detail: 'The clickstream payload is too large.',
  },
  415: {
    code: 'CLICKSTREAM_UNSUPPORTED_MEDIA_TYPE',
    title: 'Unsupported clickstream media type',
    detail: 'The clickstream payload media type is unsupported.',
  },
};

function safeProblemBody(exception: unknown): ProblemBody {
  if (!(exception instanceof HttpException)) return {};
  const body = exception.getResponse();
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {};
  return body as ProblemBody;
}

@Catch()
export class ClickstreamExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 503;
    const body = safeProblemBody(exception);
    const safeStatus = SAFE_HTTP_STATUSES.has(status) ? status : 503;
    const defaults = DEFAULT_PROBLEMS[safeStatus] ?? {
      code: 'CLICKSTREAM_UNAVAILABLE',
      title: 'Clickstream temporarily unavailable',
      detail: 'Clickstream collection is temporarily unavailable.',
    };
    const isValidation = safeStatus === 400;
    const code =
      typeof body.code === 'string' && /^[A-Z0-9_]{2,64}$/.test(body.code)
        ? body.code
        : defaults.code;
    const detail =
      typeof body.detail === 'string' && body.detail.length <= 256
        ? body.detail
        : defaults.detail;
    const errors = Array.isArray(body.errors)
      ? body.errors.filter(
          (item): item is { field: string; message: string } =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { field?: unknown }).field === 'string' &&
            typeof (item as { message?: unknown }).message === 'string',
        )
      : isValidation
        ? [{ field: 'event', message: 'The event envelope or type-specific context is invalid.' }]
        : undefined;
    response
      .status(safeStatus)
      .type('application/problem+json')
      .json({
        type: `https://shopee-clone.local/problems/${code.toLowerCase().replaceAll('_', '-')}`,
        title: defaults.title,
        status: safeStatus,
        detail,
        code,
        ...(errors && errors.length > 0 ? { errors } : {}),
      });
  }
}
