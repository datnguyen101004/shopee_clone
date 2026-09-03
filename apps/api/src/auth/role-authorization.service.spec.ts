import { MarketplaceRole, ShopOnboardingStatus, ShopStatus, UserStatus } from '../generated/prisma/enums';
import { RoleConflictError } from './auth.errors';
import { RoleAuthorizationService } from './role-authorization.service';
import type { PrismaService } from '../prisma/prisma.service';

type MockTransaction = {
  $queryRawUnsafe: jest.Mock;
  user: { findUnique: jest.Mock };
  shop: { findFirst: jest.Mock };
  userRoleAssignment: { findUnique: jest.Mock; create: jest.Mock; findMany: jest.Mock };
  roleAuditEvent: { create: jest.Mock };
};

describe('RoleAuthorizationService seller invariant', () => {
  function fixture(shop: { onboardingStatus: ShopOnboardingStatus; status: ShopStatus } | null) {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ locked: 1 }]),
      user: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ status: UserStatus.ACTIVE, deletedAt: null })
          .mockResolvedValueOnce({ status: UserStatus.ACTIVE, deletedAt: null }),
      },
      shop: { findFirst: jest.fn().mockResolvedValue(shop) },
      userRoleAssignment: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ user: { status: UserStatus.ACTIVE, deletedAt: null } })
          .mockResolvedValue(null),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { role: MarketplaceRole.BUYER },
          { role: MarketplaceRole.SELLER },
        ]),
      },
      roleAuditEvent: { create: jest.fn() },
    } as MockTransaction;
    const prisma = {
      $transaction: jest.fn(async (work: (value: MockTransaction) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaService;
    return { service: new RoleAuthorizationService(prisma), tx, prisma };
  }

  it('rejects seller grants without an approved owned shop', async () => {
    const { service, tx } = fixture(null);
    await expect(service.grantRole('admin-id', 'target-id', 'seller', 'Valid seller reason')).rejects.toBeInstanceOf(
      RoleConflictError,
    );
    expect(tx.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it.each([ShopOnboardingStatus.PENDING_APPROVAL, ShopOnboardingStatus.REJECTED])(
    'rejects seller grants for %s onboarding',
    async () => {
      const { service } = fixture(null);
      await expect(
        service.grantRole('admin-id', 'target-id', 'seller', 'Valid seller reason'),
      ).rejects.toBeInstanceOf(RoleConflictError);
    },
  );

  it.each([ShopStatus.ACTIVE, ShopStatus.INACTIVE, ShopStatus.SUSPENDED])(
    'allows the seller role for an approved shop in %s state',
    async (status) => {
      const { service, tx } = fixture({ onboardingStatus: ShopOnboardingStatus.APPROVED, status });
      await expect(
        service.grantRole('admin-id', 'target-id', 'seller', 'Valid seller reason'),
      ).resolves.toMatchObject({ roles: ['buyer', 'seller'] });
      expect(tx.shop.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ onboardingStatus: ShopOnboardingStatus.APPROVED }) }),
      );
    },
  );

  it('rejects direct seller revocation so shop lifecycle remains authoritative', async () => {
    const { service, prisma } = fixture({ onboardingStatus: ShopOnboardingStatus.APPROVED, status: ShopStatus.ACTIVE });
    await expect(
      service.revokeRole('admin-id', 'target-id', 'seller', 'Valid seller reason'),
    ).rejects.toBeInstanceOf(RoleConflictError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
