import { describe, expect, it } from 'vitest';

import {
  isAcceptedAuthPassword,
  isAuthProblemDetails,
  isAuthSessionResponse,
  isForgotPasswordRequest,
  isGoogleSignInCompletion,
  isLoginRequest,
  isRegisterRequest,
  isResetPasswordRequest,
  normalizeAuthEmail,
  parseGoogleSignInCompletion,
  parseAuthSessionResponse,
} from '../src';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.com',
  displayName: 'Buyer Example',
  status: 'active',
};

const session = {
  accessToken: 'header.payload.signature',
  expiresAt: '2026-08-12T15:00:00.000Z',
  user,
};

describe('authentication contracts', () => {
  it('normalizes email and accepts bounded account requests', () => {
    expect(normalizeAuthEmail('  Buyer@Example.COM ')).toBe('buyer@example.com');
    expect(
      isRegisterRequest({
        displayName: 'Buyer Example',
        email: 'buyer@example.com',
        password: 'Secure demo passphrase 2026',
      }),
    ).toBe(true);
    expect(isLoginRequest({ email: 'buyer@example.com', password: 'anything' })).toBe(true);
    expect(isForgotPasswordRequest({ email: 'buyer@example.com' })).toBe(true);
    expect(
      isResetPasswordRequest({
        token: 'a'.repeat(43),
        password: 'Secure replacement passphrase',
      }),
    ).toBe(true);
  });

  it('rejects non-normalized emails, common passwords, extra properties and malformed tokens', () => {
    expect(isAcceptedAuthPassword('password')).toBe(false);
    expect(
      isRegisterRequest({
        displayName: 'Buyer Example',
        email: 'Buyer@example.com',
        password: 'Secure demo passphrase 2026',
      }),
    ).toBe(false);
    expect(isLoginRequest({ email: 'buyer@example.com', password: 'x', remember: true })).toBe(
      false,
    );
    expect(isResetPasswordRequest({ token: 'short', password: 'long-enough-password' })).toBe(
      false,
    );
  });

  it('parses only strict safe session projections', () => {
    expect(parseAuthSessionResponse(session)).toEqual(session);
    expect(isAuthSessionResponse({ ...session, refreshToken: 'secret' })).toBe(false);
    expect(isAuthSessionResponse({ ...session, expiresAt: 'tomorrow' })).toBe(false);
    expect(isAuthSessionResponse({ ...session, user: { ...user, passwordHash: 'secret' } })).toBe(
      false,
    );
  });

  it('accepts bounded authentication Problem Details and rejects secret extensions', () => {
    expect(
      isAuthProblemDetails({
        type: 'https://shopee-clone.local/problems/authentication-failed',
        title: 'Authentication failed',
        status: 401,
        detail: 'The credentials could not be verified.',
      }),
    ).toBe(true);
    expect(
      isAuthProblemDetails({
        type: 'https://shopee-clone.local/problems/authentication-failed',
        title: 'Authentication failed',
        status: 401,
        detail: 'The credentials could not be verified.',
        token: 'secret',
      }),
    ).toBe(false);
  });

  it('parses only sanitized Google completion outcomes and local return paths', () => {
    const completion = {
      outcome: 'success',
      returnTo: '/products/00000000-0000-4000-8000-000000000301',
    };
    expect(parseGoogleSignInCompletion(completion)).toEqual(completion);
    expect(isGoogleSignInCompletion({ outcome: 'cancelled', returnTo: '/' })).toBe(true);
    expect(
      isGoogleSignInCompletion({ outcome: 'success', returnTo: 'https://attacker.example' }),
    ).toBe(false);
    expect(isGoogleSignInCompletion({ ...completion, code: 'secret' })).toBe(false);
  });
});
