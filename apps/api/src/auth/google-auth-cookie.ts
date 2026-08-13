import type { CookieOptions } from 'express';

import type { AuthConfig } from './auth.config';
import {
  credentialCookieOptions,
  expiredCredentialCookieOptions,
} from '../security/credential-cookie';

export function googleTransactionCookieOptions(config: AuthConfig): CookieOptions {
  return credentialCookieOptions({
    secure: config.cookieSecure,
    path: '/login/oauth2/code/google',
    maxAgeMs: config.google.transactionTtlSeconds * 1_000,
  });
}

export function expiredGoogleTransactionCookieOptions(config: AuthConfig): CookieOptions {
  return expiredCredentialCookieOptions({
    secure: config.cookieSecure,
    path: '/login/oauth2/code/google',
    maxAgeMs: config.google.transactionTtlSeconds * 1_000,
  });
}
