import { createHash, randomUUID } from 'node:crypto';

import {
  CHAT_DEFAULT_LIMIT,
  CHAT_MAX_LIMIT,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_VERSION,
  type ChatConversationListResponse,
  type ChatConversationSummary,
  type ChatMessagePage,
  type ChatParticipant,
  type ChatTargetResponse,
  type MarkChatReadResponse,
  type SendChatMessageResponse,
  type ChatUnreadCountResponse,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { ShopOnboardingStatus, ShopStatus, UserStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ChatError } from './chat.errors';
import { ChatOutboxDispatcher, ChatPresenceService, ChatTicketService } from './chat.realtime';
import { CHAT_CONFIG, type ChatConfig } from './chat.config';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cursorEncode = (value: { at: string; id: string }) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const cursorDecode = (value: string): { at: string; id: string } | null => {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    return typeof parsed.at === 'string' && typeof parsed.id === 'string'
      ? { at: parsed.at, id: parsed.id }
      : null;
  } catch {
    return null;
  }
};
const chatParticipantSelect = {
  id: true,
  displayName: true,
  status: true,
  deletedAt: true,
  shop: { select: { name: true, deletedAt: true, status: true, onboardingStatus: true } },
} satisfies Prisma.UserSelect;
const chatConversationParticipants = {
  participantLow: { select: chatParticipantSelect },
  participantHigh: { select: chatParticipantSelect },
} satisfies Prisma.ChatConversationInclude;
type ChatShopLabel = {
  name: string;
  deletedAt: Date | null;
  status: ShopStatus;
  onboardingStatus: ShopOnboardingStatus;
};
type ChatRow = {
  id: string;
  participantLowUserId: string;
  participantHighUserId: string;
  participantLow: {
    id: string;
    displayName: string;
    status: UserStatus;
    deletedAt: Date | null;
    shop: ChatShopLabel | null;
  };
  participantHigh: {
    id: string;
    displayName: string;
    status: UserStatus;
    deletedAt: Date | null;
    shop: ChatShopLabel | null;
  };
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  updatedAt: Date;
  lastMessageSequence: number;
  memberships?: Array<{ userId: string; unreadCount: number; lastReadSequence: number }>;
};

type ChatMessageRow = {
  id: string;
  conversationId: string;
  sequence: number;
  senderUserId: string;
  clientMessageId: string;
  content: string;
  createdAt: Date;
};

@Injectable()
export class ChatService {
  private readonly rate = new Map<string, number[]>();
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChatTicketService) private readonly tickets: ChatTicketService,
    @Inject(ChatOutboxDispatcher) private readonly outbox: ChatOutboxDispatcher,
    @Inject(CHAT_CONFIG) private readonly config: ChatConfig,
    @Inject(ChatPresenceService) private readonly presence: ChatPresenceService,
  ) {}

  private consumeRate(userId: string, source = 'unknown'): void {
    const now = Date.now();
    for (const key of [userId, `source:${source}`]) {
      const recent = (this.rate.get(key) ?? []).filter((at) => now - at < 60_000);
      if (recent.length >= this.config.messageRatePerMinute)
        throw new ChatError(
          'chat-rate-limited',
          429,
          'Please wait before sending another message.',
        );
      recent.push(now);
      this.rate.set(key, recent);
    }
  }

  private pair(a: string, b: string): [string, string] {
    if (a === b)
      throw new ChatError('chat-self-conversation', 409, 'You cannot message your own shop.');
    return a < b ? [a, b] : [b, a];
  }

  private participant(
    user: { id: string; displayName: string },
    presence: 'ACTIVE' | 'INACTIVE' = 'INACTIVE',
  ): ChatParticipant {
    return { userId: user.id, displayName: user.displayName, avatarUrl: null, presence };
  }

  /**
   * `isRead` is the read state from the sender's point of view. The sender's
   * own membership is advanced as soon as a message is sent, so using that
   * watermark would incorrectly report every outgoing message as read. For an
   * outgoing message we therefore use the other participant's watermark; for
   * an incoming message we use the current user's watermark.
   */
  private messageView(
    userId: string,
    memberships: Array<{ userId: string; lastReadSequence: number }>,
    message: ChatMessageRow,
    deliveryState: 'SENT' | 'PENDING' | 'FAILED' = 'SENT',
  ) {
    const currentMembership = memberships.find((membership) => membership.userId === userId);
    const otherMembership = memberships.find((membership) => membership.userId !== userId);
    const readerWatermark =
      message.senderUserId === userId
        ? (otherMembership?.lastReadSequence ?? 0)
        : (currentMembership?.lastReadSequence ?? 0);
    return {
      id: message.id,
      conversationId: message.conversationId,
      sequence: message.sequence,
      senderUserId: message.senderUserId,
      clientMessageId: message.clientMessageId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      deliveryState,
      isRead: message.sequence > 0 && message.sequence <= readerWatermark,
    };
  }

  private async summary(userId: string, row: ChatRow): Promise<ChatConversationSummary> {
    const other = row.participantLowUserId === userId ? row.participantHigh : row.participantLow;
    const membership =
      row.memberships?.find((m) => m.userId === userId) ??
      (await this.prisma.chatMembership.findUnique({
        where: { conversationId_userId: { conversationId: row.id, userId } },
      }));
    const canMessage =
      (other.status === undefined || other.status === UserStatus.ACTIVE) &&
      !other.deletedAt &&
      (!other.shop ||
        (!other.shop.deletedAt &&
          (other.shop.status === undefined || other.shop.status === ShopStatus.ACTIVE) &&
          (other.shop.onboardingStatus === undefined ||
            other.shop.onboardingStatus === ShopOnboardingStatus.APPROVED)));
    return {
      id: row.id,
      participant: this.participant(other, this.presence.state(other.id)),
      shopName: other.shop?.deletedAt ? null : (other.shop?.name ?? null),
      lastMessagePreview: row.lastMessagePreview ?? '',
      lastMessageAt: (row.lastMessageAt ?? row.updatedAt).toISOString(),
      unreadCount: membership?.unreadCount ?? 0,
      lastReadSequence: membership?.lastReadSequence ?? 0,
      lastMessageSequence: row.lastMessageSequence,
      canMessage,
    };
  }

  async target(userId: string, shopId: string): Promise<ChatTargetResponse> {
    if (!uuid.test(shopId))
      throw new ChatError('invalid-chat-request', 400, 'Invalid shop id.', ['shopId']);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        owner: { select: { id: true, displayName: true, status: true, deletedAt: true } },
      },
    });
    if (
      !shop ||
      shop.deletedAt ||
      shop.onboardingStatus !== ShopOnboardingStatus.APPROVED ||
      shop.status !== ShopStatus.ACTIVE ||
      !shop.owner
    )
      throw new ChatError('chat-target-unavailable', 404, 'This shop is not available for chat.');
    const isSelf = shop.owner.id === userId;
    let existingConversation: ChatConversationSummary | null = null;
    const ownerAvailable = shop.owner.status === UserStatus.ACTIVE && !shop.owner.deletedAt;
    if (!isSelf && ownerAvailable) {
      const [low, high] = this.pair(userId, shop.owner.id);
      const conversation = await this.prisma.chatConversation.findUnique({
        where: {
          participantLowUserId_participantHighUserId: {
            participantLowUserId: low,
            participantHighUserId: high,
          },
        },
        include: { ...chatConversationParticipants, memberships: true },
      });
      if (conversation?.memberships.some((membership) => membership.userId === userId))
        existingConversation = await this.summary(userId, conversation);
    }
    return {
      chatVersion: CHAT_VERSION,
      shopId: shop.id,
      shopName: shop.name,
      ownerUserId: shop.owner.id,
      ownerDisplayName: shop.owner.displayName,
      ownerAvatarUrl: null,
      isSelf,
      canMessage: !isSelf && ownerAvailable,
      existingConversation,
    };
  }

  async list(
    userId: string,
    input: { limit?: number; cursor?: string; query?: string },
  ): Promise<ChatConversationListResponse> {
    const limit = Math.min(Math.max(input.limit ?? CHAT_DEFAULT_LIMIT, 1), CHAT_MAX_LIMIT);
    const cursor = input.cursor ? cursorDecode(input.cursor) : null;
    if (input.cursor && (!cursor || !Number.isFinite(Date.parse(cursor.at))))
      throw new ChatError('invalid-chat-request', 400, 'Invalid cursor.', ['cursor']);
    const memberships = await this.prisma.chatMembership.findMany({
      where: {
        userId,
        ...(input.query?.trim()
          ? {
              conversation: {
                OR: [
                  {
                    participantLow: {
                      displayName: { contains: input.query.trim(), mode: 'insensitive' },
                    },
                  },
                  {
                    participantHigh: {
                      displayName: { contains: input.query.trim(), mode: 'insensitive' },
                    },
                  },
                ],
              },
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { conversation: { lastMessageAt: { lt: new Date(cursor.at) } } },
                { conversation: { lastMessageAt: new Date(cursor.at), id: { lt: cursor.id } } },
              ],
            }
          : {}),
      },
      include: {
        conversation: {
          include: { ...chatConversationParticipants, memberships: { where: { userId } } },
        },
      },
      orderBy: [{ conversation: { lastMessageAt: 'desc' } }, { conversation: { id: 'desc' } }],
      take: limit + 1,
    });
    const hasMore = memberships.length > limit;
    const items = await Promise.all(
      memberships.slice(0, limit).map((m) => this.summary(userId, m.conversation)),
    );
    const last = memberships[limit - 1]?.conversation;
    const unread =
      (
        await this.prisma.chatMembership.aggregate({
          where: { userId },
          _sum: { unreadCount: true },
        })
      )._sum.unreadCount ?? 0;
    return {
      chatVersion: CHAT_VERSION,
      items,
      nextCursor:
        hasMore && last?.lastMessageAt
          ? cursorEncode({ at: last.lastMessageAt.toISOString(), id: last.id })
          : null,
      unreadCount: unread,
    };
  }

  async unreadCount(userId: string): Promise<ChatUnreadCountResponse> {
    const result = await this.prisma.chatMembership.aggregate({
      where: { userId },
      _sum: { unreadCount: true },
    });
    return { chatVersion: CHAT_VERSION, unreadCount: result._sum.unreadCount ?? 0 };
  }

  private async conversationFor(userId: string, id: string) {
    const row = await this.prisma.chatConversation.findUnique({
      where: { id },
      include: { ...chatConversationParticipants, memberships: true },
    });
    if (!row || !row.memberships.some((membership) => membership.userId === userId))
      throw new ChatError('chat-forbidden', 403, 'You are not a participant in this conversation.');
    return row;
  }

  async messages(
    userId: string,
    id: string,
    input: { limit?: number; beforeSequence?: number; afterSequence?: number },
  ): Promise<ChatMessagePage> {
    if (!uuid.test(id))
      throw new ChatError('invalid-chat-request', 400, 'Invalid conversation id.', [
        'conversationId',
      ]);
    if (input.beforeSequence && input.afterSequence)
      throw new ChatError('invalid-chat-request', 400, 'Use only one message cursor.', [
        'beforeSequence',
        'afterSequence',
      ]);
    const conversation = await this.conversationFor(userId, id);
    const limit = Math.min(Math.max(input.limit ?? CHAT_DEFAULT_LIMIT, 1), CHAT_MAX_LIMIT);
    const where: { conversationId: string; sequence?: { lt?: number; gt?: number } } = {
      conversationId: id,
    };
    if (input.beforeSequence) where.sequence = { lt: input.beforeSequence };
    if (input.afterSequence) where.sequence = { gt: input.afterSequence };
    const items = await this.prisma.chatMessage.findMany({
      where,
      orderBy: { sequence: input.afterSequence ? 'asc' : 'desc' },
      take: limit + 1,
    });
    const hasMore = items.length > limit;
    const selected = items.slice(0, limit).sort((a, b) => a.sequence - b.sequence);
    const membership = conversation.memberships.find((item) => item.userId === userId);
    if (!membership)
      throw new ChatError('chat-forbidden', 403, 'You are not a participant in this conversation.');
    return {
      chatVersion: CHAT_VERSION,
      conversation: await this.summary(userId, conversation),
      items: selected.map((m) => this.messageView(userId, conversation.memberships, m)),
      hasMoreBefore: input.afterSequence ? false : hasMore,
      hasMoreAfter: input.afterSequence ? hasMore : false,
      unreadCount: membership.unreadCount,
    };
  }

  async send(
    userId: string,
    input: { recipientUserId: string; clientMessageId: string; content: string },
    requestSource = 'unknown',
  ): Promise<SendChatMessageResponse> {
    this.consumeRate(userId, requestSource);
    const content = input.content.trim();
    if (
      !uuid.test(input.recipientUserId) ||
      !uuid.test(input.clientMessageId) ||
      !content ||
      content.length > CHAT_MESSAGE_MAX_LENGTH
    )
      throw new ChatError('invalid-chat-request', 400, 'Invalid chat message.', [
        'recipientUserId',
        'clientMessageId',
        'content',
      ]);
    const recipientUser = await this.prisma.user.findUnique({
      where: { id: input.recipientUserId },
      select: {
        id: true,
        status: true,
        deletedAt: true,
        shop: { select: { status: true, onboardingStatus: true, deletedAt: true } },
      },
    });
    if (!recipientUser || recipientUser.deletedAt || recipientUser.status !== UserStatus.ACTIVE)
      throw new ChatError('chat-target-unavailable', 404, 'This chat target is not available.');
    if (
      recipientUser.shop &&
      (recipientUser.shop.deletedAt ||
        recipientUser.shop.status !== ShopStatus.ACTIVE ||
        recipientUser.shop.onboardingStatus !== ShopOnboardingStatus.APPROVED)
    )
      throw new ChatError('chat-forbidden', 403, 'You cannot continue this conversation.');
    const [low, high] = this.pair(userId, input.recipientUserId);
    const requestDigest = createHash('sha256')
      .update(
        JSON.stringify({
          recipientUserId: input.recipientUserId,
          clientMessageId: input.clientMessageId,
          content,
        }),
      )
      .digest('hex');
    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize first-message materialization for this unordered pair. A
      // unique-constraint exception aborts a PostgreSQL transaction and cannot
      // be recovered inside the same Prisma callback, so the transaction-scoped
      // advisory lock keeps the read/create path race-free without relying on
      // an aborted transaction followed by a second query.
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${low}:${high}`}, 0))`,
      );
      let conversation = await tx.chatConversation.findUnique({
        where: {
          participantLowUserId_participantHighUserId: {
            participantLowUserId: low,
            participantHighUserId: high,
          },
        },
        include: { ...chatConversationParticipants, memberships: true },
      });
      if (!conversation) {
        conversation = await tx.chatConversation.create({
          data: {
            id: randomUUID(),
            participantLowUserId: low,
            participantHighUserId: high,
            memberships: { create: [{ userId: low }, { userId: high }] },
          },
          include: { ...chatConversationParticipants, memberships: true },
        });
      }
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM chat_user_conversations WHERE id = ${conversation.id} FOR UPDATE`,
      );
      conversation = await tx.chatConversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: { ...chatConversationParticipants, memberships: true },
      });
      const replay = await tx.chatMessage.findUnique({
        where: {
          conversationId_senderUserId_clientMessageId: {
            conversationId: conversation.id,
            senderUserId: userId,
            clientMessageId: input.clientMessageId,
          },
        },
      });
      if (replay) {
        if (replay.requestDigest !== requestDigest)
          throw new ChatError(
            'chat-message-idempotency-conflict',
            409,
            'This message id was already used with different content.',
          );
        return { conversation, message: replay };
      }
      const sequence = conversation.nextSequence;
      const message = await tx.chatMessage.create({
        data: {
          id: randomUUID(),
          conversationId: conversation.id,
          sequence,
          senderUserId: userId,
          clientMessageId: input.clientMessageId,
          requestDigest,
          content,
        },
      });
      await tx.chatConversation.update({
        where: { id: conversation.id },
        data: {
          nextSequence: { increment: 1 },
          lastMessageSequence: sequence,
          lastMessagePreview: content,
          lastMessageAt: message.createdAt,
        },
      });
      await tx.chatMembership.update({
        where: { conversationId_userId: { conversationId: conversation.id, userId } },
        data: { lastReadSequence: sequence, lastReadAt: message.createdAt, unreadCount: 0 },
      });
      await tx.chatMembership.update({
        where: {
          conversationId_userId: { conversationId: conversation.id, userId: input.recipientUserId },
        },
        data: { unreadCount: { increment: 1 } },
      });
      const senderMembership = await tx.chatMembership.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId: conversation.id, userId } },
      });
      const recipientMembership = await tx.chatMembership.findUniqueOrThrow({
        where: {
          conversationId_userId: { conversationId: conversation.id, userId: input.recipientUserId },
        },
      });
      const memberships = [senderMembership, recipientMembership];
      const recipientUnreadTotal =
        (
          await tx.chatMembership.aggregate({
            where: { userId: input.recipientUserId },
            _sum: { unreadCount: true },
          })
        )._sum.unreadCount ?? 0;
      const senderUnreadTotal =
        (await tx.chatMembership.aggregate({ where: { userId }, _sum: { unreadCount: true } }))._sum
          .unreadCount ?? 0;
      const projectedConversation = {
        ...conversation,
        memberships,
        lastMessagePreview: content,
        lastMessageAt: message.createdAt,
        lastMessageSequence: sequence,
      };
      // Message projections must use the same live presence calculation as
      // REST summaries. A hard-coded INACTIVE value makes both contact rows
      // flip offline as soon as the first message materializes the pair.
      const recipientConversation = await this.summary(
        input.recipientUserId,
        projectedConversation,
      );
      const senderConversation = await this.summary(userId, projectedConversation);
      const recipientPayload = {
        eventVersion: CHAT_VERSION,
        type: 'chat.message.accepted',
        message: this.messageView(input.recipientUserId, memberships, message),
        conversation: recipientConversation,
        unreadTotal: recipientUnreadTotal,
      };
      const senderPayload = {
        eventVersion: CHAT_VERSION,
        type: 'chat.message.accepted',
        message: this.messageView(userId, memberships, message),
        conversation: senderConversation,
        unreadTotal: senderUnreadTotal,
      };
      await tx.chatOutbox.createMany({
        data: [
          {
            id: randomUUID(),
            conversationId: conversation.id,
            messageId: message.id,
            recipientUserId: input.recipientUserId,
            eventType: 'chat.message.accepted',
            payload: recipientPayload as unknown as Prisma.InputJsonValue,
            deduplicationKey: `message:${message.id}:${input.recipientUserId}`,
          },
          {
            id: randomUUID(),
            conversationId: conversation.id,
            messageId: message.id,
            recipientUserId: userId,
            eventType: 'chat.message.accepted',
            payload: senderPayload as unknown as Prisma.InputJsonValue,
            deduplicationKey: `message:${message.id}:${userId}`,
          },
        ],
      });
      return {
        conversation: await tx.chatConversation.findUniqueOrThrow({
          where: { id: conversation.id },
          include: { ...chatConversationParticipants, memberships: true },
        }),
        message,
      };
    });
    void this.outbox.flush();
    const summary = await this.summary(userId, result.conversation);
    return {
      chatVersion: CHAT_VERSION,
      conversation: summary,
      message: this.messageView(userId, result.conversation.memberships, result.message),
    };
  }

  async markRead(
    userId: string,
    id: string,
    throughSequence: number,
  ): Promise<MarkChatReadResponse> {
    if (!uuid.test(id))
      throw new ChatError('invalid-chat-request', 400, 'Invalid conversation id.', [
        'conversationId',
      ]);
    const conversation = await this.conversationFor(userId, id);
    const target = Math.min(Math.max(throughSequence, 0), conversation.lastMessageSequence);
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const membership = await tx.chatMembership.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId: id, userId } },
      });
      const next = Math.max(membership.lastReadSequence, target);
      const unread = await tx.chatMessage.count({
        where: { conversationId: id, sequence: { gt: next }, senderUserId: { not: userId } },
      });
      const updated = await tx.chatMembership.update({
        where: { conversationId_userId: { conversationId: id, userId } },
        data: { lastReadSequence: next, unreadCount: unread, lastReadAt: now },
      });
      const recipientUserId =
        conversation.participantLowUserId === userId
          ? conversation.participantHighUserId
          : conversation.participantLowUserId;
      const unreadTotal =
        (await tx.chatMembership.aggregate({ where: { userId }, _sum: { unreadCount: true } }))._sum
          .unreadCount ?? 0;
      const readPayload = {
        eventVersion: CHAT_VERSION,
        type: 'chat.read.updated',
        conversationId: id,
        userId,
        throughSequence: updated.lastReadSequence,
        unreadCount: updated.unreadCount,
        unreadTotal,
      };
      for (const [eventRecipient, suffix] of [
        [recipientUserId, ''],
        [userId, ':self'],
      ] as const) {
        const deduplicationKey = `read:${id}:${userId}:${updated.lastReadSequence}${suffix}`;
        await tx.chatOutbox.upsert({
          where: { deduplicationKey },
          create: {
            id: randomUUID(),
            conversationId: id,
            recipientUserId: eventRecipient,
            eventType: 'chat.read.updated',
            payload: readPayload,
            deduplicationKey,
          },
          update: {},
        });
      }
      return updated;
    });
    const total = await this.unreadCount(userId);
    void this.outbox.flush();
    return {
      chatVersion: CHAT_VERSION,
      conversationId: id,
      throughSequence: updated.lastReadSequence,
      unreadCount: updated.unreadCount,
      unreadTotal: total.unreadCount,
      readAt: now.toISOString(),
    };
  }

  issueTicket(userId: string, sessionId: string) {
    const issued = this.tickets.issue(userId, sessionId, this.config.ticketTtlSeconds);
    return {
      chatVersion: CHAT_VERSION,
      ticket: issued.ticket,
      expiresAt: issued.expiresAt.toISOString(),
    };
  }
}
