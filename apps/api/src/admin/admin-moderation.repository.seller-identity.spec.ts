import type { Prisma } from '../generated/prisma/client';
import {
  ModerationCaseOutcome,
  ModerationCaseStatus,
  ReportTargetType,
  ShopOnboardingStatus,
  ShopStatus,
} from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminModerationRepository } from './admin-moderation.repository';

describe('AdminModerationRepository seller lifecycle adapter', () => {
  const adminId = '00000000-0000-4000-8000-000000000001';
  const caseId = '00000000-0000-4000-8000-000000000002';
  const shopId = '00000000-0000-4000-8000-000000000003';

  function fixture(outcome: ModerationCaseOutcome, currentShopStatus: ShopStatus) {
    const lifecycle = {
      suspendShopInTransaction: jest.fn().mockResolvedValue({ shopStatus: ShopStatus.SUSPENDED }),
      restoreShopInTransaction: jest.fn().mockResolvedValue({ shopStatus: ShopStatus.ACTIVE }),
    };
    const tx = {
      $queryRaw: jest.fn(),
      moderationCommand: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      moderationCase: {
        findUnique: jest.fn().mockResolvedValue({
          id: caseId,
          targetType: ReportTargetType.SHOP,
          shopId,
          productId: null,
          status: ModerationCaseStatus.OPEN,
          currentOutcome: null,
          version: 0,
          targetSnapshot: { shopId, name: 'Seller Shop' },
          reports: [],
          decisions: [],
        }),
        update: jest.fn(),
      },
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          id: shopId,
          ownerId: adminId,
          status: currentShopStatus,
          onboardingStatus: ShopOnboardingStatus.APPROVED,
        }),
        update: jest.fn(),
      },
      moderationDecision: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000004', outcome }),
      },
      sellerModerationNotice: { create: jest.fn() },
      userReport: { updateMany: jest.fn() },
      moderationCaseEvent: { create: jest.fn() },
      privilegedAuditEvent: { create: jest.fn() },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: jest.fn((work: (transaction: Prisma.TransactionClient) => unknown) => work(tx)),
    } as unknown as PrismaService;
    return { repository: new AdminModerationRepository(prisma, lifecycle as never), lifecycle, tx };
  }

  it.each([
    [ModerationCaseOutcome.SUSPEND_TARGET, ShopStatus.ACTIVE, 'suspendShopInTransaction'],
    [ModerationCaseOutcome.RESTORE_TARGET, ShopStatus.SUSPENDED, 'restoreShopInTransaction'],
  ] as const)('delegates %s for a shop target to the paired lifecycle', async (outcome, currentStatus, method) => {
    const { repository, lifecycle, tx } = fixture(outcome, currentStatus);

    const result = await repository.makeDecision(
      adminId,
      caseId,
      { outcome, publicReason: 'Moderation decision requires action', expectedVersion: 0 },
      '00000000-0000-4000-8000-000000000005',
      'digest',
    );

    expect(lifecycle[method]).toHaveBeenCalledWith(
      tx,
      adminId,
      shopId,
      'Moderation decision requires action',
    );
    expect(tx.shop.update).not.toHaveBeenCalled();
    expect(result.targetStatus).toBe(
      outcome === ModerationCaseOutcome.SUSPEND_TARGET ? ShopStatus.SUSPENDED : ShopStatus.ACTIVE,
    );
  });
});
