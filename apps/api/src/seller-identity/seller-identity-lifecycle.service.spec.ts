import {
  MarketplaceRole,
  ShopOnboardingStatus,
  ShopStatus,
  UserStatus,
} from '../generated/prisma/enums';
import { SellerIdentityLifecycleService } from './seller-identity-lifecycle.service';
import { SellerShopInvariantError } from './seller-identity.errors';
import { LastAdminConflictError } from '../admin/admin.errors';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';

type MockTransaction = {
  $queryRaw: jest.Mock;
  user: { findFirst: jest.Mock; update: jest.Mock; count: jest.Mock };
  shop: { update: jest.Mock };
  authSession: { updateMany: jest.Mock };
  privilegedAuditEvent: { create: jest.Mock };
};

const ids = { user: 'user-1', shop: 'shop-1' };

function pair(userStatus: UserStatus = UserStatus.ACTIVE, shopStatus: ShopStatus = ShopStatus.ACTIVE) {
  return {
    id: ids.user,
    status: userStatus,
    deletedAt: null,
    roleAssignments: [{ role: MarketplaceRole.BUYER }, { role: MarketplaceRole.SELLER }],
    shop: {
      id: ids.shop,
      ownerId: ids.user,
      status: shopStatus,
      onboardingStatus: ShopOnboardingStatus.APPROVED,
      deletedAt: null,
    },
  };
}

function fixture(initial: unknown = pair()) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: ids.user, ownerId: ids.user }]),
    user: {
      findFirst: jest.fn().mockResolvedValue(initial),
      update: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(2),
    },
    shop: { update: jest.fn().mockResolvedValue(undefined) },
    authSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    privilegedAuditEvent: { create: jest.fn().mockResolvedValue(undefined) },
  } as MockTransaction;
  const prisma = {
    $transaction: jest.fn(async (work: (value: MockTransaction) => Promise<unknown>) => work(tx)),
  } as unknown as PrismaService;
  return { service: new SellerIdentityLifecycleService(prisma), tx };
}

describe('SellerIdentityLifecycleService', () => {
  it('suspends both seller identities, revokes sessions, and writes two audits', async () => {
    const { service, tx } = fixture();
    await expect(
      service.suspendUserInTransaction(tx as unknown as Prisma.TransactionClient, 'admin-1', ids.user, 'Policy enforcement reason'),
    ).resolves.toMatchObject({ changed: true, userStatus: UserStatus.SUSPENDED, shopStatus: ShopStatus.SUSPENDED });
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: UserStatus.SUSPENDED } }));
    expect(tx.shop.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: ShopStatus.SUSPENDED } }));
    expect(tx.authSession.updateMany).toHaveBeenCalled();
    expect(tx.privilegedAuditEvent.create).toHaveBeenCalledTimes(2);
  });

  it('treats only a fully suspended pair as idempotent', async () => {
    const { service, tx } = fixture(pair(UserStatus.SUSPENDED, ShopStatus.SUSPENDED));
    await expect(
      service.suspendUserInTransaction(tx as unknown as Prisma.TransactionClient, 'admin-1', ids.user, 'Repeat suspension reason'),
    ).resolves.toMatchObject({ changed: false });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.privilegedAuditEvent.create).not.toHaveBeenCalled();
  });

  it('restores both identities but never recreates revoked sessions', async () => {
    const { service, tx } = fixture(pair(UserStatus.SUSPENDED, ShopStatus.SUSPENDED));
    await expect(
      service.restoreUserInTransaction(tx as unknown as Prisma.TransactionClient, 'admin-1', ids.user, 'Restoration review reason'),
    ).resolves.toMatchObject({ changed: true, userStatus: UserStatus.ACTIVE, shopStatus: ShopStatus.ACTIVE });
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: UserStatus.ACTIVE } }));
    expect(tx.shop.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: ShopStatus.ACTIVE } }));
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(tx.privilegedAuditEvent.create).toHaveBeenCalledTimes(2);
  });

  it('rejects a seller role whose approved shop identity is missing', async () => {
    const invalid = { ...pair(), shop: null };
    const { service, tx } = fixture(invalid);
    await expect(
      service.suspendUserInTransaction(tx as unknown as Prisma.TransactionClient, 'admin-1', ids.user, 'Invalid pair reason'),
    ).rejects.toBeInstanceOf(SellerShopInvariantError);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('reconciles a mismatched active-account/suspended-shop pair', async () => {
    const { service, tx } = fixture(pair(UserStatus.ACTIVE, ShopStatus.SUSPENDED));
    await expect(
      service.suspendUserInTransaction(tx as unknown as Prisma.TransactionClient, 'admin-1', ids.user, 'Reconcile mismatched pair'),
    ).resolves.toMatchObject({ changed: true, userStatus: UserStatus.SUSPENDED, shopStatus: ShopStatus.SUSPENDED });
    expect(tx.user.update).toHaveBeenCalled();
  });

  it('protects the last active administrator before changing the pair', async () => {
    const { service, tx } = fixture();
    tx.user.findFirst.mockResolvedValueOnce({
      ...pair(),
      roleAssignments: [
        { role: MarketplaceRole.BUYER },
        { role: MarketplaceRole.SELLER },
        { role: MarketplaceRole.ADMIN },
      ],
    });
    tx.user.count.mockResolvedValue(1);
    await expect(
      service.suspendUserInTransaction(tx as unknown as Prisma.TransactionClient, 'admin-1', ids.user, 'Protect last administrator'),
    ).rejects.toBeInstanceOf(LastAdminConflictError);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('propagates audit failure so the enclosing transaction can roll back writes', async () => {
    const { service, tx } = fixture();
    tx.privilegedAuditEvent.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(
      service.suspendUserInTransaction(tx as unknown as Prisma.TransactionClient, 'admin-1', ids.user, 'Audit failure rollback'),
    ).rejects.toThrow('audit unavailable');
  });
});
