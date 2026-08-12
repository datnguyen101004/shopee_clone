import { Inject, Injectable } from '@nestjs/common';

import { PasswordResetDeliveryStatus, UserStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const safeUserSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  deletedAt: true,
  passwordHash: true,
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
      return user;
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
  }
}
