import {
  formatSellerOrderVersionEtag,
  isSellerOrderDetailResponse,
  isSellerOrderListResponse,
  SELLER_ORDER_VERSION,
  type SellerOrderAddress,
  type SellerOrderDetail,
  type SellerOrderDetailResponse,
  type SellerOrderFulfillmentEvent,
  type SellerOrderListResponse,
  type SellerOrderOrderTimelineEvent,
  type SellerOrderSummary,
} from '@shopee-clone/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { checkedMoneyFromBigInt } from '../pricing/money';
import { availableSellerActions } from './seller-order-fulfillment';
import type { SellerOrderGraph } from './seller-order.repository';
import { SellerOrderUnavailableError } from './seller-order.errors';
import { publicSellerProductMediaUrl } from '../seller-products/seller-product-media.storage';

function jsonObject<T>(value: Prisma.JsonValue): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new SellerOrderUnavailableError();
  return value as T;
}

function addressFromShop(shop: SellerOrderGraph['shop']): SellerOrderAddress | null {
  if (
    !shop.pickupRecipientName ||
    !shop.pickupPhoneNumber ||
    !shop.pickupProvince ||
    !shop.pickupDistrict ||
    !shop.pickupWard ||
    !shop.pickupAddressLine
  )
    return null;
  return {
    recipientName: shop.pickupRecipientName,
    phoneNumber: shop.pickupPhoneNumber,
    province: shop.pickupProvince,
    district: shop.pickupDistrict,
    ward: shop.pickupWard,
    addressLine: shop.pickupAddressLine,
  };
}

function addressFromSnapshot(value: Prisma.JsonValue): SellerOrderAddress {
  const snapshot = jsonObject<{
    recipientName: string;
    phoneNumber: string;
    province: string;
    district: string;
    ward: string;
    addressLine: string;
  }>(value);
  if (
    !snapshot.recipientName ||
    !snapshot.phoneNumber ||
    !snapshot.province ||
    !snapshot.district ||
    !snapshot.ward ||
    !snapshot.addressLine
  )
    throw new SellerOrderUnavailableError();
  return {
    recipientName: snapshot.recipientName,
    phoneNumber: snapshot.phoneNumber,
    province: snapshot.province,
    district: snapshot.district,
    ward: snapshot.ward,
    addressLine: snapshot.addressLine,
  };
}

function projectFulfillmentEvents(graph: SellerOrderGraph): SellerOrderFulfillmentEvent[] {
  return (graph.fulfillment?.events ?? []).map((event) => ({
    id: event.id,
    previousState: event.previousState,
    state: event.state,
    version: event.fulfillmentVersion,
    actorType: event.actorType,
    actorUserId: event.actorUserId,
    action: event.action as SellerOrderFulfillmentEvent['action'],
    reasonCode: event.reasonCode,
    reasonNote: event.reasonNote,
    late: event.late,
    occurredAt: event.occurredAt.toISOString(),
  }));
}

function projectOrderTimeline(graph: SellerOrderGraph): SellerOrderOrderTimelineEvent[] {
  return graph.timelineEvents.map((event) => ({
    id: event.id,
    previousStatus: event.previousStatus,
    status: event.status,
    orderVersion: event.orderVersion,
    actorType: event.actorType,
    actorUserId: event.actorUserId,
    reasonCode: event.reasonCode,
    reasonNote: event.reasonNote,
    occurredAt: event.occurredAt.toISOString(),
  }));
}

function currentProductImageUrl(line: SellerOrderGraph['lines'][number]): string | null {
  const image = line.product.images[0];
  const cdnUrl = image?.sellerProductMediaAsset?.storageKey
    ? publicSellerProductMediaUrl(image.sellerProductMediaAsset.storageKey)
    : null;
  return cdnUrl ?? line.productImageUrl ?? image?.url ?? null;
}

function projectSummary(graph: SellerOrderGraph, now: Date): SellerOrderSummary {
  const fulfillment = graph.fulfillment;
  const fulfillmentState = fulfillment?.state ?? 'PENDING_CONFIRMATION';
  const fulfillmentVersion = fulfillment?.version ?? 0;
  const confirmationAt =
    fulfillment?.confirmationDeadlineAt ??
    new Date(graph.createdAt.getTime() + 24 * 60 * 60 * 1000);
  const handoffAt = fulfillment?.handoffDeadlineAt ?? null;
  const lines = graph.lines.map((line) => ({
    lineId: line.sourceCartLineId,
    productId: line.productId,
    variantId: line.variantId,
    productName: line.productName,
    productImageUrl: currentProductImageUrl(line),
    variantName: line.variantName,
    variantSku: line.variantSku,
    quantity: line.quantity,
    unitPriceMinor: checkedMoneyFromBigInt(line.sellingUnitPriceMinor),
    payableLineMinor: checkedMoneyFromBigInt(line.payableMerchandiseMinor),
    weightGrams: line.shipmentWeightGrams,
  }));
  const context = {
    orderStatus: graph.status,
    fulfillmentState,
    shipmentExists: graph.shipment !== null,
  } as const;
  return {
    orderReference: graph.id,
    purchaseReference: graph.purchase.id,
    shopId: graph.shop.id,
    status: graph.status,
    paymentStatus: graph.paymentStatus,
    fulfillmentState,
    orderVersion: graph.version,
    fulfillmentVersion,
    createdAt: graph.createdAt.toISOString(),
    updatedAt: graph.updatedAt.toISOString(),
    lineCount: lines.length,
    itemQuantity: lines.reduce((total, line) => total + line.quantity, 0),
    payableTotalMinor: checkedMoneyFromBigInt(graph.payableTotalMinor),
    shippingService: jsonObject<{ service: 'ECONOMY' | 'STANDARD' | 'EXPRESS' }>(
      graph.shippingSnapshot,
    ).service,
    deadline: {
      confirmationAt: confirmationAt.toISOString(),
      handoffAt: handoffAt?.toISOString() ?? null,
      confirmationOverdue: graph.status === 'PENDING_CONFIRMATION' && now > confirmationAt,
      handoffOverdue: graph.status === 'AWAITING_PICKUP' && handoffAt !== null && now > handoffAt,
    },
    lines,
    availableActions: availableSellerActions(context).map((action) => ({
      action,
      reasonCodes:
        action === 'REJECT'
          ? [
              'OUT_OF_STOCK',
              'DAMAGED_OR_DEFECTIVE',
              'PRICE_OR_LISTING_ERROR',
              'CANNOT_FULFILL',
              'OTHER',
            ]
          : [],
    })),
    ...(graph.returnRequest
      ? {
          returnInfo: {
            returnReference: graph.returnRequest.id,
            status: graph.returnRequest.status,
          },
        }
      : {}),
  };
}

function projectDetail(graph: SellerOrderGraph, now: Date): SellerOrderDetail {
  const summary = projectSummary(graph, now);
  const shopAddress = addressFromShop(graph.shop);
  const shipping = jsonObject<Prisma.JsonObject>(
    graph.shippingSnapshot,
  ) as unknown as SellerOrderDetail['shipping'];
  const address = addressFromSnapshot(graph.purchase.addressSnapshot);
  const shipment = graph.shipment
    ? {
        id: graph.shipment.id,
        provider: graph.shipment.provider === 'DEMO_CARRIER' ? ('DEMO_CARRIER' as const) : ('MOCK' as const),
        version: graph.shipment.providerVersion ?? undefined,
        trackingCode: graph.shipment.trackingCode,
        status: graph.shipment.status,
        service: graph.shipment.service as SellerOrderDetail['shipping']['service'],
        handedOffAt: graph.shipment.handedOffAt.toISOString(),
        registeredAt: graph.shipment.registeredAt?.toISOString() ?? null,
        deliveredAt: graph.shipment.deliveredAt?.toISOString() ?? null,
        returnedAt: graph.shipment.returnedAt?.toISOString() ?? null,
        lastUpdatedAt: graph.shipment.lastUpdatedAt?.toISOString() ?? null,
        events: graph.shipment.events.map((event) => ({
          status: event.status,
          previousStatus: event.previousStatus,
          shipmentVersion: event.shipmentVersion,
          externalEventId: event.externalEventId,
          publicReason: event.publicReason,
          carrierOccurredAt: event.carrierOccurredAt?.toISOString() ?? null,
          occurredAt: event.occurredAt.toISOString(),
        })),
      }
    : null;
  return {
    summary,
    shop: {
      id: graph.shop.id,
      slug: graph.shop.slug,
      name: graph.shop.name,
      pickupAddress: shopAddress,
    },
    buyerNote: graph.note,
    address,
    shipping,
    listSubtotalMinor: checkedMoneyFromBigInt(graph.listSubtotalMinor),
    productDiscountMinor: checkedMoneyFromBigInt(graph.productDiscountMinor),
    merchandiseSubtotalMinor: checkedMoneyFromBigInt(graph.merchandiseSubtotalMinor),
    voucherDiscountMinor: checkedMoneyFromBigInt(graph.voucherDiscountMinor),
    shippingPayableMinor: checkedMoneyFromBigInt(graph.shippingPayableMinor),
    payableTotalMinor: checkedMoneyFromBigInt(graph.payableTotalMinor),
    fulfillmentTimeline: projectFulfillmentEvents(graph),
    orderTimeline: projectOrderTimeline(graph),
    shipment,
  };
}

@Injectable()
export class SellerOrderProjector {
  list(
    graphs: SellerOrderGraph[],
    page: number,
    totalItems: number,
    now = new Date(),
  ): SellerOrderListResponse {
    const result: SellerOrderListResponse = {
      sellerOrderVersion: SELLER_ORDER_VERSION,
      items: graphs.map((graph) => projectSummary(graph, now)),
      page,
      pageSize: 10,
      totalItems,
      totalPages: Math.ceil(totalItems / 10),
    };
    if (!isSellerOrderListResponse(result)) throw new SellerOrderUnavailableError();
    return result;
  }

  detail(graph: SellerOrderGraph, now = new Date()): SellerOrderDetailResponse {
    const result: SellerOrderDetailResponse = {
      sellerOrderVersion: SELLER_ORDER_VERSION,
      currency: 'VND',
      order: projectDetail(graph, now),
    };
    if (!isSellerOrderDetailResponse(result)) throw new SellerOrderUnavailableError();
    return result;
  }

  etag(graph: SellerOrderGraph): string {
    return formatSellerOrderVersionEtag(graph.version, graph.fulfillment?.version ?? 0);
  }
}
