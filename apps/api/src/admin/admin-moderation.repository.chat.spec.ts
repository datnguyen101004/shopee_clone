import { ModerationCaseOutcome, ReportTargetType } from '../generated/prisma/enums';
import { AdminInvalidInputError } from './admin.errors';
import { AdminModerationRepository, ModerationConflictError, ModerationIdempotencyConflictError } from './admin-moderation.repository';

const adminId = '00000000-0000-4000-8000-000000000301';
const reportedUserId = '00000000-0000-4000-8000-000000000302';
const caseId = '00000000-0000-4000-8000-000000000303';

function fixture() {
  const tx = {
    $queryRaw: jest.fn(),
    moderationCommand: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    moderationCase: {
      findUnique: jest.fn().mockResolvedValue({
        id: caseId,
        targetType: ReportTargetType.CHAT_MESSAGE,
        chatConversationId: '00000000-0000-4000-8000-000000000304',
        reportedUserId,
        targetSnapshot: { conversationId: '00000000-0000-4000-8000-000000000304', messageId: '00000000-0000-4000-8000-000000000305' },
        status: 'OPEN',
        version: 0,
        reports: [],
        decisions: [],
      }),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: reportedUserId, status: 'ACTIVE', deletedAt: null, displayName: 'Reported user' }),
    },
    userChatRestriction: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    moderationDecision: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000306', outcome: ModerationCaseOutcome.RESTRICT_CHAT_TEMPORARY }),
    },
    notification: { create: jest.fn() },
    userReport: { updateMany: jest.fn() },
    moderationCaseEvent: { create: jest.fn() },
    privilegedAuditEvent: { create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((work: (value: unknown) => unknown) => work(tx)) };
  return { repository: new AdminModerationRepository(prisma as never), prisma, tx };
}

describe('AdminModerationRepository chat decisions', () => {
  it('rejects product/shop-only outcomes for chat cases', async () => {
    const { repository, tx } = fixture();
    await expect(repository.makeDecision(
      adminId,
      caseId,
      { outcome: ModerationCaseOutcome.SUSPEND_TARGET, publicReason: 'Đây là lý do đủ dài', expectedVersion: 0 },
      '00000000-0000-4000-8000-000000000307',
      'digest',
    )).rejects.toBeInstanceOf(AdminInvalidInputError);
    expect(tx.moderationDecision.create).not.toHaveBeenCalled();
  });

  it('records a temporary restriction, user notice, and exactly one audit row atomically', async () => {
    const { repository, tx } = fixture();
    const restrictionUntil = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    const result = await repository.makeDecision(
      adminId,
      caseId,
      { outcome: ModerationCaseOutcome.RESTRICT_CHAT_TEMPORARY, publicReason: 'Hạn chế tạm thời do vi phạm', privateNote: 'Đã kiểm tra bằng chứng', restrictionUntil, expectedVersion: 0 },
      '00000000-0000-4000-8000-000000000308',
      'digest',
    );
    expect(result).toMatchObject({ caseId, outcome: ModerationCaseOutcome.RESTRICT_CHAT_TEMPORARY, targetStatus: 'RESTRICTED' });
    expect(tx.userChatRestriction.upsert).toHaveBeenCalledTimes(1);
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    expect(tx.privilegedAuditEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.moderationCase.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ version: 1, status: 'RESOLVED' }) }));
  });

  it('returns the exact idempotent decision and rejects conflicting replay/version races', async () => {
    const { repository, tx } = fixture();
    const replay = { responseBody: { caseId, outcome: ModerationCaseOutcome.NO_ACTION, version: 1, targetStatus: 'ELIGIBLE', resolvedAt: '2026-08-27T00:00:00.000Z' }, requestDigest: 'digest' };
    tx.moderationCommand.findUnique.mockResolvedValueOnce(replay);
    await expect(repository.makeDecision(adminId, caseId, { outcome: ModerationCaseOutcome.NO_ACTION, publicReason: 'Không áp dụng chế tài', expectedVersion: 0 }, '00000000-0000-4000-8000-000000000309', 'digest')).resolves.toEqual(replay.responseBody);

    tx.moderationCommand.findUnique.mockResolvedValueOnce({ ...replay, requestDigest: 'other' });
    await expect(repository.makeDecision(adminId, caseId, { outcome: ModerationCaseOutcome.NO_ACTION, publicReason: 'Không áp dụng chế tài', expectedVersion: 0 }, '00000000-0000-4000-8000-000000000310', 'digest')).rejects.toBeInstanceOf(ModerationIdempotencyConflictError);

    tx.moderationCommand.findUnique.mockResolvedValueOnce(null);
    tx.moderationCase.findUnique.mockResolvedValueOnce({ ...await tx.moderationCase.findUnique(), version: 4 });
    await expect(repository.makeDecision(adminId, caseId, { outcome: ModerationCaseOutcome.NO_ACTION, publicReason: 'Không áp dụng chế tài', expectedVersion: 0 }, '00000000-0000-4000-8000-000000000311', 'digest')).rejects.toBeInstanceOf(ModerationConflictError);
  });

  it('restores a chat restriction and records a user-facing restore notice', async () => {
    const { repository, tx } = fixture();
    tx.userChatRestriction.findUnique.mockResolvedValue({ restoredAt: null, restrictedUntil: null });
    tx.moderationDecision.create.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000312', outcome: ModerationCaseOutcome.RESTORE_CHAT });
    const result = await repository.makeDecision(
      adminId,
      caseId,
      { outcome: ModerationCaseOutcome.RESTORE_CHAT, publicReason: 'Mở lại chat sau khi rà soát', privateNote: 'Đã hoàn tất rà soát', expectedVersion: 0 },
      '00000000-0000-4000-8000-000000000313',
      'restore-digest',
    );
    expect(result.targetStatus).toBe('ELIGIBLE');
    expect(tx.userChatRestriction.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ restoredAt: expect.any(Date) }) }));
    expect(tx.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ body: 'Bạn có thể tiếp tục gửi tin nhắn.' }) }));
    expect(tx.privilegedAuditEvent.create).toHaveBeenCalledTimes(1);
  });
});
