import { ChatService } from './chat.service';
import { ChatError } from './chat.errors';
import type { PrismaService } from '../prisma/prisma.service';
import { ChatPresenceService } from './chat.realtime';
import type { ChatOutboxDispatcher, ChatTicketService } from './chat.realtime';

const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';

function service(presence = new ChatPresenceService()) {
  return new ChatService(
    {} as unknown as PrismaService,
    {} as unknown as ChatTicketService,
    {} as unknown as ChatOutboxDispatcher,
    { ticketTtlSeconds: 60, presenceLeaseSeconds: 45, outboxBatch: 50, messageRatePerMinute: 30 },
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
    await expect(service().send(userA, { recipientUserId: userB, clientMessageId: userA, content: '   ' })).rejects.toBeInstanceOf(ChatError);
  });

  it('derives read state from the other participant for outgoing messages', () => {
    const instance = service() as unknown as {
      messageView(userId: string, memberships: Array<{ userId: string; lastReadSequence: number }>, message: { id: string; conversationId: string; sequence: number; senderUserId: string; clientMessageId: string; content: string; createdAt: Date }): { isRead: boolean };
    };
    const outgoing = { id: userA, conversationId: userB, sequence: 2, senderUserId: userA, clientMessageId: userA, content: 'hello', createdAt: new Date('2026-08-27T00:00:00.000Z') };
    const memberships = [{ userId: userA, lastReadSequence: 2 }, { userId: userB, lastReadSequence: 0 }];

    expect(instance.messageView(userA, memberships, outgoing).isRead).toBe(false);
    expect(instance.messageView(userA, memberships.map((membership) => membership.userId === userB ? { ...membership, lastReadSequence: 2 } : membership), outgoing).isRead).toBe(true);
  });

  it('uses the other participant live presence in conversation projections', async () => {
    const presence = new ChatPresenceService();
    presence.connect(userB);
    const instance = service(presence) as unknown as {
      summary(userId: string, row: unknown): Promise<{ participant: { userId: string; presence: string } }>;
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
});
