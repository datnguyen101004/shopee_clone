import { JwtService } from '@nestjs/jwt';

import { loadAuthConfig } from './auth.config';
import { refreshCookieOptions } from './auth-cookie';
import { AuthRateLimitedError } from './auth.errors';
import { AuthLimiterService } from './auth-limiter.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthTokenService } from './auth-token.service';

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
