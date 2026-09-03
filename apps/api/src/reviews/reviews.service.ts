/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateProductReviewRequest, AuthorProductReview, PublicProductReviewPage, ReviewEligibility, ReviewRating, SellerShopReviewListResponse, UpdateProductReviewRequest } from '@shopee-clone/contracts';
import { REVIEW_VERSION, SELLER_REVIEWS_MAX_LIMIT } from '@shopee-clone/contracts';

import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ReviewDuplicateError, ReviewEligibilityError, ReviewIdempotencyConflictError, ReviewMediaError, ReviewNotFoundError, ReviewStaleError } from './reviews.errors';

const mediaSelect = { id: true, mimeType: true, width: true, height: true, sortOrder: true } satisfies Prisma.ReviewMediaSelect;
const reviewInclude = { buyer: { select: { displayName: true } }, media: { select: mediaSelect, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } satisfies Prisma.ProductReviewInclude;

function digest(input: CreateProductReviewRequest): string {
  return createHash('sha256').update(JSON.stringify({ rating: input.rating, text: input.text?.trim().replace(/\s+/g, ' ') ?? '', mediaIds: input.mediaIds ?? [] })).digest('hex');
}
function cursorEncode(value: { productId: string; rating: number | null; updatedAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
function cursorDecode(cursor: string | null, productId: string, rating: number | null): { updatedAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (value.productId !== productId || value.rating !== rating || typeof value.updatedAt !== 'string' || typeof value.id !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('bad cursor');
    return { updatedAt: new Date(value.updatedAt), id: value.id };
  } catch { throw new ReviewMediaError('invalid-review-cursor'); }
}

@Injectable()
export class ReviewsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async stage(userId: string, upload: { buffer: Buffer; mimeType: string; width: number; height: number; storageKey: string }) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.prisma.reviewMedia.create({ data: { uploaderId: userId, storageKey: upload.storageKey, mimeType: upload.mimeType, byteSize: upload.buffer.byteLength, width: upload.width, height: upload.height, expiresAt } });
  }

  async publicPage(productId: string, query: { rating: ReviewRating | null; limit: number; cursor: string | null }): Promise<PublicProductReviewPage> {
    const cursor = cursorDecode(query.cursor, productId, query.rating);
    const reviews = await this.prisma.productReview.findMany({
      where: { productId, visibility: 'VISIBLE', ...(query.rating ? { rating: query.rating } : {}), ...(cursor ? { OR: [{ updatedAt: { lt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }] } : {}) },
      include: reviewInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
    });
    const product = await this.prisma.product.findFirst({ where: { id: productId, deletedAt: null }, select: { ratingAverageBasisPoints: true, ratingCount: true } });
    if (!product) throw new ReviewNotFoundError();
    const visible = reviews.slice(0, query.limit);
    return { reviewVersion: REVIEW_VERSION, summary: { ratingAverageBasisPoints: product.ratingAverageBasisPoints, ratingCount: product.ratingCount }, items: visible.map((review) => this.publicReview(review)), page: { limit: query.limit, rating: query.rating, nextCursor: reviews.length > query.limit ? cursorEncode({ productId, rating: query.rating, updatedAt: visible.at(-1)!.updatedAt.toISOString(), id: visible.at(-1)!.id }) : null } };
  }

  async authorDetail(userId: string, reviewId: string): Promise<AuthorProductReview> {
    const review = await this.prisma.productReview.findFirst({ where: { id: reviewId, buyerUserId: userId }, include: reviewInclude });
    if (!review) throw new ReviewNotFoundError();
    return this.authorReview(review);
  }

  async listSellerShopReviews(sellerUserId: string): Promise<SellerShopReviewListResponse> {
    const reviews = await this.prisma.productReview.findMany({
      where: { shop: { ownerId: sellerUserId } },
      take: SELLER_REVIEWS_MAX_LIMIT,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        productId: true,
        rating: true,
        text: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        product: { select: { name: true } },
        sellerReports: {
          where: { sellerUserId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { status: true },
        },
      },
    });

    return {
      items: reviews.map((review) => ({
        id: review.id,
        productId: review.productId,
        productName: review.product.name,
        rating: review.rating,
        comment: review.text,
        visibility: review.visibility as 'VISIBLE' | 'HIDDEN',
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
        reportStatus: review.sellerReports[0]
          ? (review.sellerReports[0].status as 'OPEN' | 'RESOLVED')
          : 'NOT_REPORTED',
      })),
    };
  }

  async eligibility(userId: string, orderLineId: string, status: string): Promise<ReviewEligibility> {
    const line = await this.prisma.orderLine.findFirst({ where: { sourceCartLineId: orderLineId, order: { purchase: { buyerId: userId } } }, include: { review: { select: { id: true } } } });
    if (!line) return { state: 'INELIGIBLE', reviewId: null };
    if (line.review) return { state: 'REVIEWED', reviewId: line.review.id };
    return { state: status === 'DELIVERED' ? 'ELIGIBLE' : 'INELIGIBLE', reviewId: null };
  }

  async create(userId: string, orderReference: string, orderLineId: string, idempotencyKey: string, input: CreateProductReviewRequest): Promise<AuthorProductReview> {
    const requestDigest = digest(input);
    return this.prisma.$transaction(async (tx) => {
      // Buyer order responses deliberately expose the stable source cart line id, not the
      // internal order_lines primary key. Lock the exact order-scoped row before checking
      // idempotency/uniqueness so concurrent writes cannot create two reviews.
      await tx.$queryRawUnsafe('SELECT id FROM order_lines WHERE order_id = $1 AND source_cart_line_id = $2 FOR UPDATE', orderReference, orderLineId);
      const prior = await tx.productReview.findFirst({ where: { buyerUserId: userId, idempotencyKey }, include: reviewInclude });
      if (prior) { if (prior.requestDigest !== requestDigest) throw new ReviewIdempotencyConflictError(); return this.authorReview(prior); }
      const line = await tx.orderLine.findFirst({ where: { sourceCartLineId: orderLineId, orderId: orderReference, order: { status: 'DELIVERED', purchase: { buyerId: userId } } }, include: { order: { select: { shopId: true } }, review: { select: { id: true } } } });
      if (!line) throw new ReviewEligibilityError();
      if (line.review) throw new ReviewDuplicateError();
      const mediaIds = input.mediaIds ?? [];
      if (mediaIds.length) {
        const media = await tx.reviewMedia.findMany({ where: { id: { in: mediaIds }, uploaderId: userId, state: 'STAGED', expiresAt: { gt: new Date() } }, select: { id: true } });
        if (media.length !== mediaIds.length) throw new ReviewMediaError('review-media-unavailable');
      }
      const review = await tx.productReview.create({ data: { orderLineId: line.id, buyerUserId: userId, productId: line.productId, shopId: line.order.shopId, rating: input.rating, text: input.text ?? null, idempotencyKey, requestDigest }, include: reviewInclude });
      for (const [sortOrder, id] of mediaIds.entries()) await tx.reviewMedia.update({ where: { id }, data: { reviewId: review.id, state: 'ATTACHED', expiresAt: null, sortOrder } });
      await this.refreshAggregates(tx, review.productId, review.shopId);
      return this.authorReview(await tx.productReview.findUniqueOrThrow({ where: { id: review.id }, include: reviewInclude }));
    });
  }

  async update(userId: string, reviewId: string, expectedVersion: number, input: UpdateProductReviewRequest): Promise<AuthorProductReview> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM product_reviews WHERE id = $1 FOR UPDATE', reviewId);
      const review = await tx.productReview.findFirst({ where: { id: reviewId, buyerUserId: userId }, include: reviewInclude });
      if (!review) throw new ReviewNotFoundError();
      if (review.version !== expectedVersion) throw new ReviewStaleError(review.version);
      const mediaIds = input.mediaIds ?? [];
      if (mediaIds.length) {
        const available = await tx.reviewMedia.findMany({ where: { id: { in: mediaIds }, uploaderId: userId, OR: [{ reviewId }, { state: 'STAGED', expiresAt: { gt: new Date() } }] }, select: { id: true } });
        if (available.length !== mediaIds.length) throw new ReviewMediaError('review-media-unavailable');
      }
      await tx.reviewMedia.updateMany({ where: { reviewId }, data: { reviewId: null, state: 'STAGED', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
      for (const [sortOrder, id] of mediaIds.entries()) await tx.reviewMedia.update({ where: { id }, data: { reviewId, state: 'ATTACHED', expiresAt: null, sortOrder } });
      const updated = await tx.productReview.update({ where: { id: reviewId }, data: { rating: input.rating, text: input.text ?? null, visibility: 'VISIBLE', version: { increment: 1 } }, include: reviewInclude });
      await this.refreshAggregates(tx, updated.productId, updated.shopId);
      return this.authorReview(updated);
    });
  }

  async attachedMedia(id: string) { return this.prisma.reviewMedia.findFirst({ where: { id, state: 'ATTACHED' }, select: { storageKey: true, mimeType: true } }); }

  async cleanupExpired(storage: { remove(key: string): Promise<void> }): Promise<number> {
    const expired = await this.prisma.reviewMedia.findMany({ where: { state: 'STAGED', expiresAt: { lt: new Date() } }, select: { id: true, storageKey: true } });
    for (const item of expired) await storage.remove(item.storageKey);
    if (expired.length) await this.prisma.reviewMedia.deleteMany({ where: { id: { in: expired.map((item) => item.id) }, state: 'STAGED' } });
    return expired.length;
  }

  async repairAggregates(): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const products = await tx.productReview.findMany({ select: { productId: true, shopId: true }, distinct: ['productId', 'shopId'] });
      await tx.product.updateMany({ data: { ratingCount: 0, ratingAverageBasisPoints: 0 } });
      await tx.shop.updateMany({ data: { ratingCount: 0, ratingAverageBasisPoints: 0 } });
      for (const row of products) await this.refreshAggregates(tx, row.productId, row.shopId);
    });
  }

  async adminGetReview(reviewId: string): Promise<any> {
    const review = await this.prisma.productReview.findUnique({
      where: { id: reviewId },
      include: {
        buyer: { select: { displayName: true } },
        product: { select: { id: true, name: true } },
        shop: { select: { id: true, name: true } },
        media: { select: { ...mediaSelect, id: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        moderationEvents: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: { actor: { select: { id: true, displayName: true } } },
        },
        sellerReports: {
          where: { status: 'OPEN' as any },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, reasonCode: true, details: true, createdAt: true },
        },
      },
    });

    if (!review) throw new ReviewNotFoundError();

    return {
      id: review.id,
      productId: review.productId,
      productName: review.product.name,
      authorUserId: review.buyerUserId,
      authorDisplayName: review.buyer.displayName,
      rating: review.rating,
      comment: review.text,
      visibility: review.visibility,
      version: review.version,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      sellerReportCount: review.sellerReports.length,
      sellerReports: review.sellerReports.map((report) => ({
        id: report.id,
        reasonCode: report.reasonCode,
        details: report.details,
        createdAt: report.createdAt.toISOString(),
      })),
    };
  }

  async submitSellerReviewReport(
    sellerUserId: string,
    reviewId: string,
    input: { reasonCode: string; details?: string },
    idempotencyKey: string,
    requestDigest: string,
  ): Promise<{ id: string; reviewId: string; status: 'SUBMITTED' | 'ALREADY_SUBMITTED'; createdAt: string }> {
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.sellerReviewReport.findUnique({
        where: { sellerUserId_idempotencyKey: { sellerUserId, idempotencyKey } },
      });
      if (prior) {
        if (prior.requestDigest !== requestDigest) throw new ReviewIdempotencyConflictError();
        return { id: prior.id, reviewId: prior.reviewId, status: 'SUBMITTED' as const, createdAt: prior.createdAt.toISOString() };
      }

      await tx.$queryRawUnsafe('SELECT id FROM product_reviews WHERE id = $1 FOR UPDATE', reviewId);
      const review = await tx.productReview.findFirst({
        where: { id: reviewId, shop: { ownerId: sellerUserId } },
        select: { id: true, shopId: true },
      });
      if (!review) throw new ReviewNotFoundError();

      const openReport = await tx.sellerReviewReport.findFirst({
        where: { sellerUserId, reviewId, status: 'OPEN' as any },
      });
      if (openReport) {
        return { id: openReport.id, reviewId, status: 'ALREADY_SUBMITTED' as const, createdAt: openReport.createdAt.toISOString() };
      }

      const report = await tx.sellerReviewReport.create({
        data: {
          sellerUserId,
          reviewId,
          shopId: review.shopId,
          reasonCode: input.reasonCode as any,
          details: input.details?.trim() || null,
          idempotencyKey,
          requestDigest,
        },
      });
      return { id: report.id, reviewId, status: 'SUBMITTED' as const, createdAt: report.createdAt.toISOString() };
    });
  }

  async adminListReportedReviews(): Promise<any[]> {
    const reports = await this.prisma.sellerReviewReport.findMany({
      where: { status: 'OPEN' as any },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      distinct: ['reviewId'],
      include: {
        review: {
          include: {
            product: { select: { id: true, name: true } },
            shop: { select: { id: true, name: true } },
            _count: { select: { sellerReports: { where: { status: 'OPEN' as any } } } },
          },
        },
      },
    });
    return reports.map((report) => ({
      reviewId: report.review.id,
      productId: report.review.product.id,
      productName: report.review.product.name,
      shopId: report.review.shop.id,
      shopName: report.review.shop.name,
      rating: report.review.rating,
      comment: report.review.text,
      visibility: report.review.visibility,
      reportCount: report.review._count.sellerReports,
      latestReportedAt: report.createdAt.toISOString(),
    }));
  }

  async adminExecuteReviewAction(
    actorAdminId: string,
    reviewId: string,
    action: 'HIDE' | 'RESTORE' | 'KEEP_VISIBLE',
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
    requestDigest: string,
  ): Promise<any> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Idempotency replay check
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
          return existingCmd.responseBody;
        }
        throw new ReviewIdempotencyConflictError();
      }

      // 2. Lock review row
      await tx.$queryRawUnsafe('SELECT id FROM product_reviews WHERE id = $1 FOR UPDATE', reviewId);
      const review = await tx.productReview.findUnique({
        where: { id: reviewId },
      });

      if (!review) throw new ReviewNotFoundError();
      if (review.version !== expectedVersion) throw new ReviewStaleError(review.version);

      const newVisibility = action === 'HIDE' ? 'HIDDEN' : action === 'RESTORE' ? 'VISIBLE' : review.visibility;
      const now = new Date();
      const nextVersion = action === 'KEEP_VISIBLE' ? review.version : review.version + 1;

      const modEvent = action === 'KEEP_VISIBLE' ? null : await tx.reviewModerationEvent.create({
        data: { reviewId, actorUserId: actorAdminId, previousVisibility: review.visibility, visibility: newVisibility, reason: reason.trim(), createdAt: now },
      });
      if (action !== 'KEEP_VISIBLE') {
        await tx.productReview.update({ where: { id: reviewId }, data: { visibility: newVisibility, version: nextVersion } });
        await this.refreshAggregates(tx, review.productId, review.shopId);
      }
      await tx.sellerReviewReport.updateMany({ where: { reviewId, status: 'OPEN' as any }, data: { status: 'RESOLVED' as any, resolvedAt: now } });

      // 6. Record PrivilegedAuditEvent
      await tx.privilegedAuditEvent.create({
        data: {
          actorUserId: actorAdminId,
          targetType: 'REVIEW' as any,
          targetId: reviewId,
          action: action === 'HIDE' ? ('HIDE' as any) : action === 'RESTORE' ? ('RESTORE' as any) : ('NO_ACTION' as any),
          reason: reason.trim(),
          beforeSummary: { visibility: review.visibility },
          afterSummary: { visibility: newVisibility, sellerReports: 'RESOLVED' },
          reviewModerationEventId: modEvent?.id,
          createdAt: now,
        },
      });

      const responsePayload = {
        reviewId,
        visibility: newVisibility,
        version: nextVersion,
        updatedAt: now.toISOString(),
      };

      // 7. Save moderation command
      await tx.moderationCommand.create({
        data: {
          actorUserId: actorAdminId,
          idempotencyKey,
          requestDigest,
          resourceType: 'REVIEW',
          resourceId: reviewId,
          actionName: action,
          responseStatus: 200,
          responseBody: responsePayload,
          createdAt: now,
        },
      });

      return responsePayload;
    });
  }

  private async refreshAggregates(tx: { productReview: any; product: any; shop: any }, productId: string, shopId: string): Promise<void> {
    const [product, shop] = await Promise.all([
      tx.productReview.aggregate({ where: { productId, visibility: 'VISIBLE' }, _count: { _all: true }, _avg: { rating: true } }),
      tx.productReview.aggregate({ where: { shopId, visibility: 'VISIBLE' }, _count: { _all: true }, _avg: { rating: true } }),
    ]);
    await Promise.all([
      tx.product.update({ where: { id: productId }, data: { ratingCount: product._count._all, ratingAverageBasisPoints: Math.round((product._avg.rating ?? 0) * 100) } }),
      tx.shop.update({ where: { id: shopId }, data: { ratingCount: shop._count._all, ratingAverageBasisPoints: Math.round((shop._avg.rating ?? 0) * 100) } }),
    ]);
  }
  private publicReview(review: any) { return { id: review.id, rating: review.rating as ReviewRating, text: review.text, authorName: review.buyer.displayName, verifiedPurchase: true as const, media: review.media.map((media: any) => ({ ...media, url: `/api/v1/review-media/${media.id}` })), updatedAt: review.updatedAt.toISOString() }; }
  private authorReview(review: any): AuthorProductReview { return { ...this.publicReview(review), orderLineId: review.orderLineId, visibility: review.visibility, version: review.version }; }
}
