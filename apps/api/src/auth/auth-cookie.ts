import type { CookieOptions } from 'express';

import type { AuthConfig } from './auth.config';

export function refreshCookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: config.refreshTokenTtlSeconds * 1_000,
  };
}

export function expiredRefreshCookieOptions(config: AuthConfig): CookieOptions {
  const options = refreshCookieOptions(config);
  delete options.maxAge;
  return { ...options, expires: new Date(0) };
}
