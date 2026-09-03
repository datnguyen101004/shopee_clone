import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { AuthOriginDeniedError } from './auth.errors';

@Injectable()
export class AuthOriginGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const origin = request.headers.origin;
    if (typeof origin === 'string' && this.config.allowedOrigins.includes(origin)) return true;
    throw new AuthOriginDeniedError();
  }
}

export function requestSource(request: Request, trustProxy: boolean): string {
  if (trustProxy && request.ip) return request.ip;
  return request.socket.remoteAddress ?? 'unknown';
}
