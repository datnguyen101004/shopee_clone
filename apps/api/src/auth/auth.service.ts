import {
  marketplaceRoleValues,
  type AuthSessionResponse,
  type AuthUser,
  type MarketplaceRole as ContractMarketplaceRole,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import {
  MarketplaceRole,
  PasswordResetDeliveryStatus,
  UserStatus,
} from '../generated/prisma/enums';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { AuthClock } from './auth-clock';
import {
  AuthenticationFailedError,
  AccountSuspendedError,
  PasswordResetFailedError,
  RecoveryDeliveryFailedError,
  RefreshSessionFailedError,
  RegistrationUnavailableError,
} from './auth.errors';
import { AuthLimiterService } from './auth-limiter.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthRepository } from './auth.repository';
import { type AccessClaims, AuthTokenService } from './auth-token.service';
import { RECOVERY_MAILER, type RecoveryMailer } from './recovery-mailer';

type PersistedUser = {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  deletedAt: Date | null;
  passwordHash: string | null;
  roleAssignments: Array<{ role: MarketplaceRole }>;
};

export interface AuthSessionResult extends AuthSessionResponse {
  refreshToken: string;
}

function safeUser(user: PersistedUser): AuthUser {
  const persistedRoles = new Set(
    user.roleAssignments.map((assignment): ContractMarketplaceRole => {
      switch (assignment.role) {
        case MarketplaceRole.BUYER:
          return 'buyer';
        case MarketplaceRole.SELLER:
          return 'seller';
        case MarketplaceRole.ADMIN:
          return 'admin';
      }
    }),
  );
  const roles = marketplaceRoleValues.filter((role) => persistedRoles.has(role));
  if (roles[0] !== 'buyer') throw new AuthenticationFailedError();
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status === UserStatus.ACTIVE ? 'active' : 'suspended',
    roles,
  };
}

function isUniqueFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthRepository)
    private readonly repository: AuthRepository,
    @Inject(AuthPasswordService)
    private readonly password: AuthPasswordService,
    @Inject(AuthTokenService)
    private readonly tokens: AuthTokenService,
    @Inject(AuthLimiterService)
    private readonly limiter: AuthLimiterService,
    @Inject(AuthClock)
    private readonly clock: AuthClock,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(RECOVERY_MAILER) private readonly mailer: RecoveryMailer,
  ) {}

  async register(
    input: { displayName: string; email: string; password: string },
    requestSource: string,
  ): Promise<AuthSessionResult> {
    const now = this.clock.now();
    this.limiter.consume(
      this.limiter.key('register-source', requestSource),
      this.config.limits.registerSource,
      now,
    );
    const passwordHash = await this.password.hash(input.password);
    const refreshToken = this.tokens.createOpaqueToken();
    const userId = this.tokens.createId();
    const sessionId = this.tokens.createId();
    const familyId = this.tokens.createId();
    const refreshExpiresAt = new Date(now.getTime() + this.config.refreshTokenTtlSeconds * 1_000);
    let user: PersistedUser;
    try {
      user = await this.repository.createRegisteredUser({
        userId,
        email: input.email,
        displayName: input.displayName,
        passwordHash,
        sessionId,
        familyId,
        tokenHash: this.tokens.hashOpaqueToken(refreshToken, 'refresh'),
        expiresAt: refreshExpiresAt,
        now,
      });
    } catch (error) {
      if (isUniqueFailure(error)) throw new RegistrationUnavailableError();
      throw error;
    }
    await this.repository.pruneExpired(now);
    return this.sessionResult(user, sessionId, refreshToken, now);
  }

  async login(
    input: { email: string; password: string },
    requestSource: string,
  ): Promise<AuthSessionResult> {
    const now = this.clock.now();
    const identityKey = this.limiter.key('login-identity', input.email);
    this.limiter.consume(identityKey, this.config.limits.loginIdentity, now);
    this.limiter.consume(
      this.limiter.key('login-source', requestSource),
      this.config.limits.loginSource,
      now,
    );
    const user = await this.repository.findCredentialUser(input.email);
    const verified = await this.password.verify(input.password, user?.passwordHash ?? null);
    if (!user || !verified || user.deletedAt !== null || user.passwordHash === null) {
      throw new AuthenticationFailedError();
    }
    if (user.status !== UserStatus.ACTIVE) throw new AccountSuspendedError();
    this.limiter.clear(identityKey);
    if (this.password.needsRehash(user.passwordHash)) {
      const upgradedHash = await this.password.hash(input.password);
      await this.repository.updatePasswordHash(user.id, upgradedHash);
    }
    const refreshToken = this.tokens.createOpaqueToken();
    const sessionId = this.tokens.createId();
    await this.repository.createSession({
      id: sessionId,
      userId: user.id,
      familyId: this.tokens.createId(),
      tokenHash: this.tokens.hashOpaqueToken(refreshToken, 'refresh'),
      expiresAt: new Date(now.getTime() + this.config.refreshTokenTtlSeconds * 1_000),
      now,
    });
    await this.repository.pruneExpired(now);
    return this.sessionResult(user, sessionId, refreshToken, now);
  }

  async loginWithGoogle(input: {
    subject: string;
    email: string;
    displayName: string;
  }): Promise<AuthSessionResult> {
    const now = this.clock.now();
    const refreshToken = this.tokens.createOpaqueToken();
    const sessionId = this.tokens.createId();
    const persistence = {
      ...input,
      userId: this.tokens.createId(),
      identityId: this.tokens.createId(),
      sessionId,
      familyId: this.tokens.createId(),
      tokenHash: this.tokens.hashOpaqueToken(refreshToken, 'refresh'),
      expiresAt: new Date(now.getTime() + this.config.refreshTokenTtlSeconds * 1_000),
      now,
    };
    let user: PersistedUser;
    try {
      user = await this.repository.createGoogleIdentitySession(persistence);
    } catch (error) {
      if (!isUniqueFailure(error)) throw error;
      user = await this.repository.createGoogleIdentitySession(persistence);
    }
    await this.repository.pruneExpired(now);
    return this.sessionResult(user, sessionId, refreshToken, now);
  }

  async refresh(refreshToken: string | undefined): Promise<AuthSessionResult> {
    const now = this.clock.now();
    if (!refreshToken || !this.tokens.isOpaqueToken(refreshToken)) {
      throw new RefreshSessionFailedError();
    }
    const tokenHash = this.tokens.hashOpaqueToken(refreshToken, 'refresh');
    this.limiter.consume(
      this.limiter.key('refresh-session', tokenHash),
      this.config.limits.refreshSession,
      now,
    );
    const current = await this.repository.findSessionByHash(tokenHash);
    if (!current) throw new RefreshSessionFailedError();
    if (current.rotatedAt) {
      const elapsed = now.getTime() - current.rotatedAt.getTime();
      if (elapsed > this.config.refreshReuseToleranceSeconds * 1_000) {
        await this.repository.revokeFamily(current.familyId, now);
      }
      throw new RefreshSessionFailedError(
        elapsed > this.config.refreshReuseToleranceSeconds * 1_000,
      );
    }
    if (
      current.revokedAt ||
      current.expiresAt <= now ||
      current.user.status !== UserStatus.ACTIVE ||
      current.user.deletedAt !== null
    ) {
      throw new RefreshSessionFailedError();
    }
    const successorToken = this.tokens.createOpaqueToken();
    const successorId = this.tokens.createId();
    const rotated = await this.repository.rotateSession({
      currentId: current.id,
      currentTokenHash: tokenHash,
      successorId,
      successorTokenHash: this.tokens.hashOpaqueToken(successorToken, 'refresh'),
      familyId: current.familyId,
      userId: current.userId,
      expiresAt: new Date(now.getTime() + this.config.refreshTokenTtlSeconds * 1_000),
      now,
    });
    if (!rotated) throw new RefreshSessionFailedError(false);
    await this.repository.pruneExpired(now);
    return this.sessionResult(current.user, successorId, successorToken, now);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken || !this.tokens.isOpaqueToken(refreshToken)) return;
    await this.repository.revokeSessionByHash(
      this.tokens.hashOpaqueToken(refreshToken, 'refresh'),
      this.clock.now(),
    );
  }

  async authenticateAccess(claims: AccessClaims): Promise<AuthUser> {
    const session = await this.repository.findAuthenticatedSession(
      claims.sub,
      claims.sid,
      this.clock.now(),
    );
    if (!session) throw new AuthenticationFailedError();
    return safeUser(session.user);
  }

  async forgotPassword(email: string, requestSource: string): Promise<void> {
    const now = this.clock.now();
    this.limiter.consume(
      this.limiter.key('recovery-source', requestSource),
      this.config.limits.recoverySource,
      now,
    );
    this.limiter.consume(
      this.limiter.key('recovery-identity', email),
      this.config.limits.recoveryIdentity,
      now,
    );
    const user = await this.repository.findCredentialUser(email);
    const rawToken = this.tokens.createOpaqueToken();
    this.tokens.hashOpaqueToken(rawToken, 'reset');
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.deletedAt !== null ||
      user.passwordHash === null
    ) {
      return;
    }
    const resetId = this.tokens.createId();
    const expiresAt = new Date(now.getTime() + this.config.resetTokenTtlSeconds * 1_000);
    await this.repository.createPasswordReset({
      id: resetId,
      userId: user.id,
      tokenHash: this.tokens.hashOpaqueToken(rawToken, 'reset'),
      expiresAt,
      now,
    });
    const resetUrl = new URL('/reset-password', this.config.webBaseUrl);
    resetUrl.searchParams.set('token', rawToken);
    try {
      await this.mailer.sendPasswordReset({
        email: user.email,
        displayName: user.displayName,
        resetUrl: resetUrl.toString(),
        expiresAt: expiresAt.toISOString(),
      });
      await this.repository.markPasswordResetSent(resetId);
    } catch {
      await this.repository.markPasswordResetFailed(resetId, this.clock.now());
      throw new RecoveryDeliveryFailedError();
    }
  }

  async resetPassword(token: string, password: string, requestSource: string): Promise<void> {
    const now = this.clock.now();
    this.limiter.consume(
      this.limiter.key('reset-source', requestSource),
      this.config.limits.resetSource,
      now,
    );
    this.limiter.consume(
      this.limiter.key('reset-credential', token),
      this.config.limits.resetCredential,
      now,
    );
    this.password.assertAccepted(password);
    if (!this.tokens.isOpaqueToken(token)) throw new PasswordResetFailedError();
    const reset = await this.repository.findPasswordResetByHash(
      this.tokens.hashOpaqueToken(token, 'reset'),
    );
    if (
      !reset ||
      reset.usedAt ||
      reset.revokedAt ||
      reset.deliveryStatus !== PasswordResetDeliveryStatus.SENT ||
      reset.expiresAt <= now ||
      reset.user.status !== UserStatus.ACTIVE ||
      reset.user.deletedAt !== null
    ) {
      throw new PasswordResetFailedError();
    }
    const passwordHash = await this.password.hash(password);
    const consumed = await this.repository.consumePasswordReset({
      id: reset.id,
      userId: reset.userId,
      passwordHash,
      now,
    });
    if (!consumed) throw new PasswordResetFailedError();
    await this.repository.pruneExpired(now);
  }

  private sessionResult(
    user: PersistedUser,
    sessionId: string,
    refreshToken: string,
    now: Date,
  ): AuthSessionResult {
    const access = this.tokens.issueAccess(user.id, sessionId, now);
    return {
      accessToken: access.accessToken,
      expiresAt: access.expiresAt.toISOString(),
      user: safeUser(user),
      refreshToken,
    };
  }
}
