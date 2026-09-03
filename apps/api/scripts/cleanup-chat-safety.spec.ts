import { cleanupChatSafetyRows } from './cleanup-chat-safety';

describe('chat safety cleanup', () => {
  it('deletes only rows older than the retention/expiry boundary in batches', async () => {
    const prisma = {
      chatRateLimitEvent: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'old-rate' }])
          .mockResolvedValueOnce([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      chatAttentionLease: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'expired-lease' }])
          .mockResolvedValueOnce([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    await expect(
      cleanupChatSafetyRows(prisma as never, {
        now: new Date('2026-08-28T00:00:00.000Z'),
        retentionHours: 48,
        batchSize: 50,
      }),
    ).resolves.toEqual({ rateLimitDeleted: 1, attentionDeleted: 1 });
    expect(prisma.chatRateLimitEvent.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old-rate'] } } });
    expect(prisma.chatAttentionLease.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['expired-lease'] } } });
    expect(prisma.chatAttentionLease.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { expiresAt: { lte: new Date('2026-08-28T00:00:00.000Z') } } }),
    );
  });
});
