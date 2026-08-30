import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AUTH_CONFIG, type AuthConfig } from '../auth/auth.config';
import { BrowserMutationSecurityError } from './browser-mutation.error';
import { EXTERNAL_REQUEST_CLASS, type ExternalRequestClass } from './external-request.decorator';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const maximumBodyBytes = 100 * 1024;
// Multipart adds a boundary and part headers around the permitted 5 MiB file.
const maximumReviewMediaRequestBytes = 5 * 1024 * 1024 + 64 * 1024;
const maximumSellerProductMediaRequestBytes = 5 * 1024 * 1024 + 64 * 1024;
const maximumReturnEvidenceRequestBytes = 5 * 1024 * 1024 + 64 * 1024;
const overrideHeaders = ['x-http-method-override', 'x-method-override', 'x-http-method'] as const;

function canonicalOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.origin === value && !parsed.username && !parsed.password ? parsed.origin : null;
  } catch {
    return null;
  }
}

@Injectable()
export class BrowserMutationGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const requestClass = this.reflector.getAllAndOverride<ExternalRequestClass | undefined>(
      EXTERNAL_REQUEST_CLASS,
      [context.getHandler(), context.getClass()],
    );

    if (!unsafeMethods.has(request.method)) return true;
    if (requestClass === 'provider-signed-webhook') {
      // Provider webhooks do not carry browser Origin/CSRF state. Their controller
      // must verify the signed body before invoking any domain mutation.
      return true;
    }

    const origin = request.headers.origin;
    if (
      typeof origin !== 'string' ||
      canonicalOrigin(origin) === null ||
      !this.config.allowedOrigins.includes(origin)
    ) {
      throw new BrowserMutationSecurityError(
        403,
        'browser-origin-denied',
        'Origin denied',
        'This browser origin is not allowed to modify marketplace data.',
      );
    }

    if (
      overrideHeaders.some((header) => request.headers[header] !== undefined) ||
      Object.hasOwn(request.query, '_method')
    ) {
      throw new BrowserMutationSecurityError(
        400,
        'mutation-method-override-denied',
        'Method override denied',
        'HTTP method override is not supported for marketplace mutations.',
      );
    }

    const contentLength = request.headers['content-length'];
    const bodyBytes = typeof contentLength === 'string' ? Number(contentLength) : 0;
    const isReviewMediaUpload =
      request.method === 'POST' &&
      /\/api\/v1\/account\/review-media$/.test((request.originalUrl ?? '').split('?')[0] ?? '');
    const isSellerProductMediaUpload =
      request.method === 'POST' &&
      /\/api\/v1\/seller\/products\/media$/.test((request.originalUrl ?? '').split('?')[0] ?? '');
    const isReturnEvidenceUpload =
      request.method === 'POST' &&
      /\/api\/v1\/account\/return-evidence$/.test((request.originalUrl ?? '').split('?')[0] ?? '');
    if (
      Number.isFinite(bodyBytes) &&
      bodyBytes >
        (isReviewMediaUpload
          ? maximumReviewMediaRequestBytes
          : isSellerProductMediaUpload
            ? maximumSellerProductMediaRequestBytes
            : isReturnEvidenceUpload
              ? maximumReturnEvidenceRequestBytes
              : maximumBodyBytes)
    ) {
      throw new BrowserMutationSecurityError(
        413,
        'mutation-body-too-large',
        'Request body too large',
        'The mutation request body exceeds the supported size.',
      );
    }

    const hasBody =
      request.headers['transfer-encoding'] !== undefined ||
      (Number.isFinite(bodyBytes) && bodyBytes > 0);
    const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
    if (
      hasBody &&
      contentType !== 'application/json' &&
      !(
        (isReviewMediaUpload || isSellerProductMediaUpload || isReturnEvidenceUpload) &&
        contentType === 'multipart/form-data'
      )
    ) {
      throw new BrowserMutationSecurityError(
        415,
        'mutation-media-type-unsupported',
        'Unsupported media type',
        'Marketplace mutations with a body require application/json.',
      );
    }
    return true;
  }
}
