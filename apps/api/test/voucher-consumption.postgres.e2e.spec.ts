import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { UserStatus, VoucherBenefitType, VoucherIssuer } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  VoucherConsumptionConflictError,
  VoucherConsumptionService,
} from '../src/vouchers/voucher-consumption.service';
import type { AppliedVoucherSnapshot } from '../src/vouchers/voucher-pricing.calculator';

const databaseTest = process.env.RUN_CART_DATABASE_TESTS === '1' ? describe : describe.skip;
const userA = '00000000-0000-4000-8000-000000008801';
const userB = '00000000-0000-4000-8000-000000008802';
const voucherA = '00000000-0000-4000-8000-000000008811';
const voucherB = '00000000-0000-4000-8000-000000008812';
const raceVoucher = '00000000-0000-4000-8000-000000008813';
const purchaseA = '00000000-0000-4000-8000-000000008821';
const purchaseB = '00000000-0000-4000-8000-000000008822';
const purchaseC = '00000000-0000-4000-8000-000000008823';
const evaluatedAt = new Date('2026-08-14T05:00:00.000Z');

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

function applied(voucherId: string, amount = 10_000): AppliedVoucherSnapshot {
  return {
    voucherId,
    code: `CODE-${voucherId.slice(-4)}`,
    merchandiseDiscountMinor: amount,
    shippingDiscountMinor: 0,
    discountMinor: amount,
  };
}

databaseTest('transaction-owned voucher consumption with PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: VoucherConsumptionService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(VoucherConsumptionService);
  });

  async function cleanup() {
    await prisma.voucherRedemption.deleteMany({
      where: { voucherId: { in: [voucherA, voucherB, raceVoucher] } },
    });
    await prisma.voucherConsumption.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.voucherUserUsage.deleteMany({
      where: { voucherId: { in: [voucherA, voucherB, raceVoucher] } },
    });
    await prisma.voucher.deleteMany({ where: { id: { in: [voucherA, voucherB, raceVoucher] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  }

  beforeEach(async () => {
    await cleanup();
    await prisma.user.createMany({
      data: [
        {
          id: userA,
          email: 't18-consume-a@example.test',
          displayName: 'T18 Consume A',
          status: UserStatus.ACTIVE,
        },
        {
          id: userB,
          email: 't18-consume-b@example.test',
          displayName: 'T18 Consume B',
          status: UserStatus.ACTIVE,
        },
      ],
    });
    await prisma.voucher.createMany({
      data: [
        { id: voucherA, code: 'T18-CONSUME-A', usageLimit: 100, perBuyerLimit: 10 },
        { id: voucherB, code: 'T18-CONSUME-B', usageLimit: 100, perBuyerLimit: 10 },
        { id: raceVoucher, code: 'T18-RACE-ONE', usageLimit: 1, perBuyerLimit: 1 },
      ].map((voucher) => ({
        ...voucher,
        name: voucher.code,
        issuer: VoucherIssuer.PLATFORM,
        benefitType: VoucherBenefitType.FIXED_AMOUNT,
        fixedAmountMinor: 10_000n,
        minimumSpendMinor: 0n,
        startsAt: new Date('2020-01-01T00:00:00.000Z'),
        endsAt: new Date('2999-01-01T00:00:00.000Z'),
        isEnabled: true,
        usedCount: 0,
      })),
    });
  });

  afterAll(async () => {
    if (prisma) await cleanup();
    await app?.close();
  });

  it('commits several vouchers together and rolls every write back with the outer work', async () => {
    const committed = await prisma.$transaction((transaction) =>
      service.consumeInTransaction(transaction, {
        purchaseReference: purchaseA,
        userId: userA,
        evaluatedAt,
        applied: [applied(voucherB), applied(voucherA)],
      }),
    );
    expect(committed).toMatchObject({ created: true, redemptionCount: 2 });
    expect(
      await prisma.voucher.findMany({
        where: { id: { in: [voucherA, voucherB] } },
        orderBy: { id: 'asc' },
        select: { usedCount: true },
      }),
    ).toEqual([{ usedCount: 1 }, { usedCount: 1 }]);
    expect(await prisma.voucherUserUsage.count({ where: { userId: userA } })).toBe(2);
    expect(await prisma.voucherRedemption.count({ where: { userId: userA } })).toBe(2);

    await expect(
      prisma.$transaction(async (transaction) => {
        await service.consumeInTransaction(transaction, {
          purchaseReference: purchaseB,
          userId: userB,
          evaluatedAt,
          applied: [applied(raceVoucher)],
        });
        throw new Error('force outer rollback');
      }),
    ).rejects.toThrow('force outer rollback');
    expect(await prisma.voucher.findUniqueOrThrow({ where: { id: raceVoucher } })).toMatchObject({
      usedCount: 0,
    });
    expect(await prisma.voucherConsumption.count({ where: { purchaseReference: purchaseB } })).toBe(
      0,
    );
  });

  it('is idempotent for an identical purchase reference and rejects inconsistent reuse', async () => {
    const input = {
      purchaseReference: purchaseA,
      userId: userA,
      evaluatedAt,
      applied: [applied(voucherA)],
    } as const;
    expect(
      await prisma.$transaction((transaction) => service.consumeInTransaction(transaction, input)),
    ).toMatchObject({ created: true, redemptionCount: 1 });
    expect(
      await prisma.$transaction((transaction) => service.consumeInTransaction(transaction, input)),
    ).toMatchObject({ created: false, redemptionCount: 1 });
    await expect(
      prisma.$transaction((transaction) =>
        service.consumeInTransaction(transaction, {
          ...input,
          applied: [applied(voucherA, 9_999)],
        }),
      ),
    ).rejects.toBeInstanceOf(VoucherConsumptionConflictError);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: voucherA } })).usedCount).toBe(1);
    expect(await prisma.voucherRedemption.count({ where: { voucherId: voucherA } })).toBe(1);
  });

  it('rolls the complete set back when one voucher has no capacity', async () => {
    await prisma.voucher.update({ where: { id: voucherB }, data: { usedCount: 100 } });
    await expect(
      prisma.$transaction((transaction) =>
        service.consumeInTransaction(transaction, {
          purchaseReference: purchaseA,
          userId: userA,
          evaluatedAt,
          applied: [applied(voucherA), applied(voucherB)],
        }),
      ),
    ).rejects.toThrow('Voucher eligibility changed');
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: voucherA } })).usedCount).toBe(0);
    expect(await prisma.voucherConsumption.count({ where: { purchaseReference: purchaseA } })).toBe(
      0,
    );
  });

  it('allows at most one concurrent transaction to consume the final global use', async () => {
    const attempts = await Promise.allSettled([
      prisma.$transaction(
        (transaction) =>
          service.consumeInTransaction(transaction, {
            purchaseReference: purchaseB,
            userId: userA,
            evaluatedAt,
            applied: [applied(raceVoucher)],
          }),
        { isolationLevel: 'ReadCommitted' },
      ),
      prisma.$transaction(
        (transaction) =>
          service.consumeInTransaction(transaction, {
            purchaseReference: purchaseC,
            userId: userB,
            evaluatedAt,
            applied: [applied(raceVoucher)],
          }),
        { isolationLevel: 'ReadCommitted' },
      ),
    ]);
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: raceVoucher } })).usedCount).toBe(
      1,
    );
    expect(await prisma.voucherRedemption.count({ where: { voucherId: raceVoucher } })).toBe(1);
    expect(
      Math.max(
        0,
        ...(
          await prisma.voucherUserUsage.findMany({
            where: { voucherId: raceVoucher },
            select: { usedCount: true },
          })
        ).map(({ usedCount }) => usedCount),
      ),
    ).toBeLessThanOrEqual(1);
  });
});
