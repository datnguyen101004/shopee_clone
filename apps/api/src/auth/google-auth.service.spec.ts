import { loadAuthConfig } from './auth.config';
import type { AuthClock } from './auth-clock';
import { GoogleAccountMethodRequiredError, GoogleSignInFailedError } from './auth.errors';
import type { AuthLimiterService } from './auth-limiter.service';
import { AuthRandom } from './auth-random';
import type { AuthRepository } from './auth.repository';
import type { AuthService } from './auth.service';
import { GoogleAuthCryptoService } from './google-auth-crypto.service';
import { GoogleAuthService } from './google-auth.service';
import type { GoogleIdentityProvider } from './google-identity-provider';

const now = new Date('2026-08-12T12:00:00.000Z');
const session = {
  accessToken: 'header.payload.signature',
  expiresAt: '2026-08-12T12:15:00.000Z',
  refreshToken: 'r'.repeat(43),
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'buyer@example.com',
    displayName: 'Buyer Example',
    status: 'active' as const,
  },
};

describe('GoogleAuthService', () => {
  const config = loadAuthConfig({ NODE_ENV: 'test' });
  let createdAttempt: Record<string, unknown>;
  let repository: jest.Mocked<AuthRepository>;
  let auth: jest.Mocked<AuthService>;
  let provider: jest.Mocked<GoogleIdentityProvider>;
  let service: GoogleAuthService;

  beforeEach(() => {
    createdAttempt = {};
    repository = {
      createGoogleLoginAttempt: jest.fn(async (input) => {
        createdAttempt = input;
        return input as never;
      }),
      consumeGoogleLoginAttempt: jest.fn(async () => createdAttempt as never),
    } as unknown as jest.Mocked<AuthRepository>;
    auth = {
      loginWithGoogle: jest.fn().mockResolvedValue(session),
    } as unknown as jest.Mocked<AuthService>;
    provider = {
      authorizationUrl: jest.fn(({ state }) => `https://accounts.google.test/auth?state=${state}`),
      exchange: jest.fn().mockResolvedValue({
        subject: 'google-subject-1',
        email: 'buyer@example.com',
        displayName: 'Buyer Example',
      }),
    };
    const limiter = {
      key: jest.fn((kind: string) => kind),
      consume: jest.fn(),
    } as unknown as jest.Mocked<AuthLimiterService>;
    service = new GoogleAuthService(
      config,
      { now: () => now } as AuthClock,
      limiter,
      repository,
      auth,
      new GoogleAuthCryptoService(config, new AuthRandom()),
      provider,
    );
  });

  it('creates a browser-bound attempt and completes it into the existing local session', async () => {
    const started = await service.start(
      '/products/00000000-0000-4000-8000-000000000010',
      '127.0.0.1',
    );
    const state = new URL(started.authorizationUrl).searchParams.get('state')!;
    expect(createdAttempt).toMatchObject({
      returnTo: '/products/00000000-0000-4000-8000-000000000010',
      stateHash: expect.not.stringContaining(state),
      browserBindingHash: expect.not.stringContaining(started.browserBinding),
    });
    const completion = await service.complete({
      state,
      code: 'one-time-code',
      providerError: undefined,
      browserBinding: started.browserBinding,
      requestSource: '127.0.0.1',
    });
    expect(completion).toEqual({
      outcome: 'success',
      returnTo: '/products/00000000-0000-4000-8000-000000000010',
      session,
    });
    expect(provider.exchange).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'one-time-code', expectedNonce: expect.any(String) }),
    );
  });

  it('consumes cancellation without provider exchange and rejects replay', async () => {
    const started = await service.start('https://attacker.example', '127.0.0.1');
    const state = new URL(started.authorizationUrl).searchParams.get('state')!;
    await expect(
      service.complete({
        state,
        code: undefined,
        providerError: 'access_denied',
        browserBinding: started.browserBinding,
        requestSource: '127.0.0.1',
      }),
    ).resolves.toEqual({ outcome: 'cancelled', returnTo: '/' });
    expect(provider.exchange).not.toHaveBeenCalled();
    repository.consumeGoogleLoginAttempt.mockResolvedValueOnce(null);
    await expect(
      service.complete({
        state,
        code: 'replayed-code',
        providerError: undefined,
        browserBinding: started.browserBinding,
        requestSource: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(GoogleSignInFailedError);
  });

  it('returns original-method guidance instead of silently linking an email owner', async () => {
    const started = await service.start('/', '127.0.0.1');
    auth.loginWithGoogle.mockRejectedValueOnce(new GoogleAccountMethodRequiredError());
    await expect(
      service.complete({
        state: new URL(started.authorizationUrl).searchParams.get('state')!,
        code: 'one-time-code',
        providerError: undefined,
        browserBinding: started.browserBinding,
        requestSource: '127.0.0.1',
      }),
    ).resolves.toEqual({ outcome: 'account-method-required', returnTo: '/' });
  });
});
