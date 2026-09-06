import { randomUUID } from 'node:crypto';
import {
  MODERATION_DEFAULT_LIMIT,
  MODERATION_MAX_LIMIT,
  type ModerationCaseDetail,
  type ModerationCaseListQuery,
  type ModerationCaseListResponse,
  type ModerationCaseSummary,
  type ModerationCaseEventType as ContractModerationCaseEventType,
  type ModerationCaseOutcome as ContractModerationCaseOutcome,
  type ModerationCaseTargetDetails,
  type ModerationDecisionOutcome as ContractModerationDecisionOutcome,
  type ModerationDecisionResult,
  type ReportReasonCode as ContractReportReasonCode,
} from '@shopee-clone/contracts';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { ReportReasonCode as PrismaReportReasonCode } from '../generated/prisma/enums';
import {
  MarketplaceRole,
  ModerationCaseEventType,
  ModerationCaseOutcome,
  ModerationCaseStatus,
  PrivilegedAction,
  PrivilegedTargetType,
  ProductModerationStatus,
  ReportStatus,
  ReportTargetType,
  SellerModerationNoticeAction,
  ShopOnboardingStatus,
  ShopStatus,
  UserStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AdminInvalidInputError, AdminNotFoundError } from './admin.errors';
import { recordPrivilegedAudit } from './privileged-audit.helper';
import { SellerIdentityLifecycleService } from '../seller-identity/seller-identity-lifecycle.service';

export class ModerationConflictError extends Error {
  constructor(message: string = 'The moderation case has been modified by another operation.') {
    super(message);
    this.name = 'ModerationConflictError';
  }
}

export class ModerationIdempotencyConflictError extends Error {
  constructor(
    message: string = 'The idempotency key has already been used with different request parameters.',
  ) {
    super(message);
    this.name = 'ModerationIdempotencyConflictError';
  }
}

@Injectable()
export class AdminModerationRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(SellerIdentityLifecycleService)
    private readonly sellerLifecycle?: SellerIdentityLifecycleService,
  ) {}

  async listCases(query: ModerationCaseListQuery): Promise<ModerationCaseListResponse> {
    const limit = Math.min(query.limit ?? MODERATION_DEFAULT_LIMIT, MODERATION_MAX_LIMIT);
    const where: Prisma.ModerationCaseWhereInput = {};

    if (query.status) {
      where.status = query.status as unknown as ModerationCaseStatus;
    }
    if (query.targetType) {
      where.targetType = query.targetType as unknown as ReportTargetType;
    }
    if (query.targetId) {
      if (query.targetType === 'PRODUCT') {
        where.productId = query.targetId;
      } else if (query.targetType === 'SHOP') {
        where.shopId = query.targetId;
      } else if (query.targetType === 'CHAT_CONVERSATION' || query.targetType === 'CHAT_MESSAGE') {
        if (query.targetType === 'CHAT_MESSAGE')
          where.reports = { some: { chatMessageId: query.targetId } };
        else where.chatConversationId = query.targetId;
      } else {
        where.OR = [
          { productId: query.targetId },
          { shopId: query.targetId },
          { chatConversationId: query.targetId },
        ];
      }
    }
    if (query.searchId) {
      where.OR = [
        { id: query.searchId },
        { productId: query.searchId },
        { shopId: query.searchId },
        { chatConversationId: query.searchId },
        { reports: { some: { chatMessageId: query.searchId } } },
      ];
    }
    if (query.reasonCode) {
      where.primaryReason = query.reasonCode as unknown as PrismaReportReasonCode;
    }
    if (query.assignedAdminId) {
      where.assignedAdminId = query.assignedAdminId;
    }

    const rows = await this.prisma.moderationCase.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
      include: {
        assignedAdmin: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        reportedUser: { select: { id: true, displayName: true } },
        product: {
          select: {
            images: {
              take: 1,
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              select: { url: true },
            },
          },
        },
        shop: { select: { logoUrl: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return {
      items: items.map((c): ModerationCaseSummary => {
        const snap = c.targetSnapshot as Record<string, unknown>;
        return {
          id: c.id,
          targetType: c.targetType as unknown as 'PRODUCT' | 'SHOP',
          targetId: (c.targetType === ReportTargetType.CHAT_MESSAGE
            ? ((snap?.messageId as string) ?? c.chatConversationId)
            : (c.productId ?? c.shopId ?? c.chatConversationId ?? c.id))!,
          targetName:
            (snap?.name as string) ??
            (c.targetType === ReportTargetType.CHAT_MESSAGE ||
            c.targetType === ReportTargetType.CHAT_CONVERSATION
              ? (c.reportedUser?.displayName ?? 'Báo cáo chat')
              : 'Unknown'),
          targetImageUrl: c.product?.images[0]?.url ?? c.shop?.logoUrl ?? null,
          targetStatus: (snap?.status as string) ?? 'ACTIVE',
          status: c.status as unknown as 'OPEN' | 'IN_REVIEW' | 'RESOLVED',
          reportCount: c.reportCount,
          primaryReasonCode: c.primaryReason as unknown as ContractReportReasonCode,
          assignedAdminId: c.assignedAdminId,
          assignedAdminName: c.assignedAdmin?.displayName ?? null,
          currentOutcome: (c.currentOutcome as unknown as ContractModerationCaseOutcome) ?? null,
          version: c.version,
          createdAt: c.createdAt.toISOString(),
          lastActivityAt: c.lastActivityAt.toISOString(),
          resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
        };
      }),
      nextCursor,
    };
  }

  async getCaseDetail(caseId: string): Promise<ModerationCaseDetail> {
    const c = await this.prisma.moderationCase.findUnique({
      where: { id: caseId },
      include: {
        assignedAdmin: {
          select: { id: true, email: true, displayName: true },
        },
        reports: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            evidenceReferences: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        events: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            actorUser: {
              select: { id: true, email: true, displayName: true },
            },
          },
        },
        decisions: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: {
            actorUser: {
              select: { id: true, email: true, displayName: true },
            },
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            moderationStatus: true,
            images: {
              take: 1,
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              select: { url: true },
            },
            shop: { select: { id: true, name: true, slug: true, status: true, logoUrl: true } },
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            onboardingStatus: true,
            logoUrl: true,
          },
        },
        chatConversation: {
          select: {
            id: true,
            participantLowUserId: true,
            participantHighUserId: true,
            participantLow: { select: { id: true, displayName: true } },
            participantHigh: { select: { id: true, displayName: true } },
            messages: {
              orderBy: [{ sequence: 'desc' }, { id: 'desc' }],
              take: 20,
              select: {
                sequence: true,
                senderUserId: true,
                content: true,
                createdAt: true,
                sender: { select: { displayName: true } },
              },
            },
          },
        },
        reportedUser: { select: { id: true, displayName: true } },
      },
    });

    if (!c) {
      throw new AdminNotFoundError('Moderation case not found');
    }

    const snap = c.targetSnapshot as Record<string, unknown>;

    // Generate deterministic opaque reporter identifiers (reporter-1, reporter-2, etc.)
    const reporterMap = new Map<string, string>();
    let reporterCounter = 1;
    for (const r of c.reports) {
      if (!reporterMap.has(r.reporterUserId)) {
        reporterMap.set(r.reporterUserId, `reporter-${reporterCounter++}`);
      }
    }

    let targetDetails: ModerationCaseTargetDetails & { onboardingStatus?: string };
    if (c.targetType === ReportTargetType.PRODUCT) {
      targetDetails = {
        targetType: 'PRODUCT',
        id: (c.productId ?? (snap?.id as string))!,
        name: c.product?.name ?? (snap?.name as string) ?? 'Unknown',
        imageUrl: c.product?.images[0]?.url ?? null,
        slug: c.product?.slug ?? (snap?.slug as string) ?? null,
        currentStatus: c.product?.status ?? 'UNKNOWN',
        moderationStatus: c.product?.moderationStatus ?? 'ACTIVE',
        shopId: c.product?.shop?.id ?? (snap?.shopId as string) ?? 'Unknown',
        shopName: c.product?.shop?.name ?? (snap?.shopName as string) ?? 'Unknown',
      };
    } else if (
      c.targetType === ReportTargetType.CHAT_CONVERSATION ||
      c.targetType === ReportTargetType.CHAT_MESSAGE
    ) {
      const chat = c.chatConversation;
      const reportedUser = c.reportedUser;
      targetDetails = {
        targetType: c.targetType as unknown as 'CHAT_CONVERSATION' | 'CHAT_MESSAGE',
        id: c.chatConversationId ?? (snap?.conversationId as string) ?? c.id,
        name: reportedUser?.displayName ?? 'Tài khoản bị báo cáo',
        slug: null,
        currentStatus: reportedUser ? 'ACTIVE' : 'UNKNOWN',
        ownerUserId: reportedUser?.id,
        chat:
          chat && reportedUser
            ? {
                conversationId: chat.id,
                messageId: (snap?.messageId as string) ?? null,
                reportedUserId: reportedUser.id,
                reportedUserName: reportedUser.displayName,
                messages: [...chat.messages].reverse().map((message) => ({
                  sequence: message.sequence,
                  senderUserId: message.senderUserId,
                  senderLabel: message.sender.displayName,
                  content: message.content,
                  createdAt: message.createdAt.toISOString(),
                })),
              }
            : undefined,
      };
    } else {
      targetDetails = {
        targetType: 'SHOP',
        id: (c.shopId ?? (snap?.id as string))!,
        name: c.shop?.name ?? (snap?.name as string) ?? 'Unknown',
        imageUrl: c.shop?.logoUrl ?? null,
        slug: c.shop?.slug ?? (snap?.slug as string) ?? null,
        currentStatus: c.shop?.status ?? 'UNKNOWN',
        onboardingStatus: c.shop?.onboardingStatus ?? 'APPROVED',
      };
    }

    return {
      id: c.id,
      targetType: c.targetType as unknown as 'PRODUCT' | 'SHOP',
      targetId: (c.targetType === ReportTargetType.CHAT_MESSAGE
        ? ((snap?.messageId as string) ?? c.chatConversationId)
        : (c.productId ?? c.shopId ?? c.chatConversationId ?? c.id))!,
      targetName:
        (snap?.name as string) ??
        (c.targetType === ReportTargetType.CHAT_MESSAGE ||
        c.targetType === ReportTargetType.CHAT_CONVERSATION
          ? (c.reportedUser?.displayName ?? 'Báo cáo chat')
          : 'Unknown'),
      targetImageUrl: c.product?.images[0]?.url ?? c.shop?.logoUrl ?? null,
      targetStatus: (snap?.status as string) ?? 'ACTIVE',
      status: c.status as unknown as 'OPEN' | 'IN_REVIEW' | 'RESOLVED',
      reportCount: c.reportCount,
      primaryReasonCode: c.primaryReason as unknown as ContractReportReasonCode,
      assignedAdminId: c.assignedAdminId,
      assignedAdminName: c.assignedAdmin?.displayName ?? null,
      currentOutcome: (c.currentOutcome as unknown as ContractModerationCaseOutcome) ?? null,
      version: c.version,
      createdAt: c.createdAt.toISOString(),
      lastActivityAt: c.lastActivityAt.toISOString(),
      resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      targetDetails,
      reports: c.reports.map((r) => ({
        id: r.id,
        reporterOpaqueId: reporterMap.get(r.reporterUserId)!,
        reasonCode: r.reasonCode as unknown as ContractReportReasonCode,
        details: r.details,
        evidenceUrls: r.evidenceReferences.map((e) => e.url),
        createdAt: r.createdAt.toISOString(),
      })),
      events: c.events.map((e) => ({
        id: e.id,
        eventType: e.eventType as unknown as ContractModerationCaseEventType,
        actorUserId: e.actorUserId,
        actorName: e.actorUser?.displayName ?? null,
        version: e.version,
        note: e.note ?? null,
        metadata: (e.metadata as Record<string, unknown> | null) ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
      decisions: c.decisions.map((d) => ({
        id: d.id,
        outcome: d.outcome as unknown as ContractModerationDecisionOutcome,
        publicReason: d.publicReason,
        privateNote: d.privateNote ?? null,
        previousTargetStatus: d.previousTargetStatus,
        nextTargetStatus: d.nextTargetStatus,
        reversesDecisionId: d.reversesDecisionId ?? null,
        actorUserId: d.actorUserId,
        actorName: d.actorUser.displayName,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }

  async assignCase(
    actorAdminId: string,
    caseId: string,
    assignedAdminId: string | null,
    expectedVersion: number,
    idempotencyKey: string,
    requestDigest: string,
  ): Promise<{ caseDetail: ModerationCaseDetail }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Check idempotency command replay
      const existingCmd = await tx.moderationCommand.findUnique({
        where: {
          actorUserId_idempotencyKey: {
            actorUserId: actorAdminId,
            idempotencyKey,
          },
        },
      });

      if (existingCmd) {
        if (existingCmd.requestDigest === requestDigest) {
          return existingCmd.responseBody as unknown as { caseDetail: ModerationCaseDetail };
        }
        throw new ModerationIdempotencyConflictError();
      }

      // 2. Lock case row before reading its version to serialize concurrent commands.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM moderation_cases WHERE id = ${caseId} FOR UPDATE`,
      );
      const targetCase = await tx.moderationCase.findUnique({
        where: { id: caseId },
      });

      if (!targetCase) {
        throw new AdminNotFoundError('Moderation case not found');
      }

      if (targetCase.version !== expectedVersion) {
        throw new ModerationConflictError(
          `Case version mismatch: expected ${expectedVersion}, found ${targetCase.version}`,
        );
      }

      // 3. Verify assignee if present
      if (assignedAdminId) {
        const adminUser = await tx.user.findFirst({
          where: {
            id: assignedAdminId,
            status: UserStatus.ACTIVE,
            roleAssignments: { some: { role: MarketplaceRole.ADMIN } },
          },
        });
        if (!adminUser) {
          throw new AdminInvalidInputError('Target assignee must be an active admin user');
        }
      }

      const now = new Date();
      const nextVersion = targetCase.version + 1;
      const nextStatus = assignedAdminId
        ? ModerationCaseStatus.IN_REVIEW
        : targetCase.status === ModerationCaseStatus.IN_REVIEW
          ? ModerationCaseStatus.OPEN
          : targetCase.status;

      await tx.moderationCase.update({
        where: { id: caseId },
        data: {
          assignedAdminId,
          status: nextStatus,
          version: nextVersion,
          lastActivityAt: now,
        },
      });

      await tx.moderationCaseEvent.create({
        data: {
          caseId,
          eventType: assignedAdminId
            ? ModerationCaseEventType.ASSIGNED
            : ModerationCaseEventType.UNASSIGNED,
          actorUserId: actorAdminId,
          version: nextVersion,
          createdAt: now,
        },
      });

      const updatedDetail = await this.getCaseDetail(caseId);
      const responsePayload = { caseDetail: updatedDetail };

      await tx.moderationCommand.create({
        data: {
          actorUserId: actorAdminId,
          idempotencyKey,
          requestDigest,
          resourceType: 'MODERATION_CASE',
          resourceId: caseId,
          actionName: 'ASSIGN',
          responseStatus: 200,
          responseBody: responsePayload as unknown as Prisma.InputJsonValue,
          createdAt: now,
        },
      });

      return responsePayload;
    });
  }

  async addNote(
    actorAdminId: string,
    caseId: string,
    note: string,
    expectedVersion: number,
    idempotencyKey: string,
    requestDigest: string,
  ): Promise<{ caseDetail: ModerationCaseDetail }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Check idempotency command replay
      const existingCmd = await tx.moderationCommand.findUnique({
        where: {
          actorUserId_idempotencyKey: {
            actorUserId: actorAdminId,
            idempotencyKey,
          },
        },
      });

      if (existingCmd) {
        if (existingCmd.requestDigest === requestDigest) {
          return existingCmd.responseBody as unknown as { caseDetail: ModerationCaseDetail };
        }
        throw new ModerationIdempotencyConflictError();
      }

      // 2. Lock case row before reading its version to serialize concurrent commands.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM moderation_cases WHERE id = ${caseId} FOR UPDATE`,
      );
      const targetCase = await tx.moderationCase.findUnique({
        where: { id: caseId },
      });

      if (!targetCase) {
        throw new AdminNotFoundError('Moderation case not found');
      }

      if (targetCase.version !== expectedVersion) {
        throw new ModerationConflictError(
          `Case version mismatch: expected ${expectedVersion}, found ${targetCase.version}`,
        );
      }

      const now = new Date();
      const nextVersion = targetCase.version + 1;

      await tx.moderationCase.update({
        where: { id: caseId },
        data: {
          version: nextVersion,
          lastActivityAt: now,
        },
      });

      await tx.moderationCaseEvent.create({
        data: {
          caseId,
          eventType: ModerationCaseEventType.NOTE_ADDED,
          actorUserId: actorAdminId,
          version: nextVersion,
          note: note.trim(),
          createdAt: now,
        },
      });

      const updatedDetail = await this.getCaseDetail(caseId);
      const responsePayload = { caseDetail: updatedDetail };

      await tx.moderationCommand.create({
        data: {
          actorUserId: actorAdminId,
          idempotencyKey,
          requestDigest,
          resourceType: 'MODERATION_CASE',
          resourceId: caseId,
          actionName: 'NOTE_ADDED',
          responseStatus: 200,
          responseBody: responsePayload as unknown as Prisma.InputJsonValue,
          createdAt: now,
        },
      });

      return responsePayload;
    });
  }

  async makeDecision(
    actorAdminId: string,
    caseId: string,
    input: {
      outcome: ModerationCaseOutcome;
      publicReason: string;
      privateNote?: string;
      reversesDecisionId?: string;
      restrictionUntil?: string;
      expectedVersion: number;
    },
    idempotencyKey: string,
    requestDigest: string,
  ): Promise<ModerationDecisionResult> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Check idempotency command replay
      const existingCmd = await tx.moderationCommand.findUnique({
        where: {
          actorUserId_idempotencyKey: {
            actorUserId: actorAdminId,
            idempotencyKey,
          },
        },
      });

      if (existingCmd) {
        if (existingCmd.requestDigest === requestDigest) {
          return existingCmd.responseBody as unknown as ModerationDecisionResult;
        }
        throw new ModerationIdempotencyConflictError();
      }

      // 2. Lock case row before reading its version to serialize concurrent commands.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM moderation_cases WHERE id = ${caseId} FOR UPDATE`,
      );
      const targetCase = await tx.moderationCase.findUnique({
        where: { id: caseId },
        include: {
          reports: true,
          decisions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!targetCase) {
        throw new AdminNotFoundError('Moderation case not found');
      }

      if (targetCase.version !== input.expectedVersion) {
        throw new ModerationConflictError(
          `Case version mismatch: expected ${input.expectedVersion}, found ${targetCase.version}`,
        );
      }

      // 3. If reversal, validate reversesDecisionId
      if (input.reversesDecisionId) {
        const priorDecision = await tx.moderationDecision.findUnique({
          where: { id: input.reversesDecisionId },
        });
        if (!priorDecision || priorDecision.caseId !== caseId) {
          throw new AdminInvalidInputError('Reversed decision not found for this case');
        }
      }

      const now = new Date();
      let previousTargetStatus: string;
      let nextTargetStatus: string;
      let privilegedAction: PrivilegedAction;
      let targetOwnerUserId: string | null = null;
      let chatRestrictionUntil: Date | null = null;
      let chatDecisionTarget = false;
      const targetSnapshot = targetCase.targetSnapshot as Prisma.InputJsonValue;

      // 4. Lock target row and determine status changes
      if (
        targetCase.targetType === ReportTargetType.CHAT_CONVERSATION ||
        targetCase.targetType === ReportTargetType.CHAT_MESSAGE
      ) {
        chatDecisionTarget = true;
        const reportedUserId = targetCase.reportedUserId;
        if (!reportedUserId) throw new AdminInvalidInputError('Chat case has no reported account');
        const reportedUser = await tx.user.findUnique({
          where: { id: reportedUserId },
          select: { id: true, status: true, deletedAt: true, displayName: true },
        });
        if (!reportedUser) throw new AdminNotFoundError('Reported account not found');
        targetOwnerUserId = reportedUser.id;
        const currentRestriction = await tx.userChatRestriction.findUnique({
          where: { userId: reportedUser.id },
        });
        const restrictionActive = Boolean(
          currentRestriction &&
          !currentRestriction.restoredAt &&
          (currentRestriction.restrictedUntil === null || currentRestriction.restrictedUntil > now),
        );
        previousTargetStatus = restrictionActive ? 'RESTRICTED' : 'ELIGIBLE';
        if (input.outcome === ModerationCaseOutcome.RESTRICT_CHAT_TEMPORARY) {
          if (!input.restrictionUntil) {
            throw new AdminInvalidInputError('Temporary chat restriction expiry is required', {
              invalidParameters: ['restrictionUntil'],
            });
          }
          chatRestrictionUntil = new Date(input.restrictionUntil);
          if (Number.isNaN(chatRestrictionUntil.getTime()) || chatRestrictionUntil <= now) {
            throw new AdminInvalidInputError(
              'Temporary chat restriction expiry must be in the future',
              {
                invalidParameters: ['restrictionUntil'],
              },
            );
          }
          nextTargetStatus = 'RESTRICTED';
          privilegedAction = PrivilegedAction.UPDATE;
        } else if (input.outcome === ModerationCaseOutcome.RESTRICT_CHAT_INDEFINITE) {
          nextTargetStatus = 'RESTRICTED';
          privilegedAction = PrivilegedAction.UPDATE;
        } else if (input.outcome === ModerationCaseOutcome.RESTORE_CHAT) {
          nextTargetStatus = 'ELIGIBLE';
          privilegedAction = PrivilegedAction.RESTORE;
        } else if (input.outcome === ModerationCaseOutcome.WARN_USER) {
          nextTargetStatus = previousTargetStatus;
          privilegedAction = PrivilegedAction.UPDATE;
        } else if (input.outcome === ModerationCaseOutcome.NO_ACTION) {
          nextTargetStatus = previousTargetStatus;
          privilegedAction = PrivilegedAction.NO_ACTION;
        } else {
          throw new AdminInvalidInputError('This outcome is not valid for a chat case', {
            invalidParameters: ['outcome'],
          });
        }
      } else if (targetCase.targetType === ReportTargetType.PRODUCT) {
        if (
          input.outcome === ModerationCaseOutcome.WARN_USER ||
          input.outcome === ModerationCaseOutcome.RESTRICT_CHAT_TEMPORARY ||
          input.outcome === ModerationCaseOutcome.RESTRICT_CHAT_INDEFINITE ||
          input.outcome === ModerationCaseOutcome.RESTORE_CHAT
        ) {
          throw new AdminInvalidInputError('This outcome is not valid for a product case', {
            invalidParameters: ['outcome'],
          });
        }
        const product = await tx.product.findUnique({
          where: { id: targetCase.productId! },
          include: { shop: { select: { ownerId: true, name: true } } },
        });
        if (!product) {
          throw new AdminNotFoundError('Target product not found');
        }
        targetOwnerUserId = product.shop.ownerId;
        previousTargetStatus = product.moderationStatus;

        if (input.outcome === ModerationCaseOutcome.SUSPEND_TARGET) {
          nextTargetStatus = ProductModerationStatus.SUSPENDED;
          privilegedAction = PrivilegedAction.SUSPEND;
          await tx.product.update({
            where: { id: product.id },
            data: { moderationStatus: ProductModerationStatus.SUSPENDED },
          });
        } else if (input.outcome === ModerationCaseOutcome.RESTORE_TARGET) {
          nextTargetStatus = ProductModerationStatus.ACTIVE;
          privilegedAction = PrivilegedAction.RESTORE;
          await tx.product.update({
            where: { id: product.id },
            data: { moderationStatus: ProductModerationStatus.ACTIVE },
          });
        } else {
          nextTargetStatus = previousTargetStatus;
          privilegedAction = PrivilegedAction.NO_ACTION;
        }
      } else {
        if (
          input.outcome === ModerationCaseOutcome.WARN_USER ||
          input.outcome === ModerationCaseOutcome.RESTRICT_CHAT_TEMPORARY ||
          input.outcome === ModerationCaseOutcome.RESTRICT_CHAT_INDEFINITE ||
          input.outcome === ModerationCaseOutcome.RESTORE_CHAT
        ) {
          throw new AdminInvalidInputError('This outcome is not valid for a shop case', {
            invalidParameters: ['outcome'],
          });
        }
        const shop = await tx.shop.findUnique({
          where: { id: targetCase.shopId! },
        });
        if (!shop) {
          throw new AdminNotFoundError('Target shop not found');
        }
        targetOwnerUserId = shop.ownerId;
        previousTargetStatus = shop.status;

        if (input.outcome === ModerationCaseOutcome.SUSPEND_TARGET) {
          nextTargetStatus = ShopStatus.SUSPENDED;
          privilegedAction = PrivilegedAction.SUSPEND;
          if (this.sellerLifecycle) {
            const result = await this.sellerLifecycle.suspendShopInTransaction(
              tx,
              actorAdminId,
              shop.id,
              input.publicReason.trim(),
            );
            nextTargetStatus = result.shopStatus ?? ShopStatus.SUSPENDED;
          } else {
            await tx.shop.update({
              where: { id: shop.id },
              data: { status: ShopStatus.SUSPENDED },
            });
          }
        } else if (input.outcome === ModerationCaseOutcome.RESTORE_TARGET) {
          if (shop.onboardingStatus !== ShopOnboardingStatus.APPROVED) {
            throw new AdminInvalidInputError('Cannot restore shop that is not approved');
          }
          nextTargetStatus = ShopStatus.ACTIVE;
          privilegedAction = PrivilegedAction.RESTORE;
          if (this.sellerLifecycle) {
            const result = await this.sellerLifecycle.restoreShopInTransaction(
              tx,
              actorAdminId,
              shop.id,
              input.publicReason.trim(),
            );
            nextTargetStatus = result.shopStatus ?? ShopStatus.ACTIVE;
          } else {
            await tx.shop.update({
              where: { id: shop.id },
              data: { status: ShopStatus.ACTIVE },
            });
          }
        } else {
          nextTargetStatus = previousTargetStatus;
          privilegedAction = PrivilegedAction.NO_ACTION;
        }
      }

      // 5. Create ModerationDecision
      const decision = await tx.moderationDecision.create({
        data: {
          id: randomUUID(),
          caseId,
          outcome: input.outcome,
          publicReason: input.publicReason.trim(),
          privateNote: input.privateNote?.trim() ?? null,
          previousTargetStatus,
          nextTargetStatus,
          reversesDecisionId: input.reversesDecisionId ?? null,
          actorUserId: actorAdminId,
          createdAt: now,
        },
      });

      if (chatDecisionTarget && targetOwnerUserId) {
        if (
          input.outcome === ModerationCaseOutcome.RESTRICT_CHAT_TEMPORARY ||
          input.outcome === ModerationCaseOutcome.RESTRICT_CHAT_INDEFINITE
        ) {
          await tx.userChatRestriction.upsert({
            where: { userId: targetOwnerUserId },
            create: {
              id: randomUUID(),
              userId: targetOwnerUserId,
              restrictedUntil: chatRestrictionUntil,
              originatingDecisionId: decision.id,
              restrictedAt: now,
              restoredAt: null,
            },
            update: {
              restrictedUntil: chatRestrictionUntil,
              originatingDecisionId: decision.id,
              restrictedAt: now,
              restoredAt: null,
              version: { increment: 1 },
            },
          });
        } else if (input.outcome === ModerationCaseOutcome.RESTORE_CHAT) {
          await tx.userChatRestriction.updateMany({
            where: { userId: targetOwnerUserId, restoredAt: null },
            data: { restoredAt: now, restrictedUntil: now, version: { increment: 1 } },
          });
        }
        if (
          input.outcome === ModerationCaseOutcome.WARN_USER ||
          input.outcome === ModerationCaseOutcome.RESTRICT_CHAT_TEMPORARY ||
          input.outcome === ModerationCaseOutcome.RESTRICT_CHAT_INDEFINITE ||
          input.outcome === ModerationCaseOutcome.RESTORE_CHAT
        ) {
          const notificationCopy =
            input.outcome === ModerationCaseOutcome.WARN_USER
              ? {
                  title: 'Bạn nhận được cảnh báo về chat',
                  body: 'Một cuộc trò chuyện của bạn đã được báo cáo. Hãy giữ nội dung trao đổi lịch sự.',
                }
              : input.outcome === ModerationCaseOutcome.RESTORE_CHAT
                ? { title: 'Chat đã được mở lại', body: 'Bạn có thể tiếp tục gửi tin nhắn.' }
                : {
                    title: 'Tạm hạn chế tính năng chat',
                    body: chatRestrictionUntil
                      ? `Bạn không thể gửi tin nhắn cho đến ${chatRestrictionUntil.toISOString()}.`
                      : 'Bạn không thể gửi tin nhắn cho đến khi được mở lại.',
                  };
          await tx.notification.create({
            data: {
              id: randomUUID(),
              recipientId: targetOwnerUserId,
              category: 'ACCOUNT',
              type: 'SYSTEM_NOTICE',
              title: notificationCopy.title,
              body: notificationCopy.body,
              metadata: {
                targetUrl: '/account/notifications',
                thumbnailUrl: null,
                referenceId: caseId,
                amountMinor: null,
                currency: null,
              },
              deduplicationKey: `chat-moderation:${decision.id}`,
              isRead: false,
              createdAt: now,
              activityAt: now,
            },
          });
        }
      }

      // 6. Create SellerModerationNotice if target was suspended or restored
      if (
        input.outcome === ModerationCaseOutcome.SUSPEND_TARGET ||
        input.outcome === ModerationCaseOutcome.RESTORE_TARGET
      ) {
        let noticeAction: SellerModerationNoticeAction;
        if (targetCase.targetType === ReportTargetType.PRODUCT) {
          noticeAction =
            input.outcome === ModerationCaseOutcome.SUSPEND_TARGET
              ? SellerModerationNoticeAction.PRODUCT_SUSPENDED
              : SellerModerationNoticeAction.PRODUCT_RESTORED;
        } else {
          noticeAction =
            input.outcome === ModerationCaseOutcome.SUSPEND_TARGET
              ? SellerModerationNoticeAction.SHOP_SUSPENDED
              : SellerModerationNoticeAction.SHOP_RESTORED;
        }

        if (targetOwnerUserId) {
          await tx.sellerModerationNotice.create({
            data: {
              ownerUserId: targetOwnerUserId,
              targetType: targetCase.targetType,
              productId: targetCase.productId,
              shopId: targetCase.shopId,
              targetSnapshot,
              action: noticeAction,
              reason: input.publicReason.trim(),
              decisionId: decision.id,
              effectiveAt: now,
              createdAt: now,
            },
          });
        }
      }

      // 7. Update case & reports to resolved
      const nextVersion = targetCase.version + 1;
      await tx.moderationCase.update({
        where: { id: caseId },
        data: {
          status: ModerationCaseStatus.RESOLVED,
          currentOutcome: input.outcome,
          version: nextVersion,
          resolvedAt: now,
          lastActivityAt: now,
        },
      });

      await tx.userReport.updateMany({
        where: { caseId },
        data: {
          status: ReportStatus.REVIEWED,
          resolvedAt: now,
        },
      });

      await tx.moderationCaseEvent.create({
        data: {
          caseId,
          eventType: input.reversesDecisionId
            ? ModerationCaseEventType.DECISION_REVERSED
            : ModerationCaseEventType.DECISION_MADE,
          actorUserId: actorAdminId,
          version: nextVersion,
          note: input.privateNote?.trim() ?? null,
          metadata: {
            decisionId: decision.id,
            outcome: input.outcome,
          },
          createdAt: now,
        },
      });

      // 8. Record privileged audit log
      await recordPrivilegedAudit(tx, {
        actorUserId: actorAdminId,
        targetType: PrivilegedTargetType.MODERATION_CASE,
        targetId: caseId,
        action: privilegedAction,
        reason: input.publicReason.trim(),
        beforeSummary: { status: targetCase.status, targetStatus: previousTargetStatus },
        afterSummary: {
          status: ModerationCaseStatus.RESOLVED,
          targetStatus: nextTargetStatus,
          outcome: input.outcome,
        },
        decisionId: decision.id,
        now,
      });

      const result: ModerationDecisionResult = {
        caseId,
        outcome: decision.outcome as unknown as ContractModerationDecisionOutcome,
        version: nextVersion,
        targetStatus: nextTargetStatus,
        resolvedAt: now.toISOString(),
      };

      await tx.moderationCommand.create({
        data: {
          actorUserId: actorAdminId,
          idempotencyKey,
          requestDigest,
          resourceType: 'MODERATION_CASE',
          resourceId: caseId,
          actionName: 'DECISION',
          responseStatus: 200,
          responseBody: result as unknown as Prisma.InputJsonValue,
          createdAt: now,
        },
      });

      return result;
    });
  }
}
