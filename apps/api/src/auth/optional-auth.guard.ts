import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';

import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.guard';
import { AuthTokenService } from './auth-token.service';

/** Resolves a valid bearer session when present, otherwise keeps a public request anonymous. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    @Inject(AuthTokenService) private readonly tokens: AuthTokenService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    request.authUser = undefined;
    request.authSessionId = undefined;
    if (!authorization?.startsWith('Bearer ') || authorization.length > 4_103) return true;
    try {
      const claims = this.tokens.verifyAccess(authorization.slice(7));
      request.authUser = await this.auth.authenticateAccess(claims);
      request.authSessionId = claims.sid;
    } catch {
      // Invalid optional credentials deliberately degrade to guest discovery.
    }
    return true;
  }
}
