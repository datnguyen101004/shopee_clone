import {
  type BuyerOrderDetailResponse,
  type BuyerOrderListQuery,
  type BuyerOrderListResponse,
  type CancelOrderRequest,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  cancellationRequestDigest,
  decodeOrderCursor,
  encodeOrderCursor,
  orderDigestsEqual,
} from './order-canonical';
import {
  OrderHistoryUnavailableError,
  OrderHistoryValidationError,
  OrderIdempotencyConflictError,
  OrderNotFoundError,
  OrderStaleConflictError,
  OrderTransitionConflictError,
} from './order-history.errors';
import { OrderHistoryProjector } from './order-history.projector';
import { OrderHistoryRepository } from './order-history.repository';
import { OrderLifecycleService } from './order-lifecycle.service';
import { SellerOrderCompensationService } from '../seller-orders/seller-order-compensation.service';
import { orderNotificationEvent } from '../notifications/notification-events';
import { NotificationService } from '../notifications/notification.service';
import { publicSellerProductMediaUrl } from '../seller-products/seller-product-media.storage';

@Injectable()
export class OrderHistoryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OrderHistoryRepository) private readonly repository: OrderHistoryRepository,
    @Inject(OrderHistoryProjector) private readonly projector: OrderHistoryProjector,
    @Inject(OrderLifecycleService) private readonly lifecycle: OrderLifecycleService,
    @Inject(SellerOrderCompensationService) private readonly compensation: SellerOrderCompensationService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async list(userId: string, query: BuyerOrderListQuery): Promise<BuyerOrderListResponse> {
    const cursor = query.cursor ? decodeOrderCursor(query.cursor, query.filter) : null;
    if (query.cursor && !cursor) throw new OrderHistoryValidationError(['cursor']);
    const rows = await this.repository.list(userId, query, cursor);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeOrderCursor(query.filter, { createdAt: last.createdAt, id: last.id })
        : null;
    return this.projector.list(page, query.limit, nextCursor);
  }

  async detail(userId: string, orderReference: string): Promise<BuyerOrderDetailResponse> {
    const graph = await this.repository.detail(userId, orderReference);
    if (!graph) throw new OrderNotFoundError();
    return this.projector.detail(graph);
  }

  async cancel(
    userId: string,
    orderReference: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: CancelOrderRequest,
  ): Promise<BuyerOrderDetailResponse> {
    const digest = cancellationRequestDigest(userId, orderReference, expectedVersion, input);
    try {
      const result = await this.prisma.$transaction(
        async (transaction) => {
          const locked = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT so."id"
          FROM "shop_orders" so
          INNER JOIN "purchases" p ON p."id" = so."purchase_id"
          WHERE so."id" = ${orderReference}::uuid
            AND p."buyer_id" = ${userId}::uuid
          FOR UPDATE OF so
        `);
          if (!locked[0]) throw new OrderNotFoundError();

          const replay = await transaction.orderTimelineEvent.findFirst({
            where: { orderId: orderReference, idempotencyKey },
            select: { requestDigest: true },
          });
          if (replay) {
            if (!replay.requestDigest || !orderDigestsEqual(replay.requestDigest, digest)) {
              throw new OrderIdempotencyConflictError();
            }
            const replayGraph = await this.repository.detail(userId, orderReference, transaction);
            if (!replayGraph) throw new OrderNotFoundError();
            return {
              detail: this.projector.detail(replayGraph),
              orderId: orderReference,
              replay: true as const,
            };
          }

          const current = await transaction.shopOrder.findUnique({
            where: { id: orderReference },
            select: { status: true, version: true },
          });
          if (!current) throw new OrderNotFoundError();
          if (current.version !== expectedVersion) {
            throw new OrderStaleConflictError(current.version);
          }
          if (current.status !== 'PENDING_CONFIRMATION') {
            throw new OrderTransitionConflictError(current.version);
          }
          await this.lifecycle.transition(transaction, {
            orderId: orderReference,
            currentStatus: current.status,
            targetStatus: 'CANCELLED',
            expectedVersion,
            actorType: 'BUYER',
            actorUserId: userId,
            reasonCode: input.reasonCode,
            reasonNote: input.reasonNote ?? null,
            idempotencyKey,
            requestDigest: digest,
          });
          await this.compensation.cancelAndCompensate(transaction, {
            orderId: orderReference,
            actorUserId: userId,
            actorType: 'BUYER',
            state: 'CANCELLED',
            action: 'BUYER_CANCELLED',
            reasonCode: input.reasonCode,
            reasonNote: input.reasonNote ?? null,
            idempotencyKey,
            requestDigest: digest,
          });
          const updated = await this.repository.detail(userId, orderReference, transaction);
          if (!updated) throw new OrderNotFoundError();
          return { detail: this.projector.detail(updated), orderId: orderReference, replay: false as const };
        },
        { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 15_000 },
      );
      if (!result.replay) await this.emitCancelledNotification(result.orderId, userId);
      return result.detail;
    } catch (error) {
      if (
        error instanceof OrderNotFoundError ||
        error instanceof OrderStaleConflictError ||
        error instanceof OrderTransitionConflictError ||
        error instanceof OrderIdempotencyConflictError ||
        error instanceof OrderHistoryUnavailableError
      )
        throw error;
      throw new OrderHistoryUnavailableError();
    }
  }

  private async emitCancelledNotification(orderId: string, buyerId: string): Promise<void> {
    try {
      const order = await this.prisma.shopOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          payableTotalMinor: true,
          shop: { select: { ownerId: true } },
          lines: {
            take: 1,
            select: {
              productImageUrl: true,
              product: {
                select: {
                  images: {
                    where: { variantId: null },
                    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                    take: 1,
                    select: {
                      url: true,
                      sellerProductMediaAsset: { select: { storageKey: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!order) return;
      const image = order.lines[0]?.product.images[0];
      const cdnUrl = image?.sellerProductMediaAsset?.storageKey
        ? publicSellerProductMediaUrl(image.sellerProductMediaAsset.storageKey)
        : null;
      await this.notifications.notify(
        orderNotificationEvent({
          type: 'ORDER_CANCELLED',
          orderId: order.id,
          buyerId,
          sellerOwnerId: order.shop.ownerId,
          amountMinor: Number(order.payableTotalMinor),
          thumbnailUrl: cdnUrl ?? order.lines[0]?.productImageUrl ?? image?.url ?? null,
        }),
      );
    } catch (error) {
      console.error('[notifications] buyer-cancel emit failed', error);
    }
  }
}
