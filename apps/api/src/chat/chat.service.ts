import { createHash, createHmac, randomUUID } from 'node:crypto';

import {
  CHAT_DEFAULT_LIMIT,
  CHAT_MAX_LIMIT,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_REPLY_PREVIEW_MAX_LENGTH,
  CHAT_ATTENTION_LEASE_SECONDS,
  CHAT_VERSION,
  type ChatConversationListResponse,
  type ChatConversationSummary,
  type ChatMessagePage,
  type ChatParticipant,
  type ChatTargetResponse,
  type MarkChatReadResponse,
  type SendChatMessageResponse,
  type ChatUnreadCountResponse,
  type ChatConversationActionResponse,
  type ChatAttentionResponse,
  type ChatReportReceipt,
} from '@shopee-clone/contracts';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  ChatRateLimitScope,
  ShopOnboardingStatus,
  ShopStatus,
  UserStatus,
  NotificationCategory,
  NotificationType,
  ReportStatus,
  ReportTargetType,
} from '../generated/prisma/enums';
import { AuthService } from '../auth/auth.service';
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
const chatReportReasonCodes = new Set([
  'INAPPROPRIATE_CONTENT',
  'HARASSMENT',
  'SPAM',
  'SCAM',
  'OTHER',
]);
const reportReasonForReceipt = (row: {
  reasonCode: string;
  targetSnapshot: unknown;
}): ChatReportReceipt['reasonCode'] => {
  if (typeof row.targetSnapshot === 'object' && row.targetSnapshot !== null) {
    const snapshotReason = (row.targetSnapshot as Record<string, unknown>).reasonCode;
    if (typeof snapshotReason === 'string' && chatReportReasonCodes.has(snapshotReason))
      return snapshotReason as ChatReportReceipt['reasonCode'];
  }
  if (row.reasonCode === 'ABUSIVE_BEHAVIOR') return 'HARASSMENT';
  if (row.reasonCode === 'FRAUD_SCAM') return 'SCAM';
  return row.reasonCode as ChatReportReceipt['reasonCode'];
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
  memberships?: Array<{
    userId: string;
    unreadCount: number;
    lastReadSequence: number;
    notificationsMutedAt?: Date | null;
  }>;
};

type ChatMessageRow = {
  id: string;
  conversationId: string;
  sequence: number;
  senderUserId: string;
  clientMessageId: string;
  content: string;
  createdAt: Date;
  replyToMessageId: string | null;
  replyTo?: {
    id: string;
    sequence: number;
    senderUserId: string;
    content: string;
    sender: { displayName: string };
  } | null;
};

type SendTransactionResult = {
  conversation: ChatRow & { memberships: NonNullable<ChatRow['memberships']> };
  message: ChatMessageRow;
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChatTicketService) private readonly tickets: ChatTicketService,
    @Inject(ChatOutboxDispatcher) private readonly outbox: ChatOutboxDispatcher,
    @Inject(CHAT_CONFIG) private readonly config: ChatConfig,
    @Inject(ChatPresenceService) private readonly presence: ChatPresenceService,
    @Optional() @Inject(AuthService) private readonly auth: AuthService = {
      isSessionActive: async () => true,
    } as unknown as AuthService,
  ) {}

  private sourceHash(source: string): string {
    const secret =
      process.env.CHAT_RATE_LIMIT_HMAC_SECRET ??
      (process.env.NODE_ENV === 'production' ? undefined : 'chat-development-hmac-secret');
    if (!secret) throw new ChatError('chat-unavailable', 503, 'Chat rate limiting is not configured.');
    return createHmac('sha256', secret).update(source || 'unknown').digest('hex');
  }

  private accountHash(userId: string): string {
    return createHash('sha256').update(`chat-account:${userId}`).digest('hex');
  }

  /**
   * Keep rate-limit telemetry aggregate-only. In particular, never include a
   * user id, source address, subject digest, or message content in logs.
   */
  private logRateOutcome(
    outcome: 'accepted' | 'limited' | 'unavailable',
    retryAfterSeconds?: number,
  ): void {
    const retryClass =
      retryAfterSeconds === undefined
        ? undefined
        : retryAfterSeconds <= 5
          ? 'short'
          : retryAfterSeconds <= 30
            ? 'medium'
            : 'long';
    this.logger.debug(
      JSON.stringify({
        event: 'chat_send_rate',
        outcome,
        ...(retryClass ? { retryClass } : {}),
      }),
    );
  }

  /** Persist a rejected attempt after the allowance transaction rolls back. */
  private async recordRejectedRateAttempt(userId: string, source: string): Promise<void> {
    try {
      const attemptedAt = new Date();
      await this.prisma.chatRateLimitEvent.createMany({
        data: [
          {
            id: randomUUID(),
            scope: ChatRateLimitScope.ACCOUNT,
            subjectHash: this.accountHash(userId),
            userId,
            accepted: false,
            attemptedAt,
          },
          {
            id: randomUUID(),
            scope: ChatRateLimitScope.SOURCE,
            subjectHash: this.sourceHash(source),
            userId: null,
            accepted: false,
            attemptedAt,
          },
        ],
      });
    } catch {
      // Telemetry must never hide or replace the authoritative 429 response.
    }
  }

  private async enforceSharedRate(
    tx: Prisma.TransactionClient,
    userId: string,
    source: string,
    now: Date,
  ): Promise<void> {
    const subjects = [
      { scope: ChatRateLimitScope.ACCOUNT, hash: this.accountHash(userId), userId },
      { scope: ChatRateLimitScope.SOURCE, hash: this.sourceHash(source), userId: null },
    ] as const;
    for (const subject of subjects) {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${subject.scope}:${subject.hash}`}, 0))`,
      );
      const since = new Date(now.getTime() - 60_000);
      const recent = await tx.chatRateLimitEvent.findMany({
        where: {
          scope: subject.scope,
          subjectHash: subject.hash,
          accepted: true,
          attemptedAt: { gte: since },
        },
        orderBy: { attemptedAt: 'asc' },
        select: { attemptedAt: true },
      });
      if (recent.length >= this.config.messageRatePerMinute) {
        const oldest = recent[0]?.attemptedAt ?? now;
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((oldest.getTime() + 60_000 - now.getTime()) / 1_000),
        );
        throw new ChatError(
          'chat-rate-limited',
          429,
          'Please wait before sending another message.',
          [],
          retryAfterSeconds,
        );
      }
      await tx.chatRateLimitEvent.create({
        data: {
          id: randomUUID(),
          scope: subject.scope,
          subjectHash: subject.hash,
          userId: subject.userId,
          accepted: true,
          attemptedAt: now,
        },
      });
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
    const replyTo = message.replyTo;
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
      ...(replyTo
        ? {
            replyTo: {
              messageId: replyTo.id,
              sequence: replyTo.sequence,
              senderUserId: replyTo.senderUserId,
              senderLabel: replyTo.sender.displayName,
              preview: replyTo.content.slice(0, CHAT_REPLY_PREVIEW_MAX_LENGTH),
            },
          }
        : message.replyToMessageId
          ? { replyTo: null }
          : {}),
    };
  }

  private async blockExists(blockerUserId: string, blockedUserId: string): Promise<boolean> {
    if (!this.prisma.chatUserBlock?.findUnique) return false;
    return Boolean(
      await this.prisma.chatUserBlock.findUnique({
        where: { blockerUserId_blockedUserId: { blockerUserId, blockedUserId } },
        select: { id: true },
      }),
    );
  }

  private async activeRestriction(userId: string, now = new Date()): Promise<boolean> {
    if (!this.prisma.userChatRestriction?.findUnique) return false;
    const restriction = await this.prisma.userChatRestriction.findUnique({ where: { userId } });
    return Boolean(
      restriction &&
        !restriction.restoredAt &&
        (restriction.restrictedUntil === null || restriction.restrictedUntil > now),
    );
  }

  private async summary(userId: string, row: ChatRow): Promise<ChatConversationSummary> {
    const other = row.participantLowUserId === userId ? row.participantHigh : row.participantLow;
    const membership =
      row.memberships?.find((m) => m.userId === userId) ??
      (await this.prisma.chatMembership.findUnique({
        where: { conversationId_userId: { conversationId: row.id, userId } },
      }));
    const blockedByMe = await this.blockExists(userId, other.id);
    const blockedEither =
      blockedByMe || (await this.blockExists(other.id, userId));
    const restricted =
      (await this.activeRestriction(userId)) || (await this.activeRestriction(other.id));
    const canMessage =
      (other.status === undefined || other.status === UserStatus.ACTIVE) &&
      !other.deletedAt &&
      !blockedEither &&
      !restricted &&
      (!other.shop ||
        (!other.shop.deletedAt &&
          (other.shop.status === undefined || other.shop.status === ShopStatus.ACTIVE) &&
          (other.shop.onboardingStatus === undefined ||
            other.shop.onboardingStatus === ShopOnboardingStatus.APPROVED)));
    return {
      id: row.id,
      participant: this.participant(other, blockedEither ? 'INACTIVE' : this.presence.state(other.id)),
      shopName: other.shop?.deletedAt ? null : (other.shop?.name ?? null),
      lastMessagePreview: row.lastMessagePreview ?? '',
      lastMessageAt: (row.lastMessageAt ?? row.updatedAt).toISOString(),
      unreadCount: membership?.unreadCount ?? 0,
      lastReadSequence: membership?.lastReadSequence ?? 0,
      lastMessageSequence: row.lastMessageSequence,
      canMessage,
      notificationsMuted: Boolean(membership?.notificationsMutedAt),
      blockedByMe,
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
      include: {
        replyTo: {
          select: {
            id: true,
            sequence: true,
            senderUserId: true,
            content: true,
            sender: { select: { displayName: true } },
          },
        },
      },
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
    input: {
      recipientUserId: string;
      clientMessageId: string;
      content: string;
      replyToMessageId?: string | null;
    },
    requestSource = 'unknown',
  ): Promise<SendChatMessageResponse> {
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
    if (input.replyToMessageId !== undefined && input.replyToMessageId !== null && !uuid.test(input.replyToMessageId))
      throw new ChatError('chat-reply-invalid', 400, 'Invalid reply target.', ['replyToMessageId']);
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
          replyToMessageId: input.replyToMessageId ?? null,
        }),
      )
      .digest('hex');
    let result: SendTransactionResult;
    try {
      result = await this.prisma.$transaction(async (tx) => {
      // Serialize first-message materialization for this unordered pair. A
      // unique-constraint exception aborts a PostgreSQL transaction and cannot
      // be recovered inside the same Prisma callback, so the transaction-scoped
      // advisory lock keeps the read/create path race-free without relying on
      // an aborted transaction followed by a second query.
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${low}:${high}`}, 0))`,
      );
      const now = new Date();
      const earlyBlock = await tx.chatUserBlock.findFirst({
        where: {
          OR: [
            { blockerUserId: userId, blockedUserId: input.recipientUserId },
            { blockerUserId: input.recipientUserId, blockedUserId: userId },
          ],
        },
        select: { id: true },
      });
      if (earlyBlock)
        throw new ChatError('chat-forbidden', 403, 'You cannot continue this conversation.');
      const earlyRestriction = await tx.userChatRestriction.findUnique({ where: { userId } });
      if (
        earlyRestriction &&
        !earlyRestriction.restoredAt &&
        (earlyRestriction.restrictedUntil === null || earlyRestriction.restrictedUntil > now)
      )
        throw new ChatError('chat-restriction-active', 403, 'You cannot send messages right now.');
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
        include: {
          replyTo: {
            select: {
              id: true,
              sequence: true,
              senderUserId: true,
              content: true,
              sender: { select: { displayName: true } },
            },
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
      const blocked = await tx.chatUserBlock.findFirst({
        where: {
          OR: [
            { blockerUserId: userId, blockedUserId: input.recipientUserId },
            { blockerUserId: input.recipientUserId, blockedUserId: userId },
          ],
        },
        select: { id: true },
      });
      if (blocked)
        throw new ChatError('chat-forbidden', 403, 'You cannot continue this conversation.');
      const restriction = await tx.userChatRestriction.findUnique({ where: { userId } });
      if (
        restriction &&
        !restriction.restoredAt &&
        (restriction.restrictedUntil === null || restriction.restrictedUntil > now)
      )
        throw new ChatError('chat-restriction-active', 403, 'You cannot send messages right now.');
      await this.enforceSharedRate(tx, userId, requestSource, now);
      const replyToMessageId: string | null = input.replyToMessageId ?? null;
      if (replyToMessageId) {
        const target = await tx.chatMessage.findFirst({
          where: { id: replyToMessageId, conversationId: conversation.id },
          select: {
            id: true,
            sequence: true,
            senderUserId: true,
            content: true,
            sender: { select: { displayName: true } },
          },
        });
        if (!target) throw new ChatError('chat-reply-invalid', 400, 'Invalid reply target.');
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
          replyToMessageId,
        },
      });
      const projectedMessage = await tx.chatMessage.findUniqueOrThrow({
        where: { id: message.id },
        include: {
          replyTo: {
            select: {
              id: true,
              sequence: true,
              senderUserId: true,
              content: true,
              sender: { select: { displayName: true } },
            },
          },
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
      const attention = await tx.chatAttentionLease.findFirst({
        where: {
          userId: input.recipientUserId,
          conversationId: conversation.id,
          atNewestRegion: true,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });
      const chatPreference = await tx.notificationPreference.findUnique({
        where: {
          userId_category_channel: {
            userId: input.recipientUserId,
            category: NotificationCategory.CHAT,
            channel: 'IN_APP',
          },
        },
        select: { enabled: true },
      });
      const sender =
        conversation.participantLowUserId === userId
          ? conversation.participantLow
          : conversation.participantHigh;
      const shouldNotify =
        !recipientMembership.notificationsMutedAt && !attention && chatPreference?.enabled !== false;
      if (shouldNotify) {
        const deduplicationKey = `chat:${input.recipientUserId}:${conversation.id}`;
        await tx.notification.upsert({
          where: { deduplicationKey },
          create: {
            id: randomUUID(),
            recipientId: input.recipientUserId,
            category: NotificationCategory.CHAT,
            type: NotificationType.CHAT_MESSAGE,
            title: `Tin nhắn mới từ ${sender.displayName}`.slice(0, 160),
            body: content.slice(0, 500) || 'Bạn có tin nhắn mới',
            metadata: {
              targetUrl: '/',
              thumbnailUrl: null,
              referenceId: conversation.id,
              amountMinor: null,
              currency: null,
              chat: {
                conversationId: conversation.id,
                unreadCount: recipientMembership.unreadCount,
                newestSequence: sequence,
                preview: content.slice(0, 500),
                avatarUrl: null,
                activityAt: message.createdAt.toISOString(),
              },
            },
            deduplicationKey,
            isRead: false,
            readAt: null,
            isArchived: false,
            activityAt: message.createdAt,
          },
          update: {
            title: `Tin nhắn mới từ ${sender.displayName}`.slice(0, 160),
            body: content.slice(0, 500) || 'Bạn có tin nhắn mới',
            metadata: {
              targetUrl: '/',
              thumbnailUrl: null,
              referenceId: conversation.id,
              amountMinor: null,
              currency: null,
              chat: {
                conversationId: conversation.id,
                unreadCount: recipientMembership.unreadCount,
                newestSequence: sequence,
                preview: content.slice(0, 500),
                avatarUrl: null,
                activityAt: message.createdAt.toISOString(),
              },
            },
            isRead: false,
            readAt: null,
            isArchived: false,
            activityAt: message.createdAt,
          },
        });
      }
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
        message: this.messageView(input.recipientUserId, memberships, projectedMessage),
        conversation: recipientConversation,
        unreadTotal: recipientUnreadTotal,
      };
      const senderPayload = {
        eventVersion: CHAT_VERSION,
        type: 'chat.message.accepted',
        message: this.messageView(userId, memberships, projectedMessage),
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
          ...(shouldNotify
            ? [
                {
                  id: randomUUID(),
                  conversationId: conversation.id,
                  recipientUserId: input.recipientUserId,
                  eventType: 'chat.notification.updated',
                  payload: {
                    eventVersion: CHAT_VERSION,
                    type: 'chat.notification.updated',
                    conversationId: conversation.id,
                    notificationUnreadCount: 1,
                  } as unknown as Prisma.InputJsonValue,
                  deduplicationKey: `notification:${message.id}:${input.recipientUserId}`,
                },
              ]
            : []),
        ],
      });
      return {
        conversation: await tx.chatConversation.findUniqueOrThrow({
          where: { id: conversation.id },
          include: { ...chatConversationParticipants, memberships: true },
        }),
        message: projectedMessage,
      };
      });
    } catch (error) {
      if (error instanceof ChatError) {
        if (error.code === 'chat-rate-limited') {
          await this.recordRejectedRateAttempt(userId, requestSource);
          this.logRateOutcome('limited', error.retryAfterSeconds);
        } else if (error.code === 'chat-unavailable') {
          this.logRateOutcome('unavailable');
        }
      }
      throw error;
    }
    this.logRateOutcome('accepted');
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
      await tx.notification.updateMany({
        where: {
          recipientId: userId,
          deduplicationKey: `chat:${userId}:${id}`,
          type: NotificationType.CHAT_MESSAGE,
          isArchived: false,
        },
        data: {
          isRead: unread === 0,
          readAt: unread === 0 ? now : null,
          metadata: {
            targetUrl: '/',
            thumbnailUrl: null,
            referenceId: id,
            amountMinor: null,
            currency: null,
            chat: {
              conversationId: id,
              unreadCount: unread,
              newestSequence: conversation.lastMessageSequence,
              preview: conversation.lastMessagePreview ?? '',
              avatarUrl: null,
              activityAt: conversation.lastMessageAt?.toISOString() ?? now.toISOString(),
            },
          },
        },
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

  private async actionResponse(
    userId: string,
    conversationId: string,
  ): Promise<ChatConversationActionResponse> {
    const conversation = await this.conversationFor(userId, conversationId);
    const summary = await this.summary(userId, conversation);
    return {
      chatVersion: CHAT_VERSION,
      conversationId,
      notificationsMuted: summary.notificationsMuted ?? false,
      blockedByMe: summary.blockedByMe ?? false,
      canMessage: summary.canMessage !== false,
    };
  }

  async setMute(userId: string, conversationId: string, muted: boolean): Promise<ChatConversationActionResponse> {
    if (!uuid.test(conversationId))
      throw new ChatError('invalid-chat-request', 400, 'Invalid conversation id.', ['conversationId']);
    await this.conversationFor(userId, conversationId);
    const changed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM chat_user_memberships WHERE conversation_id = ${conversationId} AND user_id = ${userId} FOR UPDATE`,
      );
      const membership = await tx.chatMembership.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId, userId } },
        select: { notificationsMutedAt: true },
      });
      if (Boolean(membership.notificationsMutedAt) === muted) return false;
      await tx.chatMembership.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { notificationsMutedAt: muted ? new Date() : null },
      });
      return true;
    });
    const conversation = await this.conversationFor(userId, conversationId);
    const summary = await this.summary(userId, conversation);
    if (changed) {
      const payload = {
        eventVersion: CHAT_VERSION,
        type: 'chat.safety.updated',
        conversation: summary,
      };
      await this.prisma.chatOutbox.create({
        data: {
          id: randomUUID(),
          conversationId,
          recipientUserId: userId,
          eventType: 'chat.safety.updated',
          payload: payload as unknown as Prisma.InputJsonValue,
          deduplicationKey: `safety:mute:${conversationId}:${userId}:${muted ? 'on' : 'off'}:${randomUUID()}`,
        },
      });
      void this.outbox.flush();
    }
    return {
      chatVersion: CHAT_VERSION,
      conversationId,
      notificationsMuted: muted,
      blockedByMe: summary.blockedByMe ?? false,
      canMessage: summary.canMessage !== false,
    };
  }

  async setBlock(userId: string, blockedUserId: string, blocked: boolean): Promise<ChatConversationActionResponse> {
    if (!uuid.test(blockedUserId) || userId === blockedUserId)
      throw new ChatError('chat-block-forbidden', 409, 'This block target is not available.');
    const [low, high] = this.pair(userId, blockedUserId);
    const conversation = await this.prisma.chatConversation.findUnique({
      where: {
        participantLowUserId_participantHighUserId: {
          participantLowUserId: low,
          participantHighUserId: high,
        },
      },
      select: { id: true },
    });
    if (!conversation)
      throw new ChatError('chat-block-forbidden', 403, 'This block target is not available.');
    const changed = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${low}:${high}`}, 0))`,
      );
      const existing = await tx.chatUserBlock.findUnique({
        where: { blockerUserId_blockedUserId: { blockerUserId: userId, blockedUserId } },
        select: { id: true },
      });
      if (Boolean(existing) === blocked) return false;
      if (blocked) {
        await tx.chatUserBlock.upsert({
          where: { blockerUserId_blockedUserId: { blockerUserId: userId, blockedUserId } },
          create: { id: randomUUID(), blockerUserId: userId, blockedUserId },
          update: {},
        });
        await tx.notification.updateMany({
          where: { recipientId: userId, deduplicationKey: `chat:${userId}:${conversation.id}` },
          data: { isRead: true, readAt: new Date() },
        });
      } else {
        await tx.chatUserBlock.deleteMany({ where: { blockerUserId: userId, blockedUserId } });
      }
      return true;
    });
    const result = await this.actionResponse(userId, conversation.id);
    const conversationRow = await this.conversationFor(userId, conversation.id);
    const otherUserId = conversationRow.participantLowUserId === userId
      ? conversationRow.participantHighUserId
      : conversationRow.participantLowUserId;
    const [selfSummary, otherSummary] = await Promise.all([
      this.summary(userId, conversationRow),
      this.summary(otherUserId, conversationRow),
    ]);
    if (changed) {
      await this.prisma.chatOutbox.createMany({
        data: [
          { id: randomUUID(), conversationId: conversation.id, recipientUserId: userId, eventType: 'chat.safety.updated', payload: { eventVersion: CHAT_VERSION, type: 'chat.safety.updated', conversation: selfSummary } as unknown as Prisma.InputJsonValue, deduplicationKey: `safety:block:${conversation.id}:${userId}:${blocked ? 'on' : 'off'}:${randomUUID()}` },
          { id: randomUUID(), conversationId: conversation.id, recipientUserId: otherUserId, eventType: 'chat.safety.updated', payload: { eventVersion: CHAT_VERSION, type: 'chat.safety.updated', conversation: otherSummary } as unknown as Prisma.InputJsonValue, deduplicationKey: `safety:block:${conversation.id}:${otherUserId}:${blocked ? 'on' : 'off'}:${randomUUID()}` },
        ],
      });
      void this.outbox.flush();
    }
    return result;
  }

  async attention(
    userId: string,
    sessionId: string,
    conversationId: string,
    input: { clientInstanceId: string; engagedAtNewestRegion: boolean },
  ): Promise<ChatAttentionResponse> {
    if (!uuid.test(conversationId) || !uuid.test(sessionId) || !/^[A-Za-z0-9._-]{1,80}$/.test(input.clientInstanceId))
      throw new ChatError('invalid-chat-request', 400, 'Invalid attention state.');
    if (!(await this.auth.isSessionActive(userId, sessionId)))
      throw new ChatError('chat-attention-forbidden', 403, 'Attention state is no longer valid.');
    await this.conversationFor(userId, conversationId);
    const now = new Date();
    if (!input.engagedAtNewestRegion) {
      await this.prisma.chatAttentionLease.deleteMany({
        where: { userId, sessionId, clientInstanceId: input.clientInstanceId, conversationId },
      });
      return { chatVersion: CHAT_VERSION, conversationId, clientInstanceId: input.clientInstanceId, expiresAt: null };
    }
    const expiresAt = new Date(now.getTime() + CHAT_ATTENTION_LEASE_SECONDS * 1_000);
    await this.prisma.chatAttentionLease.upsert({
      where: {
        userId_sessionId_clientInstanceId_conversationId: {
          userId,
          sessionId,
          clientInstanceId: input.clientInstanceId,
          conversationId,
        },
      },
      create: {
        id: randomUUID(),
        userId,
        sessionId,
        clientInstanceId: input.clientInstanceId,
        conversationId,
        atNewestRegion: true,
        engagedAt: now,
        expiresAt,
      },
      update: { atNewestRegion: true, engagedAt: now, expiresAt },
    });
    return { chatVersion: CHAT_VERSION, conversationId, clientInstanceId: input.clientInstanceId, expiresAt: expiresAt.toISOString() };
  }

  async report(
    reporterUserId: string,
    input: { conversationId: string; messageId?: string | null; reasonCode: string; details?: string | null },
    idempotencyKey: string,
  ): Promise<ChatReportReceipt> {
    if (!uuid.test(input.conversationId) || (input.messageId !== undefined && input.messageId !== null && !uuid.test(input.messageId)))
      throw new ChatError('chat-report-invalid', 400, 'Invalid report target.');
    if (!uuid.test(idempotencyKey)) throw new ChatError('chat-report-invalid', 400, 'A valid report idempotency key is required.');
    const allowed = new Set(['INAPPROPRIATE_CONTENT', 'HARASSMENT', 'SPAM', 'SCAM', 'OTHER']);
    if (!allowed.has(input.reasonCode)) throw new ChatError('chat-report-invalid', 400, 'Invalid report reason.');
    const details = (input.details ?? '').trim();
    if (details.length > 0 && details.length < 20)
      throw new ChatError('chat-report-invalid', 400, 'Report details must be at least 20 characters.', ['details']);
    if (input.reasonCode === 'OTHER' && details.length < 20)
      throw new ChatError('chat-report-invalid', 400, 'Please explain the other reason.', ['details']);
    const normalizedDetails = (details || `Reported chat behavior: ${input.reasonCode}`).slice(0, 1_000);
    const digest = createHash('sha256')
      .update(JSON.stringify({ conversationId: input.conversationId, messageId: input.messageId ?? null, reasonCode: input.reasonCode, details: normalizedDetails }))
      .digest('hex');
    const conversation = await this.conversationFor(reporterUserId, input.conversationId);
    const otherUserId = conversation.participantLowUserId === reporterUserId ? conversation.participantHighUserId : conversation.participantLowUserId;
    const dbReason = input.reasonCode === 'HARASSMENT' ? 'ABUSIVE_BEHAVIOR' : input.reasonCode === 'SPAM' ? 'INAPPROPRIATE_CONTENT' : input.reasonCode === 'SCAM' ? 'FRAUD_SCAM' : input.reasonCode;
    const result = await this.prisma.$transaction(async (tx) => {
      const replay = await tx.userReport.findUnique({ where: { reporterUserId_idempotencyKey: { reporterUserId, idempotencyKey } } });
      if (replay) {
        if (replay.requestDigest !== digest) throw new ChatError('chat-report-conflict', 409, 'This report id was already used with different details.');
        return replay;
      }
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`chat-report:${reporterUserId}`}, 0))`,
      );
      // A reporter may submit the same target more than once with a new
      // idempotency key. Treat it as an already-submitted receipt instead of
      // consuming another report allowance or incrementing the case count.
      const existingTarget = await tx.userReport.findFirst({
        where: {
          reporterUserId,
          status: ReportStatus.SUBMITTED,
          ...(input.messageId
            ? { chatConversationId: input.conversationId, chatMessageId: input.messageId }
            : { chatConversationId: input.conversationId, chatMessageId: null }),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (existingTarget) return existingTarget;
      const hourSince = new Date(Date.now() - 60 * 60 * 1_000);
      const daySince = new Date(Date.now() - 24 * 60 * 60 * 1_000);
      const [hourAttempts, dayAccepted] = await Promise.all([
        tx.reportRateLimitEvent.count({
          where: { reporterUserId, attemptedAt: { gte: hourSince } },
        }),
        tx.reportRateLimitEvent.count({
          where: { reporterUserId, accepted: true, attemptedAt: { gte: daySince } },
        }),
      ]);
      if (hourAttempts >= 20 || dayAccepted >= 10) {
        throw new ChatError('chat-rate-limited', 429, 'Please wait before submitting another report.', [], 60);
      }
      await tx.reportRateLimitEvent.create({
        data: { id: randomUUID(), reporterUserId, accepted: true, attemptedAt: new Date() },
      });
      let message: { id: string; content: string; sequence: number } | null = null;
      if (input.messageId) {
        message = await tx.chatMessage.findFirst({ where: { id: input.messageId, conversationId: input.conversationId }, select: { id: true, content: true, sequence: true } });
        if (!message) throw new ChatError('chat-report-invalid', 400, 'Invalid report target.');
      }
      const targetType = message ? ReportTargetType.CHAT_MESSAGE : ReportTargetType.CHAT_CONVERSATION;
      let moderationCase = await tx.moderationCase.findFirst({
        where: {
          targetType: { in: [ReportTargetType.CHAT_CONVERSATION, ReportTargetType.CHAT_MESSAGE] },
          chatConversationId: input.conversationId,
          reportedUserId: otherUserId,
          status: { not: 'RESOLVED' },
        },
      });
      if (!moderationCase) {
        moderationCase = await tx.moderationCase.create({
          data: {
            id: randomUUID(),
            targetType,
            chatConversationId: input.conversationId,
            reportedUserId: otherUserId,
            targetSnapshot: { conversationId: input.conversationId, messageId: message?.id ?? null },
            primaryReason: dbReason as never,
          },
        });
      } else {
        await tx.moderationCase.update({ where: { id: moderationCase.id }, data: { reportCount: { increment: 1 }, lastActivityAt: new Date() } });
      }
      return tx.userReport.create({
        data: {
          id: randomUUID(),
          reporterUserId,
          caseId: moderationCase.id,
          targetType,
          chatConversationId: input.conversationId,
          chatMessageId: message?.id ?? null,
          reportedUserId: otherUserId,
          reasonCode: dbReason as never,
          details: normalizedDetails,
          targetSnapshot: {
            conversationId: input.conversationId,
            messageId: message?.id ?? null,
            sequence: message?.sequence ?? null,
            reasonCode: input.reasonCode,
          },
          idempotencyKey,
          requestDigest: digest,
          status: ReportStatus.SUBMITTED,
        },
      });
    });
    return {
      id: result.id,
      conversationId: result.chatConversationId!,
      messageId: result.chatMessageId,
      reasonCode: reportReasonForReceipt(result),
      status: result.status === ReportStatus.REVIEWED ? 'REVIEWED' : 'SUBMITTED',
      createdAt: result.createdAt.toISOString(),
    };
  }

  async listReports(reporterUserId: string, conversationId?: string): Promise<ChatReportReceipt[]> {
    if (conversationId !== undefined && !uuid.test(conversationId))
      throw new ChatError('chat-report-invalid', 400, 'Invalid conversation id.', ['conversationId']);
    const rows = await this.prisma.userReport.findMany({
      where: { reporterUserId, targetType: { in: [ReportTargetType.CHAT_CONVERSATION, ReportTargetType.CHAT_MESSAGE] }, ...(conversationId ? { chatConversationId: conversationId } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      conversationId: row.chatConversationId!,
      messageId: row.chatMessageId,
      reasonCode: reportReasonForReceipt(row),
      status: row.status === ReportStatus.REVIEWED ? 'REVIEWED' : 'SUBMITTED',
      createdAt: row.createdAt.toISOString(),
    }));
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
