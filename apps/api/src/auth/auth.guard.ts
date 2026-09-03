import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { AuthenticationFailedError } from './auth.errors';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';

export interface AuthenticatedRequest extends Request {
  authUser?: Awaited<ReturnType<AuthService['authenticateAccess']>>;
  authSessionId?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthTokenService)
    private readonly tokens: AuthTokenService,
    @Inject(AuthService)
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ') || authorization.length > 4_103) {
      throw new AuthenticationFailedError();
    }
    try {
      const claims = this.tokens.verifyAccess(authorization.slice(7));
      request.authUser = await this.auth.authenticateAccess(claims);
      request.authSessionId = claims.sid;
      return true;
    } catch (error) {
      if (error instanceof AuthenticationFailedError) throw error;
      throw new AuthenticationFailedError();
    }
  }
}
