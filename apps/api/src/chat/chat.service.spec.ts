import { ChatService } from './chat.service';
import { ChatError } from './chat.errors';
import type { PrismaService } from '../prisma/prisma.service';
import { ChatPresenceService } from './chat.realtime';
import type { ChatOutboxDispatcher, ChatTicketService } from './chat.realtime';

const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
const shopId = '00000000-0000-4000-8000-000000000003';
const conversationId = '00000000-0000-4000-8000-000000000004';

function service(presence = new ChatPresenceService()) {
  return new ChatService(
    {} as unknown as PrismaService,
    {} as unknown as ChatTicketService,
    { flush: jest.fn() } as unknown as ChatOutboxDispatcher,
    {
      ticketTtlSeconds: 60,
      presenceLeaseSeconds: 45,
      outboxBatch: 50,
      messageRatePerMinute: 30,
      outboxReadinessMaxAgeSeconds: 60,
    },
    presence,
  );
}

function serviceWithPrisma(prisma: unknown, presence = new ChatPresenceService()) {
  return new ChatService(
    prisma as PrismaService,
    {} as unknown as ChatTicketService,
    { flush: jest.fn() } as unknown as ChatOutboxDispatcher,
    {
      ticketTtlSeconds: 60,
      presenceLeaseSeconds: 45,
      outboxBatch: 50,
      messageRatePerMinute: 30,
      outboxReadinessMaxAgeSeconds: 60,
    },
    presence,
  );
}

describe('ChatService invariants', () => {
  it('canonicalizes the participant pair and rejects self-chat', () => {
    const instance = service() as unknown as { pair(a: string, b: string): [string, string] };
    expect(instance.pair(userB, userA)).toEqual([userA, userB]);
    expect(() => instance.pair(userA, userA)).toThrow(ChatError);
  });

  it('rejects whitespace-only messages before opening a conversation', async () => {
    await expect(
      service().send(userA, { recipientUserId: userB, clientMessageId: userA, content: '   ' }),
    ).rejects.toBeInstanceOf(ChatError);
  });

  it('derives read state from the other participant for outgoing messages', () => {
    const instance = service() as unknown as {
      messageView(
        userId: string,
        memberships: Array<{ userId: string; lastReadSequence: number }>,
        message: {
          id: string;
          conversationId: string;
          sequence: number;
          senderUserId: string;
          clientMessageId: string;
          content: string;
          createdAt: Date;
        },
      ): { isRead: boolean };
    };
    const outgoing = {
      id: userA,
      conversationId: userB,
      sequence: 2,
      senderUserId: userA,
      clientMessageId: userA,
      content: 'hello',
      createdAt: new Date('2026-08-27T00:00:00.000Z'),
    };
    const memberships = [
      { userId: userA, lastReadSequence: 2 },
      { userId: userB, lastReadSequence: 0 },
    ];

    expect(instance.messageView(userA, memberships, outgoing).isRead).toBe(false);
    expect(
      instance.messageView(
        userA,
        memberships.map((membership) =>
          membership.userId === userB ? { ...membership, lastReadSequence: 2 } : membership,
        ),
        outgoing,
      ).isRead,
    ).toBe(true);
  });

  it('uses the other participant live presence in conversation projections', async () => {
    const presence = new ChatPresenceService();
    presence.connect(userB);
    const instance = service(presence) as unknown as {
      summary(
        userId: string,
        row: unknown,
      ): Promise<{ participant: { userId: string; presence: string } }>;
    };
    const row = {
      id: '00000000-0000-4000-8000-000000000003',
      participantLowUserId: userA,
      participantHighUserId: userB,
      participantLow: { id: userA, displayName: 'User A', shop: null },
      participantHigh: { id: userB, displayName: 'User B', shop: null },
      lastMessagePreview: 'hello',
      lastMessageAt: new Date('2026-08-27T00:00:00.000Z'),
      updatedAt: new Date('2026-08-27T00:00:00.000Z'),
      lastMessageSequence: 1,
      memberships: [
        { userId: userA, unreadCount: 0, lastReadSequence: 1 },
        { userId: userB, unreadCount: 1, lastReadSequence: 0 },
      ],
    };

    await expect(instance.summary(userA, row)).resolves.toMatchObject({
      participant: { userId: userB, presence: 'ACTIVE' },
    });
    await expect(instance.summary(userB, row)).resolves.toMatchObject({
      participant: { userId: userA, presence: 'INACTIVE' },
    });
  });

  it('hides presence and messaging eligibility after a directed block', async () => {
    const row = {
      id: conversationId,
      participantLowUserId: userA,
      participantHighUserId: userB,
      participantLow: {
        id: userA,
        displayName: 'User A',
        status: 'ACTIVE',
        deletedAt: null,
        shop: null,
      },
      participantHigh: {
        id: userB,
        displayName: 'User B',
        status: 'ACTIVE',
        deletedAt: null,
        shop: null,
      },
      lastMessagePreview: 'hello',
      lastMessageAt: new Date('2026-08-27T00:00:00.000Z'),
      updatedAt: new Date('2026-08-27T00:00:00.000Z'),
      lastMessageSequence: 1,
      memberships: [
        { userId: userA, unreadCount: 0, lastReadSequence: 1 },
        { userId: userB, unreadCount: 1, lastReadSequence: 0 },
      ],
    };
    const prisma = {
      chatMembership: { findUnique: jest.fn().mockResolvedValue(row.memberships[0]) },
      chatUserBlock: {
        findUnique: jest.fn(({ where }: { where: { blockerUserId_blockedUserId: { blockerUserId: string; blockedUserId: string } } }) =>
          Promise.resolve(
            where.blockerUserId_blockedUserId.blockerUserId === userA ? { id: 'block-1' } : null,
          )),
      },
      userChatRestriction: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const instance = serviceWithPrisma(prisma) as unknown as {
      summary(userId: string, input: unknown): Promise<{ canMessage?: boolean; blockedByMe?: boolean; participant: { presence: string } }>;
    };

    await expect(instance.summary(userA, row)).resolves.toMatchObject({
      canMessage: false,
      blockedByMe: true,
      participant: { presence: 'INACTIVE' },
    });
  });

  it('projects bounded replies and a neutral unavailable-original marker', () => {
    const instance = service() as unknown as {
      messageView(userId: string, memberships: Array<{ userId: string; lastReadSequence: number }>, message: unknown): { replyTo?: { preview: string } | null };
    };
    const base = {
      id: userA,
      conversationId,
      sequence: 2,
      senderUserId: userA,
      clientMessageId: userB,
      content: 'reply body',
      createdAt: new Date('2026-08-27T00:00:00.000Z'),
      replyToMessageId: userB,
      replyTo: {
        id: userB,
        sequence: 1,
        senderUserId: userB,
        content: 'x'.repeat(300),
        sender: { displayName: 'User B' },
      },
    };
    expect(instance.messageView(userA, [{ userId: userB, lastReadSequence: 2 }], base).replyTo?.preview).toHaveLength(160);
    expect(
      instance.messageView(userA, [{ userId: userB, lastReadSequence: 2 }], { ...base, replyTo: null }).replyTo,
    ).toBeNull();
  });

  it('rejects invalid report reasons and underspecified OTHER reports before persistence', async () => {
    const instance = service();
    await expect(
      instance.report(userA, { conversationId, reasonCode: 'UNKNOWN' }, userB),
    ).rejects.toMatchObject({ code: 'chat-report-invalid' });
    await expect(
      instance.report(userA, { conversationId, reasonCode: 'OTHER', details: 'too short' }, userB),
    ).rejects.toMatchObject({ code: 'chat-report-invalid' });
  });

  it('reuses an existing submitted target report without consuming another allowance', async () => {
    const existing = {
      id: '00000000-0000-4000-8000-000000000099',
      status: 'SUBMITTED',
      createdAt: new Date('2026-08-27T00:00:00.000Z'),
      chatConversationId: conversationId,
      chatMessageId: userB,
      reasonCode: 'INAPPROPRIATE_CONTENT',
      targetSnapshot: { reasonCode: 'SPAM' },
    };
    const reportFindFirst = jest.fn().mockResolvedValue(existing);
    const rateCount = jest.fn();
    const rateCreate = jest.fn();
    const prisma = {
      chatConversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: conversationId,
          participantLowUserId: userA,
          participantHighUserId: userB,
          memberships: [{ userId: userA }, { userId: userB }],
        }),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          userReport: {
            findUnique: jest.fn().mockResolvedValue(null),
            findFirst: reportFindFirst,
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
          reportRateLimitEvent: { count: rateCount, create: rateCreate },
        }),
      ),
    };

    await expect(
      serviceWithPrisma(prisma).report(
        userA,
        { conversationId, messageId: userB, reasonCode: 'SPAM' },
        '00000000-0000-4000-8000-000000000098',
      ),
    ).resolves.toMatchObject({
      id: existing.id,
      conversationId,
      messageId: userB,
      reasonCode: 'SPAM',
      status: 'SUBMITTED',
    });
    expect(reportFindFirst).toHaveBeenCalledTimes(1);
    expect(rateCount).not.toHaveBeenCalled();
    expect(rateCreate).not.toHaveBeenCalled();
  });

  it('records rejected rate attempts without retaining the raw source address', async () => {
    const prisma = { chatRateLimitEvent: { createMany: jest.fn().mockResolvedValue({ count: 2 }) } };
    const instance = serviceWithPrisma(prisma) as unknown as {
      recordRejectedRateAttempt(userId: string, source: string): Promise<void>;
    };
    await instance.recordRejectedRateAttempt(userA, '203.0.113.9');
    const payload = prisma.chatRateLimitEvent.createMany.mock.calls[0]?.[0];
    expect(payload.data).toHaveLength(2);
    expect(payload.data.every((row: { accepted: boolean }) => row.accepted === false)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('203.0.113.9');
  });

  it('resolves an authorized existing pair without relying on the contact page', async () => {
    const row = {
      id: conversationId,
      participantLowUserId: userA,
      participantHighUserId: userB,
      participantLow: {
        id: userA,
        displayName: 'User A',
        status: 'ACTIVE',
        deletedAt: null,
        shop: null,
      },
      participantHigh: {
        id: userB,
        displayName: 'User B',
        status: 'ACTIVE',
        deletedAt: null,
        shop: null,
      },
      lastMessagePreview: 'old',
      lastMessageAt: new Date('2026-08-27T00:00:00.000Z'),
      updatedAt: new Date('2026-08-27T00:00:00.000Z'),
      lastMessageSequence: 4,
      memberships: [
        { userId: userA, unreadCount: 0, lastReadSequence: 4 },
        { userId: userB, unreadCount: 1, lastReadSequence: 3 },
      ],
    };
    const prisma = {
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          id: shopId,
          name: 'Shop',
          deletedAt: null,
          status: 'ACTIVE',
          onboardingStatus: 'APPROVED',
          owner: { id: userB, displayName: 'User B', status: 'ACTIVE', deletedAt: null },
        }),
      },
      chatConversation: {
        findUnique: jest.fn().mockResolvedValue(row),
      },
    };

    await expect(serviceWithPrisma(prisma).target(userA, shopId)).resolves.toMatchObject({
      isSelf: false,
      canMessage: true,
      existingConversation: { id: conversationId, participant: { userId: userB } },
    });
    expect(prisma.chatConversation.findUnique).toHaveBeenCalledTimes(1);
  });

  it('keeps self and unavailable owner targets non-messageable', async () => {
    const unavailable = {
      id: shopId,
      name: 'Shop',
      deletedAt: null,
      status: 'ACTIVE',
      onboardingStatus: 'APPROVED',
      owner: { id: userB, displayName: 'User B', status: 'SUSPENDED', deletedAt: null },
    };
    const prisma = {
      shop: { findUnique: jest.fn().mockResolvedValue(unavailable) },
      chatConversation: { findUnique: jest.fn() },
    };
    await expect(serviceWithPrisma(prisma).target(userA, shopId)).resolves.toMatchObject({
      isSelf: false,
      canMessage: false,
      existingConversation: null,
    });
    expect(prisma.chatConversation.findUnique).not.toHaveBeenCalled();

    prisma.shop.findUnique.mockResolvedValue({
      ...unavailable,
      owner: { ...unavailable.owner, id: userA, status: 'ACTIVE' },
    });
    await expect(serviceWithPrisma(prisma).target(userA, shopId)).resolves.toMatchObject({
      isSelf: true,
      canMessage: false,
      existingConversation: null,
    });
  });

  it('makes mute idempotent and emits an event only when the state changes', async () => {
    const row = { id: conversationId };
    const membership = { notificationsMutedAt: null as Date | null };
    const update = jest.fn();
    const tx = {
      $queryRaw: jest.fn(),
      chatMembership: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => membership),
        update,
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx)),
      chatOutbox: { create: jest.fn() },
    };
    const instance = serviceWithPrisma(prisma);
    const internals = instance as unknown as { conversationFor: jest.Mock; summary: jest.Mock };
    internals.conversationFor = jest.fn().mockResolvedValue(row);
    internals.summary = jest.fn().mockResolvedValue({
      notificationsMuted: true,
      blockedByMe: false,
      canMessage: true,
    });

    await expect(instance.setMute(userA, conversationId, true)).resolves.toMatchObject({
      notificationsMuted: true,
    });
    expect(update).toHaveBeenCalledWith({
      where: { conversationId_userId: { conversationId, userId: userA } },
      data: { notificationsMutedAt: expect.any(Date) },
    });
    expect(prisma.chatOutbox.create).toHaveBeenCalledTimes(1);

    membership.notificationsMutedAt = new Date();
    await instance.setMute(userA, conversationId, true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(prisma.chatOutbox.create).toHaveBeenCalledTimes(1);
  });

  it('serializes both block directions and restores send eligibility after unblock', async () => {
    const row = {
      id: conversationId,
      participantLowUserId: userA,
      participantHighUserId: userB,
    };
    const findBlock = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'block-1' });
    const upsert = jest.fn();
    const deleteMany = jest.fn();
    const tx = {
      $executeRaw: jest.fn(),
      chatUserBlock: { findUnique: findBlock, upsert, deleteMany },
      notification: { updateMany: jest.fn() },
    };
    const prisma = {
      chatConversation: { findUnique: jest.fn().mockResolvedValue(row) },
      $transaction: jest.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx)),
      chatOutbox: { createMany: jest.fn() },
    };
    const instance = serviceWithPrisma(prisma);
    const internals = instance as unknown as { conversationFor: jest.Mock; summary: jest.Mock };
    internals.conversationFor = jest.fn().mockResolvedValue(row);
    internals.summary = jest.fn().mockResolvedValue({
      notificationsMuted: false,
      blockedByMe: true,
      canMessage: false,
      participant: { userId: userB, presence: 'INACTIVE' },
    });

    await expect(instance.setBlock(userA, userB, true)).resolves.toMatchObject({
      blockedByMe: true,
      canMessage: false,
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(prisma.chatOutbox.createMany).toHaveBeenCalledTimes(1);

    internals.summary.mockResolvedValue({
      notificationsMuted: false,
      blockedByMe: false,
      canMessage: true,
      participant: { userId: userB, presence: 'ACTIVE' },
    });
    await expect(instance.setBlock(userA, userB, false)).resolves.toMatchObject({
      blockedByMe: false,
      canMessage: true,
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { blockerUserId: userA, blockedUserId: userB } });
    expect(prisma.chatOutbox.createMany).toHaveBeenCalledTimes(2);
  });

  it('rejects a send that races with an effective block before materializing a conversation', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: userB, status: 'ACTIVE', deletedAt: null, shop: null }) },
      $transaction: jest.fn(async (callback: (value: unknown) => Promise<unknown>) =>
        callback({
          $executeRaw: jest.fn(),
          chatUserBlock: { findFirst: jest.fn().mockResolvedValue({ id: 'block-1' }) },
        }),
      ),
    };
    await expect(
      serviceWithPrisma(prisma).send(userA, {
        recipientUserId: userB,
        clientMessageId: '00000000-0000-4000-8000-000000000009',
        content: 'should be rejected',
      }),
    ).rejects.toMatchObject({ code: 'chat-forbidden' });
  });

  it('rejects a reply target outside the canonical conversation and preserves idempotency conflicts', async () => {
    const conversation = {
      id: conversationId,
      nextSequence: 2,
      participantLowUserId: userA,
      participantHighUserId: userB,
      participantLow: { id: userA, displayName: 'User A' },
      participantHigh: { id: userB, displayName: 'User B' },
      memberships: [{ userId: userA }, { userId: userB }],
    };
    const tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
      chatUserBlock: { findFirst: jest.fn().mockResolvedValue(null) },
      userChatRestriction: { findUnique: jest.fn().mockResolvedValue(null) },
      chatConversation: {
        findUnique: jest.fn().mockResolvedValue(conversation),
        findUniqueOrThrow: jest.fn().mockResolvedValue(conversation),
      },
      chatMessage: {
        findUnique: jest.fn().mockResolvedValue({ requestDigest: 'different' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: userB, status: 'ACTIVE', deletedAt: null, shop: null }) },
      $transaction: jest.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx)),
    };
    const instance = serviceWithPrisma(prisma);
    const internals = instance as unknown as { enforceSharedRate: jest.Mock };
    internals.enforceSharedRate = jest.fn().mockResolvedValue(undefined);

    await expect(
      instance.send(userA, {
        recipientUserId: userB,
        clientMessageId: '00000000-0000-4000-8000-000000000010',
        content: 'reply',
        replyToMessageId: '00000000-0000-4000-8000-000000000011',
      }),
    ).rejects.toMatchObject({ code: 'chat-message-idempotency-conflict' });

    tx.chatMessage.findUnique.mockResolvedValue(null);
    await expect(
      instance.send(userA, {
        recipientUserId: userB,
        clientMessageId: '00000000-0000-4000-8000-000000000012',
        content: 'reply',
        replyToMessageId: '00000000-0000-4000-8000-000000000013',
      }),
    ).rejects.toMatchObject({ code: 'chat-reply-invalid' });
  });

  it('keeps history cursor pages ordered and non-overlapping', async () => {
    const row = { id: conversationId, participantLowUserId: userA, participantHighUserId: userB, memberships: [{ userId: userA, unreadCount: 0, lastReadSequence: 3 }] };
    const findMany = jest.fn().mockResolvedValue([
      { id: userA, conversationId, sequence: 1, senderUserId: userA, clientMessageId: userA, content: 'one', createdAt: new Date('2026-08-27T00:00:00.000Z'), replyToMessageId: null },
      { id: userB, conversationId, sequence: 2, senderUserId: userB, clientMessageId: userB, content: 'two', createdAt: new Date('2026-08-27T00:00:01.000Z'), replyToMessageId: null },
    ]);
    const prisma = { chatConversation: { findUnique: jest.fn().mockResolvedValue(row) }, chatMessage: { findMany }, chatUserBlock: { findUnique: jest.fn().mockResolvedValue(null) }, userChatRestriction: { findUnique: jest.fn().mockResolvedValue(null) } };
    const instance = serviceWithPrisma(prisma);
    const internals = instance as unknown as { summary: jest.Mock };
    internals.summary = jest.fn().mockResolvedValue({ id: conversationId, unreadCount: 0 });
    const page = await instance.messages(userA, conversationId, { beforeSequence: 3, limit: 2 });
    expect(page.items.map((item) => item.sequence)).toEqual([1, 2]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { sequence: 'desc' }, take: 3 }));
  });

  it('derives the reported participant, converges duplicate case reports, and enforces report limits', async () => {
    const conversation = { id: conversationId, participantLowUserId: userA, participantHighUserId: userB, memberships: [{ userId: userA }, { userId: userB }] };
    const reportCreate = jest.fn().mockResolvedValue({ id: 'report-1', chatConversationId: conversationId, chatMessageId: null, reasonCode: 'SPAM', targetSnapshot: { reasonCode: 'SPAM' }, status: 'SUBMITTED', createdAt: new Date('2026-08-27T00:00:00.000Z') });
    const tx = {
      userReport: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), create: reportCreate },
      $executeRaw: jest.fn(),
      reportRateLimitEvent: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
      moderationCase: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }), update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx)) };
    const instance = serviceWithPrisma(prisma);
    const internals = instance as unknown as { conversationFor: jest.Mock };
    internals.conversationFor = jest.fn().mockResolvedValue(conversation);
    await expect(instance.report(userA, { conversationId, reasonCode: 'SPAM' }, '00000000-0000-4000-8000-000000000014')).resolves.toMatchObject({ reasonCode: 'SPAM' });
    expect(reportCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reportedUserId: userB }) }));
    expect(tx.moderationCase.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'case-1' } }));

    tx.reportRateLimitEvent.count.mockResolvedValueOnce(20).mockResolvedValueOnce(0);
    await expect(instance.report(userA, { conversationId, reasonCode: 'SPAM' }, '00000000-0000-4000-8000-000000000015')).rejects.toMatchObject({ code: 'chat-rate-limited' });
    expect(reportCreate).toHaveBeenCalledTimes(1);
  });

  it('does not disclose or persist a report submitted by a non-participant', async () => {
    const prisma = {
      chatConversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: conversationId,
          participantLowUserId: userA,
          participantHighUserId: userB,
          memberships: [{ userId: userB }],
        }),
      },
      $transaction: jest.fn(),
    };
    await expect(
      serviceWithPrisma(prisma).report(
        userA,
        { conversationId, reasonCode: 'SPAM' },
        '00000000-0000-4000-8000-000000000117',
      ),
    ).rejects.toMatchObject({ code: 'chat-forbidden' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a live session for attention and clears the exact client lease', async () => {
    const upsert = jest.fn();
    const deleteMany = jest.fn();
    const prisma = { chatAttentionLease: { upsert, deleteMany } };
    const auth = { isSessionActive: jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true) };
    const instance = new ChatService(prisma as unknown as PrismaService, {} as unknown as ChatTicketService, {} as unknown as ChatOutboxDispatcher, { ticketTtlSeconds: 60, presenceLeaseSeconds: 45, outboxBatch: 50, messageRatePerMinute: 30, outboxReadinessMaxAgeSeconds: 60 }, new ChatPresenceService(), auth as never);
    const internals = instance as unknown as { conversationFor: jest.Mock };
    internals.conversationFor = jest.fn().mockResolvedValue({ id: conversationId });
    const sessionId = '00000000-0000-4000-8000-000000000016';
    await expect(instance.attention(userA, sessionId, conversationId, { clientInstanceId: 'browser-1', engagedAtNewestRegion: true })).rejects.toMatchObject({ code: 'chat-attention-forbidden' });
    await expect(instance.attention(userA, sessionId, conversationId, { clientInstanceId: 'browser-1', engagedAtNewestRegion: true })).resolves.toMatchObject({ clientInstanceId: 'browser-1', expiresAt: expect.any(String) });
    await expect(instance.attention(userA, sessionId, conversationId, { clientInstanceId: 'browser-1', engagedAtNewestRegion: false })).resolves.toMatchObject({ expiresAt: null });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: userA, sessionId, clientInstanceId: 'browser-1', conversationId } });
  });
});
