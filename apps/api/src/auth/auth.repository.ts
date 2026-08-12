import { Inject, Injectable } from '@nestjs/common';

import {
  ExternalIdentityProvider,
  MarketplaceRole,
  PasswordResetDeliveryStatus,
  RoleAuditAction,
  RoleAuditSource,
  UserStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleAccountMethodRequiredError, GoogleSignInFailedError } from './auth.errors';

const safeUserSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  deletedAt: true,
  passwordHash: true,
  roleAssignments: {
    select: { role: true },
  },
} as const;

@Injectable()
export class AuthRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findCredentialUser(email: string) {
    return this.prisma.user.findUnique({ where: { email }, select: safeUserSelect });
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async createRegisteredUser(input: {
    userId: string;
    email: string;
    displayName: string;
    passwordHash: string;
    sessionId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          id: input.userId,
          email: input.email,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          status: UserStatus.ACTIVE,
        },
        select: safeUserSelect,
      });
      await transaction.userRoleAssignment.create({
        data: {
          userId: user.id,
          role: MarketplaceRole.BUYER,
          source: RoleAuditSource.SYSTEM,
        },
      });
      await transaction.roleAuditEvent.create({
        data: {
          targetUserId: user.id,
          role: MarketplaceRole.BUYER,
          action: RoleAuditAction.GRANT,
          source: RoleAuditSource.SYSTEM,
          reason: 'Buyer role assigned at account creation',
        },
      });
      await transaction.authSession.create({
        data: {
          id: input.sessionId,
          userId: user.id,
          familyId: input.familyId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          lastUsedAt: input.now,
        },
      });
      return transaction.user.findUniqueOrThrow({ where: { id: user.id }, select: safeUserSelect });
    });
  }

  async createSession(input: {
    id: string;
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }) {
    return this.prisma.authSession.create({
      data: {
        id: input.id,
        userId: input.userId,
        familyId: input.familyId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: input.now,
        lastUsedAt: input.now,
      },
    });
  }

  createGoogleLoginAttempt(input: {
    id: string;
    stateHash: string;
    browserBindingHash: string;
    nonceHash: string;
    protectedPayload: string;
    returnTo: string;
    expiresAt: Date;
    now: Date;
  }) {
    return this.prisma.googleLoginAttempt.create({
      data: {
        id: input.id,
        stateHash: input.stateHash,
        browserBindingHash: input.browserBindingHash,
        nonceHash: input.nonceHash,
        protectedPayload: input.protectedPayload,
        returnTo: input.returnTo,
        expiresAt: input.expiresAt,
        createdAt: input.now,
      },
    });
  }

  async consumeGoogleLoginAttempt(input: {
    stateHash: string;
    browserBindingHash: string;
    now: Date;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const attempt = await transaction.googleLoginAttempt.findUnique({
        where: { stateHash: input.stateHash },
      });
      if (!attempt) return null;
      const consumed = await transaction.googleLoginAttempt.updateMany({
        where: {
          id: attempt.id,
          browserBindingHash: input.browserBindingHash,
          consumedAt: null,
          expiresAt: { gt: input.now },
        },
        data: { consumedAt: input.now },
      });
      return consumed.count === 1 ? attempt : null;
    });
  }

  async createGoogleIdentitySession(input: {
    subject: string;
    email: string;
    displayName: string;
    userId: string;
    identityId: string;
    sessionId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const identity = await transaction.externalIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: ExternalIdentityProvider.GOOGLE,
            providerSubject: input.subject,
          },
        },
        include: { user: { select: safeUserSelect } },
      });
      let user;
      if (identity) {
        if (identity.user.status !== UserStatus.ACTIVE || identity.user.deletedAt !== null) {
          throw new GoogleSignInFailedError();
        }
        user = identity.user;
        await transaction.externalIdentity.update({
          where: { id: identity.id },
          data: { lastLoginAt: input.now },
        });
      } else {
        const emailOwner = await transaction.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (emailOwner) throw new GoogleAccountMethodRequiredError();
        user = await transaction.user.create({
          data: {
            id: input.userId,
            email: input.email,
            displayName: input.displayName,
            passwordHash: null,
            status: UserStatus.ACTIVE,
          },
          select: safeUserSelect,
        });
        await transaction.userRoleAssignment.create({
          data: {
            userId: user.id,
            role: MarketplaceRole.BUYER,
            source: RoleAuditSource.SYSTEM,
          },
        });
        await transaction.roleAuditEvent.create({
          data: {
            targetUserId: user.id,
            role: MarketplaceRole.BUYER,
            action: RoleAuditAction.GRANT,
            source: RoleAuditSource.SYSTEM,
            reason: 'Buyer role assigned at account creation',
          },
        });
        await transaction.externalIdentity.create({
          data: {
            id: input.identityId,
            userId: user.id,
            provider: ExternalIdentityProvider.GOOGLE,
            providerSubject: input.subject,
            createdAt: input.now,
            lastLoginAt: input.now,
          },
        });
      }
      await transaction.authSession.create({
        data: {
          id: input.sessionId,
          userId: user.id,
          familyId: input.familyId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          lastUsedAt: input.now,
        },
      });
      return transaction.user.findUniqueOrThrow({ where: { id: user.id }, select: safeUserSelect });
    });
  }

  findSessionByHash(tokenHash: string) {
    return this.prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: { select: safeUserSelect } },
    });
  }

  findAuthenticatedSession(userId: string, sessionId: string, now: Date) {
    return this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
      include: { user: { select: safeUserSelect } },
    });
  }

  async rotateSession(input: {
    currentId: string;
    currentTokenHash: string;
    successorId: string;
    successorTokenHash: string;
    familyId: string;
    userId: string;
    expiresAt: Date;
    now: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.authSession.updateMany({
        where: {
          id: input.currentId,
          tokenHash: input.currentTokenHash,
          rotatedAt: null,
          revokedAt: null,
          expiresAt: { gt: input.now },
        },
        data: { lastUsedAt: input.now },
      });
      if (claimed.count !== 1) return false;
      await transaction.authSession.create({
        data: {
          id: input.successorId,
          userId: input.userId,
          familyId: input.familyId,
          tokenHash: input.successorTokenHash,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          lastUsedAt: input.now,
        },
      });
      await transaction.authSession.update({
        where: { id: input.currentId },
        data: { rotatedAt: input.now, replacedById: input.successorId, lastUsedAt: input.now },
      });
      return true;
    });
  }

  revokeFamily(familyId: string, now: Date) {
    return this.prisma.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeSessionByHash(tokenHash: string, now: Date): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async createPasswordReset(input: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.updateMany({
        where: { userId: input.userId, usedAt: null, revokedAt: null },
        data: { revokedAt: input.now },
      });
      await transaction.passwordResetToken.create({
        data: {
          id: input.id,
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          deliveryStatus: PasswordResetDeliveryStatus.PENDING,
        },
      });
    });
  }

  markPasswordResetSent(id: string) {
    return this.prisma.passwordResetToken.update({
      where: { id },
      data: { deliveryStatus: PasswordResetDeliveryStatus.SENT },
    });
  }

  async markPasswordResetFailed(id: string, now: Date): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { id, usedAt: null, revokedAt: null },
      data: { deliveryStatus: PasswordResetDeliveryStatus.FAILED, revokedAt: now },
    });
  }

  findPasswordResetByHash(tokenHash: string) {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: safeUserSelect } },
    });
  }

  async consumePasswordReset(input: {
    id: string;
    userId: string;
    passwordHash: string;
    now: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: {
          id: input.id,
          userId: input.userId,
          usedAt: null,
          revokedAt: null,
          deliveryStatus: PasswordResetDeliveryStatus.SENT,
          expiresAt: { gt: input.now },
        },
        data: { usedAt: input.now },
      });
      if (consumed.count !== 1) return false;
      await transaction.user.update({
        where: { id: input.userId },
        data: { passwordHash: input.passwordHash },
      });
      await transaction.passwordResetToken.updateMany({
        where: {
          userId: input.userId,
          id: { not: input.id },
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: input.now },
      });
      await transaction.authSession.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: input.now },
      });
      return true;
    });
  }

  async pruneExpired(now: Date, limit = 100): Promise<void> {
    const sessionIds = (
      await this.prisma.authSession.findMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { lt: new Date(now.getTime() - 86_400_000) } },
          ],
        },
        select: { id: true },
        take: limit,
        orderBy: { expiresAt: 'asc' },
      })
    ).map(({ id }) => id);
    if (sessionIds.length > 0)
      await this.prisma.authSession.deleteMany({ where: { id: { in: sessionIds } } });

    const resetIds = (
      await this.prisma.passwordResetToken.findMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { lt: new Date(now.getTime() - 86_400_000) } },
          ],
        },
        select: { id: true },
        take: limit,
        orderBy: { expiresAt: 'asc' },
      })
    ).map(({ id }) => id);
    if (resetIds.length > 0) {
      await this.prisma.passwordResetToken.deleteMany({ where: { id: { in: resetIds } } });
    }

    const googleAttemptIds = (
      await this.prisma.googleLoginAttempt.findMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { consumedAt: { lt: new Date(now.getTime() - 86_400_000) } },
          ],
        },
        select: { id: true },
        take: limit,
        orderBy: { expiresAt: 'asc' },
      })
    ).map(({ id }) => id);
    if (googleAttemptIds.length > 0) {
      await this.prisma.googleLoginAttempt.deleteMany({
        where: { id: { in: googleAttemptIds } },
      });
    }
  }
}
