import {
  ORDER_CANCELLATION_REASON_CODES,
  ORDER_HISTORY_VERSION,
  parseBuyerOrderDetailResponse,
  parseBuyerOrderListResponse,
  type BuyerOrderDetailResponse,
  type BuyerOrderListResponse,
  type BuyerOrderSummary,
  type BuyerOrderVoucherSnapshot,
  type CheckoutAddressSnapshot,
  type MockShippingBreakdown,
} from '@shopee-clone/contracts';
import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { checkedMoneyFromBigInt } from '../pricing/money';
import { returnEligibilityDeadline } from '../returns/return-policy';
import type { BuyerOrderDetailGraph, BuyerOrderSummaryGraph } from './order-history.repository';
import { OrderHistoryUnavailableError } from './order-history.errors';

function jsonObject<T>(value: Prisma.JsonValue): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrderHistoryUnavailableError();
  }
  return value as T;
}

function projectSummary(order: BuyerOrderSummaryGraph | BuyerOrderDetailGraph): BuyerOrderSummary {
  const status = order.status;
  const delivery = [...order.timelineEvents]
    .reverse()
    .find((event) => event.status === 'DELIVERED');
  const returnDeadline =
    !order.returnRequest && delivery ? returnEligibilityDeadline(delivery.occurredAt) : null;
  return {
    orderReference: order.id,
    purchaseReference: order.purchase.id,
    status,
    paymentStatus: order.paymentStatus,
    version: order.version,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    shop: jsonObject<{ id: string; slug: string; name: string }>(order.shopSnapshot),
    note: order.note,
    lines: order.lines.map((line) => ({
      lineId: line.sourceCartLineId,
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      unitWeightGrams: line.unitWeightGrams,
      shipmentWeightGrams: line.shipmentWeightGrams,
      listUnitPriceMinor: checkedMoneyFromBigInt(line.listUnitPriceMinor),
      sellingUnitPriceMinor: checkedMoneyFromBigInt(line.sellingUnitPriceMinor),
      listSubtotalMinor: checkedMoneyFromBigInt(line.listSubtotalMinor),
      productDiscountMinor: checkedMoneyFromBigInt(line.productDiscountMinor),
      merchandiseSubtotalMinor: checkedMoneyFromBigInt(line.merchandiseSubtotalMinor),
      shopVoucherDiscountMinor: checkedMoneyFromBigInt(line.shopVoucherDiscountMinor),
      platformVoucherDiscountMinor: checkedMoneyFromBigInt(line.platformVoucherDiscountMinor),
      merchandiseVoucherDiscountMinor: checkedMoneyFromBigInt(line.merchandiseVoucherDiscountMinor),
      payableMerchandiseMinor: checkedMoneyFromBigInt(line.payableMerchandiseMinor),
      productName: line.productName,
      productImageUrl: line.productImageUrl,
      productAvailable: line.product.deletedAt === null,
      variantName: line.variantName,
      variantSku: line.variantSku,
      review: line.review
        ? { state: 'REVIEWED' as const, reviewId: line.review.id }
        : {
            state: status === 'DELIVERED' ? ('ELIGIBLE' as const) : ('INELIGIBLE' as const),
            reviewId: null,
          },
    })),
    shipping: jsonObject<MockShippingBreakdown>(order.shippingSnapshot),
    listSubtotalMinor: checkedMoneyFromBigInt(order.listSubtotalMinor),
    productDiscountMinor: checkedMoneyFromBigInt(order.productDiscountMinor),
    merchandiseSubtotalMinor: checkedMoneyFromBigInt(order.merchandiseSubtotalMinor),
    shopVoucherDiscountMinor: checkedMoneyFromBigInt(order.shopVoucherDiscountMinor),
    platformVoucherDiscountMinor: checkedMoneyFromBigInt(order.platformVoucherDiscountMinor),
    merchandiseVoucherDiscountMinor: checkedMoneyFromBigInt(order.merchandiseVoucherDiscountMinor),
    shippingVoucherDiscountMinor: checkedMoneyFromBigInt(order.shippingVoucherDiscountMinor),
    voucherDiscountMinor: checkedMoneyFromBigInt(order.voucherDiscountMinor),
    shippingPayableMinor: checkedMoneyFromBigInt(order.shippingPayableMinor),
    payableTotalMinor: checkedMoneyFromBigInt(order.payableTotalMinor),
    cancellation: {
      allowed: status === 'PENDING_CONFIRMATION',
      reasonCodes: status === 'PENDING_CONFIRMATION' ? [...ORDER_CANCELLATION_REASON_CODES] : [],
    },
    returnCapability: {
      allowed: status === 'DELIVERED' && returnDeadline !== null && returnDeadline >= new Date(),
      deadlineAt: returnDeadline?.toISOString() ?? null,
      returnReference: order.returnRequest?.id ?? null,
    },
    ...(order.purchase.inventoryReservation
      ? {
          inventoryHold: {
            status: order.purchase.inventoryReservation.status,
            expiresAt: order.purchase.inventoryReservation.expiresAt.toISOString(),
            terminalReason: order.purchase.inventoryReservation.terminalReason,
          },
        }
      : {}),
  };
}

function projectVouchers(order: BuyerOrderDetailGraph): BuyerOrderVoucherSnapshot[] {
  const grouped = new Map<string, BuyerOrderVoucherSnapshot>();
  for (const allocation of order.voucherAllocations) {
    const voucher = allocation.purchaseVoucher;
    let snapshot = grouped.get(voucher.id);
    if (!snapshot) {
      snapshot = {
        code: voucher.code,
        name: voucher.name,
        slot: voucher.slot,
        issuer: voucher.issuer,
        benefitType: voucher.benefitType,
        merchandiseDiscountMinor: 0,
        shippingDiscountMinor: 0,
        discountMinor: 0,
        allocations: [],
      };
      grouped.set(voucher.id, snapshot);
    }
    const amountMinor = checkedMoneyFromBigInt(allocation.amountMinor);
    snapshot.allocations.push({
      lineId: allocation.orderLine?.sourceCartLineId ?? null,
      kind: allocation.kind,
      amountMinor,
    });
    if (allocation.kind === 'SHIPPING') snapshot.shippingDiscountMinor += amountMinor;
    else snapshot.merchandiseDiscountMinor += amountMinor;
    snapshot.discountMinor += amountMinor;
  }
  return [...grouped.values()];
}

@Injectable()
export class OrderHistoryProjector {
  list(
    graphs: BuyerOrderSummaryGraph[],
    limit: number,
    nextCursor: string | null,
  ): BuyerOrderListResponse {
    const result: BuyerOrderListResponse = {
      orderHistoryVersion: ORDER_HISTORY_VERSION,
      items: graphs.map(projectSummary),
      page: { limit, nextCursor },
    };
    const parsed = parseBuyerOrderListResponse(result);
    if (!parsed) throw new OrderHistoryUnavailableError();
    return parsed;
  }

  detail(order: BuyerOrderDetailGraph): BuyerOrderDetailResponse {
    const result: BuyerOrderDetailResponse = {
      orderHistoryVersion: ORDER_HISTORY_VERSION,
      currency: 'VND',
      order: projectSummary(order),
      address: jsonObject<CheckoutAddressSnapshot>(order.purchase.addressSnapshot),
      vouchers: projectVouchers(order),
      timeline: order.timelineEvents.map((event) => ({
        id: event.id,
        previousStatus: event.previousStatus,
        status: event.status,
        orderVersion: event.orderVersion,
        actorType: event.actorType,
        actorUserId: event.actorUserId,
        reasonCode: event.reasonCode,
        reasonNote: event.reasonNote,
        occurredAt: event.occurredAt.toISOString(),
      })),
    };
    const parsed = parseBuyerOrderDetailResponse(result);
    if (!parsed) throw new OrderHistoryUnavailableError();
    return parsed;
  }
}
