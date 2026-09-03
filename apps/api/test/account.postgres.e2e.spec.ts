import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AccountAddressNotFoundError } from '../src/account/account.errors';
import { AccountService } from '../src/account/account.service';
import { AppModule } from '../src/app.module';
import { MarketplaceRole, RoleAuditSource, UserStatus } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';

const databaseTest = process.env.RUN_ACCOUNT_DATABASE_TESTS === '1' ? describe : describe.skip;
const firstUserId = '00000000-0000-4000-8000-000000009901';
const secondUserId = '00000000-0000-4000-8000-000000009902';

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const input = (suffix: string, isDefault = false) => ({
  recipientName: `Nguoi Nhan ${suffix}`,
  phoneNumber: '+84 912 345 678',
  province: 'Ha Noi',
  district: 'Ba Dinh',
  ward: 'Phuc Xa',
  addressLine: `${suffix} Hang Than`,
  label: suffix,
  isDefault,
});

databaseTest('Account invariants with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let account: AccountService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    account = app.get(AccountService);
    await prisma.shippingAddress.deleteMany({
      where: { userId: { in: [firstUserId, secondUserId] } },
    });
    await prisma.userRoleAssignment.deleteMany({
      where: { userId: { in: [firstUserId, secondUserId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } });
    await prisma.user.createMany({
      data: [
        {
          id: firstUserId,
          email: 't13-first@example.test',
          displayName: 'T13 First Buyer',
          status: UserStatus.ACTIVE,
        },
        {
          id: secondUserId,
          email: 't13-second@example.test',
          displayName: 'T13 Second Buyer',
          status: UserStatus.ACTIVE,
        },
      ],
    });
    await prisma.userRoleAssignment.createMany({
      data: [firstUserId, secondUserId].map((userId) => ({
        userId,
        role: MarketplaceRole.BUYER,
        source: RoleAuditSource.SYSTEM,
      })),
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.shippingAddress.deleteMany({
        where: { userId: { in: [firstUserId, secondUserId] } },
      });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [firstUserId, secondUserId] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } });
    }
    await app?.close();
  });

  it('defaults the first address, normalizes profile/contact data, and isolates owners', async () => {
    await expect(
      account.updateProfile(firstUserId, {
        displayName: '  T13 Updated Buyer  ',
        phoneNumber: '+84 911-111-111',
      }),
    ).resolves.toMatchObject({
      displayName: 'T13 Updated Buyer',
      phoneNumber: '0911111111',
    });
    const first = await account.createAddress(firstUserId, input('A'));
    expect(first).toMatchObject({ phoneNumber: '0912345678', isDefault: true });
    await expect(
      account.updateAddress(secondUserId, first.id, { ward: 'Foreign Ward' }),
    ).rejects.toBeInstanceOf(AccountAddressNotFoundError);
    expect((await account.addresses(secondUserId)).items).toEqual([]);
  });

  it('serializes concurrent explicit defaults and preserves partial uniqueness', async () => {
    const created = await Promise.all([
      account.createAddress(firstUserId, input('B', true)),
      account.createAddress(firstUserId, input('C', true)),
      account.createAddress(firstUserId, input('D', true)),
    ]);
    const current = await account.addresses(firstUserId);
    expect(current.items.filter(({ isDefault }) => isDefault)).toHaveLength(1);
    await Promise.all(created.map(({ id }) => account.selectDefault(firstUserId, id)));
    const afterSelections = await account.addresses(firstUserId);
    expect(afterSelections.items.filter(({ isDefault }) => isDefault)).toHaveLength(1);

    const defaultAddress = afterSelections.items[0]!;
    await expect(
      prisma.shippingAddress.create({
        data: {
          userId: firstUserId,
          recipientName: 'Second Default',
          phoneNumber: '0912345678',
          province: 'Ha Noi',
          district: 'Ba Dinh',
          ward: 'Phuc Xa',
          addressLine: '99 Hang Than',
          label: null,
          isDefault: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(defaultAddress.isDefault).toBe(true);
  });

  it('soft-deletes owned addresses, promotes deterministically, and leaves unrelated users unchanged', async () => {
    const unrelated = await account.createAddress(secondUserId, input('Other'));
    const before = await account.addresses(firstUserId);
    const currentDefault = before.items[0]!;
    const expectedReplacement = before.items
      .filter(({ id }) => id !== currentDefault.id)
      .sort((left, right) =>
        left.createdAt === right.createdAt
          ? left.id.localeCompare(right.id)
          : left.createdAt.localeCompare(right.createdAt),
      )[0]!;
    await account.deleteAddress(firstUserId, currentDefault.id);
    const after = await account.addresses(firstUserId);
    expect(after.items[0]!.id).toBe(expectedReplacement.id);
    expect(after.items.filter(({ isDefault }) => isDefault)).toHaveLength(1);
    expect((await account.addresses(secondUserId)).items).toEqual([
      expect.objectContaining({ id: unrelated.id, isDefault: true }),
    ]);
    const deleted = await prisma.shippingAddress.findUniqueOrThrow({
      where: { id: currentDefault.id },
    });
    expect(deleted).toMatchObject({ isDefault: false, deletedAt: expect.any(Date) });

    await Promise.all(after.items.map(({ id }) => account.deleteAddress(firstUserId, id)));
    expect((await account.addresses(firstUserId)).items).toEqual([]);
  });
});
