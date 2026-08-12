import { describe, expect, it } from 'vitest';

import {
  isAcceptedAuthPassword,
  isAuthorizationProblemDetails,
  isAuthProblemDetails,
  isAuthSessionResponse,
  isCanonicalMarketplaceRoles,
  isForgotPasswordRequest,
  isGoogleSignInCompletion,
  isLoginRequest,
  isRoleAssignmentResult,
  isRoleAuditPage,
  isRoleGrantRequest,
  isRoleRevokeRequest,
  isRegisterRequest,
  isResetPasswordRequest,
  isSellerShop,
  normalizeAuthEmail,
  parseGoogleSignInCompletion,
  parseAuthSessionResponse,
} from '../src';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.com',
  displayName: 'Buyer Example',
  status: 'active',
  roles: ['buyer'],
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

  it('requires exact, deduplicated roles in canonical buyer-seller-admin order', () => {
    expect(isCanonicalMarketplaceRoles(['buyer'])).toBe(true);
    expect(isCanonicalMarketplaceRoles(['buyer', 'seller', 'admin'])).toBe(true);
    expect(isCanonicalMarketplaceRoles(['seller', 'buyer'])).toBe(false);
    expect(isCanonicalMarketplaceRoles(['buyer', 'buyer'])).toBe(false);
    expect(isCanonicalMarketplaceRoles(['buyer', 'operator'])).toBe(false);
    expect(isAuthSessionResponse({ ...session, user: { ...user, roles: undefined } })).toBe(false);
  });

  it('accepts only strict elevated-role commands and rejects authority assertions', () => {
    const grant = { role: 'seller', reason: 'Approved seller onboarding' };
    expect(isRoleGrantRequest(grant)).toBe(true);
    expect(isRoleGrantRequest({ ...grant, role: 'buyer' })).toBe(false);
    expect(isRoleGrantRequest({ ...grant, actorUserId: user.id })).toBe(false);
    expect(isRoleGrantRequest({ ...grant, ownerId: user.id })).toBe(false);
    expect(isRoleGrantRequest({ ...grant, reason: ' padded reason ' })).toBe(false);
    expect(isRoleRevokeRequest({ reason: 'Seller access withdrawn' })).toBe(true);
    expect(isRoleRevokeRequest({ reason: 'short' })).toBe(false);
  });

  it('parses only safe role, shop, and bounded audit projections', () => {
    expect(isRoleAssignmentResult({ userId: user.id, roles: ['buyer', 'seller'] })).toBe(true);
    expect(
      isSellerShop({
        id: '00000000-0000-4000-8000-000000000101',
        slug: 'example-shop',
        name: 'Example Shop',
        status: 'active',
      }),
    ).toBe(true);
    expect(
      isSellerShop({
        id: '00000000-0000-4000-8000-000000000101',
        slug: 'example-shop',
        name: 'Example Shop',
        status: 'active',
        ownerId: user.id,
      }),
    ).toBe(false);
    const auditEvent = {
      id: '00000000-0000-4000-8000-000000000901',
      targetUserId: user.id,
      role: 'seller',
      action: 'grant',
      source: 'admin',
      actorUserId: '00000000-0000-4000-8000-000000000002',
      reason: 'Approved seller onboarding',
      createdAt: '2026-08-13T03:00:00.000Z',
    };
    expect(isRoleAuditPage({ items: [auditEvent], nextCursor: 'opaque_cursor_value_123' })).toBe(
      true,
    );
    expect(isRoleAuditPage({ items: Array(101).fill(auditEvent), nextCursor: null })).toBe(false);
    expect(
      isRoleAuditPage({ items: [{ ...auditEvent, email: user.email }], nextCursor: null }),
    ).toBe(false);
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
    expect(
      isAuthorizationProblemDetails({
        type: 'https://shopee-clone.local/problems/authorization-denied',
        title: 'Authorization denied',
        status: 403,
        detail: 'The operation is not allowed.',
      }),
    ).toBe(true);
    expect(
      isAuthorizationProblemDetails({
        type: 'https://shopee-clone.local/problems/authorization-denied',
        title: 'Authorization denied',
        status: 404,
        detail: 'The operation is not allowed.',
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
