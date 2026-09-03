import { randomUUID } from 'node:crypto';

import type { OrderTimelineActor, ShopOrderStatus } from '@shopee-clone/contracts';
import { Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import type { Prisma as PrismaTypes } from '../generated/prisma/client';
import { OrderInventoryHoldConflictError, OrderStaleConflictError, OrderTransitionConflictError } from './order-history.errors';
import { canTransitionOrder } from './order-lifecycle';

export interface TransitionOrderInput {
  orderId: string;
  currentStatus: ShopOrderStatus;
  targetStatus: ShopOrderStatus;
  expectedVersion: number;
  actorType: OrderTimelineActor;
  actorUserId: string | null;
  reasonCode: string;
  reasonNote: string | null;
  idempotencyKey?: string;
  requestDigest?: string;
}

@Injectable()
export class OrderLifecycleService {
  async transition(
    transaction: PrismaTypes.TransactionClient,
    input: TransitionOrderInput,
  ): Promise<void> {
    if (!canTransitionOrder(input.currentStatus, input.targetStatus)) {
      throw new OrderTransitionConflictError(input.expectedVersion);
    }
    if (input.targetStatus !== 'CANCELLED') {
      const hold = await transaction.inventoryReservation.findFirst({
        where: { purchase: { orders: { some: { id: input.orderId } } } },
        select: { status: true, expiresAt: true },
      });
      if (hold && (hold.status === 'RELEASED' || hold.status === 'EXPIRED')) {
        throw new OrderInventoryHoldConflictError(hold.status);
      }
      if (hold?.status === 'ACTIVE') {
        const nowRows = await transaction.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
        if (nowRows[0]?.now instanceof Date && hold.expiresAt <= nowRows[0].now) {
          throw new OrderInventoryHoldConflictError('EXPIRED');
        }
      }
    }
    const advanced = await transaction.shopOrder.updateMany({
      where: {
        id: input.orderId,
        status: input.currentStatus,
        version: input.expectedVersion,
      },
      data: { status: input.targetStatus, version: { increment: 1 } },
    });
    if (advanced.count !== 1) throw new OrderStaleConflictError(input.expectedVersion);
    await transaction.orderTimelineEvent.create({
      data: {
        id: randomUUID(),
        orderId: input.orderId,
        previousStatus: input.currentStatus,
        status: input.targetStatus,
        orderVersion: input.expectedVersion + 1,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        idempotencyKey: input.idempotencyKey,
        requestDigest: input.requestDigest,
      },
    });
  }
}
