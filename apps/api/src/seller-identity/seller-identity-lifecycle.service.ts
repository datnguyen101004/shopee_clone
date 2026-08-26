import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import {
  MarketplaceRole,
  PrivilegedAction,
  PrivilegedTargetType,
  ShopOnboardingStatus,
  ShopStatus,
  UserStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminNotFoundError,
  LastAdminConflictError,
  SelfActionForbiddenError,
  ShopRestoreNotApprovedError,
} from '../admin/admin.errors';
import { recordPrivilegedAudit } from '../admin/privileged-audit.helper';
import { SellerShopInvariantError } from './seller-identity.errors';

export interface SellerLifecycleResult {
  changed: boolean;
  userId: string;
  shopId: string | null;
  userStatus: UserStatus;
  shopStatus: ShopStatus | null;
}

type SellerPair = {
  user: {
    id: string;
    status: UserStatus;
    deletedAt: Date | null;
    roles: MarketplaceRole[];
  };
  shop: {
    id: string;
    ownerId: string;
    status: ShopStatus;
    onboardingStatus: ShopOnboardingStatus;
    deletedAt: Date | null;
  } | null;
};

@Injectable()
export class SellerIdentityLifecycleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  suspendUser(
    actorUserId: string,
    targetUserId: string,
    reason: string,
  ): Promise<SellerLifecycleResult> {
    return this.prisma.$transaction((tx) =>
      this.suspendUserInTransaction(tx, actorUserId, targetUserId, reason),
    );
  }

  restoreUser(
    actorUserId: string,
    targetUserId: string,
    reason: string,
  ): Promise<SellerLifecycleResult> {
    return this.prisma.$transaction((tx) =>
      this.restoreUserInTransaction(tx, actorUserId, targetUserId, reason),
    );
  }

  suspendShop(
    actorUserId: string,
    targetShopId: string,
    reason: string,
  ): Promise<SellerLifecycleResult> {
    return this.prisma.$transaction((tx) =>
      this.suspendShopInTransaction(tx, actorUserId, targetShopId, reason),
    );
  }

  restoreShop(
    actorUserId: string,
    targetShopId: string,
    reason: string,
  ): Promise<SellerLifecycleResult> {
    return this.prisma.$transaction((tx) =>
      this.restoreShopInTransaction(tx, actorUserId, targetShopId, reason),
    );
  }

  async suspendUserInTransaction(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    targetUserId: string,
    reason: string,
  ): Promise<SellerLifecycleResult> {
    if (actorUserId === targetUserId) throw new SelfActionForbiddenError();
    const pair = await this.lockAndLoadPair(tx, targetUserId);
    await this.assertLastAdminCanChange(tx, pair, true);

    const hasSellerRole = pair.user.roles.includes(MarketplaceRole.SELLER);
    if (hasSellerRole && !this.isValidSellerPair(pair)) {
      throw new SellerShopInvariantError();
    }

    const pairAlreadySuspended =
      pair.user.status === UserStatus.SUSPENDED &&
      (!hasSellerRole || pair.shop?.status === ShopStatus.SUSPENDED);
    if (pairAlreadySuspended) {
      return {
        changed: false,
        userId: pair.user.id,
        shopId: pair.shop?.id ?? null,
        userStatus: pair.user.status,
        shopStatus: pair.shop?.status ?? null,
      };
    }

    const now = new Date();
    if (pair.user.status !== UserStatus.SUSPENDED) {
      await tx.user.update({ where: { id: pair.user.id }, data: { status: UserStatus.SUSPENDED } });
    }
    if (hasSellerRole && pair.shop && pair.shop.status !== ShopStatus.SUSPENDED) {
      await tx.shop.update({ where: { id: pair.shop.id }, data: { status: ShopStatus.SUSPENDED } });
    }
    await tx.authSession.updateMany({
      where: { userId: pair.user.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await recordPrivilegedAudit(tx, {
      actorUserId,
      targetType: PrivilegedTargetType.USER,
      targetId: pair.user.id,
      action: PrivilegedAction.SUSPEND,
      reason,
      beforeSummary: { status: pair.user.status },
      afterSummary: { status: UserStatus.SUSPENDED, pairedShopId: pair.shop?.id ?? null },
      now,
    });
    if (hasSellerRole && pair.shop) {
      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.SHOP,
        targetId: pair.shop.id,
        action: PrivilegedAction.SUSPEND,
        reason,
        beforeSummary: { status: pair.shop.status },
        afterSummary: { status: ShopStatus.SUSPENDED, ownerUserId: pair.user.id },
        now,
      });
    }
    return {
      changed: true,
      userId: pair.user.id,
      shopId: pair.shop?.id ?? null,
      userStatus: UserStatus.SUSPENDED,
      shopStatus: hasSellerRole ? ShopStatus.SUSPENDED : pair.shop?.status ?? null,
    };
  }

  async restoreUserInTransaction(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    targetUserId: string,
    reason: string,
  ): Promise<SellerLifecycleResult> {
    const pair = await this.lockAndLoadPair(tx, targetUserId);
    const hasSellerRole = pair.user.roles.includes(MarketplaceRole.SELLER);
    if (hasSellerRole && !this.isValidSellerPair(pair)) {
      throw new SellerShopInvariantError();
    }
    if (hasSellerRole && pair.shop?.onboardingStatus !== ShopOnboardingStatus.APPROVED) {
      throw new ShopRestoreNotApprovedError();
    }
    if (
      pair.user.status === UserStatus.ACTIVE &&
      (!hasSellerRole || pair.shop?.status === ShopStatus.ACTIVE)
    ) {
      return {
        changed: false,
        userId: pair.user.id,
        shopId: pair.shop?.id ?? null,
        userStatus: pair.user.status,
        shopStatus: pair.shop?.status ?? null,
      };
    }

    const now = new Date();
    if (pair.user.status !== UserStatus.ACTIVE) {
      await tx.user.update({ where: { id: pair.user.id }, data: { status: UserStatus.ACTIVE } });
    }
    if (hasSellerRole && pair.shop && pair.shop.status !== ShopStatus.ACTIVE) {
      await tx.shop.update({ where: { id: pair.shop.id }, data: { status: ShopStatus.ACTIVE } });
    }
    await recordPrivilegedAudit(tx, {
      actorUserId,
      targetType: PrivilegedTargetType.USER,
      targetId: pair.user.id,
      action: PrivilegedAction.RESTORE,
      reason,
      beforeSummary: { status: pair.user.status },
      afterSummary: { status: UserStatus.ACTIVE, pairedShopId: pair.shop?.id ?? null },
      now,
    });
    if (hasSellerRole && pair.shop) {
      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.SHOP,
        targetId: pair.shop.id,
        action: PrivilegedAction.RESTORE,
        reason,
        beforeSummary: { status: pair.shop.status },
        afterSummary: { status: ShopStatus.ACTIVE, ownerUserId: pair.user.id },
        now,
      });
    }
    return {
      changed: true,
      userId: pair.user.id,
      shopId: pair.shop?.id ?? null,
      userStatus: UserStatus.ACTIVE,
      shopStatus: hasSellerRole ? ShopStatus.ACTIVE : pair.shop?.status ?? null,
    };
  }

  async suspendShopInTransaction(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    targetShopId: string,
    reason: string,
  ): Promise<SellerLifecycleResult> {
    const shopId = await this.lockShopAndOwner(tx, targetShopId);
    const pair = await this.loadPair(tx, shopId.ownerId);
    if (!pair.shop || pair.shop.id !== targetShopId) throw new AdminNotFoundError('Shop');
    if (pair.shop.onboardingStatus !== ShopOnboardingStatus.APPROVED) {
      throw new SellerShopInvariantError('Only an approved seller shop can be suspended as a paired identity');
    }
    if (!pair.user.roles.includes(MarketplaceRole.SELLER) || !this.isValidSellerPair(pair)) {
      throw new SellerShopInvariantError();
    }
    await this.assertLastAdminCanChange(tx, pair, true);
    if (pair.user.status === UserStatus.SUSPENDED && pair.shop.status === ShopStatus.SUSPENDED) {
      return { changed: false, userId: pair.user.id, shopId: pair.shop.id, userStatus: pair.user.status, shopStatus: pair.shop.status };
    }

    const now = new Date();
    await tx.user.update({ where: { id: pair.user.id }, data: { status: UserStatus.SUSPENDED } });
    await tx.shop.update({ where: { id: pair.shop.id }, data: { status: ShopStatus.SUSPENDED } });
    await tx.authSession.updateMany({ where: { userId: pair.user.id, revokedAt: null }, data: { revokedAt: now } });
    await recordPrivilegedAudit(tx, {
      actorUserId,
      targetType: PrivilegedTargetType.SHOP,
      targetId: pair.shop.id,
      action: PrivilegedAction.SUSPEND,
      reason,
      beforeSummary: { status: pair.shop.status, ownerUserId: pair.user.id },
      afterSummary: { status: ShopStatus.SUSPENDED, ownerUserStatus: UserStatus.SUSPENDED },
      now,
    });
    await recordPrivilegedAudit(tx, {
      actorUserId,
      targetType: PrivilegedTargetType.USER,
      targetId: pair.user.id,
      action: PrivilegedAction.SUSPEND,
      reason,
      beforeSummary: { status: pair.user.status, pairedShopId: pair.shop.id },
      afterSummary: { status: UserStatus.SUSPENDED },
      now,
    });
    return { changed: true, userId: pair.user.id, shopId: pair.shop.id, userStatus: UserStatus.SUSPENDED, shopStatus: ShopStatus.SUSPENDED };
  }

  async restoreShopInTransaction(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    targetShopId: string,
    reason: string,
  ): Promise<SellerLifecycleResult> {
    const shopId = await this.lockShopAndOwner(tx, targetShopId);
    const pair = await this.loadPair(tx, shopId.ownerId);
    if (!pair.shop || pair.shop.id !== targetShopId) throw new AdminNotFoundError('Shop');
    if (pair.shop.onboardingStatus !== ShopOnboardingStatus.APPROVED) throw new ShopRestoreNotApprovedError();
    if (!pair.user.roles.includes(MarketplaceRole.SELLER) || !this.isValidSellerPair(pair)) {
      throw new SellerShopInvariantError();
    }
    if (pair.user.status === UserStatus.ACTIVE && pair.shop.status === ShopStatus.ACTIVE) {
      return { changed: false, userId: pair.user.id, shopId: pair.shop.id, userStatus: pair.user.status, shopStatus: pair.shop.status };
    }

    const now = new Date();
    await tx.user.update({ where: { id: pair.user.id }, data: { status: UserStatus.ACTIVE } });
    await tx.shop.update({ where: { id: pair.shop.id }, data: { status: ShopStatus.ACTIVE } });
    await recordPrivilegedAudit(tx, {
      actorUserId,
      targetType: PrivilegedTargetType.SHOP,
      targetId: pair.shop.id,
      action: PrivilegedAction.RESTORE,
      reason,
      beforeSummary: { status: pair.shop.status, ownerUserId: pair.user.id },
      afterSummary: { status: ShopStatus.ACTIVE, ownerUserStatus: UserStatus.ACTIVE },
      now,
    });
    await recordPrivilegedAudit(tx, {
      actorUserId,
      targetType: PrivilegedTargetType.USER,
      targetId: pair.user.id,
      action: PrivilegedAction.RESTORE,
      reason,
      beforeSummary: { status: pair.user.status, pairedShopId: pair.shop.id },
      afterSummary: { status: UserStatus.ACTIVE },
      now,
    });
    return { changed: true, userId: pair.user.id, shopId: pair.shop.id, userStatus: UserStatus.ACTIVE, shopStatus: ShopStatus.ACTIVE };
  }

  private async lockAndLoadPair(tx: Prisma.TransactionClient, userId: string): Promise<SellerPair> {
    const userLock = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${userId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    if (userLock.length === 0) throw new AdminNotFoundError('User');
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM shops WHERE owner_id = ${userId}::uuid FOR UPDATE`;
    return this.loadPair(tx, userId);
  }

  private async lockShopAndOwner(tx: Prisma.TransactionClient, shopId: string): Promise<{ ownerId: string }> {
    const shopRows = await tx.$queryRaw<Array<{ id: string; ownerId: string }>>`
      SELECT id, owner_id AS "ownerId" FROM shops WHERE id = ${shopId}::uuid AND deleted_at IS NULL`;
    if (shopRows.length === 0) throw new AdminNotFoundError('Shop');
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${shopRows[0]!.ownerId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM shops WHERE id = ${shopId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    return { ownerId: shopRows[0]!.ownerId };
  }

  private loadPair(tx: Prisma.TransactionClient, userId: string): Promise<SellerPair> {
    return tx.user
      .findFirst({
        where: { id: userId, deletedAt: null },
        select: {
          id: true,
          status: true,
          deletedAt: true,
          roleAssignments: { select: { role: true } },
          shop: {
            select: { id: true, ownerId: true, status: true, onboardingStatus: true, deletedAt: true },
          },
        },
      })
      .then((user) => {
        if (!user) throw new AdminNotFoundError('User');
        return {
          user: { id: user.id, status: user.status, deletedAt: user.deletedAt, roles: user.roleAssignments.map(({ role }) => role) },
          shop: user.shop,
        };
      });
  }

  private isValidSellerPair(pair: SellerPair): boolean {
    return Boolean(
      pair.shop &&
        pair.shop.deletedAt === null &&
        pair.shop.onboardingStatus === ShopOnboardingStatus.APPROVED,
    );
  }

  private async assertLastAdminCanChange(
    tx: Prisma.TransactionClient,
    pair: SellerPair,
    suspending: boolean,
  ): Promise<void> {
    if (!suspending || pair.user.status !== UserStatus.ACTIVE) return;
    if (!pair.user.roles.includes(MarketplaceRole.ADMIN)) return;
    const activeAdmins = await tx.user.count({
      where: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
        roleAssignments: { some: { role: MarketplaceRole.ADMIN } },
      },
    });
    if (activeAdmins <= 1) throw new LastAdminConflictError();
  }
}
