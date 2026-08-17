import { SellerOnboardingService } from '../src/seller-onboarding/seller-onboarding.service';
import { SellerOnboardingRepository } from '../src/seller-onboarding/seller-onboarding.repository';
import { RoleAuthorizationService } from '../src/auth/role-authorization.service';
import { randomUUID } from 'node:crypto';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import {
  MarketplaceRole,
  RoleAuditSource,
  ShopOnboardingStatus,
  UserStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { SellerShopConflictError } from '../src/seller-onboarding/seller-onboarding.errors';

const databaseTest =
  process.env.RUN_SELLER_ONBOARDING_DATABASE_TESTS === '1' ? describe : describe.skip;

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const address = {
  recipientName: 'An Nguyen',
  phoneNumber: '0912345678',
  province: 'TP. Hồ Chí Minh',
  district: 'Quận 1',
  ward: 'Phường Bến Nghé',
  addressLine: '12 Nguyễn Huệ',
};

databaseTest('Seller onboarding PostgreSQL', () => {
  const prisma = new PrismaService();
  const service = new SellerOnboardingService(
    new SellerOnboardingRepository(prisma),
    new RoleAuthorizationService(prisma),
  );
  const ownerId = randomUUID();
  const otherOwnerId = randomUUID();
  const racingOwnerId = randomUUID();
  const adminId = randomUUID();
  const runSuffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          email: `t22-owner-${ownerId}@example.test`,
          displayName: 'T22 Owner',
          status: UserStatus.ACTIVE,
        },
        {
          id: otherOwnerId,
          email: `t22-other-${otherOwnerId}@example.test`,
          displayName: 'T22 Other',
          status: UserStatus.ACTIVE,
        },
        {
          id: racingOwnerId,
          email: `t22-racing-${racingOwnerId}@example.test`,
          displayName: 'T22 Racing',
          status: UserStatus.ACTIVE,
        },
        {
          id: adminId,
          email: `t22-admin-${adminId}@example.test`,
          displayName: 'T22 Admin',
          status: UserStatus.ACTIVE,
        },
      ],
    });
    await prisma.userRoleAssignment.createMany({
      data: [
        { userId: ownerId, role: MarketplaceRole.BUYER, source: RoleAuditSource.SEED },
        { userId: otherOwnerId, role: MarketplaceRole.BUYER, source: RoleAuditSource.SEED },
        { userId: racingOwnerId, role: MarketplaceRole.BUYER, source: RoleAuditSource.SEED },
        { userId: adminId, role: MarketplaceRole.BUYER, source: RoleAuditSource.SEED },
        { userId: adminId, role: MarketplaceRole.ADMIN, source: RoleAuditSource.SEED },
      ],
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('enforces one live shop and unique live name', async () => {
    const created = await service.create(ownerId, {
      slug: `t22-unique-shop-${runSuffix}`,
      name: `T22 Unique Shop ${runSuffix}`,
      description: 'Test shop',
      logoUrl: null,
      bannerUrl: null,
      location: 'Hà Nội',
      contactPhone: '0912345678',
      contactEmail: `t22-shop-${runSuffix}@example.test`,
      pickupAddress: address,
      returnAddress: address,
    });
    expect(created.onboardingStatus).toBe('pending_approval');
    await expect(
      service.create(ownerId, {
        slug: `t22-second-shop-${runSuffix}`,
        name: `T22 Second Shop ${runSuffix}`,
        description: 'Test shop',
        logoUrl: null,
        bannerUrl: null,
        location: 'Hà Nội',
        contactPhone: '0912345678',
        contactEmail: `t22-shop-2-${runSuffix}@example.test`,
        pickupAddress: address,
        returnAddress: address,
      }),
    ).rejects.toBeInstanceOf(SellerShopConflictError);
    expect(await prisma.shop.count({ where: { ownerId: otherOwnerId } })).toBe(0);

    const races = await Promise.allSettled([
      service.create(racingOwnerId, {
        slug: `t22-race-shop-a-${runSuffix}`,
        name: `T22 Race Shop A ${runSuffix}`,
        description: 'Test shop',
        logoUrl: null,
        bannerUrl: null,
        location: 'Hà Nội',
        contactPhone: '0912345678',
        contactEmail: `t22-race-a-${runSuffix}@example.test`,
        pickupAddress: address,
        returnAddress: address,
      }),
      service.create(racingOwnerId, {
        slug: `t22-race-shop-b-${runSuffix}`,
        name: `T22 Race Shop B ${runSuffix}`,
        description: 'Test shop',
        logoUrl: null,
        bannerUrl: null,
        location: 'Hà Nội',
        contactPhone: '0912345678',
        contactEmail: `t22-race-b-${runSuffix}@example.test`,
        pickupAddress: address,
        returnAddress: address,
      }),
    ]);
    expect(races.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(races.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(await prisma.shop.count({ where: { ownerId: racingOwnerId, deletedAt: null } })).toBe(1);

    await expect(
      service.create(otherOwnerId, {
        slug: `t22-other-shop-${runSuffix}`,
        name: `t22 unique shop ${runSuffix}`,
        description: 'Test shop',
        logoUrl: null,
        bannerUrl: null,
        location: 'Hà Nội',
        contactPhone: '0912345678',
        contactEmail: `t22-other-${runSuffix}@example.test`,
        pickupAddress: address,
        returnAddress: address,
      }),
    ).rejects.toBeInstanceOf(SellerShopConflictError);

    const approved = await service.approve(created.id, {
      decision: 'approve',
      reason: 'Shop identity looks complete',
    }, adminId);
    expect(approved.canSell).toBe(true);
    expect(approved.status).toBe('active');
    expect(approved.onboardingStatus).toBe('approved');
    expect(
      await prisma.userRoleAssignment.findUnique({
        where: { userId_role: { userId: ownerId, role: MarketplaceRole.SELLER } },
      }),
    ).not.toBeNull();

    await prisma.shop.update({ where: { id: created.id }, data: { deletedAt: new Date() } });
    const replacement = await service.create(ownerId, {
      slug: `t22-replacement-shop-${runSuffix}`,
      name: `T22 Replacement Shop ${runSuffix}`,
      description: 'Test shop',
      logoUrl: null,
      bannerUrl: null,
      location: 'Hà Nội',
      contactPhone: '0912345678',
      contactEmail: `t22-replacement-${runSuffix}@example.test`,
      pickupAddress: address,
      returnAddress: address,
    });
    expect(replacement.id).not.toBe(created.id);

    const decisions = await Promise.allSettled([
      service.approve(replacement.id, { decision: 'approve', reason: 'Approved after review' }, adminId),
      service.approve(replacement.id, { decision: 'reject', reason: 'Rejected after review' }, adminId),
    ]);
    expect(decisions.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const decided = await prisma.shop.findUniqueOrThrow({ where: { id: replacement.id } });
    expect([ShopOnboardingStatus.APPROVED, ShopOnboardingStatus.REJECTED]).toContain(
      decided.onboardingStatus,
    );
    const repeated = await service.approve(replacement.id, {
      decision:
        decided.onboardingStatus === ShopOnboardingStatus.APPROVED ? 'approve' : 'reject',
      reason: decided.onboardingReason!,
    }, adminId);
    expect(repeated.id).toBe(replacement.id);
  });
});
