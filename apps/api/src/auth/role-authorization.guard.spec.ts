import type { AuthUser } from '@shopee-clone/contracts';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { AuthenticationFailedError, AuthorizationDeniedError } from './auth.errors';
import type { AuthenticatedRequest } from './auth.guard';
import { RolesGuard } from './role-authorization.guard';

const buyer: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer Example',
  status: 'active',
  roles: ['buyer'],
};

function context(authUser?: AuthUser): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ authUser }) as AuthenticatedRequest }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows any declared matching current role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['seller', 'admin']) };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(context({ ...buyer, roles: ['buyer', 'seller'] }))).toBe(true);
  });

  it('denies missing identity before evaluating roles', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['seller']) };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(() => guard.canActivate(context())).toThrow(AuthenticationFailedError);
  });

  it('denies an undeclared policy and a stale or unrelated role', () => {
    const reflector = { getAllAndOverride: jest.fn() };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    reflector.getAllAndOverride.mockReturnValueOnce(undefined);
    expect(() => guard.canActivate(context(buyer))).toThrow(AuthorizationDeniedError);
    reflector.getAllAndOverride.mockReturnValueOnce(['seller']);
    expect(() => guard.canActivate(context({ ...buyer, roles: ['buyer', 'admin'] }))).toThrow(
      AuthorizationDeniedError,
    );
  });
});
