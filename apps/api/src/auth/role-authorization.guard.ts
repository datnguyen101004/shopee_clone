import type { MarketplaceRole } from '@shopee-clone/contracts';
import { SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticationFailedError, AuthorizationDeniedError } from './auth.errors';
import type { AuthenticatedRequest } from './auth.guard';

const REQUIRED_ROLES = 'shopee-clone:required-roles';

export const RequireRoles = (...roles: MarketplaceRole[]) => SetMetadata(REQUIRED_ROLES, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<MarketplaceRole[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) throw new AuthorizationDeniedError();
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.authUser) throw new AuthenticationFailedError();
    if (!required.some((role) => request.authUser!.roles.includes(role))) {
      throw new AuthorizationDeniedError();
    }
    return true;
  }
}
