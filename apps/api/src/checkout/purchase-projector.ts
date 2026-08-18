import {
  CHECKOUT_VERSION,
  parsePurchaseResult,
  type CheckoutAddressSnapshot,
  type MockShippingBreakdown,
  type PurchaseResult,
} from '@shopee-clone/contracts';
import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { checkedMoneyFromBigInt } from '../pricing/money';
import { CheckoutUnavailableError } from './checkout.errors';

export const purchaseInclude = {
  orders: {
    orderBy: [{ shopId: 'asc' as const }, { id: 'asc' as const }],
    include: {
      lines: { orderBy: [{ sourceCartLineId: 'asc' as const }, { id: 'asc' as const }] },
    },
  },
  vouchers: {
    orderBy: [{ slot: 'asc' as const }, { code: 'asc' as const }],
    include: {
      allocations: {
        orderBy: [{ shopOrderId: 'asc' as const }, { orderLineId: 'asc' as const }],
        include: {
          shopOrder: { select: { shopId: true } },
          orderLine: { select: { sourceCartLineId: true } },
        },
      },
      },
  },
  inventoryReservation: true,
} satisfies Prisma.PurchaseInclude;

export type PurchaseGraph = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;

function jsonObject<T>(value: Prisma.JsonValue): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CheckoutUnavailableError();
  }
  return value as T;
}

@Injectable()
export class PurchaseProjector {
  project(purchase: PurchaseGraph): PurchaseResult {
    const orders = purchase.orders.map((order) => {
      const shop = jsonObject<{ id: string; slug: string; name: string }>(order.shopSnapshot);
      const shipping = jsonObject<MockShippingBreakdown>(order.shippingSnapshot);
      return {
        orderReference: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus,
        inventoryHold: purchase.inventoryReservation
          ? {
              status: purchase.inventoryReservation.status,
              expiresAt: purchase.inventoryReservation.expiresAt.toISOString(),
              terminalReason: purchase.inventoryReservation.terminalReason,
            }
          : undefined,
        shop,
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
          merchandiseVoucherDiscountMinor: checkedMoneyFromBigInt(
            line.merchandiseVoucherDiscountMinor,
          ),
          payableMerchandiseMinor: checkedMoneyFromBigInt(line.payableMerchandiseMinor),
          productName: line.productName,
          productImageUrl: line.productImageUrl,
          variantName: line.variantName,
          variantSku: line.variantSku,
        })),
        shipping,
        listSubtotalMinor: checkedMoneyFromBigInt(order.listSubtotalMinor),
        productDiscountMinor: checkedMoneyFromBigInt(order.productDiscountMinor),
        merchandiseSubtotalMinor: checkedMoneyFromBigInt(order.merchandiseSubtotalMinor),
        shopVoucherDiscountMinor: checkedMoneyFromBigInt(order.shopVoucherDiscountMinor),
        platformVoucherDiscountMinor: checkedMoneyFromBigInt(order.platformVoucherDiscountMinor),
        merchandiseVoucherDiscountMinor: checkedMoneyFromBigInt(
          order.merchandiseVoucherDiscountMinor,
        ),
        shippingVoucherDiscountMinor: checkedMoneyFromBigInt(order.shippingVoucherDiscountMinor),
        voucherDiscountMinor: checkedMoneyFromBigInt(order.voucherDiscountMinor),
        shippingPayableMinor: checkedMoneyFromBigInt(order.shippingPayableMinor),
        payableTotalMinor: checkedMoneyFromBigInt(order.payableTotalMinor),
      };
    });
    const result: PurchaseResult = {
      checkoutVersion: CHECKOUT_VERSION,
      pricingVersion: 'pricing-v2',
      voucherVersion: 'voucher-v1',
      shippingVersion: 'mock-v1',
      currency: 'VND',
      purchaseReference: purchase.id,
      createdAt: purchase.createdAt.toISOString(),
      sourceCartVersion: purchase.sourceCartVersion,
      paymentMethod: purchase.paymentMethod,
      paymentStatus: purchase.paymentStatus,
      address: jsonObject<CheckoutAddressSnapshot>(purchase.addressSnapshot),
      orders,
      vouchers: purchase.vouchers.map((voucher) => ({
        code: voucher.code,
        slot: voucher.slot,
        shopId: voucher.shopId,
        status: 'APPLIED',
        name: voucher.name,
        issuer: voucher.issuer,
        benefitType: voucher.benefitType,
        rejectionReason: null,
        discountMinor: checkedMoneyFromBigInt(voucher.discountMinor),
        merchandiseDiscountMinor: checkedMoneyFromBigInt(voucher.merchandiseDiscountMinor),
        shippingDiscountMinor: checkedMoneyFromBigInt(voucher.shippingDiscountMinor),
        allocations: voucher.allocations.map((allocation) => ({
          shopId: allocation.shopOrder.shopId,
          lineId: allocation.orderLine?.sourceCartLineId ?? null,
          amountMinor: checkedMoneyFromBigInt(allocation.amountMinor),
        })),
      })),
      summary: {
        selectedLineCount: orders.reduce((total, order) => total + order.lines.length, 0),
        selectedQuantity: orders.reduce(
          (total, order) =>
            total + order.lines.reduce((lineTotal, line) => lineTotal + line.quantity, 0),
          0,
        ),
        listSubtotalMinor: checkedMoneyFromBigInt(purchase.listSubtotalMinor),
        productDiscountMinor: checkedMoneyFromBigInt(purchase.productDiscountMinor),
        merchandiseSubtotalMinor: checkedMoneyFromBigInt(purchase.merchandiseSubtotalMinor),
        shippingTotalMinor: checkedMoneyFromBigInt(purchase.shippingTotalMinor),
        shopVoucherDiscountMinor: checkedMoneyFromBigInt(purchase.shopVoucherDiscountMinor),
        platformVoucherDiscountMinor: checkedMoneyFromBigInt(purchase.platformVoucherDiscountMinor),
        merchandiseVoucherDiscountMinor: checkedMoneyFromBigInt(
          purchase.merchandiseVoucherDiscountMinor,
        ),
        shippingVoucherDiscountMinor: checkedMoneyFromBigInt(purchase.shippingVoucherDiscountMinor),
        voucherDiscountMinor: checkedMoneyFromBigInt(purchase.voucherDiscountMinor),
        shippingPayableMinor: checkedMoneyFromBigInt(purchase.shippingPayableMinor),
        payableTotalMinor: checkedMoneyFromBigInt(purchase.payableTotalMinor),
      },
    };
    const parsed = parsePurchaseResult(result);
    if (!parsed) throw new CheckoutUnavailableError();
    return parsed;
  }
}
