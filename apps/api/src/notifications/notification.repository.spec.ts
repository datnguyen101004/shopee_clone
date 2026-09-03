import { NotificationRepository } from './notification.repository';

const userId = '00000000-0000-4000-8000-000000000201';
const conversationId = '00000000-0000-4000-8000-000000000202';

function row(id: string, activityAt: string, isRead = false) {
  return {
    id,
    category: 'CHAT',
    type: 'CHAT_MESSAGE',
    title: 'Tin nhắn mới',
    body: 'Xin chào',
    metadata: {
      targetUrl: '/',
      thumbnailUrl: null,
      referenceId: conversationId,
      amountMinor: null,
      currency: null,
      chat: {
        conversationId,
        unreadCount: isRead ? 0 : 2,
        newestSequence: 4,
        preview: 'Xin chào',
        avatarUrl: null,
        activityAt,
      },
    },
    isRead,
    readAt: isRead ? new Date(activityAt) : null,
    isArchived: false,
    createdAt: new Date(activityAt),
    activityAt: new Date(activityAt),
  };
}

describe('NotificationRepository chat aggregates', () => {
  it('orders by activity time, preserves grouped chat metadata, and emits a stable cursor', async () => {
    const first = row('00000000-0000-4000-8000-000000000211', '2026-08-27T00:00:02.000Z');
    const second = row('00000000-0000-4000-8000-000000000212', '2026-08-27T00:00:01.000Z');
    const prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([first, second]),
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const repository = new NotificationRepository(prisma as never);

    const result = await repository.list(userId, 'CHAT', 1, null);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: first.id,
      category: 'CHAT',
      type: 'CHAT_MESSAGE',
      activityAt: '2026-08-27T00:00:02.000Z',
      metadata: { chat: { conversationId, unreadCount: 2, newestSequence: 4 } },
    });
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ recipientId: userId, category: 'CHAT' }),
      orderBy: [{ activityAt: 'desc' }, { id: 'desc' }],
      take: 2,
    }));
  });

  it('marks chat aggregate read through the same general read contract without changing its activity order', async () => {
    const existing = row('00000000-0000-4000-8000-000000000213', '2026-08-27T00:00:03.000Z');
    const prisma = {
      notification: {
        findFirst: jest.fn().mockResolvedValue(existing),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 3 })
          .mockResolvedValueOnce({ count: 1 }),
      },
    };
    const repository = new NotificationRepository(prisma as never);

    await expect(repository.markRead(userId, existing.id)).resolves.toMatchObject({
      id: existing.id,
      isRead: true,
      readAt: expect.any(String),
      updatedCount: 3,
    });
    expect(prisma.notification.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        recipientId: userId,
        isRead: false,
        isArchived: false,
        OR: [
          { activityAt: { lt: existing.activityAt } },
          { activityAt: existing.activityAt, id: { lte: existing.id } },
        ],
      },
      data: { isRead: true, readAt: expect.any(Date) },
    });
    await expect(repository.markAllRead(userId)).resolves.toMatchObject({ updatedCount: 1 });
    expect(prisma.notification.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { recipientId: userId, isRead: false, isArchived: false },
    }));
  });
});
