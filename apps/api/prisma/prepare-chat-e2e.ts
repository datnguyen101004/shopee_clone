import { createHash, randomBytes } from 'node:crypto';
import { MarketplaceRole, RoleAuditSource, UserStatus } from '../src/generated/prisma/enums';
import { createPrismaClient } from './create-prisma-client';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required.');

const buyerId = '00000000-0000-4000-8000-000000009001';
const buyerEmail = 'chat-e2e-buyer@example.test';
const buyerPassword = 'ChatE2E-password';
const buyerPasswordHash =
  'scrypt$1$1024$8$1$AQEBAQEBAQEBAQEBAQEBAQ$IUJomy5LTpJY_DjgO4mKl1L902RXjPocRZObmEPkZBmiSZSeVtdiiH07p92QfkZHmequfoP0DzS-jq2xd4w9DA';
const buyerAddressId = '00000000-0000-4000-8000-000000009021';
const buyerCartId = '00000000-0000-4000-8000-000000009022';
const buyerCartLineId = '00000000-0000-4000-8000-000000009023';
const temporarySellerId = '00000000-0000-4000-8000-000000009024';
const temporaryShopId = '00000000-0000-4000-8000-000000009025';
const temporaryShopSlug = 'chat-e2e-temporary-shop';
const existingConversationId = '00000000-0000-4000-8000-000000009060';
const existingMessageId = '00000000-0000-4000-8000-000000009061';
const existingClientMessageId = '00000000-0000-4000-8000-000000009062';
const fillerUserIds = Array.from(
  { length: 25 },
  (_, index) => `00000000-0000-4000-8000-${(0x9100 + index).toString(16).padStart(12, '0')}`,
);
const fillerConversationIds = fillerUserIds.map(
  (_, index) => `00000000-0000-4000-8000-${(0x9200 + index).toString(16).padStart(12, '0')}`,
);
const fillerMessageIds = fillerUserIds.map(
  (_, index) => `00000000-0000-4000-8000-${(0x9300 + index).toString(16).padStart(12, '0')}`,
);
const fillerClientMessageIds = fillerUserIds.map(
  (_, index) => `00000000-0000-4000-8000-${(0x9400 + index).toString(16).padStart(12, '0')}`,
);
const safetyReplyMessageId = '00000000-0000-4000-8000-000000009601';
const safetyAttentionLeaseId = '00000000-0000-4000-8000-000000009602';
const safetyNotificationId = '00000000-0000-4000-8000-000000009603';
const safetyReportId = '00000000-0000-4000-8000-000000009604';
const safetyCaseId = '00000000-0000-4000-8000-000000009605';
const safetyAdminIds = [
  '00000000-0000-4000-8000-000000009611',
  '00000000-0000-4000-8000-000000009612',
] as const;
const safetyAdminSessionIds: Record<ProjectName, string> = {
  mobile: '00000000-0000-4000-8000-000000009613',
  tablet: '00000000-0000-4000-8000-000000009614',
  desktop: '00000000-0000-4000-8000-000000009615',
};
type ProjectName = 'mobile' | 'tablet' | 'desktop';
type ScenarioName =
  | 'existing'
  | 'temporary'
  | 'public'
  | 'checkout'
  | 'accessibility'
  | 'multitab'
  | 'exchange'
  | 'safety';
type SessionPair = { buyer: string; seller: string };
const scenarioNames: readonly ScenarioName[] = [
  'existing',
  'temporary',
  'public',
  'checkout',
  'accessibility',
  'multitab',
  'exchange',
  'safety',
];

function fixtureUuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

function createProjectSessions(projectOffset: number): Record<ScenarioName, SessionPair> {
  return Object.fromEntries(
    scenarioNames.map((scenario, scenarioIndex) => {
      const offset = projectOffset + scenarioIndex * 2;
      return [
        scenario,
        { buyer: fixtureUuid(0xa000 + offset), seller: fixtureUuid(0xa001 + offset) },
      ];
    }),
  ) as Record<ScenarioName, SessionPair>;
}

const sessionIds: Record<ProjectName, Record<ScenarioName, SessionPair>> = {
  mobile: createProjectSessions(0),
  tablet: createProjectSessions(20),
  desktop: createProjectSessions(40),
};

function refreshToken() {
  return randomBytes(32).toString('base64url');
}

function tokenHash(token: string) {
  return createHash('sha256').update(`refresh:${token}`, 'utf8').digest('hex');
}

const prisma = createPrismaClient(databaseUrl);
async function main(): Promise<void> {
  try {
    const product = await prisma.product.findFirst({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        shop: { is: { deletedAt: null, status: 'ACTIVE', onboardingStatus: 'APPROVED' } },
      },
      select: {
        id: true,
        shop: { select: { id: true, slug: true, name: true, ownerId: true } },
        variants: {
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            inventory: { is: { quantityOnHand: { gt: 0 } } },
          },
          orderBy: { id: 'asc' },
          take: 1,
          select: { id: true, priceMinor: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    if (!product)
      throw new Error('No active product with an approved shop is available for chat E2E.');
    const variant = product.variants[0];
    if (!variant) throw new Error('No active in-stock product variant is available for chat E2E.');
    const sellerId = product.shop.ownerId;
    const refreshTokens: Record<ProjectName, Record<ScenarioName, SessionPair>> = {
      mobile: Object.fromEntries(
        scenarioNames.map((scenario) => [
          scenario,
          { buyer: refreshToken(), seller: refreshToken() },
        ]),
      ) as Record<ScenarioName, SessionPair>,
      tablet: Object.fromEntries(
        scenarioNames.map((scenario) => [
          scenario,
          { buyer: refreshToken(), seller: refreshToken() },
        ]),
      ) as Record<ScenarioName, SessionPair>,
      desktop: Object.fromEntries(
        scenarioNames.map((scenario) => [
          scenario,
          { buyer: refreshToken(), seller: refreshToken() },
        ]),
      ) as Record<ScenarioName, SessionPair>,
    };
    const adminRefreshTokens: Record<ProjectName, string> = {
      mobile: refreshToken(),
      tablet: refreshToken(),
      desktop: refreshToken(),
    };
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1_000);
    const [low, high] = buyerId < sellerId ? [buyerId, sellerId] : [sellerId, buyerId];

    await prisma.$transaction(async (tx) => {
      const safetyCaseRows = await tx.moderationCase.findMany({
        where: { chatConversationId: fillerConversationIds[0] },
        select: { id: true },
      });
      const safetyCaseIds = [...new Set([safetyCaseId, ...safetyCaseRows.map((row) => row.id)])];
      await tx.userReport.deleteMany({ where: { chatConversationId: fillerConversationIds[0] } });
      await tx.privilegedAuditEvent.deleteMany({ where: { targetId: { in: safetyCaseIds } } });
      await tx.moderationCommand.deleteMany({ where: { resourceId: { in: safetyCaseIds } } });
      await tx.moderationDecision.deleteMany({ where: { caseId: { in: safetyCaseIds } } });
      await tx.moderationCase.deleteMany({ where: { id: { in: safetyCaseIds } } });
      await tx.chatAttentionLease.deleteMany({ where: { id: safetyAttentionLeaseId } });
      await tx.notification.deleteMany({ where: { id: safetyNotificationId } });
      await tx.chatUserBlock.deleteMany({ where: { id: fixtureUuid(0x9501) } });
      await tx.userRoleAssignment.deleteMany({ where: { userId: { in: [...safetyAdminIds] } } });
      await tx.authSession.deleteMany({ where: { userId: { in: [...safetyAdminIds] } } });
      await tx.user.deleteMany({ where: { id: { in: [...safetyAdminIds] } } });
      await tx.chatOutbox.deleteMany({
        where: { conversation: { participantLowUserId: low, participantHighUserId: high } },
      });
      await tx.chatConversation.deleteMany({
        where: {
          OR: [
            { participantLowUserId: low, participantHighUserId: high },
            { participantLowUserId: buyerId, participantHighUserId: temporarySellerId },
            { participantLowUserId: temporarySellerId, participantHighUserId: buyerId },
            { participantLowUserId: buyerId, participantHighUserId: { in: fillerUserIds } },
            { participantLowUserId: { in: fillerUserIds }, participantHighUserId: buyerId },
          ],
        },
      });
      await tx.shop.deleteMany({ where: { id: temporaryShopId } });
      await tx.authSession.deleteMany({ where: { userId: temporarySellerId } });
      await tx.userRoleAssignment.deleteMany({ where: { userId: temporarySellerId } });
      await tx.user.deleteMany({ where: { id: temporarySellerId } });
      await tx.user.deleteMany({ where: { id: { in: fillerUserIds } } });
      await tx.user.upsert({
        where: { id: buyerId },
        create: {
          id: buyerId,
          email: buyerEmail,
          displayName: 'Chat E2E Buyer',
          status: UserStatus.ACTIVE,
          passwordHash: buyerPasswordHash,
        },
        update: {
          email: buyerEmail,
          displayName: 'Chat E2E Buyer',
          status: UserStatus.ACTIVE,
          deletedAt: null,
          passwordHash: buyerPasswordHash,
        },
      });
      await tx.userRoleAssignment.upsert({
        where: { userId_role: { userId: buyerId, role: MarketplaceRole.BUYER } },
        create: { userId: buyerId, role: MarketplaceRole.BUYER, source: RoleAuditSource.SEED },
        update: {},
      });
      await tx.user.create({
        data: {
          id: temporarySellerId,
          email: 'chat-e2e-temporary-seller@example.test',
          displayName: 'Chat E2E Temporary Seller',
          status: UserStatus.ACTIVE,
        },
      });
      await tx.userRoleAssignment.create({
        data: {
          userId: temporarySellerId,
          role: MarketplaceRole.SELLER,
          source: RoleAuditSource.SEED,
        },
      });
      await tx.shop.create({
        data: {
          id: temporaryShopId,
          ownerId: temporarySellerId,
          slug: temporaryShopSlug,
          name: 'Chat E2E Temporary Shop',
          status: 'ACTIVE',
          onboardingStatus: 'APPROVED',
        },
      });
      await tx.authSession.deleteMany({ where: { userId: { in: [buyerId, sellerId] } } });
      await tx.authSession.createMany({
        data: Object.entries(sessionIds).flatMap(([project, scenarios]) =>
          Object.entries(scenarios).flatMap(([scenario, ids]) => {
            const tokens = refreshTokens[project as ProjectName][scenario as ScenarioName];
            return [
              {
                id: ids.buyer,
                userId: buyerId,
                familyId: ids.buyer,
                tokenHash: tokenHash(tokens.buyer),
                expiresAt,
              },
              {
                id: ids.seller,
                userId: sellerId,
                familyId: ids.seller,
                tokenHash: tokenHash(tokens.seller),
                expiresAt,
              },
            ];
          }),
        ),
      });
      await tx.shippingAddress.deleteMany({ where: { userId: buyerId } });
      await tx.shippingAddress.create({
        data: {
          id: buyerAddressId,
          userId: buyerId,
          recipientName: 'Chat E2E Buyer',
          phoneNumber: '0900009011',
          province: 'Hà Nội',
          district: 'Ba Đình',
          ward: 'Phúc Xá',
          addressLine: '1 Chat E2E Street',
          label: 'Nhà riêng',
          isDefault: true,
        },
      });
      await tx.cart.deleteMany({ where: { userId: buyerId } });
      await tx.cart.create({
        data: {
          id: buyerCartId,
          userId: buyerId,
          version: 0,
          lines: {
            create: {
              id: buyerCartLineId,
              variantId: variant.id,
              quantity: 1,
              isSelected: true,
              lastObservedUnitPriceMinor: variant.priceMinor,
            },
          },
        },
      });

      const existingAt = new Date(now.getTime() - 60 * 60 * 1_000);
      const existingDigest = createHash('sha256')
        .update('chat-e2e-existing-history', 'utf8')
        .digest('hex');
      await tx.chatConversation.create({
        data: {
          id: existingConversationId,
          participantLowUserId: low,
          participantHighUserId: high,
          nextSequence: 2,
          lastMessageSequence: 1,
          lastMessagePreview: 'Lịch sử có sẵn',
          lastMessageAt: existingAt,
          createdAt: existingAt,
          updatedAt: existingAt,
          memberships: {
            create: [
              {
                userId: buyerId,
                unreadCount: 1,
                lastReadSequence: 0,
                createdAt: existingAt,
                updatedAt: existingAt,
              },
              {
                userId: sellerId,
                unreadCount: 0,
                lastReadSequence: 1,
                lastReadAt: existingAt,
                createdAt: existingAt,
                updatedAt: existingAt,
              },
            ],
          },
          messages: {
            create: {
              id: existingMessageId,
              sequence: 1,
              senderUserId: sellerId,
              clientMessageId: existingClientMessageId,
              requestDigest: existingDigest,
              content: 'Lịch sử có sẵn',
              createdAt: existingAt,
            },
          },
        },
      });
      await tx.user.createMany({
        data: fillerUserIds.map((id, index) => ({
          id,
          email: `chat-e2e-filler-${index + 1}@example.test`,
          displayName: `Chat E2E Filler ${String(index + 1).padStart(2, '0')}`,
          status: UserStatus.ACTIVE,
        })),
      });
      for (const [index, fillerId] of fillerUserIds.entries()) {
        const fillerAt = new Date(now.getTime() - (index + 1) * 60 * 1_000);
        const fillerConversationId = fillerConversationIds[index]!;
        const fillerMessageId = fillerMessageIds[index]!;
        const fillerClientMessageId = fillerClientMessageIds[index]!;
        const fillerDigest = createHash('sha256')
          .update(`chat-e2e-filler-${index + 1}`, 'utf8')
          .digest('hex');
        const [fillerLow, fillerHigh] =
          buyerId < fillerId ? [buyerId, fillerId] : [fillerId, buyerId];
        await tx.chatConversation.create({
          data: {
            id: fillerConversationId,
            participantLowUserId: fillerLow,
            participantHighUserId: fillerHigh,
            nextSequence: 2,
            lastMessageSequence: 1,
            lastMessagePreview: `Tin nhắn filler ${index + 1}`,
            lastMessageAt: fillerAt,
            createdAt: fillerAt,
            updatedAt: fillerAt,
            memberships: {
              create: [
                {
                  userId: buyerId,
                  unreadCount: 1,
                  lastReadSequence: 0,
                  createdAt: fillerAt,
                  updatedAt: fillerAt,
                },
                {
                  userId: fillerId,
                  unreadCount: 0,
                  lastReadSequence: 1,
                  lastReadAt: fillerAt,
                  createdAt: fillerAt,
                  updatedAt: fillerAt,
                },
              ],
            },
            messages: {
              create: {
                id: fillerMessageId,
                sequence: 1,
                senderUserId: fillerId,
                clientMessageId: fillerClientMessageId,
                requestDigest: fillerDigest,
                content: `Tin nhắn filler ${index + 1}`,
                createdAt: fillerAt,
              },
            },
          },
        });
      }

      const safetyConversationId = fillerConversationIds[0]!;
      const safetyFillerId = fillerUserIds[0]!;
      const safetyMessageId = fillerMessageIds[0]!;
      const safetyAt = new Date(now.getTime() - 5 * 1_000);
      await tx.chatUserBlock.upsert({
        where: { blockerUserId_blockedUserId: { blockerUserId: buyerId, blockedUserId: safetyFillerId } },
        create: { id: fixtureUuid(0x9501), blockerUserId: buyerId, blockedUserId: safetyFillerId },
        update: {},
      });
      await tx.chatMembership.update({
        where: { conversationId_userId: { conversationId: safetyConversationId, userId: buyerId } },
        data: { notificationsMutedAt: safetyAt },
      });
      await tx.chatMessage.create({
        data: {
          id: safetyReplyMessageId,
          conversationId: safetyConversationId,
          sequence: 2,
          senderUserId: buyerId,
          clientMessageId: fixtureUuid(0x9603),
          requestDigest: createHash('sha256').update('chat-e2e-safety-reply', 'utf8').digest('hex'),
          content: 'Tin nhắn phản hồi trong fixture an toàn',
          replyToMessageId: safetyMessageId,
          createdAt: safetyAt,
        },
      });
      await tx.chatConversation.update({
        where: { id: safetyConversationId },
        data: { nextSequence: 3, lastMessageSequence: 2, lastMessagePreview: 'Tin nhắn phản hồi trong fixture an toàn', lastMessageAt: safetyAt },
      });
      await tx.chatAttentionLease.create({
        data: {
          id: safetyAttentionLeaseId,
          userId: buyerId,
          sessionId: sessionIds.mobile.existing.buyer,
          clientInstanceId: 'fixture-browser',
          conversationId: safetyConversationId,
          atNewestRegion: true,
          engagedAt: safetyAt,
          expiresAt: new Date(now.getTime() + 5 * 60 * 1_000),
        },
      });
      await tx.notification.create({
        data: {
          id: safetyNotificationId,
          recipientId: buyerId,
          category: 'CHAT',
          type: 'CHAT_MESSAGE',
          title: 'Tin nhắn fixture chat',
          body: 'Tin nhắn phản hồi trong fixture an toàn',
          metadata: {
            targetUrl: '/', thumbnailUrl: null, referenceId: safetyConversationId, amountMinor: null, currency: null,
            chat: { conversationId: safetyConversationId, unreadCount: 1, newestSequence: 2, preview: 'Tin nhắn phản hồi trong fixture an toàn', avatarUrl: null, activityAt: safetyAt.toISOString() },
          },
          deduplicationKey: `chat:${buyerId}:${safetyConversationId}`,
          isRead: false,
          readAt: null,
          isArchived: false,
          createdAt: safetyAt,
          activityAt: safetyAt,
        },
      });
      await tx.user.createMany({
        data: safetyAdminIds.map((id, index) => ({ id, email: `chat-e2e-admin-${index + 1}@example.test`, displayName: `Chat E2E Admin ${index + 1}`, status: UserStatus.ACTIVE })),
      });
      for (const adminId of safetyAdminIds) {
        await tx.userRoleAssignment.createMany({
          data: [
            { userId: adminId, role: MarketplaceRole.BUYER, source: RoleAuditSource.SEED },
            { userId: adminId, role: MarketplaceRole.ADMIN, source: RoleAuditSource.SEED },
          ],
        });
      }
      await tx.authSession.createMany({
        data: (Object.keys(adminRefreshTokens) as ProjectName[]).map((project) => {
          const sessionId = safetyAdminSessionIds[project];
          return {
            id: sessionId,
            userId: safetyAdminIds[0],
            familyId: sessionId,
            tokenHash: tokenHash(adminRefreshTokens[project]),
            expiresAt,
          };
        }),
      });
      await tx.moderationCase.create({
        data: {
          id: safetyCaseId,
          targetType: 'CHAT_MESSAGE',
          chatConversationId: safetyConversationId,
          reportedUserId: safetyFillerId,
          targetSnapshot: { conversationId: safetyConversationId, messageId: safetyMessageId, sequence: 1 },
          primaryReason: 'INAPPROPRIATE_CONTENT',
          reportCount: 1,
        },
      });
      await tx.userReport.create({
        data: {
          id: safetyReportId,
          reporterUserId: buyerId,
          caseId: safetyCaseId,
          targetType: 'CHAT_MESSAGE',
          chatConversationId: safetyConversationId,
          chatMessageId: safetyMessageId,
          reportedUserId: safetyFillerId,
          reasonCode: 'INAPPROPRIATE_CONTENT',
          details: 'Fixture report for chat moderation verification.',
          targetSnapshot: { conversationId: safetyConversationId, messageId: safetyMessageId, sequence: 1, reasonCode: 'INAPPROPRIATE_CONTENT' },
          idempotencyKey: fixtureUuid(0x9604),
          requestDigest: createHash('sha256').update('chat-e2e-safety-report', 'utf8').digest('hex'),
        },
      });
    });

    process.stdout.write(
      JSON.stringify({
        buyerId,
        sellerId,
        shopId: product.shop.id,
        shopSlug: product.shop.slug,
        shopName: product.shop.name,
        temporaryShopId,
        temporaryShopSlug,
        productId: product.id,
        buyerEmail,
        buyerPassword,
        adminRefreshTokens,
        safetyCaseId,
        buyerAddressId,
        existingConversationId,
        refreshTokens,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
