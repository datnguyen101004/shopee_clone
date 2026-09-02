import { randomUUID, createHash } from 'node:crypto';

import type {
  DemoCarrierShippingBreakdown,
  SellerOrderActionRequest,
  SellerOrderDetailResponse,
  SellerOrderListResponse,
  SellerOrderQueueQuery,
} from '@shopee-clone/contracts';
import { isShippingBreakdown } from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderLifecycleService } from '../order-history/order-lifecycle.service';
import {
  OrderInventoryHoldConflictError,
  OrderStaleConflictError,
  OrderTransitionConflictError,
} from '../order-history/order-history.errors';
import { SellerOrderCompensationService } from './seller-order-compensation.service';
import {
  canExecuteSellerAction,
  deadlineIsLate,
  targetForSellerAction,
} from './seller-order-fulfillment';
import { sellerOrderActionDigest, sellerOrderDigestsEqual } from './seller-order-canonical';
import {
  SellerOrderIdempotencyConflictError,
  SellerOrderInventoryInvariantError,
  SellerOrderNotFoundError,
  SellerOrderStaleError,
  SellerOrderTransitionError,
  SellerOrderUnavailableError,
  SellerOrderValidationError,
} from './seller-order.errors';
import { decodeSellerOrderCursor, encodeSellerOrderCursor } from './seller-order-cursor';
import { SellerOrderProjector } from './seller-order.projector';
import { SellerOrderRepository } from './seller-order.repository';
import { orderNotificationEvent } from '../notifications/notification-events';
import { NotificationService } from '../notifications/notification.service';
import { publicSellerProductMediaUrl } from '../seller-products/seller-product-media.storage';

@Injectable()
export class SellerOrderService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SellerOrderRepository) private readonly repository: SellerOrderRepository,
    @Inject(SellerOrderProjector) private readonly projector: SellerOrderProjector,
    @Inject(OrderLifecycleService) private readonly lifecycle: OrderLifecycleService,
    @Inject(SellerOrderCompensationService)
    private readonly compensation: SellerOrderCompensationService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async list(userId: string, query: SellerOrderQueueQuery): Promise<SellerOrderListResponse> {
    const cursor = query.cursor ? decodeSellerOrderCursor(query.cursor, query) : null;
    if (query.cursor && !cursor) throw new SellerOrderValidationError(['cursor']);
    const rows = await this.repository.list(userId, query, cursor);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const nextCursor =
      rows.length > query.limit && last
        ? encodeSellerOrderCursor(query, { createdAt: last.createdAt, id: last.id })
        : null;
    return this.projector.list(page, query.limit, nextCursor);
  }

  async detail(userId: string, orderReference: string): Promise<SellerOrderDetailResponse> {
    const graph = await this.repository.detail(userId, orderReference);
    if (!graph) throw new SellerOrderNotFoundError();
    return this.projector.detail(graph);
  }

  private async databaseNow(tx: Pick<Prisma.TransactionClient, '$queryRaw'>): Promise<Date> {
    const rows = await tx.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT clock_timestamp() AS "now"`,
    );
    const now = rows[0]?.now;
    if (!(now instanceof Date) || Number.isNaN(now.getTime()))
      throw new SellerOrderUnavailableError();
    return now;
  }

  private async lockOwnedOrder(
    tx: Prisma.TransactionClient,
    userId: string,
    orderReference: string,
  ): Promise<void> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT so."id"
      FROM "shop_orders" so
      INNER JOIN "shops" s ON s."id" = so."shop_id"
      WHERE so."id" = ${orderReference}::uuid
        AND s."owner_id" = ${userId}::uuid
        AND s."deleted_at" IS NULL
        AND s."status" = 'active'
        AND s."onboarding_status" = 'approved'
      FOR UPDATE OF so
    `);
    if (!locked[0]) throw new SellerOrderNotFoundError();
    await tx.$queryRaw(
      Prisma.sql`SELECT "order_id" FROM "seller_order_fulfillments" WHERE "order_id" = ${orderReference}::uuid FOR UPDATE`,
    );
  }

  private async ensureFulfillmentEvent(
    tx: Prisma.TransactionClient,
    orderId: string,
    createdAt: Date,
  ) {
    const existing = await tx.sellerOrderFulfillment.findUnique({ where: { orderId } });
    if (existing) return existing;
    const created = await this.compensation.ensureFulfillment(tx, orderId, createdAt);
    await tx.sellerOrderFulfillmentEvent.create({
      data: {
        id: randomUUID(),
        orderId,
        previousState: null,
        state: 'PENDING_CONFIRMATION',
        fulfillmentVersion: 0,
        actorType: 'SYSTEM',
        actorUserId: null,
        action: 'ORDER_CREATED',
        reasonCode: 'ORDER_CREATED',
        reasonNote: null,
        late: false,
        occurredAt: createdAt,
      },
    });
    return created;
  }

  async act(
    userId: string,
    orderReference: string,
    expectedOrderVersion: number,
    expectedFulfillmentVersion: number,
    idempotencyKey: string,
    input: SellerOrderActionRequest,
  ): Promise<SellerOrderDetailResponse> {
    const requestDigest = sellerOrderActionDigest(
      orderReference,
      expectedOrderVersion,
      expectedFulfillmentVersion,
      input,
    );
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          await this.lockOwnedOrder(tx, userId, orderReference);
          let current = await this.repository.detail(userId, orderReference, tx);
          if (!current) throw new SellerOrderNotFoundError();
          const replay = await tx.sellerOrderFulfillmentEvent.findFirst({
            where: { orderId: orderReference, idempotencyKey },
            select: { requestDigest: true },
          });
          if (replay) {
            if (
              !replay.requestDigest ||
              !sellerOrderDigestsEqual(replay.requestDigest, requestDigest)
            )
              throw new SellerOrderIdempotencyConflictError();
            return {
              detail: this.projector.detail(current),
              action: input.action,
              orderId: orderReference,
              replay: true as const,
            };
          }
          const fulfillment =
            current.fulfillment ??
            (await this.ensureFulfillmentEvent(tx, orderReference, current.createdAt));
          if (current.purchase.paymentMethod !== 'COD' && current.paymentStatus !== 'PAID') {
            throw new SellerOrderTransitionError();
          }
          if (
            current.version !== expectedOrderVersion ||
            fulfillment.version !== expectedFulfillmentVersion
          )
            throw new SellerOrderStaleError(current.version, fulfillment.version);
          if (
            !canExecuteSellerAction(
              {
                orderStatus: current.status,
                fulfillmentState: fulfillment.state,
                shipmentExists: current.shipment !== null,
              },
              input.action,
            )
          )
            throw new SellerOrderTransitionError();
          const now = await this.databaseNow(tx);
          const late = deadlineIsLate(
            input.action,
            now,
            fulfillment.confirmationDeadlineAt,
            fulfillment.handoffDeadlineAt,
          );
          const target = targetForSellerAction(input.action);
          const reasonCode = input.reasonCode ?? `SELLER_${input.action}`;
          if (
            input.action === 'CONFIRM' ||
            input.action === 'HAND_OFF' ||
            input.action === 'REJECT'
          ) {
            const targetStatus =
              input.action === 'CONFIRM'
                ? 'AWAITING_PICKUP'
                : input.action === 'HAND_OFF'
                  ? 'SHIPPING'
                  : 'CANCELLED';
            await this.lifecycle.transition(tx, {
              orderId: orderReference,
              currentStatus: current.status,
              targetStatus,
              expectedVersion: current.version,
              actorType: 'SELLER',
              actorUserId: userId,
              reasonCode,
              reasonNote: input.reasonNote ?? null,
              idempotencyKey,
              requestDigest,
            });
          }
          if (input.action === 'REJECT') {
            await this.compensation.compensateConsumedInventory(tx, {
              orderId: orderReference,
              actorUserId: userId,
              actorType: 'SELLER',
              state: 'REJECTED',
              action: 'REJECT',
              reasonCode,
              reasonNote: input.reasonNote ?? null,
              idempotencyKey,
              requestDigest,
            });
          }
          const fulfillmentUpdate: Prisma.SellerOrderFulfillmentUpdateInput = {
            state: target,
            version: { increment: 1 },
            updatedAt: now,
          };
          if (input.action === 'CONFIRM') {
            fulfillmentUpdate.confirmedAt = now;
            fulfillmentUpdate.readyForPickupAt = now;
          }
          if (input.action === 'START_PREPARING') fulfillmentUpdate.preparingAt = now;
          if (input.action === 'MARK_READY_FOR_PICKUP') fulfillmentUpdate.readyForPickupAt = now;
          if (input.action === 'HAND_OFF') fulfillmentUpdate.handedOffAt = now;
          if (input.action === 'REJECT') fulfillmentUpdate.rejectedAt = now;
          const advanced = await tx.sellerOrderFulfillment.updateMany({
            where: {
              orderId: orderReference,
              state: fulfillment.state,
              version: fulfillment.version,
            },
            data: fulfillmentUpdate,
          });
          if (advanced.count !== 1)
            throw new SellerOrderStaleError(current.version, fulfillment.version);
          if (input.action === 'CONFIRM') {
            const shipping = current.shippingSnapshot as { service?: string };
            const demoCarrierEnabled = process.env.DEMO_CARRIER_ENABLED === 'true';
            const trackingCode = `${demoCarrierEnabled ? 'DEMO' : 'MOCK'}-${createHash('sha256').update(`${orderReference}:${idempotencyKey}`).digest('hex').slice(0, 16).toUpperCase()}`;
            const shipment = await tx.sellerOrderShipment.create({
              data: {
                id: randomUUID(),
                orderId: orderReference,
                provider: demoCarrierEnabled ? 'DEMO_CARRIER' : 'MOCK',
                trackingCode,
                status: demoCarrierEnabled ? 'REGISTRATION_PENDING' : 'HANDED_OFF',
                service: shipping.service ?? 'STANDARD',
                shippingSnapshot: current.shippingSnapshot as Prisma.InputJsonValue,
                handedOffAt: now,
                providerVersion: demoCarrierEnabled ? 'demo-distance-v1' : null,
                shipmentVersion: 0,
                lastUpdatedAt: now,
              },
            });
            await tx.sellerOrderShipmentEvent.create({
              data: {
                id: randomUUID(),
                shipmentId: shipment.id,
                status: demoCarrierEnabled ? 'REGISTRATION_PENDING' : 'HANDED_OFF',
                previousStatus: null,
                shipmentVersion: 0,
                occurredAt: now,
              },
            });
            if (demoCarrierEnabled) {
              if (
                !isShippingBreakdown(current.shippingSnapshot) ||
                current.shippingSnapshot.provider !== 'DEMO_CARRIER'
              ) {
                throw new SellerOrderValidationError(['shippingSnapshot']);
              }
              const demoShipping = current.shippingSnapshot as DemoCarrierShippingBreakdown;
              const payload = {
                shipmentReference: orderReference,
                trackingCode,
                service: demoShipping.service,
                pickup: {
                  provinceCode: demoShipping.originProvinceCode,
                  districtCode: demoShipping.originDistrictCode,
                },
                delivery: {
                  provinceCode: demoShipping.destinationProvinceCode,
                  districtCode: demoShipping.destinationDistrictCode,
                },
                shipmentWeightGrams: demoShipping.shipmentWeightGrams,
              } satisfies Prisma.InputJsonObject;
              await tx.carrierDispatchOutbox.create({
                data: {
                  id: randomUUID(),
                  shipmentId: shipment.id,
                  shipmentReference: orderReference,
                  payload,
                  payloadDigest: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
                  nextAttemptAt: now,
                },
              });
            }
          }
          await tx.sellerOrderFulfillmentEvent.create({
            data: {
              id: randomUUID(),
              orderId: orderReference,
              previousState: fulfillment.state,
              state: target,
              fulfillmentVersion: fulfillment.version + 1,
              actorType: 'SELLER',
              actorUserId: userId,
              action: input.action,
              reasonCode,
              reasonNote: input.reasonNote ?? null,
              late,
              idempotencyKey,
              requestDigest,
              occurredAt: now,
            },
          });
          current = await this.repository.detail(userId, orderReference, tx);
          if (!current) throw new SellerOrderNotFoundError();
          return {
            detail: this.projector.detail(current, now),
            action: input.action,
            orderId: orderReference,
            replay: false as const,
          };
        },
        { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 15_000 },
      );
      if (!result.replay) await this.emitLifecycleNotification(result.orderId, result.action);
      return result.detail;
    } catch (error) {
      if (
        error instanceof SellerOrderNotFoundError ||
        error instanceof SellerOrderValidationError ||
        error instanceof SellerOrderStaleError ||
        error instanceof SellerOrderTransitionError ||
        error instanceof SellerOrderIdempotencyConflictError ||
        error instanceof SellerOrderInventoryInvariantError ||
        error instanceof OrderStaleConflictError ||
        error instanceof OrderTransitionConflictError ||
        error instanceof OrderInventoryHoldConflictError
      )
        throw error;
      throw new SellerOrderUnavailableError();
    }
  }

  private async emitLifecycleNotification(
    orderId: string,
    action: SellerOrderActionRequest['action'],
  ): Promise<void> {
    const type =
      action === 'HAND_OFF'
        ? ('ORDER_SHIPPING' as const)
        : action === 'REJECT'
          ? ('ORDER_CANCELLED' as const)
          : null;
    if (!type) return;
    try {
      const order = await this.prisma.shopOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          payableTotalMinor: true,
          shop: { select: { ownerId: true } },
          purchase: { select: { buyerId: true } },
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
          type,
          orderId: order.id,
          buyerId: order.purchase.buyerId,
          sellerOwnerId: order.shop.ownerId,
          amountMinor: Number(order.payableTotalMinor),
          thumbnailUrl: cdnUrl ?? order.lines[0]?.productImageUrl ?? image?.url ?? null,
        }),
      );
    } catch (error) {
      console.error('[notifications] seller-order emit failed', error);
    }
  }
}
