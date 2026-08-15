/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateProductReviewRequest, AuthorProductReview, PublicProductReviewPage, ReviewEligibility, ReviewRating, UpdateProductReviewRequest } from '@shopee-clone/contracts';
import { REVIEW_VERSION } from '@shopee-clone/contracts';

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
