import { loadAuthConfig } from './auth.config';

describe('authentication configuration', () => {
  it('provides explicit development and test-safe defaults', () => {
    const development = loadAuthConfig({ NODE_ENV: 'development' });
    expect(development.cookieSecure).toBe(false);
    expect(development.recoveryMode).toBe('file');
    expect(development.scrypt.cost).toBe(131_072);

    const test = loadAuthConfig({ NODE_ENV: 'test' });
    expect(test.recoveryMode).toBe('capture');
    expect(test.scrypt.cost).toBe(1_024);
  });

  it('rejects unsafe production configuration and malformed values', () => {
    expect(() => loadAuthConfig({ NODE_ENV: 'production' })).toThrow(
      'authentication configuration',
    );
    expect(() => loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: '*' })).toThrow(
      'AUTH_ALLOWED_ORIGINS',
    );
    expect(() => loadAuthConfig({ NODE_ENV: 'test', AUTH_SCRYPT_COST: '1000' })).toThrow(
      'AUTH_SCRYPT_COST',
    );
  });

  it('accepts a hardened production webhook configuration', () => {
    const config = loadAuthConfig({
      NODE_ENV: 'production',
      AUTH_ACCESS_TOKEN_SECRET: 'a'.repeat(64),
      AUTH_LIMITER_SECRET: 'b'.repeat(64),
      AUTH_ALLOWED_ORIGINS: 'https://shop.example.com',
      AUTH_WEB_BASE_URL: 'https://shop.example.com',
      AUTH_COOKIE_SECURE: 'true',
      AUTH_RECOVERY_MODE: 'webhook',
      AUTH_RECOVERY_WEBHOOK_URL: 'https://mail.example.com/send',
      AUTH_RECOVERY_WEBHOOK_SECRET: 'c'.repeat(64),
    });
    expect(config.recoveryMode).toBe('webhook');
    expect(config.allowedOrigins).toEqual(['https://shop.example.com']);
  });
});
