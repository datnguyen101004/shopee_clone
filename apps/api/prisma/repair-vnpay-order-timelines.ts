import { randomUUID } from 'node:crypto';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';

loadRepositoryEnvironment();

const VNPAY_TERMINAL_PAYMENT_STATUSES = ['FAILED', 'CANCELLED', 'EXPIRED'] as const;

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const report = await prisma.$transaction(async (tx) => {
      const terminalOrders = await tx.shopOrder.findMany({
        where: {
          purchase: { paymentMethod: 'VNPAY' },
          paymentStatus: { in: [...VNPAY_TERMINAL_PAYMENT_STATUSES] },
          status: { in: ['PENDING_PAYMENT', 'PENDING_CONFIRMATION'] },
        },
        select: {
          id: true,
          status: true,
          version: true,
          updatedAt: true,
          timelineEvents: {
            orderBy: [{ orderVersion: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { orderVersion: true, status: true },
          },
        },
      });
      for (const order of terminalOrders) {
        const latest = order.timelineEvents[0];
        if (!latest || latest.orderVersion !== order.version) {
          throw new Error(`Refusing to guess an invalid timeline for order ${order.id}.`);
        }
        await tx.shopOrder.update({
          where: { id: order.id },
          data: { status: 'CANCELLED', version: { increment: 1 } },
        });
        await tx.orderTimelineEvent.create({
          data: {
            id: randomUUID(),
            orderId: order.id,
            previousStatus: order.status,
            status: 'CANCELLED',
            orderVersion: order.version + 1,
            actorType: 'SYSTEM',
            actorUserId: null,
            reasonCode: `VNPAY_PAYMENT_${order.paymentStatus}`,
            reasonNote: null,
            idempotencyKey: null,
            requestDigest: null,
            occurredAt: order.updatedAt,
          },
        });
      }

      const expiredOrders = await tx.shopOrder.findMany({
        where: {
          purchase: { paymentMethod: 'VNPAY' },
          status: 'CANCELLED',
          paymentStatus: { in: ['EXPIRED', 'REFUND_PENDING'] },
        },
        select: {
          id: true,
          version: true,
          updatedAt: true,
          _count: { select: { timelineEvents: true } },
          timelineEvents: {
            orderBy: [{ orderVersion: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { orderVersion: true, status: true },
          },
        },
      });
      let expiryTransitionsAdded = 0;
      for (const order of expiredOrders) {
        const latest = order.timelineEvents[0];
        if (!latest || latest.status === 'CANCELLED') continue;
        if (
          latest.orderVersion !== order.version ||
          order._count.timelineEvents !== order.version + 1
        ) {
          throw new Error(`Refusing to guess an invalid timeline for order ${order.id}.`);
        }
        await tx.shopOrder.update({
          where: { id: order.id },
          data: { version: { increment: 1 } },
        });
        await tx.orderTimelineEvent.create({
          data: {
            id: randomUUID(),
            orderId: order.id,
            previousStatus: latest.status,
            status: 'CANCELLED',
            orderVersion: order.version + 1,
            actorType: 'SYSTEM',
            actorUserId: null,
            reasonCode: 'PAYMENT_WINDOW_EXPIRED',
            reasonNote: null,
            idempotencyKey: null,
            requestDigest: null,
            occurredAt: order.updatedAt,
          },
        });
        expiryTransitionsAdded += 1;
      }

      return {
        paymentEventsNormalized: terminalOrders.length,
        expiryTransitionsAdded,
      };
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
