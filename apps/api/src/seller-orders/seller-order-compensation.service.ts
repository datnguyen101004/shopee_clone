import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { Prisma as PrismaTypes } from '../generated/prisma/client';
import { SELLER_CONFIRMATION_DEADLINE_MS } from './seller-order-fulfillment';
import {
  SellerOrderCompensationConflictError,
  SellerOrderInventoryInvariantError,
} from './seller-order.errors';

type Tx = PrismaTypes.TransactionClient;

export interface SellerOrderCancellationInput {
  orderId: string;
  actorUserId: string | null;
  actorType: 'SELLER' | 'BUYER';
  state: 'REJECTED' | 'CANCELLED';
  action: 'REJECT' | 'BUYER_CANCELLED';
  reasonCode: string;
  reasonNote: string | null;
  idempotencyKey: string;
  requestDigest: string;
}

@Injectable()
export class SellerOrderCompensationService {
  async ensureFulfillment(tx: Tx, orderId: string, createdAt: Date) {
    const existing = await tx.sellerOrderFulfillment.findUnique({ where: { orderId } });
    if (existing) return existing;
    const confirmationDeadlineAt = new Date(createdAt.getTime() + SELLER_CONFIRMATION_DEADLINE_MS);
    return tx.sellerOrderFulfillment.create({
      data: {
        orderId,
        state: 'PENDING_CONFIRMATION',
        version: 0,
        confirmationDeadlineAt,
        createdAt,
        updatedAt: createdAt,
      },
    });
  }

  async synchronizeCancellation(tx: Tx, input: SellerOrderCancellationInput): Promise<void> {
    const order = await tx.shopOrder.findUnique({
      where: { id: input.orderId },
      select: { id: true, createdAt: true },
    });
    if (!order) throw new SellerOrderInventoryInvariantError();
    const fulfillment = await this.ensureFulfillment(tx, input.orderId, order.createdAt);
    if (
      fulfillment.state === input.state ||
      (input.state === 'CANCELLED' && fulfillment.state === 'REJECTED')
    )
      return;
    if (fulfillment.state !== 'PENDING_CONFIRMATION')
      throw new SellerOrderCompensationConflictError();
    const updated = await tx.sellerOrderFulfillment.updateMany({
      where: {
        orderId: input.orderId,
        state: 'PENDING_CONFIRMATION',
        version: fulfillment.version,
      },
      data: {
        state: input.state,
        version: { increment: 1 },
        ...(input.state === 'REJECTED' ? { rejectedAt: new Date() } : { cancelledAt: new Date() }),
      },
    });
    if (updated.count !== 1) throw new SellerOrderCompensationConflictError();
    await tx.sellerOrderFulfillmentEvent.create({
      data: {
        id: randomUUID(),
        orderId: input.orderId,
        previousState: 'PENDING_CONFIRMATION',
        state: input.state,
        fulfillmentVersion: fulfillment.version + 1,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        action: input.action,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        late: false,
        idempotencyKey: input.idempotencyKey,
        requestDigest: input.requestDigest,
      },
    });
  }

  async compensateConsumedInventory(tx: Tx, input: SellerOrderCancellationInput): Promise<void> {
    const existing = await tx.sellerOrderInventoryCompensation.findUnique({
      where: { orderId: input.orderId },
    });
    if (existing) return;
    const order = await tx.shopOrder.findUnique({
      where: { id: input.orderId },
      select: {
        shopId: true,
        purchase: { select: { inventoryReservation: { select: { status: true } } } },
      },
    });
    if (!order || order.purchase?.inventoryReservation?.status !== 'CONSUMED') return;
    const lines = await tx.orderLine.findMany({
      where: { orderId: input.orderId },
      select: { variantId: true, productId: true, quantity: true },
    });
    if (lines.length === 0) throw new SellerOrderInventoryInvariantError();
    const byVariant = new Map<string, { productId: string; quantity: number }>();
    for (const line of lines) {
      const current = byVariant.get(line.variantId);
      if (current) current.quantity += line.quantity;
      else byVariant.set(line.variantId, { productId: line.productId, quantity: line.quantity });
    }
    const variantIds = [...byVariant.keys()].sort((left, right) => left.localeCompare(right));
    await tx.$queryRaw(
      Prisma.sql`SELECT "variant_id" FROM "inventory" WHERE "variant_id" IN (${Prisma.join(variantIds)}) ORDER BY "variant_id" FOR UPDATE`,
    );
    const balances = await tx.inventory.findMany({ where: { variantId: { in: variantIds } } });
    const balancesByVariant = new Map(balances.map((balance) => [balance.variantId, balance]));
    for (const variantId of variantIds) {
      const requested = byVariant.get(variantId)!;
      const balance = balancesByVariant.get(variantId);
      if (!balance || balance.quantitySold < requested.quantity)
        throw new SellerOrderInventoryInvariantError();
    }
    const productQuantities = new Map<string, number>();
    for (const requested of byVariant.values())
      productQuantities.set(
        requested.productId,
        (productQuantities.get(requested.productId) ?? 0) + requested.quantity,
      );
    for (const [productId, quantity] of productQuantities) {
      const updated = await tx.product.updateMany({
        where: { id: productId, soldCount: { gte: quantity } },
        data: { soldCount: { decrement: quantity } },
      });
      if (updated.count !== 1) throw new SellerOrderInventoryInvariantError();
    }
    for (const variantId of variantIds) {
      const requested = byVariant.get(variantId)!;
      const balance = balancesByVariant.get(variantId)!;
      const updated = await tx.inventory.updateMany({
        where: { variantId, quantitySold: { gte: requested.quantity } },
        data: {
          quantityOnHand: { increment: requested.quantity },
          quantitySold: { decrement: requested.quantity },
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new SellerOrderInventoryInvariantError();
      const after = await tx.inventory.findUnique({ where: { variantId } });
      if (!after) throw new SellerOrderInventoryInvariantError();
      await tx.inventoryAdjustment.create({
        data: {
          id: randomUUID(),
          variantId,
          shopId: order.shopId,
          actorUserId: input.actorUserId,
          reason: 'ORDER_CANCELLATION',
          note: input.reasonNote,
          delta: requested.quantity,
          quantityOnHandBefore: balance.quantityOnHand,
          quantityOnHandAfter: after.quantityOnHand,
          quantityReserved: after.quantityReserved,
          quantitySold: after.quantitySold,
          inventoryVersion: after.version,
          idempotencyKey: input.idempotencyKey,
          requestDigest: input.requestDigest,
          sourceOrderId: input.orderId,
        },
      });
    }
    await tx.sellerOrderInventoryCompensation.create({
      data: {
        id: randomUUID(),
        orderId: input.orderId,
        actorUserId: input.actorUserId,
        reason: input.reasonCode,
      },
    });
  }

  async cancelAndCompensate(tx: Tx, input: SellerOrderCancellationInput): Promise<void> {
    await this.compensateConsumedInventory(tx, input);
    await this.synchronizeCancellation(tx, input);
  }
}
