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
    {} as unknown as ChatOutboxDispatcher,
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
    {} as unknown as ChatOutboxDispatcher,
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
});
