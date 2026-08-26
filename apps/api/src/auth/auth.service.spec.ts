import { MarketplaceRole, UserStatus } from '../generated/prisma/enums';
import { loadAuthConfig } from './auth.config';
import type { AuthClock } from './auth-clock';
import {
  AuthenticationFailedError,
  AccountSuspendedError,
  RecoveryDeliveryFailedError,
  RefreshSessionFailedError,
} from './auth.errors';
import type { AuthLimiterService } from './auth-limiter.service';
import type { AuthPasswordService } from './auth-password.service';
import type { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import type { AuthTokenService } from './auth-token.service';
import type { RecoveryMailer } from './recovery-mailer';

const now = new Date('2026-08-12T12:00:00.000Z');
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.com',
  displayName: 'Buyer Example',
  status: UserStatus.ACTIVE,
  deletedAt: null,
  passwordHash: 'stored-hash',
  roleAssignments: [{ role: MarketplaceRole.BUYER }],
};

describe('AuthService', () => {
  const config = loadAuthConfig({ NODE_ENV: 'test' });
  let repository: jest.Mocked<AuthRepository>;
  let password: jest.Mocked<AuthPasswordService>;
  let tokens: jest.Mocked<AuthTokenService>;
  let limiter: jest.Mocked<AuthLimiterService>;
  let mailer: jest.Mocked<RecoveryMailer>;
  let service: AuthService;

  beforeEach(() => {
    repository = {
      createRegisteredUser: jest.fn(),
      createSession: jest.fn(),
      pruneExpired: jest.fn(),
      findCredentialUser: jest.fn(),
      updatePasswordHash: jest.fn(),
      findSessionByHash: jest.fn(),
      rotateSession: jest.fn(),
      revokeFamily: jest.fn(),
      revokeSessionByHash: jest.fn(),
      findAuthenticatedSession: jest.fn(),
      createPasswordReset: jest.fn(),
      markPasswordResetSent: jest.fn(),
      markPasswordResetFailed: jest.fn(),
      findPasswordResetByHash: jest.fn(),
      consumePasswordReset: jest.fn(),
      createGoogleIdentitySession: jest.fn(),
    } as unknown as jest.Mocked<AuthRepository>;
    password = {
      hash: jest.fn().mockResolvedValue('stored-hash'),
      verify: jest.fn(),
      assertAccepted: jest.fn(),
      needsRehash: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<AuthPasswordService>;
    tokens = {
      createOpaqueToken: jest.fn().mockReturnValue('a'.repeat(43)),
      createId: jest
        .fn()
        .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
        .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
        .mockReturnValue('00000000-0000-4000-8000-000000000003'),
      hashOpaqueToken: jest.fn().mockReturnValue('b'.repeat(64)),
      issueAccess: jest.fn().mockReturnValue({
        accessToken: 'header.payload.signature',
        expiresAt: new Date('2026-08-12T12:15:00.000Z'),
      }),
      isOpaqueToken: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<AuthTokenService>;
    limiter = {
      key: jest.fn((kind: string) => kind),
      consume: jest.fn(),
      clear: jest.fn(),
    } as unknown as jest.Mocked<AuthLimiterService>;
    mailer = { sendPasswordReset: jest.fn() };
    service = new AuthService(
      repository,
      password,
      tokens,
      limiter,
      { now: () => now } as AuthClock,
      config,
      mailer,
    );
  });

  it('registers atomically and returns no refresh token inside the access credential', async () => {
    repository.createRegisteredUser.mockResolvedValue(user);
    const result = await service.register(
      { ...user, password: 'Secure demo passphrase 2026' },
      '127.0.0.1',
    );
    expect(result).toMatchObject({
      user: { email: user.email },
      accessToken: 'header.payload.signature',
      refreshToken: 'a'.repeat(43),
    });
    expect(repository.createRegisteredUser).toHaveBeenCalled();
  });

  it('uses the same login failure after dummy password verification', async () => {
    repository.findCredentialUser.mockResolvedValue(null);
    password.verify.mockResolvedValue(false);
    await expect(
      service.login({ email: user.email, password: 'wrong' }, '127.0.0.1'),
    ).rejects.toBeInstanceOf(AuthenticationFailedError);
    expect(password.verify).toHaveBeenCalledWith('wrong', null);
  });

  it('returns the locked account outcome only after the submitted password is verified', async () => {
    repository.findCredentialUser.mockResolvedValue({ ...user, status: UserStatus.SUSPENDED });
    password.verify.mockResolvedValue(true);
    await expect(
      service.login({ email: user.email, password: 'correct passphrase' }, '127.0.0.1'),
    ).rejects.toBeInstanceOf(AccountSuspendedError);
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it('converts a verified Google subject into the existing local session shape', async () => {
    repository.createGoogleIdentitySession.mockResolvedValue(user);
    await expect(
      service.loginWithGoogle({
        subject: 'stable-google-subject',
        email: user.email,
        displayName: user.displayName,
      }),
    ).resolves.toMatchObject({
      accessToken: 'header.payload.signature',
      refreshToken: 'a'.repeat(43),
      user: { email: user.email },
    });
    expect(repository.createGoogleIdentitySession).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'stable-google-subject',
        tokenHash: 'b'.repeat(64),
      }),
    );
  });

  it('revokes a refresh family after late rotated-token reuse', async () => {
    repository.findSessionByHash.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000002',
      userId: user.id,
      familyId: '00000000-0000-4000-8000-000000000003',
      rotatedAt: new Date(now.getTime() - 6_000),
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 60_000),
      user,
    } as never);
    await expect(service.refresh('a'.repeat(43))).rejects.toBeInstanceOf(RefreshSessionFailedError);
    expect(repository.revokeFamily).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000003',
      now,
    );
  });

  it('rejects refresh and access authentication as soon as the seller account is suspended', async () => {
    repository.findSessionByHash.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000004',
      userId: user.id,
      familyId: '00000000-0000-4000-8000-000000000005',
      rotatedAt: null,
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 60_000),
      user: { ...user, status: UserStatus.SUSPENDED },
    } as never);
    await expect(service.refresh('a'.repeat(43))).rejects.toBeInstanceOf(RefreshSessionFailedError);
    repository.findAuthenticatedSession.mockResolvedValue(null);
    await expect(
      service.authenticateAccess({ sub: user.id, sid: '00000000-0000-4000-8000-000000000004', iat: 1, exp: 2 } as never),
    ).rejects.toBeInstanceOf(AuthenticationFailedError);
  });

  it('returns generic recovery behavior without sending for an unknown account', async () => {
    repository.findCredentialUser.mockResolvedValue(null);
    await expect(
      service.forgotPassword('unknown@example.com', '127.0.0.1'),
    ).resolves.toBeUndefined();
    expect(mailer.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('compensates a recovery credential when delivery fails', async () => {
    repository.findCredentialUser.mockResolvedValue(user);
    mailer.sendPasswordReset.mockRejectedValue(new Error('provider secret'));
    await expect(service.forgotPassword(user.email, '127.0.0.1')).rejects.toBeInstanceOf(
      RecoveryDeliveryFailedError,
    );
    expect(repository.createPasswordReset).toHaveBeenCalled();
    expect(repository.markPasswordResetFailed).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      now,
    );
  });
});
