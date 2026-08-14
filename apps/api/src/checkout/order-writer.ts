import { randomUUID } from 'node:crypto';

import type { CheckoutPreviewResponse } from '@shopee-clone/contracts';
import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import type { AppliedVoucherSnapshot } from '../vouchers/voucher-pricing.calculator';
import { CheckoutUnavailableError } from './checkout.errors';

export interface WritePurchaseInput {
  purchaseId: string;
  buyerId: string;
  idempotencyKey: string;
  requestDigest: string;
  preview: CheckoutPreviewResponse;
  applied: readonly AppliedVoucherSnapshot[];
}

export interface WrittenPurchaseVouchers {
  byVoucherId: ReadonlyMap<string, string>;
}

const money = (value: number) => BigInt(value);
const json = (value: object) => value as Prisma.InputJsonValue;

@Injectable()
export class OrderWriter {
  async write(
    transaction: Prisma.TransactionClient,
    input: WritePurchaseInput,
  ): Promise<WrittenPurchaseVouchers> {
    const { summary } = input.preview;
    await transaction.purchase.create({
      data: {
        id: input.purchaseId,
        buyerId: input.buyerId,
        idempotencyKey: input.idempotencyKey,
        requestDigest: input.requestDigest,
        checkoutFingerprint: input.preview.checkoutFingerprint!,
        sourceCartVersion: input.preview.cartVersion,
        addressSnapshot: json(input.preview.address),
        listSubtotalMinor: money(summary.listSubtotalMinor),
        productDiscountMinor: money(summary.productDiscountMinor),
        merchandiseSubtotalMinor: money(summary.merchandiseSubtotalMinor),
        shippingTotalMinor: money(summary.shippingTotalMinor),
        shopVoucherDiscountMinor: money(summary.shopVoucherDiscountMinor),
        platformVoucherDiscountMinor: money(summary.platformVoucherDiscountMinor),
        merchandiseVoucherDiscountMinor: money(summary.merchandiseVoucherDiscountMinor),
        shippingVoucherDiscountMinor: money(summary.shippingVoucherDiscountMinor),
        voucherDiscountMinor: money(summary.voucherDiscountMinor),
        shippingPayableMinor: money(summary.shippingPayableMinor),
        payableTotalMinor: money(summary.payableTotalMinor),
      },
    });

    const orderByShop = new Map<string, string>();
    const lineBySource = new Map<string, string>();
    for (const shop of [...input.preview.shops].sort((left, right) =>
      left.shop.id.localeCompare(right.shop.id),
    )) {
      const orderId = randomUUID();
      orderByShop.set(shop.shop.id, orderId);
      await transaction.shopOrder.create({
        data: {
          id: orderId,
          purchaseId: input.purchaseId,
          shopId: shop.shop.id,
          shopSnapshot: json(shop.shop),
          note: shop.note,
          shippingSnapshot: json(shop.shipping),
          listSubtotalMinor: money(shop.listSubtotalMinor),
          productDiscountMinor: money(shop.productDiscountMinor),
          merchandiseSubtotalMinor: money(shop.merchandiseSubtotalMinor),
          shopVoucherDiscountMinor: money(shop.shopVoucherDiscountMinor),
          platformVoucherDiscountMinor: money(shop.platformVoucherDiscountMinor),
          merchandiseVoucherDiscountMinor: money(shop.merchandiseVoucherDiscountMinor),
          shippingVoucherDiscountMinor: money(shop.shippingVoucherDiscountMinor),
          voucherDiscountMinor: money(shop.voucherDiscountMinor),
          shippingPayableMinor: money(shop.shippingPayableMinor),
          payableTotalMinor: money(shop.payableTotalMinor),
        },
      });
      await transaction.orderTimelineEvent.create({
        data: {
          id: randomUUID(),
          orderId,
          previousStatus: null,
          status: 'PENDING_CONFIRMATION',
          orderVersion: 0,
          actorType: 'SYSTEM',
          actorUserId: null,
          reasonCode: 'ORDER_CREATED',
          reasonNote: null,
        },
      });
      for (const line of [...shop.lines].sort((left, right) =>
        left.lineId.localeCompare(right.lineId),
      )) {
        const orderLineId = randomUUID();
        lineBySource.set(line.lineId, orderLineId);
        await transaction.orderLine.create({
          data: {
            id: orderLineId,
            orderId,
            sourceCartLineId: line.lineId,
            productId: line.productId,
            variantId: line.variantId,
            productName: line.productName,
            productImageUrl: line.productImageUrl,
            variantName: line.variantName,
            variantSku: line.variantSku,
            quantity: line.quantity,
            unitWeightGrams: line.unitWeightGrams,
            shipmentWeightGrams: line.shipmentWeightGrams,
            listUnitPriceMinor: money(line.listUnitPriceMinor),
            sellingUnitPriceMinor: money(line.sellingUnitPriceMinor),
            listSubtotalMinor: money(line.listSubtotalMinor),
            productDiscountMinor: money(line.productDiscountMinor),
            merchandiseSubtotalMinor: money(line.merchandiseSubtotalMinor),
            shopVoucherDiscountMinor: money(line.shopVoucherDiscountMinor),
            platformVoucherDiscountMinor: money(line.platformVoucherDiscountMinor),
            merchandiseVoucherDiscountMinor: money(line.merchandiseVoucherDiscountMinor),
            payableMerchandiseMinor: money(line.payableMerchandiseMinor),
          },
        });
      }
    }

    const appliedByCode = new Map(input.applied.map((voucher) => [voucher.code, voucher]));
    const purchaseVoucherByVoucherId = new Map<string, string>();
    for (const result of input.preview.vouchers.filter(({ status }) => status === 'APPLIED')) {
      const applied = appliedByCode.get(result.code);
      if (
        !applied ||
        result.name === null ||
        result.issuer === null ||
        result.benefitType === null
      ) {
        throw new CheckoutUnavailableError();
      }
      const purchaseVoucherId = randomUUID();
      purchaseVoucherByVoucherId.set(applied.voucherId, purchaseVoucherId);
      await transaction.purchaseVoucher.create({
        data: {
          id: purchaseVoucherId,
          purchaseId: input.purchaseId,
          voucherId: applied.voucherId,
          shopId: result.shopId,
          code: result.code,
          name: result.name,
          issuer: result.issuer,
          benefitType: result.benefitType,
          slot: result.slot,
          merchandiseDiscountMinor: money(result.merchandiseDiscountMinor),
          shippingDiscountMinor: money(result.shippingDiscountMinor),
          discountMinor: money(result.discountMinor),
        },
      });
      for (const allocation of result.allocations) {
        const shopOrderId = orderByShop.get(allocation.shopId);
        const orderLineId =
          allocation.lineId === null ? null : (lineBySource.get(allocation.lineId) ?? null);
        if (!shopOrderId || (allocation.lineId !== null && orderLineId === null)) {
          throw new CheckoutUnavailableError();
        }
        await transaction.purchaseVoucherAllocation.create({
          data: {
            id: randomUUID(),
            purchaseVoucherId,
            shopOrderId,
            orderLineId,
            kind: allocation.lineId === null ? 'SHIPPING' : 'MERCHANDISE',
            amountMinor: money(allocation.amountMinor),
          },
        });
      }
    }
    return { byVoucherId: purchaseVoucherByVoucherId };
  }

  async linkRedemptions(
    transaction: Prisma.TransactionClient,
    purchaseId: string,
    written: WrittenPurchaseVouchers,
    redemptions: readonly { id: string; voucherId: string }[],
  ): Promise<void> {
    if (written.byVoucherId.size !== redemptions.length) {
      throw new CheckoutUnavailableError();
    }
    for (const redemption of redemptions) {
      const purchaseVoucherId = written.byVoucherId.get(redemption.voucherId);
      if (!purchaseVoucherId) throw new CheckoutUnavailableError();
      const linked = await transaction.purchaseVoucher.updateMany({
        where: {
          id: purchaseVoucherId,
          purchaseId,
          voucherId: redemption.voucherId,
          redemptionId: null,
        },
        data: { redemptionId: redemption.id },
      });
      if (linked.count !== 1) throw new CheckoutUnavailableError();
    }
  }
}
