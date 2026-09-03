import {
  isCanonicalRoleTargetId,
  marketplaceRoleValues,
  type ElevatedMarketplaceRole,
  type MarketplaceRole as ContractMarketplaceRole,
  type RoleAssignmentResult,
  type RoleAuditEvent as ContractRoleAuditEvent,
  type RoleAuditPage,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import {
  MarketplaceRole,
  RoleAuditAction,
  RoleAuditSource,
  ShopOnboardingStatus,
  UserStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthorizationDeniedError,
  RoleConflictError,
  RoleRequestError,
  RoleTargetUnavailableError,
} from './auth.errors';

type AuditCursor = { createdAt: string; id: string };

function toPersistedRole(role: ElevatedMarketplaceRole): MarketplaceRole {
  if (role === 'seller') return MarketplaceRole.SELLER;
  if (role === 'carrier_operator') return MarketplaceRole.CARRIER_OPERATOR;
  return MarketplaceRole.ADMIN;
}

function toContractRole(role: MarketplaceRole): ContractMarketplaceRole {
  switch (role) {
    case MarketplaceRole.BUYER:
      return 'buyer';
    case MarketplaceRole.SELLER:
      return 'seller';
    case MarketplaceRole.ADMIN:
      return 'admin';
    case MarketplaceRole.CARRIER_OPERATOR:
      return 'carrier_operator';
  }
}

function toContractSource(source: RoleAuditSource): ContractRoleAuditEvent['source'] {
  return source.toLowerCase() as ContractRoleAuditEvent['source'];
}

function canonicalRoles(assignments: Array<{ role: MarketplaceRole }>): ContractMarketplaceRole[] {
  const current = new Set(assignments.map(({ role }) => toContractRole(role)));
  return marketplaceRoleValues.filter((role) => current.has(role));
}

function encodeCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string | undefined): { createdAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as AuditCursor;
    const createdAt = new Date(decoded.createdAt);
    if (
      !isCanonicalRoleTargetId(decoded.id) ||
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toISOString() !== decoded.createdAt
    ) {
      throw new Error('invalid cursor');
    }
    return { createdAt, id: decoded.id };
  } catch {
    throw new RoleRequestError();
  }
}

function isUniqueFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

@Injectable()
export class RoleAuthorizationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async grantRole(
    actorUserId: string,
    targetUserId: string,
    role: ElevatedMarketplaceRole,
    reason: string,
  ): Promise<RoleAssignmentResult> {
    const persistedRole = toPersistedRole(role);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRawUnsafe(
          'SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext($1))',
          'rbac-admin-set',
        );
        await this.assertCurrentAdmin(transaction, actorUserId);
        await this.assertEligibleTarget(transaction, targetUserId);
        if (persistedRole === MarketplaceRole.SELLER) {
          const approvedShop = await transaction.shop.findFirst({
            where: {
              ownerId: targetUserId,
              deletedAt: null,
              onboardingStatus: ShopOnboardingStatus.APPROVED,
            },
            select: { id: true },
          });
          if (!approvedShop) {
            throw new RoleConflictError('Seller role requires one approved shop owned by the target account');
          }
        }
        const existing = await transaction.userRoleAssignment.findUnique({
          where: { userId_role: { userId: targetUserId, role: persistedRole } },
          select: { userId: true },
        });
        if (!existing) {
          await transaction.userRoleAssignment.create({
            data: {
              userId: targetUserId,
              role: persistedRole,
              source: RoleAuditSource.ADMIN,
              grantedByUserId: actorUserId,
            },
          });
          await transaction.roleAuditEvent.create({
            data: {
              targetUserId,
              role: persistedRole,
              action: RoleAuditAction.GRANT,
              source: RoleAuditSource.ADMIN,
              actorUserId,
              reason,
            },
          });
        }
        return this.assignmentResult(transaction, targetUserId);
      });
    } catch (error) {
      if (!isUniqueFailure(error)) throw error;
      return this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRawUnsafe(
          'SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext($1))',
          'rbac-admin-set',
        );
        await this.assertCurrentAdmin(transaction, actorUserId);
        await this.assertEligibleTarget(transaction, targetUserId);
        return this.assignmentResult(transaction, targetUserId);
      });
    }
  }

  async grantSellerForShopApproval(
    transaction: Prisma.TransactionClient,
    actorUserId: string,
    targetUserId: string,
    reason: string,
  ): Promise<void> {
    await this.assertCurrentAdmin(transaction, actorUserId);
    await this.assertEligibleTarget(transaction, targetUserId);
    const existing = await transaction.userRoleAssignment.findUnique({
      where: { userId_role: { userId: targetUserId, role: MarketplaceRole.SELLER } },
      select: { userId: true },
    });
    if (existing) return;
    await transaction.userRoleAssignment.create({
      data: {
        userId: targetUserId,
        role: MarketplaceRole.SELLER,
        source: RoleAuditSource.ADMIN,
        grantedByUserId: actorUserId,
      },
    });
    await transaction.roleAuditEvent.create({
      data: {
        targetUserId,
        role: MarketplaceRole.SELLER,
        action: RoleAuditAction.GRANT,
        source: RoleAuditSource.ADMIN,
        actorUserId,
        reason,
      },
    });
  }

  revokeRole(
    actorUserId: string,
    targetUserId: string,
    role: ElevatedMarketplaceRole,
    reason: string,
  ): Promise<RoleAssignmentResult> {
    const persistedRole = toPersistedRole(role);
    if (persistedRole === MarketplaceRole.SELLER) {
      return Promise.reject(
        new RoleConflictError('Seller role follows the approved shop lifecycle and cannot be revoked directly'),
      );
    }
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe(
        'SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext($1))',
        'rbac-admin-set',
      );
      await this.assertCurrentAdmin(transaction, actorUserId);
      await this.assertEligibleTarget(transaction, targetUserId);
      const existing = await transaction.userRoleAssignment.findUnique({
        where: { userId_role: { userId: targetUserId, role: persistedRole } },
        select: { userId: true },
      });
      if (!existing) return this.assignmentResult(transaction, targetUserId);
      if (persistedRole === MarketplaceRole.ADMIN) {
        const activeAdmins = await transaction.userRoleAssignment.count({
          where: {
            role: MarketplaceRole.ADMIN,
            user: { status: UserStatus.ACTIVE, deletedAt: null },
          },
        });
        if (activeAdmins <= 1) throw new RoleConflictError();
      }
      await transaction.userRoleAssignment.delete({
        where: { userId_role: { userId: targetUserId, role: persistedRole } },
      });
      await transaction.roleAuditEvent.create({
        data: {
          targetUserId,
          role: persistedRole,
          action: RoleAuditAction.REVOKE,
          source: RoleAuditSource.ADMIN,
          actorUserId,
          reason,
        },
      });
      return this.assignmentResult(transaction, targetUserId);
    });
  }

  async auditPage(limit: number, cursorValue?: string): Promise<RoleAuditPage> {
    const cursor = decodeCursor(cursorValue);
    const events = await this.prisma.roleAuditEvent.findMany({
      where: cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : undefined,
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const hasMore = events.length > limit;
    const page = events.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((event): ContractRoleAuditEvent => ({
        id: event.id,
        targetUserId: event.targetUserId,
        role: toContractRole(event.role),
        action: event.action === RoleAuditAction.GRANT ? 'grant' : 'revoke',
        source: toContractSource(event.source),
        actorUserId: event.actorUserId,
        reason: event.reason,
        createdAt: event.createdAt.toISOString(),
      })),
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  bootstrapFirstAdmin(email: string, reason: string): Promise<RoleAssignmentResult> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe(
        'SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext($1))',
        'rbac-first-admin',
      );
      const activeAdmins = await transaction.userRoleAssignment.count({
        where: {
          role: MarketplaceRole.ADMIN,
          user: { status: UserStatus.ACTIVE, deletedAt: null },
        },
      });
      if (activeAdmins > 0) throw new RoleConflictError();
      const target = await transaction.user.findUnique({
        where: { email },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!target || target.status !== UserStatus.ACTIVE || target.deletedAt !== null) {
        throw new RoleTargetUnavailableError();
      }
      await transaction.userRoleAssignment.create({
        data: {
          userId: target.id,
          role: MarketplaceRole.ADMIN,
          source: RoleAuditSource.BOOTSTRAP,
        },
      });
      await transaction.roleAuditEvent.create({
        data: {
          targetUserId: target.id,
          role: MarketplaceRole.ADMIN,
          action: RoleAuditAction.GRANT,
          source: RoleAuditSource.BOOTSTRAP,
          reason,
        },
      });
      return this.assignmentResult(transaction, target.id);
    });
  }

  private async assertCurrentAdmin(
    transaction: Prisma.TransactionClient,
    actorUserId: string,
  ): Promise<void> {
    const assignment = await transaction.userRoleAssignment.findUnique({
      where: { userId_role: { userId: actorUserId, role: MarketplaceRole.ADMIN } },
      select: { user: { select: { status: true, deletedAt: true } } },
    });
    if (
      !assignment ||
      assignment.user.status !== UserStatus.ACTIVE ||
      assignment.user.deletedAt !== null
    ) {
      throw new AuthorizationDeniedError();
    }
  }

  private async assertEligibleTarget(
    transaction: Prisma.TransactionClient,
    targetUserId: string,
  ): Promise<void> {
    const target = await transaction.user.findUnique({
      where: { id: targetUserId },
      select: { status: true, deletedAt: true },
    });
    if (!target || target.status !== UserStatus.ACTIVE || target.deletedAt !== null) {
      throw new RoleTargetUnavailableError();
    }
  }

  private async assignmentResult(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<RoleAssignmentResult> {
    const assignments = await transaction.userRoleAssignment.findMany({
      where: { userId },
      select: { role: true },
    });
    const roles = canonicalRoles(assignments);
    if (roles[0] !== 'buyer') throw new RoleTargetUnavailableError();
    return { userId, roles };
  }
}
