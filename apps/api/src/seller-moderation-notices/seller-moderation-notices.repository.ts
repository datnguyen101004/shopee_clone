import {
  SELLER_NOTICES_DEFAULT_LIMIT,
  SELLER_NOTICES_MAX_LIMIT,
  type MarkSellerNoticeReadResponse,
  type SellerModerationNoticeListQuery,
  type SellerModerationNoticeListResponse,
  type SellerModerationNoticeSummary,
  type SellerNoticeAction,
  type ReportTargetType,
} from '@shopee-clone/contracts';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SellerModerationNoticesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listNotices(
    ownerUserId: string,
    query: SellerModerationNoticeListQuery,
  ): Promise<SellerModerationNoticeListResponse> {
    const limit = Math.min(
      query.limit ?? SELLER_NOTICES_DEFAULT_LIMIT,
      SELLER_NOTICES_MAX_LIMIT,
    );
    const where: Prisma.SellerModerationNoticeWhereInput = {
      ownerUserId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [rows, unreadCount] = await Promise.all([
      this.prisma.sellerModerationNotice.findMany({
        where,
        take: limit + 1,
        ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
        orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
        include: {
          product: {
            select: { id: true, name: true, slug: true, deletedAt: true, shop: { select: { ownerId: true } } },
          },
          shop: {
            select: { id: true, name: true, slug: true, ownerId: true },
          },
        },
      }),
      this.prisma.sellerModerationNotice.count({
        where: { ownerUserId, readAt: null },
      }),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    const summaries: SellerModerationNoticeSummary[] = items.map((notice) => {
      const snap = notice.targetSnapshot as Record<string, unknown>;
      let targetId: string | null = notice.productId ?? notice.shopId;
      let targetName = (snap?.name as string) ?? 'Unknown';
      let targetSlug = (snap?.slug as string) ?? null;

      if (notice.productId) {
        if (!notice.product || notice.product.deletedAt || notice.product.shop.ownerId !== ownerUserId) {
          targetId = null;
        } else {
          targetName = notice.product.name;
          targetSlug = notice.product.slug;
        }
      } else if (notice.shopId) {
        if (!notice.shop || notice.shop.ownerId !== ownerUserId) {
          targetId = null;
        } else {
          targetName = notice.shop.name;
          targetSlug = notice.shop.slug;
        }
      }

      return {
        id: notice.id,
        targetType: notice.targetType as unknown as ReportTargetType,
        targetId,
        targetName,
        targetSlug,
        action: notice.action as unknown as SellerNoticeAction,
        reason: notice.reason,
        effectiveAt: notice.effectiveAt.toISOString(),
        readAt: notice.readAt ? notice.readAt.toISOString() : null,
      };
    });

    return {
      items: summaries,
      unreadCount,
      nextCursor,
    };
  }

  async markRead(
    ownerUserId: string,
    noticeId: string,
  ): Promise<MarkSellerNoticeReadResponse> {
    const notice = await this.prisma.sellerModerationNotice.findFirst({
      where: { id: noticeId, ownerUserId },
    });

    if (!notice) {
      throw new NotFoundException('Moderation notice not found');
    }

    if (notice.readAt) {
      return {
        noticeId: notice.id,
        readAt: notice.readAt.toISOString(),
      };
    }

    const now = new Date();
    const updated = await this.prisma.sellerModerationNotice.update({
      where: { id: noticeId },
      data: { readAt: now },
    });

    return {
      noticeId: updated.id,
      readAt: now.toISOString(),
    };
  }
}
