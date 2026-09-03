import {
  MODERATION_DEFAULT_LIMIT,
  MODERATION_MAX_LIMIT,
  REPORT_RATE_LIMIT_DAILY_ACCEPTED,
  REPORT_RATE_LIMIT_HOURLY_ATTEMPTS,
  type CreateReportResponse,
  type ReporterReportDetail,
  type ReporterReportListQuery,
  type ReporterReportListResponse,
  type ReportReasonCode as ContractReportReasonCode,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type {
  ReportReasonCode} from '../generated/prisma/enums';
import {
  ModerationCaseEventType,
  ModerationCaseStatus,
  ProductModerationStatus,
  ProductStatus,
  ReportStatus,
  ReportTargetType,
  ShopOnboardingStatus,
  ShopStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportIdempotencyConflictError,
  ReportNotFoundError,
  ReportRateLimitExceededError,
  ReportTargetNotFoundError,
  SelfReportForbiddenError,
} from './reporting.errors';

export interface CreateReportInput {
  reporterUserId: string;
  targetType: ReportTargetType;
  targetId: string;
  reasonCode: ReportReasonCode;
  details: string;
  evidenceUrls?: string[];
  idempotencyKey: string;
  requestDigest: string;
}

export interface CreateReportExecutionResult {
  isReplay: boolean;
  response: CreateReportResponse;
}

@Injectable()
export class ReportingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async submitReport(input: CreateReportInput): Promise<CreateReportExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Check idempotency first before taking locks or consuming quota
      const existingByIdempotency = await tx.userReport.findUnique({
        where: {
          reporterUserId_idempotencyKey: {
            reporterUserId: input.reporterUserId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

      if (existingByIdempotency) {
        if (existingByIdempotency.requestDigest === input.requestDigest) {
          return {
            isReplay: true,
            response: {
              reportId: existingByIdempotency.id,
              targetType: existingByIdempotency.targetType as unknown as 'PRODUCT' | 'SHOP',
              targetId: (existingByIdempotency.productId ?? existingByIdempotency.shopId)!,
              reasonCode: existingByIdempotency.reasonCode as unknown as ContractReportReasonCode,
              status: existingByIdempotency.status as unknown as 'SUBMITTED' | 'REVIEWED',
              createdAt: existingByIdempotency.createdAt.toISOString(),
            },
          };
        }
        throw new ReportIdempotencyConflictError();
      }

      // 2. Validate target and check self-reporting
      let targetSnapshot: Prisma.InputJsonValue;
      let targetProductId: string | null = null;
      let targetShopId: string | null = null;

      if (input.targetType === ReportTargetType.PRODUCT) {
        const product = await tx.product.findUnique({
          where: { id: input.targetId },
          include: { shop: { select: { id: true, name: true, ownerId: true, status: true, onboardingStatus: true } } },
        });

        if (
          !product ||
          product.deletedAt !== null ||
          product.status !== ProductStatus.ACTIVE ||
          product.moderationStatus !== ProductModerationStatus.ACTIVE ||
          product.shop.status !== ShopStatus.ACTIVE ||
          product.shop.onboardingStatus !== ShopOnboardingStatus.APPROVED
        ) {
          throw new ReportTargetNotFoundError();
        }

        if (product.shop.ownerId === input.reporterUserId) {
          throw new SelfReportForbiddenError();
        }

        targetProductId = product.id;
        targetSnapshot = {
          id: product.id,
          name: product.name,
          slug: product.slug,
          shopId: product.shopId,
          shopName: product.shop.name,
        };
      } else {
        const shop = await tx.shop.findUnique({
          where: { id: input.targetId },
        });

        if (
          !shop ||
          shop.deletedAt !== null ||
          shop.status !== ShopStatus.ACTIVE ||
          shop.onboardingStatus !== ShopOnboardingStatus.APPROVED
        ) {
          throw new ReportTargetNotFoundError();
        }

        if (shop.ownerId === input.reporterUserId) {
          throw new SelfReportForbiddenError();
        }

        targetShopId = shop.id;
        targetSnapshot = {
          id: shop.id,
          name: shop.name,
          slug: shop.slug,
          ownerUserId: shop.ownerId,
        };
      }

      // 3. Take PostgreSQL transaction advisory lock for reporter then target
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.reporterUserId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.targetId}))`;

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // 4. Enforce rolling rate limits
      const [hourlyAttempts, dailyAccepted] = await Promise.all([
        tx.reportRateLimitEvent.count({
          where: {
            reporterUserId: input.reporterUserId,
            attemptedAt: { gte: oneHourAgo },
          },
        }),
        tx.reportRateLimitEvent.count({
          where: {
            reporterUserId: input.reporterUserId,
            accepted: true,
            attemptedAt: { gte: oneDayAgo },
          },
        }),
      ]);

      if (hourlyAttempts >= REPORT_RATE_LIMIT_HOURLY_ATTEMPTS) {
        await tx.reportRateLimitEvent.create({
          data: {
            reporterUserId: input.reporterUserId,
            accepted: false,
            attemptedAt: now,
          },
        });
        throw new ReportRateLimitExceededError(3600);
      }

      if (dailyAccepted >= REPORT_RATE_LIMIT_DAILY_ACCEPTED) {
        await tx.reportRateLimitEvent.create({
          data: {
            reporterUserId: input.reporterUserId,
            accepted: false,
            attemptedAt: now,
          },
        });
        throw new ReportRateLimitExceededError(86400);
      }

      // 5. Check for existing unresolved report on the same target
      const existingUnresolved = await tx.userReport.findFirst({
        where: {
          reporterUserId: input.reporterUserId,
          status: ReportStatus.SUBMITTED,
          ...(targetProductId ? { productId: targetProductId } : { shopId: targetShopId }),
        },
      });

      if (existingUnresolved) {
        return {
          isReplay: true,
          response: {
            reportId: existingUnresolved.id,
            targetType: existingUnresolved.targetType as unknown as 'PRODUCT' | 'SHOP',
            targetId: (existingUnresolved.productId ?? existingUnresolved.shopId)!,
            reasonCode: existingUnresolved.reasonCode as unknown as ContractReportReasonCode,
            status: existingUnresolved.status as unknown as 'SUBMITTED' | 'REVIEWED',
            createdAt: existingUnresolved.createdAt.toISOString(),
          },
        };
      }

      // 6. Find or create active moderation case
      let targetCase = await tx.moderationCase.findFirst({
        where: {
          status: { in: [ModerationCaseStatus.OPEN, ModerationCaseStatus.IN_REVIEW] },
          ...(targetProductId ? { productId: targetProductId } : { shopId: targetShopId }),
        },
      });

      if (!targetCase) {
        targetCase = await tx.moderationCase.create({
          data: {
            targetType: input.targetType,
            productId: targetProductId,
            shopId: targetShopId,
            targetSnapshot,
            status: ModerationCaseStatus.OPEN,
            reportCount: 1,
            primaryReason: input.reasonCode,
            firstReportAt: now,
            lastActivityAt: now,
            version: 0,
          },
        });
      } else {
        targetCase = await tx.moderationCase.update({
          where: { id: targetCase.id },
          data: {
            reportCount: { increment: 1 },
            lastActivityAt: now,
          },
        });
      }

      // 7. Insert report, evidence references, case event, and record accepted rate-limit event
      const report = await tx.userReport.create({
        data: {
          reporterUserId: input.reporterUserId,
          caseId: targetCase.id,
          targetType: input.targetType,
          productId: targetProductId,
          shopId: targetShopId,
          reasonCode: input.reasonCode,
          details: input.details,
          targetSnapshot,
          idempotencyKey: input.idempotencyKey,
          requestDigest: input.requestDigest,
          status: ReportStatus.SUBMITTED,
          createdAt: now,
        },
      });

      if (input.evidenceUrls && input.evidenceUrls.length > 0) {
        await tx.reportEvidenceReference.createMany({
          data: input.evidenceUrls.map((url, index) => ({
            reportId: report.id,
            url,
            sortOrder: index,
            createdAt: now,
          })),
        });
      }

      await tx.moderationCaseEvent.create({
        data: {
          caseId: targetCase.id,
          eventType: ModerationCaseEventType.REPORT_ATTACHED,
          actorUserId: null,
          version: targetCase.version,
          createdAt: now,
        },
      });

      await tx.reportRateLimitEvent.create({
        data: {
          reporterUserId: input.reporterUserId,
          accepted: true,
          attemptedAt: now,
        },
      });

      return {
        isReplay: false,
        response: {
          reportId: report.id,
          targetType: report.targetType as unknown as 'PRODUCT' | 'SHOP',
          targetId: (report.productId ?? report.shopId)!,
          reasonCode: report.reasonCode as unknown as ContractReportReasonCode,
          status: report.status as unknown as 'SUBMITTED' | 'REVIEWED',
          createdAt: report.createdAt.toISOString(),
        },
      };
    });
  }

  async listReporterReports(
    reporterUserId: string,
    query: ReporterReportListQuery,
  ): Promise<ReporterReportListResponse> {
    const limit = Math.min(query.limit ?? MODERATION_DEFAULT_LIMIT, MODERATION_MAX_LIMIT);
    const where: Prisma.UserReportWhereInput = {
      reporterUserId,
    };

    if (query.targetType) {
      where.targetType = query.targetType as unknown as ReportTargetType;
    }
    if (query.status) {
      where.status = query.status as unknown as ReportStatus;
    }

    const rows = await this.prisma.userReport.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return {
      items: items.map((r) => {
        const snap = r.targetSnapshot as Record<string, unknown>;
        return {
          id: r.id,
          targetType: r.targetType as unknown as 'PRODUCT' | 'SHOP',
          targetId: (r.productId ?? r.shopId)!,
          targetName: (snap?.name as string) ?? 'Unknown',
          reasonCode: r.reasonCode as unknown as ContractReportReasonCode,
          status: r.status as unknown as 'SUBMITTED' | 'REVIEWED',
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        };
      }),
      nextCursor,
    };
  }

  async getReporterReportDetail(
    reporterUserId: string,
    reportId: string,
  ): Promise<ReporterReportDetail> {
    const report = await this.prisma.userReport.findFirst({
      where: {
        id: reportId,
        reporterUserId,
      },
      include: {
        evidenceReferences: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!report) {
      throw new ReportNotFoundError();
    }

    const snap = report.targetSnapshot as Record<string, unknown>;
    return {
      id: report.id,
      targetType: report.targetType as unknown as 'PRODUCT' | 'SHOP',
      targetId: (report.productId ?? report.shopId)!,
      targetName: (snap?.name as string) ?? 'Unknown',
      targetSlug: (snap?.slug as string) ?? null,
      reasonCode: report.reasonCode as unknown as ContractReportReasonCode,
      details: report.details,
      evidenceUrls: report.evidenceReferences.map((e) => e.url),
      status: report.status as unknown as 'SUBMITTED' | 'REVIEWED',
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt ? report.resolvedAt.toISOString() : null,
    };
  }
}
