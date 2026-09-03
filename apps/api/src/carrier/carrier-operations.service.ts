import { randomUUID } from 'node:crypto';

import {
  demoCarrierActionAllowed,
  demoCarrierNextState,
  isShippingBreakdown,
  DEMO_CARRIER_SNAPSHOT_VERSION,
  type DemoCarrierOperationRequest,
  type DemoCarrierFailureReason,
  type DemoCarrierQuote,
  type DemoCarrierShipment,
  type DemoCarrierShipmentState,
  type DemoCarrierCallbackPayload,
  type DemoCarrierShipmentListQuery,
} from '@shopee-clone/contracts';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderLifecycleService } from '../order-history/order-lifecycle.service';
import { orderNotificationEvent } from '../notifications/notification-events';
import { NotificationService } from '../notifications/notification.service';
import { publicSellerProductMediaUrl } from '../seller-products/seller-product-media.storage';
import { createHash } from 'node:crypto';

const demoStates: DemoCarrierShipmentState[] = [
  'REGISTRATION_PENDING',
  'REGISTRATION_FAILED',
  'CREATED',
  'ACCEPTED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
  'RETURN_IN_TRANSIT',
  'DELIVERED',
  'RETURNED',
];

const shipmentInclude = {
  events: { orderBy: [{ shipmentVersion: 'asc' }, { id: 'asc' }] },
  order: {
    select: {
      note: true,
      payableTotalMinor: true,
      createdAt: true,
      purchase: {
        select: {
          currency: true,
          paymentMethod: true,
          addressSnapshot: true,
          buyer: { select: { displayName: true, email: true, phoneNumber: true } },
        },
      },
      shop: {
        select: {
          name: true,
          location: true,
          contactPhone: true,
          pickupRecipientName: true,
          pickupPhoneNumber: true,
          pickupProvince: true,
          pickupDistrict: true,
          pickupWard: true,
          pickupAddressLine: true,
        },
      },
      lines: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          variantId: true,
          productName: true,
          productImageUrl: true,
          variantName: true,
          quantity: true,
          shipmentWeightGrams: true,
          product: {
            select: {
              description: true,
              images: {
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                select: {
                  url: true,
                  variantId: true,
                  sellerProductMediaAsset: { select: { storageKey: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.SellerOrderShipmentInclude;

type ShipmentRow = Prisma.SellerOrderShipmentGetPayload<{ include: typeof shipmentInclude }>;

const carrierProviders = ['DEMO_CARRIER', 'MOCK'] as const;

@Injectable()
export class CarrierOperationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OrderLifecycleService) private readonly lifecycle: OrderLifecycleService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async dashboard() {
    const rows = await this.prisma.sellerOrderShipment.findMany({
      where: { provider: { in: [...carrierProviders] } },
      orderBy: [{ lastUpdatedAt: 'desc' }, { id: 'desc' }],
      take: 10,
      include: shipmentInclude,
    });
    const counts = Object.fromEntries(demoStates.map((state) => [state, 0])) as Record<
      DemoCarrierShipmentState,
      number
    >;
    const all = await this.prisma.sellerOrderShipment.findMany({
      where: { provider: { in: [...carrierProviders] } },
      select: { status: true },
    });
    for (const row of all) {
      counts[toCarrierState(row.status)] += 1;
    }
    return {
      provider: 'DEMO_CARRIER' as const,
      simulation: true as const,
      counts,
      attention: rows.map((row) => this.project(row)),
    };
  }

  async list(query: DemoCarrierShipmentListQuery = { limit: 50 }) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 50);
    const cursor = query.cursor ? decodeCarrierCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new BadRequestException('Invalid shipment cursor');
    const where: Prisma.SellerOrderShipmentWhereInput = {
      provider: { in: [...carrierProviders] },
      ...(query.status === 'CREATED'
        ? { status: { in: ['CREATED', 'HANDED_OFF'] } }
        : query.status
          ? { status: query.status }
          : {}),
      ...(query.service ? { service: query.service } : {}),
      ...(query.reference ? { orderId: query.reference } : {}),
      ...(query.from || query.to
        ? {
            lastUpdatedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(cursor
        ? {
            OR: [
              { lastUpdatedAt: { lt: cursor.updatedAt } },
              { lastUpdatedAt: cursor.updatedAt, trackingCode: { lt: cursor.trackingCode } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.sellerOrderShipment.findMany({
      where,
      orderBy: [{ lastUpdatedAt: 'desc' }, { trackingCode: 'desc' }],
      take: limit + 1,
      include: shipmentInclude,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const nextCursor =
      rows.length > limit && last?.lastUpdatedAt
        ? encodeCarrierCursor({ updatedAt: last.lastUpdatedAt, trackingCode: last.trackingCode })
        : null;
    const body = {
      provider: 'DEMO_CARRIER' as const,
      simulation: true as const,
      items: page.map((row) => this.project(row)),
      page: { limit: page.length, nextCursor },
    };
    const etag = `"${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)}"`;
    return {
      body,
      etag,
    };
  }

  async detail(trackingCode: string) {
    const row = await this.prisma.sellerOrderShipment.findFirst({
      where: { provider: { in: [...carrierProviders] }, trackingCode },
      include: shipmentInclude,
    });
    if (!row) throw new NotFoundException('Shipment not found');
    return this.project(row);
  }

  async action(trackingCode: string, input: DemoCarrierOperationRequest, commandId?: string) {
    if (input.action === 'FAIL_DELIVERY' && !input.reason)
      throw new BadRequestException('Failure reason is required');
    if (input.action === 'FAIL_DELIVERY' && input.reason === 'OTHER' && !input.note?.trim())
      throw new BadRequestException('A note is required for OTHER');
    const commandDigest = commandId
      ? createHash('sha256').update(JSON.stringify(input)).digest('hex')
      : null;
    const result = await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "seller_order_shipments"
        WHERE provider IN ('demo_carrier', 'mock') AND tracking_code = ${trackingCode}
        FOR UPDATE
      `);
        const row = rows[0];
        if (!row) throw new NotFoundException('Shipment not found');
        const shipment = await tx.sellerOrderShipment.findUnique({
          where: { id: row.id },
          include: shipmentInclude,
        });
        if (!shipment) throw new NotFoundException('Shipment not found');
        if (commandId) {
          const replay = await tx.sellerOrderShipmentEvent.findUnique({
            where: { commandId },
            include: {
              shipment: {
                include: shipmentInclude,
              },
            },
          });
          if (replay) {
            if (replay.commandDigest !== commandDigest || replay.shipmentId !== shipment.id) {
              throw new BadRequestException('Idempotency key was already used for another command');
            }
            return {
              shipment: this.project(replay.shipment),
              callback: {
                provider: 'DEMO_CARRIER' as const,
                externalEventId: replay.externalEventId ?? replay.id,
                outcome: 'DUPLICATE' as const,
                status: replay.status as DemoCarrierShipmentState,
                versionNumber: replay.shipmentVersion,
                receivedAt: replay.occurredAt.toISOString(),
              },
            };
          }
        }
        const state = toCarrierState(shipment.status);
        if (!demoCarrierActionAllowed(state, input.action))
          throw new BadRequestException('Action is not available for current state');
        const next = demoCarrierNextState(state, input.action);
        if (!next) throw new BadRequestException('Invalid shipment transition');
        const now = new Date();
        const nextVersion = shipment.shipmentVersion + 1;
        await tx.sellerOrderShipment.update({
          where: { id: shipment.id },
          data: {
            status: next,
            shipmentVersion: nextVersion,
            lastUpdatedAt: now,
            deliveredAt: next === 'DELIVERED' ? now : undefined,
            returnedAt: next === 'RETURNED' ? now : undefined,
          },
        });
        await tx.sellerOrderShipmentEvent.create({
          data: {
            id: randomUUID(),
            shipmentId: shipment.id,
            status: next,
            previousStatus: state,
            shipmentVersion: nextVersion,
            externalEventId: `demo-${randomUUID()}`,
            commandId: commandId ?? null,
            commandDigest,
            publicReason: input.reason ?? null,
            carrierOccurredAt: now,
            occurredAt: now,
          },
        });
        if (next === 'OUT_FOR_DELIVERY') {
          await this.markOrderShippingAfterPickup(tx, shipment.orderId, now);
        }
        if (input.action === 'RETRY_REGISTRATION') {
          const shipping = shipment.shippingSnapshot;
          if (!isShippingBreakdown(shipping) || shipping.provider !== 'DEMO_CARRIER') {
            throw new BadRequestException('Demo Carrier quote snapshot is unavailable');
          }
          const payload = {
            shipmentReference: shipment.orderId,
            trackingCode: shipment.trackingCode,
            pickup: {
              provinceCode: shipping.originProvinceCode,
              districtCode: shipping.originDistrictCode,
            },
            delivery: {
              provinceCode: shipping.destinationProvinceCode,
              districtCode: shipping.destinationDistrictCode,
            },
            shipmentWeightGrams: shipping.shipmentWeightGrams,
            service: shipment.service,
          } satisfies Prisma.InputJsonObject;
          const payloadDigest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
          await tx.carrierDispatchOutbox.upsert({
            where: { shipmentId: shipment.id },
            create: {
              id: randomUUID(),
              shipmentId: shipment.id,
              shipmentReference: shipment.orderId,
              payload,
              payloadDigest,
              attemptCount: 0,
              nextAttemptAt: now,
              outcome: null,
              errorCode: null,
              leaseOwner: null,
              leaseUntil: null,
            },
            update: {
              payload,
              payloadDigest,
              attemptCount: 0,
              nextAttemptAt: now,
              outcome: null,
              errorCode: null,
              leaseOwner: null,
              leaseUntil: null,
            },
          });
        }
        if (next === 'DELIVERED' || next === 'RETURNED') {
          const order = await tx.shopOrder.findUnique({
            where: { id: shipment.orderId },
            select: { status: true, version: true },
          });
          if (order?.status === 'SHIPPING') {
            await this.lifecycle.transition(tx, {
              orderId: shipment.orderId,
              currentStatus: 'SHIPPING',
              targetStatus: next === 'DELIVERED' ? 'DELIVERED' : 'CANCELLED',
              expectedVersion: order.version,
              actorType: 'SYSTEM',
              actorUserId: null,
              reasonCode:
                next === 'DELIVERED' ? 'CARRIER_DELIVERED' : 'CARRIER_RETURNED_UNDELIVERED',
              reasonNote: input.note?.trim() || null,
            });
          }
        }
        const updated = await tx.sellerOrderShipment.findUnique({
          where: { id: shipment.id },
          include: shipmentInclude,
        });
        if (!updated) throw new NotFoundException('Shipment not found');
        return {
          shipment: this.project(updated),
          callback: {
            provider: 'DEMO_CARRIER' as const,
            externalEventId: updated.events.at(-1)?.externalEventId ?? `demo-${randomUUID()}`,
            outcome: 'APPLIED' as const,
            status: updated.status as DemoCarrierShipmentState,
            versionNumber: updated.shipmentVersion,
            receivedAt: new Date().toISOString(),
          },
        };
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 15_000 },
    );
    if (result.callback.outcome === 'APPLIED' && result.shipment.status === 'OUT_FOR_DELIVERY') {
      await this.emitShippingNotification(result.shipment.shipmentReference);
    }
    return result;
  }

  async reconcileCallback(payload: DemoCarrierCallbackPayload, rawBody: Buffer) {
    const digest = createHash('sha256').update(rawBody).digest('hex');
    const result = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.carrierCallbackReceipt.findUnique({
          where: {
            provider_externalEventId: {
              provider: 'DEMO_CARRIER',
              externalEventId: payload.externalEventId,
            },
          },
        });
        if (existing) {
          return {
            provider: 'DEMO_CARRIER' as const,
            externalEventId: payload.externalEventId,
            outcome: existing.payloadDigest === digest ? existing.outcome : 'CONFLICT',
            status: existing.resultStatus as DemoCarrierShipmentState | null,
            versionNumber: existing.resultVersion,
            receivedAt: existing.receivedAt.toISOString(),
          };
        }
        const shipment = await tx.sellerOrderShipment.findFirst({
          where: { provider: 'DEMO_CARRIER', orderId: payload.shipmentReference },
          include: { events: { orderBy: [{ shipmentVersion: 'asc' }, { id: 'asc' }] } },
        });
        if (!shipment) {
          await tx.carrierCallbackReceipt.create({
            data: {
              provider: 'DEMO_CARRIER',
              externalEventId: payload.externalEventId,
              payloadDigest: digest,
              outcome: 'REJECTED',
            },
          });
          return {
            provider: 'DEMO_CARRIER' as const,
            externalEventId: payload.externalEventId,
            outcome: 'REJECTED' as const,
            status: null,
            versionNumber: null,
            receivedAt: new Date().toISOString(),
          };
        }
        const current = shipment.status as DemoCarrierShipmentState;
        if (payload.versionNumber <= shipment.shipmentVersion) {
          await tx.carrierCallbackReceipt.create({
            data: {
              provider: 'DEMO_CARRIER',
              externalEventId: payload.externalEventId,
              payloadDigest: digest,
              shipmentId: shipment.id,
              outcome: 'STALE',
              resultStatus: shipment.status,
              resultVersion: shipment.shipmentVersion,
            },
          });
          return {
            provider: 'DEMO_CARRIER' as const,
            externalEventId: payload.externalEventId,
            outcome: 'STALE' as const,
            status: shipment.status,
            versionNumber: shipment.shipmentVersion,
            receivedAt: new Date().toISOString(),
          };
        }
        if (
          payload.versionNumber !== shipment.shipmentVersion + 1 ||
          !isCallbackTransitionAllowed(current, payload.status)
        ) {
          await tx.carrierCallbackReceipt.create({
            data: {
              provider: 'DEMO_CARRIER',
              externalEventId: payload.externalEventId,
              payloadDigest: digest,
              shipmentId: shipment.id,
              outcome: 'REJECTED',
              resultStatus: shipment.status,
              resultVersion: shipment.shipmentVersion,
            },
          });
          return {
            provider: 'DEMO_CARRIER' as const,
            externalEventId: payload.externalEventId,
            outcome: 'REJECTED' as const,
            status: shipment.status,
            versionNumber: shipment.shipmentVersion,
            receivedAt: new Date().toISOString(),
          };
        }
        await tx.sellerOrderShipment.update({
          where: { id: shipment.id },
          data: {
            status: payload.status,
            shipmentVersion: payload.versionNumber,
            lastUpdatedAt: new Date(payload.occurredAt),
            deliveredAt: payload.status === 'DELIVERED' ? new Date(payload.occurredAt) : undefined,
            returnedAt: payload.status === 'RETURNED' ? new Date(payload.occurredAt) : undefined,
            externalShipmentId: payload.externalShipmentId,
            registeredAt: shipment.registeredAt ?? new Date(payload.occurredAt),
          },
        });
        await tx.sellerOrderShipmentEvent.create({
          data: {
            id: randomUUID(),
            shipmentId: shipment.id,
            status: payload.status,
            previousStatus: current,
            shipmentVersion: payload.versionNumber,
            externalEventId: payload.externalEventId,
            publicReason: payload.reason ?? null,
            carrierOccurredAt: new Date(payload.occurredAt),
            occurredAt: new Date(),
          },
        });
        if (payload.status === 'OUT_FOR_DELIVERY') {
          await this.markOrderShippingAfterPickup(
            tx,
            shipment.orderId,
            new Date(payload.occurredAt),
          );
        }
        if (payload.status === 'DELIVERED' || payload.status === 'RETURNED') {
          const order = await tx.shopOrder.findUnique({
            where: { id: shipment.orderId },
            select: { status: true, version: true },
          });
          if (order?.status === 'SHIPPING')
            await this.lifecycle.transition(tx, {
              orderId: shipment.orderId,
              currentStatus: 'SHIPPING',
              targetStatus: payload.status === 'DELIVERED' ? 'DELIVERED' : 'CANCELLED',
              expectedVersion: order.version,
              actorType: 'SYSTEM',
              actorUserId: null,
              reasonCode:
                payload.status === 'DELIVERED'
                  ? 'CARRIER_DELIVERED'
                  : 'CARRIER_RETURNED_UNDELIVERED',
              reasonNote: payload.reason ?? null,
            });
        }
        await tx.carrierCallbackReceipt.create({
          data: {
            provider: 'DEMO_CARRIER',
            externalEventId: payload.externalEventId,
            payloadDigest: digest,
            shipmentId: shipment.id,
            outcome: 'APPLIED',
            resultStatus: payload.status,
            resultVersion: payload.versionNumber,
          },
        });
        return {
          provider: 'DEMO_CARRIER' as const,
          externalEventId: payload.externalEventId,
          outcome: 'APPLIED' as const,
          status: payload.status,
          versionNumber: payload.versionNumber,
          receivedAt: new Date().toISOString(),
        };
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 15_000 },
    );
    if (result.outcome === 'APPLIED' && result.status === 'OUT_FOR_DELIVERY') {
      await this.emitShippingNotification(payload.shipmentReference);
    }
    return result;
  }

  private async markOrderShippingAfterPickup(
    tx: Prisma.TransactionClient,
    orderId: string,
    occurredAt: Date,
  ): Promise<void> {
    const order = await tx.shopOrder.findUnique({
      where: { id: orderId },
      select: { status: true, version: true },
    });
    if (order?.status !== 'AWAITING_PICKUP') return;

    await this.lifecycle.transition(tx, {
      orderId,
      currentStatus: 'AWAITING_PICKUP',
      targetStatus: 'SHIPPING',
      expectedVersion: order.version,
      actorType: 'SYSTEM',
      actorUserId: null,
      reasonCode: 'CARRIER_PICKED_UP',
      reasonNote: null,
    });

    const fulfillment = await tx.sellerOrderFulfillment.findUnique({
      where: { orderId },
      select: { state: true, version: true },
    });
    if (!fulfillment || fulfillment.state === 'HANDED_OFF') return;
    const updated = await tx.sellerOrderFulfillment.updateMany({
      where: { orderId, state: fulfillment.state, version: fulfillment.version },
      data: {
        state: 'HANDED_OFF',
        version: { increment: 1 },
        handedOffAt: occurredAt,
        updatedAt: occurredAt,
      },
    });
    if (updated.count !== 1) {
      throw new BadRequestException('Order fulfillment changed while carrier pickup was applied');
    }
    await tx.sellerOrderFulfillmentEvent.create({
      data: {
        id: randomUUID(),
        orderId,
        previousState: fulfillment.state,
        state: 'HANDED_OFF',
        fulfillmentVersion: fulfillment.version + 1,
        actorType: 'SYSTEM',
        actorUserId: null,
        action: 'HAND_OFF',
        reasonCode: 'CARRIER_PICKED_UP',
        reasonNote: null,
        late: false,
        occurredAt,
      },
    });
  }

  private async emitShippingNotification(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.shopOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          payableTotalMinor: true,
          shop: { select: { ownerId: true } },
          purchase: { select: { buyerId: true, currency: true } },
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
          type: 'ORDER_SHIPPING',
          orderId: order.id,
          buyerId: order.purchase.buyerId,
          sellerOwnerId: order.shop.ownerId,
          amountMinor: Number(order.payableTotalMinor),
          currency: order.purchase.currency,
          thumbnailUrl: cdnUrl ?? order.lines[0]?.productImageUrl ?? image?.url ?? null,
        }),
      );
    } catch (error) {
      console.error('[notifications] carrier-pickup emit failed', error);
    }
  }

  private project(row: ShipmentRow): DemoCarrierShipment {
    const address = asRecord(row.order.purchase.addressSnapshot);
    const quote = toCarrierQuote(row.shippingSnapshot, row.orderId, row.createdAt);
    const pickupProvince = row.order.shop.pickupProvince ?? quote.pickup.provinceName;
    const pickupDistrict = row.order.shop.pickupDistrict ?? quote.pickup.districtName;
    const deliveryProvince = recordText(address, 'province') || quote.delivery.provinceName;
    const deliveryDistrict = recordText(address, 'district') || quote.delivery.districtName;
    const senderAddress = joinAddress([
      row.order.shop.pickupAddressLine,
      row.order.shop.pickupWard,
      row.order.shop.pickupDistrict,
      row.order.shop.pickupProvince,
      row.order.shop.location,
    ]);
    const recipientAddress = joinAddress([
      recordText(address, 'addressLine'),
      recordText(address, 'ward'),
      recordText(address, 'district'),
      recordText(address, 'province'),
    ]);
    return {
      provider: 'DEMO_CARRIER' as const,
      version: 'demo-distance-v1',
      simulation: true as const,
      shipmentReference: row.orderId,
      trackingCode: row.trackingCode,
      externalShipmentId: row.externalShipmentId ?? `pending-${row.id}`,
      status: toCarrierState(row.status),
      service: row.service as 'ECONOMY' | 'STANDARD' | 'EXPRESS',
      quote: {
        ...quote,
        pickup: {
          ...quote.pickup,
          provinceName: pickupProvince,
          districtName: pickupDistrict,
        },
        delivery: {
          ...quote.delivery,
          provinceName: deliveryProvince,
          districtName: deliveryDistrict,
        },
      },
      versionNumber: row.shipmentVersion,
      registeredAt: row.registeredAt?.toISOString() ?? row.handedOffAt.toISOString(),
      lastUpdatedAt: row.lastUpdatedAt?.toISOString() ?? row.updatedAt.toISOString(),
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      returnedAt: row.returnedAt?.toISOString() ?? null,
      events: row.events.map((event) => ({
        externalEventId: event.externalEventId ?? event.id,
        shipmentReference: row.orderId,
        previousStatus: event.previousStatus ? toCarrierState(event.previousStatus) : null,
        status: toCarrierState(event.status),
        versionNumber: event.shipmentVersion,
        reason: (event.publicReason as DemoCarrierFailureReason | null) ?? null,
        note: null,
        occurredAt: (event.carrierOccurredAt ?? event.occurredAt).toISOString(),
      })),
      sender: {
        name: row.order.shop.pickupRecipientName ?? row.order.shop.name,
        phoneNumber: row.order.shop.pickupPhoneNumber ?? row.order.shop.contactPhone,
        address: senderAddress || row.order.shop.location,
      },
      recipient: {
        name:
          recordText(address, 'recipientName') ||
          row.order.purchase.buyer.displayName ||
          row.order.purchase.buyer.email,
        phoneNumber: recordText(address, 'phoneNumber') || row.order.purchase.buyer.phoneNumber,
        address: recipientAddress,
      },
      order: {
        shopName: row.order.shop.name,
        currency: row.order.purchase.currency,
        createdAt: row.order.createdAt.toISOString(),
        note: row.order.note.trim() || null,
        codAmountMinor:
          row.order.purchase.paymentMethod === 'COD' ? Number(row.order.payableTotalMinor) : 0,
        items: row.order.lines.map((line) => {
          const image =
            line.product.images.find((candidate) => candidate.variantId === line.variantId) ??
            line.product.images.find((candidate) => candidate.variantId === null) ??
            line.product.images[0];
          const currentImageUrl = image?.sellerProductMediaAsset?.storageKey
            ? publicSellerProductMediaUrl(image.sellerProductMediaAsset.storageKey)
            : image?.url ?? null;
          return {
            productName: line.productName,
            variantName: line.variantName,
            quantity: line.quantity,
            shipmentWeightGrams: line.shipmentWeightGrams,
            imageUrl: line.productImageUrl ?? currentImageUrl,
            description: line.product.description.trim() || null,
          };
        }),
      },
      driver: null,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordText(value: Record<string, unknown>, key: string): string {
  return typeof value[key] === 'string' ? String(value[key]).trim() : '';
}

function joinAddress(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index)
    .join(', ');
}

function toCarrierState(status: string): DemoCarrierShipmentState {
  if (status === 'HANDED_OFF') return 'CREATED';
  return demoStates.includes(status as DemoCarrierShipmentState)
    ? (status as DemoCarrierShipmentState)
    : 'CREATED';
}

function toCarrierQuote(
  value: unknown,
  shipmentReference: string,
  calculatedAt: Date,
): DemoCarrierQuote {
  const snapshot =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const textValue = (key: string, fallback: string) =>
    typeof snapshot[key] === 'string' && snapshot[key] ? String(snapshot[key]) : fallback;
  const numberValue = (key: string, fallback = 0) =>
    typeof snapshot[key] === 'number' && Number.isFinite(snapshot[key])
      ? Number(snapshot[key])
      : fallback;
  const demo = snapshot.provider === 'DEMO_CARRIER';
  const originProvince = textValue('originProvince', 'Việt Nam');
  const originDistrict = textValue('originDistrict', originProvince);
  const destinationProvince = textValue('destinationProvince', 'Việt Nam');
  const destinationDistrict = textValue('destinationDistrict', destinationProvince);
  const zoneFee = numberValue('zoneSurchargeMinor');
  const weightFee = demo ? numberValue('weightFeeMinor') : numberValue('weightSurchargeMinor');
  const totalFee = numberValue('shippingFeeMinor');

  return {
    provider: 'DEMO_CARRIER',
    version: 'demo-distance-v1',
    simulation: true,
    shipmentReference,
    pickup: {
      provinceCode: textValue('originProvinceCode', 'LEGACY'),
      districtCode: textValue('originDistrictCode', 'LEGACY'),
      provinceName: originProvince,
      districtName: originDistrict,
      resolutionLevel: 'DISTRICT',
    },
    delivery: {
      provinceCode: textValue('destinationProvinceCode', 'LEGACY'),
      districtCode: textValue('destinationDistrictCode', 'LEGACY'),
      provinceName: destinationProvince,
      districtName: destinationDistrict,
      resolutionLevel: 'DISTRICT',
    },
    straightLineDistanceKm: numberValue('straightLineDistanceKm'),
    estimatedDistanceKm: numberValue('estimatedDistanceKm'),
    billableDistanceKm: numberValue('billableDistanceKm'),
    shipmentWeightGrams: numberValue('shipmentWeightGrams'),
    service: textValue('service', 'STANDARD') as DemoCarrierQuote['service'],
    estimatedDaysMin: numberValue('estimatedDaysMin'),
    estimatedDaysMax: numberValue('estimatedDaysMax'),
    baseFeeMinor: numberValue('baseFeeMinor'),
    nearDistanceFeeMinor: numberValue('nearDistanceFeeMinor'),
    longDistanceFeeMinor: demo ? numberValue('longDistanceFeeMinor') : zoneFee,
    weightFeeMinor: weightFee,
    totalFeeMinor: totalFee,
    currency: 'VND',
    calculationVersion: 'demo-distance-v1',
    locationSnapshotVersion: DEMO_CARRIER_SNAPSHOT_VERSION,
    calculatedAt: calculatedAt.toISOString(),
  };
}

function isCallbackTransitionAllowed(
  current: DemoCarrierShipmentState,
  next: DemoCarrierShipmentState,
): boolean {
  if (current === 'REGISTRATION_PENDING')
    return next === 'CREATED' || next === 'REGISTRATION_FAILED';
  if (current === 'REGISTRATION_FAILED') return next === 'REGISTRATION_PENDING';
  if (current === 'CREATED') return next === 'OUT_FOR_DELIVERY' || next === 'ACCEPTED';
  if (current === 'ACCEPTED') return next === 'IN_TRANSIT';
  if (current === 'IN_TRANSIT') return next === 'OUT_FOR_DELIVERY';
  if (current === 'OUT_FOR_DELIVERY') return next === 'DELIVERY_FAILED' || next === 'DELIVERED';
  if (current === 'DELIVERY_FAILED')
    return next === 'OUT_FOR_DELIVERY' || next === 'RETURN_IN_TRANSIT';
  if (current === 'RETURN_IN_TRANSIT') return next === 'RETURNED';
  return false;
}

function encodeCarrierCursor(value: { updatedAt: Date; trackingCode: string }): string {
  return Buffer.from(
    JSON.stringify({ updatedAt: value.updatedAt.toISOString(), trackingCode: value.trackingCode }),
    'utf8',
  ).toString('base64url');
}

function decodeCarrierCursor(value: string): { updatedAt: Date; trackingCode: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (typeof parsed.updatedAt !== 'string' || typeof parsed.trackingCode !== 'string')
      return null;
    const updatedAt = new Date(parsed.updatedAt);
    return Number.isNaN(updatedAt.getTime())
      ? null
      : { updatedAt, trackingCode: parsed.trackingCode };
  } catch {
    return null;
  }
}
