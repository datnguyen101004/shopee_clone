import type { CookieOptions } from 'express';

import type { AuthConfig } from './auth.config';
import {
  credentialCookieOptions,
  expiredCredentialCookieOptions,
} from '../security/credential-cookie';

export function refreshCookieOptions(config: AuthConfig): CookieOptions {
  return credentialCookieOptions({
    secure: config.cookieSecure,
    path: '/api/v1/auth',
    maxAgeMs: config.refreshTokenTtlSeconds * 1_000,
  });
}

export function expiredRefreshCookieOptions(config: AuthConfig): CookieOptions {
  return expiredCredentialCookieOptions({
    secure: config.cookieSecure,
    path: '/api/v1/auth',
    maxAgeMs: config.refreshTokenTtlSeconds * 1_000,
  });
}
