import type { ExecutionContext } from '@nestjs/common';

import type { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.guard';
import type { AuthTokenService } from './auth-token.service';
import { OptionalAuthGuard } from './optional-auth.guard';

function context(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('OptionalAuthGuard', () => {
  const user = { id: 'buyer-1' };

  it('keeps a request without bearer credentials public', async () => {
    const tokens = { verifyAccess: jest.fn() };
    const auth = { authenticateAccess: jest.fn() };
    const guard = new OptionalAuthGuard(
      tokens as unknown as AuthTokenService,
      auth as unknown as AuthService,
    );
    const request = { headers: {} } as AuthenticatedRequest;
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.authUser).toBeUndefined();
    expect(auth.authenticateAccess).not.toHaveBeenCalled();
  });

  it('attaches a valid authenticated buyer', async () => {
    const claims = { sub: 'buyer-1', sid: 'session-1' };
    const tokens = { verifyAccess: jest.fn().mockReturnValue(claims) };
    const auth = { authenticateAccess: jest.fn().mockResolvedValue(user) };
    const guard = new OptionalAuthGuard(
      tokens as unknown as AuthTokenService,
      auth as unknown as AuthService,
    );
    const request = { headers: { authorization: 'Bearer valid' } } as AuthenticatedRequest;
    await guard.canActivate(context(request));
    expect(request.authUser).toBe(user);
    expect(request.authSessionId).toBe('session-1');
  });

  it.each(['Bearer expired', 'Basic credentials'])(
    'treats invalid optional credentials as guest',
    async (authorization) => {
      const tokens = {
        verifyAccess: jest.fn().mockImplementation(() => {
          throw new Error('invalid');
        }),
      };
      const auth = { authenticateAccess: jest.fn() };
      const guard = new OptionalAuthGuard(
        tokens as unknown as AuthTokenService,
        auth as unknown as AuthService,
      );
      const request = { headers: { authorization } } as AuthenticatedRequest;
      await expect(guard.canActivate(context(request))).resolves.toBe(true);
      expect(request.authUser).toBeUndefined();
    },
  );
});
