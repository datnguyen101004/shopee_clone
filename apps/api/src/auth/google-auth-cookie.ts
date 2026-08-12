import type { CookieOptions } from 'express';

import type { AuthConfig } from './auth.config';

export function googleTransactionCookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/login/oauth2/code/google',
    maxAge: config.google.transactionTtlSeconds * 1_000,
  };
}

export function expiredGoogleTransactionCookieOptions(config: AuthConfig): CookieOptions {
  const options = googleTransactionCookieOptions(config);
  delete options.maxAge;
  return { ...options, expires: new Date(0) };
}
