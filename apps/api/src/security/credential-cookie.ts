import type { CookieOptions } from 'express';

export interface CredentialCookiePolicy {
  secure: boolean;
  path: string;
  maxAgeMs: number;
}

export function credentialCookieOptions(policy: CredentialCookiePolicy): CookieOptions {
  return {
    httpOnly: true,
    secure: policy.secure,
    sameSite: 'lax',
    path: policy.path,
    maxAge: policy.maxAgeMs,
  };
}

export function expiredCredentialCookieOptions(policy: CredentialCookiePolicy): CookieOptions {
  const options = credentialCookieOptions(policy);
  delete options.maxAge;
  return { ...options, expires: new Date(0) };
}
