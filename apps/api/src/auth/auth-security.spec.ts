import { JwtService } from '@nestjs/jwt';

import { loadAuthConfig } from './auth.config';
import { refreshCookieOptions } from './auth-cookie';
import { AuthRateLimitedError, GoogleSignInFailedError } from './auth.errors';
import { AuthLimiterService } from './auth-limiter.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthTokenService } from './auth-token.service';
import { googleTransactionCookieOptions } from './google-auth-cookie';
import { GoogleAuthCryptoService } from './google-auth-crypto.service';
import { GoogleOAuthIdentityProvider } from './google-identity-provider';
import { AuthRandom } from './auth-random';

describe('authentication security foundations', () => {
  const config = loadAuthConfig({ NODE_ENV: 'test' });

  it('creates versioned scrypt envelopes and performs dummy verification', async () => {
    const passwords = new AuthPasswordService(config);
    const envelope = await passwords.hash('Secure demo passphrase 2026');
    expect(envelope).toMatch(/^scrypt\$1\$1024\$8\$1\$/);
    await expect(passwords.verify('Secure demo passphrase 2026', envelope)).resolves.toBe(true);
    await expect(passwords.verify('wrong password', envelope)).resolves.toBe(false);
    await expect(passwords.verify('anything', null)).resolves.toBe(false);
    expect(() => passwords.assertAccepted('password')).toThrow('Invalid authentication request');
    expect(passwords.needsRehash(envelope)).toBe(false);
    expect(
      new AuthPasswordService({
        ...config,
        scrypt: { ...config.scrypt, cost: config.scrypt.cost * 2 },
      }).needsRehash(envelope),
    ).toBe(true);
  });

  it('issues bounded access claims and domain-separated opaque digests', () => {
    const tokens = new AuthTokenService(new JwtService(), config);
    const now = new Date();
    const issued = tokens.issueAccess(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      now,
    );
    expect(issued.expiresAt.getTime() - Math.floor(now.getTime() / 1_000) * 1_000).toBe(
      15 * 60 * 1_000,
    );
    expect(tokens.verifyAccess(issued.accessToken)).toMatchObject({
      sub: '00000000-0000-4000-8000-000000000001',
      sid: '00000000-0000-4000-8000-000000000002',
    });
    const opaque = tokens.createOpaqueToken();
    expect(tokens.isOpaqueToken(opaque)).toBe(true);
    expect(tokens.hashOpaqueToken(opaque, 'refresh')).not.toBe(
      tokens.hashOpaqueToken(opaque, 'reset'),
    );
  });

  it('uses hardened refresh cookie flags', () => {
    expect(refreshCookieOptions({ ...config, cookieSecure: true })).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 2_592_000_000,
    });
  });

  it('protects one-time Google transaction material and uses callback-only cookies', () => {
    const crypto = new GoogleAuthCryptoService(config, new AuthRandom());
    const nonce = crypto.randomValue();
    const verifier = crypto.randomValue();
    const protectedPayload = crypto.protect({ nonce, verifier });
    expect(protectedPayload).not.toContain(nonce);
    expect(protectedPayload).not.toContain(verifier);
    expect(crypto.unprotect(protectedPayload)).toEqual({ nonce, verifier });
    const envelope = protectedPayload.split('.');
    envelope[2] = `${envelope[2]![0] === 'a' ? 'b' : 'a'}${envelope[2]!.slice(1)}`;
    expect(() => crypto.unprotect(envelope.join('.'))).toThrow(GoogleSignInFailedError);
    expect(crypto.digest(nonce, 'nonce')).not.toBe(crypto.digest(nonce, 'state'));
    expect(crypto.pkceChallenge(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(googleTransactionCookieOptions({ ...config, cookieSecure: true })).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/login/oauth2/code/google',
      maxAge: 600_000,
    });
  });

  it('generates an exact, minimal Google authorization request', () => {
    const provider = new GoogleOAuthIdentityProvider(config);
    const url = new URL(
      provider.authorizationUrl({
        state: 's'.repeat(43),
        nonce: 'n'.repeat(43),
        codeChallenge: 'c'.repeat(43),
      }),
    );
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3001/login/oauth2/code/google',
    );
    expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual(
      ['openid', 'email', 'profile'].sort(),
    );
    expect(url.searchParams.get('access_type')).toBe('online');
    expect(url.searchParams.get('state')).toBe('s'.repeat(43));
    expect(url.searchParams.get('nonce')).toBe('n'.repeat(43));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('accepts only a fully verified Google identity projection and returns no provider token', async () => {
    const provider = new GoogleOAuthIdentityProvider(config);
    const getToken = jest.fn().mockResolvedValue({
      tokens: { id_token: 'signed-id-token', access_token: 'discarded-access-token' },
    });
    const verifyIdToken = jest.fn().mockResolvedValue({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        aud: config.google.clientId,
        exp: Math.floor(Date.now() / 1_000) + 300,
        nonce: 'n'.repeat(43),
        sub: 'stable-google-subject',
        email: 'Buyer@Example.com',
        email_verified: true,
        name: 'Buyer Example',
      }),
    });
    Object.assign(provider as unknown as { client: unknown }, {
      client: { getToken, verifyIdToken },
    });
    await expect(
      provider.exchange({
        code: 'one-time-code',
        codeVerifier: 'v'.repeat(43),
        expectedNonce: 'n'.repeat(43),
      }),
    ).resolves.toEqual({
      subject: 'stable-google-subject',
      email: 'buyer@example.com',
      displayName: 'Buyer Example',
    });
    expect(getToken).toHaveBeenCalledWith({
      code: 'one-time-code',
      codeVerifier: 'v'.repeat(43),
      redirect_uri: config.google.callbackUrl,
    });
  });

  it('rejects invalid Google nonce or unverified email with one sanitized error type', async () => {
    const provider = new GoogleOAuthIdentityProvider(config);
    Object.assign(provider as unknown as { client: unknown }, {
      client: {
        getToken: jest.fn().mockResolvedValue({ tokens: { id_token: 'signed-id-token' } }),
        verifyIdToken: jest.fn().mockResolvedValue({
          getPayload: () => ({
            iss: 'https://accounts.google.com',
            aud: config.google.clientId,
            exp: Math.floor(Date.now() / 1_000) + 300,
            nonce: 'wrong-nonce',
            sub: 'stable-google-subject',
            email: 'buyer@example.com',
            email_verified: false,
          }),
        }),
      },
    });
    await expect(
      provider.exchange({
        code: 'one-time-code',
        codeVerifier: 'v'.repeat(43),
        expectedNonce: 'n'.repeat(43),
      }),
    ).rejects.toBeInstanceOf(GoogleSignInFailedError);
  });

  it('rate limits privacy-preserving keys and supplies a retry duration', () => {
    const limiter = new AuthLimiterService(config);
    const key = limiter.key('login-identity', 'buyer@example.com');
    expect(key).not.toContain('buyer@example.com');
    const limit = { max: 1, windowSeconds: 60 };
    limiter.consume(key, limit, new Date('2026-08-12T12:00:00.000Z'));
    expect(() => limiter.consume(key, limit, new Date('2026-08-12T12:00:01.000Z'))).toThrow(
      AuthRateLimitedError,
    );
    limiter.clear(key);
    expect(() => limiter.consume(key, limit, new Date('2026-08-12T12:00:01.000Z'))).not.toThrow();
  });
});
