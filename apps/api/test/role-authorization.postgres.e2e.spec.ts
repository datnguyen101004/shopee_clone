import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { RoleConflictError, RoleTargetUnavailableError } from '../src/auth/auth.errors';
import { MarketplaceOwnershipService } from '../src/auth/marketplace-ownership.service';
import { RoleAuthorizationService } from '../src/auth/role-authorization.service';
import { configureApplication } from '../src/configure-application';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import {
  MarketplaceRole,
  RoleAuditAction,
  RoleAuditSource,
  ShopOnboardingStatus,
  ShopStatus,
  UserStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest = process.env.RUN_ROLE_DATABASE_TESTS === '1' ? describe : describe.skip;

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const origin =
  process.env.AUTH_ALLOWED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .find(Boolean) ?? 'http://localhost:3000';
const bootstrapCandidates = [
  {
    id: '00000000-0000-4000-8000-000000008001',
    email: 't12-bootstrap-a@example.test',
  },
  {
    id: '00000000-0000-4000-8000-000000008002',
    email: 't12-bootstrap-b@example.test',
  },
] as const;
const targetId = '00000000-0000-4000-8000-000000008003';
const inactiveTargetId = '00000000-0000-4000-8000-000000008004';
const sessionEmail = 't12-current-role@example.test';

databaseTest('Role authorization with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let roles: RoleAuthorizationService;
  let ownership: MarketplaceOwnershipService;
  let currentAdminId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test' }));
    await app.init();
    prisma = app.get(PrismaService);
    roles = app.get(RoleAuthorizationService);
    ownership = app.get(MarketplaceOwnershipService);

    await prisma.user.createMany({
      data: [
        ...bootstrapCandidates.map(({ id, email }) => ({
          id,
          email,
          displayName: `Bootstrap ${id.slice(-1)}`,
          status: UserStatus.ACTIVE,
        })),
        {
          id: targetId,
          email: 't12-role-target@example.test',
          displayName: 'Role Target',
          status: UserStatus.ACTIVE,
        },
        {
          id: inactiveTargetId,
          email: 't12-inactive-target@example.test',
          displayName: 'Inactive Target',
          status: UserStatus.SUSPENDED,
        },
      ],
    });
    await prisma.userRoleAssignment.createMany({
      data: [...bootstrapCandidates.map(({ id }) => id), targetId, inactiveTargetId].map(
        (userId) => ({
          userId,
          role: MarketplaceRole.BUYER,
          source: RoleAuditSource.SYSTEM,
        }),
      ),
    });
    await prisma.roleAuditEvent.createMany({
      data: [...bootstrapCandidates.map(({ id }) => id), targetId, inactiveTargetId].map(
        (targetUserId, index) => ({
          id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          targetUserId,
          role: MarketplaceRole.BUYER,
          action: RoleAuditAction.GRANT,
          source: RoleAuditSource.SYSTEM,
          reason: 'Buyer role assigned for isolated role tests',
        }),
      ),
    });
    await prisma.shop.create({
      data: {
        id: '00000000-0000-4000-8000-000000008102',
        ownerId: targetId,
        slug: 't12-role-target-shop',
        name: 'T12 Role Target Shop',
        status: ShopStatus.ACTIVE,
        onboardingStatus: ShopOnboardingStatus.APPROVED,
        onboardingReason: 'Approved shop for role invariant test',
      },
    });
  });

  afterAll(async () => app?.close());

  it('serializes competing first-admin bootstrap attempts and then fails closed', async () => {
    const outcomes = await Promise.allSettled(
      bootstrapCandidates.map(({ email }) =>
        roles.bootstrapFirstAdmin(email, 'Authorized isolated first administrator'),
      ),
    );
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const activeAdmins = await prisma.userRoleAssignment.findMany({
      where: { role: MarketplaceRole.ADMIN, user: { status: UserStatus.ACTIVE } },
    });
    expect(activeAdmins).toHaveLength(1);
    currentAdminId = activeAdmins[0]!.userId;
    await expect(
      roles.bootstrapFirstAdmin(
        bootstrapCandidates.find(({ id }) => id !== currentAdminId)!.email,
        'A repeated bootstrap must be rejected',
      ),
    ).rejects.toBeInstanceOf(RoleConflictError);
    expect(
      await prisma.roleAuditEvent.count({
        where: { role: MarketplaceRole.ADMIN, source: RoleAuditSource.BOOTSTRAP },
      }),
    ).toBe(1);
  });

  it('resolves persisted roles for every protected request so an old token loses seller access', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send({
        displayName: 'Current Role Seller',
        email: sessionEmail,
        password: 'T12 secure current role passphrase',
      })
      .expect(201);
    expect(registration.body.user.roles).toEqual(['buyer']);
    const sessionUserId = registration.body.user.id as string;
    await prisma.shop.create({
      data: {
        id: '00000000-0000-4000-8000-000000008101',
        ownerId: sessionUserId,
        slug: 't12-current-role-shop',
        name: 'T12 Current Role Shop',
        status: ShopStatus.ACTIVE,
        onboardingStatus: ShopOnboardingStatus.APPROVED,
        onboardingReason: 'Approved shop for current-role test',
      },
    });
    await roles.grantRole(
      currentAdminId,
      sessionUserId,
      'seller',
      'Approved seller for current-role test',
    );
    const authorization = `Bearer ${registration.body.accessToken as string}`;
    await request(app.getHttpServer())
      .get('/api/v1/seller/shop')
      .set('Authorization', authorization)
      .expect(200);
    await expect(
      roles.revokeRole(
        currentAdminId,
        sessionUserId,
        'seller',
        'Seller permission revoked during active session',
      ),
    ).rejects.toBeInstanceOf(RoleConflictError);
    const denied = await request(app.getHttpServer())
      .get('/api/v1/seller/shop')
      .set('Authorization', authorization)
      .expect(403);
    expect(denied.body.type).toBe('https://shopee-clone.local/problems/authorization-denied');
  });

  it('keeps grants and revocations idempotent, atomic, attributed, and target-safe', async () => {
    const concurrentGrants = await Promise.all([
      roles.grantRole(currentAdminId, targetId, 'seller', 'Approved concurrent seller grant'),
      roles.grantRole(currentAdminId, targetId, 'seller', 'Approved concurrent seller grant'),
    ]);
    expect(concurrentGrants.every(({ roles: resultRoles }) => resultRoles.includes('seller'))).toBe(
      true,
    );
    expect(
      await prisma.roleAuditEvent.count({
        where: {
          targetUserId: targetId,
          role: MarketplaceRole.SELLER,
          action: RoleAuditAction.GRANT,
          source: RoleAuditSource.ADMIN,
        },
      }),
    ).toBe(1);
    const grantAudit = await prisma.roleAuditEvent.findFirstOrThrow({
      where: { targetUserId: targetId, role: MarketplaceRole.SELLER },
    });
    expect(grantAudit.actorUserId).toBe(currentAdminId);

    await expect(
      roles.revokeRole(currentAdminId, targetId, 'seller', 'Seller access no longer needed'),
    ).rejects.toBeInstanceOf(RoleConflictError);
    expect(
      await prisma.userRoleAssignment.count({
        where: { userId: targetId, role: MarketplaceRole.SELLER },
      }),
    ).toBe(1);

    await expect(
      roles.grantRole(
        currentAdminId,
        inactiveTargetId,
        'seller',
        'Inactive targets cannot become sellers',
      ),
    ).rejects.toBeInstanceOf(RoleTargetUnavailableError);
    await expect(
      roles.grantRole(
        currentAdminId,
        '00000000-0000-4000-8000-000000008999',
        'seller',
        'Unknown targets cannot become sellers',
      ),
    ).rejects.toBeInstanceOf(RoleTargetUnavailableError);

    await expect(
      roles.grantRole(currentAdminId, targetId, 'seller', 'short'),
    ).rejects.toBeDefined();
    expect(
      await prisma.userRoleAssignment.count({
        where: { userId: targetId, role: MarketplaceRole.SELLER },
      }),
    ).toBe(0);
  });

  it('derives shop ownership from persistence and hides unknown/foreign targets alike', async () => {
    const ownerId = '00000000-0000-4000-8000-000000000001';
    const foreignOwnerId = '00000000-0000-4000-8000-000000000002';
    const shopId = '00000000-0000-4000-8000-000000000101';
    await expect(ownership.ownsShop(ownerId, shopId)).resolves.toBe(true);
    await expect(ownership.ownsShop(foreignOwnerId, shopId)).resolves.toBe(false);
    await expect(ownership.ownsShop(ownerId, '00000000-0000-4000-8000-000000009999')).resolves.toBe(
      false,
    );
  });

  it('prevents simultaneous revocations from removing the last active admin', async () => {
    const secondAdminId = bootstrapCandidates.find(({ id }) => id !== currentAdminId)!.id;
    await roles.grantRole(
      currentAdminId,
      secondAdminId,
      'admin',
      'Approved second administrator for invariant test',
    );
    const outcomes = await Promise.allSettled([
      roles.revokeRole(
        currentAdminId,
        currentAdminId,
        'admin',
        'Self-revocation while another admin remains',
      ),
      roles.revokeRole(
        secondAdminId,
        secondAdminId,
        'admin',
        'Self-revocation while another admin remains',
      ),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const activeAdmins = await prisma.userRoleAssignment.findMany({
      where: { role: MarketplaceRole.ADMIN, user: { status: UserStatus.ACTIVE } },
    });
    expect(activeAdmins).toHaveLength(1);
    currentAdminId = activeAdmins[0]!.userId;
    await expect(
      roles.revokeRole(
        currentAdminId,
        currentAdminId,
        'admin',
        'The final administrator cannot be revoked',
      ),
    ).rejects.toBeInstanceOf(RoleConflictError);
  });

  it('returns stable newest-first bounded audit pages without personal or credential joins', async () => {
    const firstPage = await roles.auditPage(3);
    expect(firstPage.items).toHaveLength(3);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const secondPage = await roles.auditPage(3, firstPage.nextCursor!);
    expect(secondPage.items.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining(firstPage.items.map(({ id }) => id)),
    );
    for (const event of [...firstPage.items, ...secondPage.items]) {
      expect(event).not.toHaveProperty('email');
      expect(event).not.toHaveProperty('password');
      expect(event).not.toHaveProperty('token');
      expect(event).not.toHaveProperty('cookie');
    }
  });
});
