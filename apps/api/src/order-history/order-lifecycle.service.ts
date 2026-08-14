import { randomUUID } from 'node:crypto';

import type { OrderTimelineActor, ShopOrderStatus } from '@shopee-clone/contracts';
import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { OrderStaleConflictError, OrderTransitionConflictError } from './order-history.errors';
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
    transaction: Prisma.TransactionClient,
    input: TransitionOrderInput,
  ): Promise<void> {
    if (!canTransitionOrder(input.currentStatus, input.targetStatus)) {
      throw new OrderTransitionConflictError(input.expectedVersion);
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
