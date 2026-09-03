import { loadAuthConfig } from './auth.config';

describe('authentication configuration', () => {
  it('provides explicit development and test-safe defaults', () => {
    const development = loadAuthConfig({
      NODE_ENV: 'development',
      GOOGLE_CLIENT_ID: 'local-client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'local-test-client-secret',
    });
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
      GOOGLE_CLIENT_ID: 'production-client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'd'.repeat(32),
      GOOGLE_CALLBACK_URL: 'https://api.example.com/login/oauth2/code/google',
    });
    expect(config.recoveryMode).toBe('webhook');
    expect(config.allowedOrigins).toEqual(['https://shop.example.com']);
  });

  it('fails closed for missing, placeholder, or mismatched Google settings', () => {
    expect(() => loadAuthConfig({ NODE_ENV: 'development' })).toThrow('GOOGLE_CLIENT_ID');
    expect(() =>
      loadAuthConfig({
        NODE_ENV: 'development',
        GOOGLE_CLIENT_ID: 'replace_with_google_client_id',
        GOOGLE_CLIENT_SECRET: 'valid-client-secret',
      }),
    ).toThrow('GOOGLE_CLIENT_ID');
    expect(() =>
      loadAuthConfig({
        NODE_ENV: 'development',
        GOOGLE_CLIENT_ID: 'valid.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'valid-client-secret',
        GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/v1/auth/google/callback',
      }),
    ).toThrow('GOOGLE_CALLBACK_URL');
  });
});
