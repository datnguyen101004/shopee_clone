import type { BuyerOrderListFilter, BuyerOrderListQuery } from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { Prisma, ShopOrderStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { OrderCursorPosition } from './order-canonical';

const buyerShopOrderRelations = {
  lines: {
    orderBy: [{ sourceCartLineId: 'asc' as const }, { id: 'asc' as const }],
    include: { review: { select: { id: true } }, product: { select: { deletedAt: true } } },
  },
  returnRequest: { select: { id: true } },
  timelineEvents: {
    orderBy: [{ orderVersion: 'asc' as const }, { id: 'asc' as const }],
    select: { status: true, occurredAt: true },
  },
  shipment: {
    include: { events: { orderBy: [{ shipmentVersion: 'asc' as const }, { id: 'asc' as const }] } },
  },
} satisfies Prisma.ShopOrderInclude;

export const buyerOrderSummaryInclude = {
  purchase: {
    select: {
      id: true,
      inventoryReservation: { select: { status: true, expiresAt: true, terminalReason: true } },
    },
  },
  ...buyerShopOrderRelations,
} satisfies Prisma.ShopOrderInclude;

const buyerShopOrderDetailRelations = {
  ...buyerShopOrderRelations,
  timelineEvents: { orderBy: [{ orderVersion: 'asc' as const }, { id: 'asc' as const }] },
  voucherAllocations: {
    orderBy: [
      { purchaseVoucherId: 'asc' as const },
      { orderLineId: 'asc' as const },
      { id: 'asc' as const },
    ],
    include: {
      purchaseVoucher: true,
      orderLine: { select: { sourceCartLineId: true } },
    },
  },
} satisfies Prisma.ShopOrderInclude;

export const buyerOrderDetailInclude = {
  purchase: {
    select: {
      id: true,
      addressSnapshot: true,
      currency: true,
      inventoryReservation: { select: { status: true, expiresAt: true, terminalReason: true } },
    },
  },
  ...buyerShopOrderDetailRelations,
} satisfies Prisma.ShopOrderInclude;

export type BuyerOrderSummaryGraph = Prisma.ShopOrderGetPayload<{
  include: typeof buyerOrderSummaryInclude;
}>;
export type BuyerOrderDetailGraph = Prisma.ShopOrderGetPayload<{
  include: typeof buyerOrderDetailInclude;
}>;

export function statusesFor(filter: BuyerOrderListFilter): ShopOrderStatus[] | null {
  if (filter === 'ALL') return null;
  if (filter === 'RETURN_REFUND') return ['RETURN_REQUESTED', 'RETURNED', 'REFUNDED'];
  if (filter === 'SHIPPING') return ['AWAITING_PICKUP', 'SHIPPING'];
  return [filter];
}

export function requiresConfirmedPaymentOrCod(filter: BuyerOrderListFilter): boolean {
  return filter === 'PENDING_CONFIRMATION';
}

@Injectable()
export class OrderHistoryRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(
    userId: string,
    query: BuyerOrderListQuery,
    cursor: OrderCursorPosition | null,
  ): Promise<BuyerOrderSummaryGraph[]> {
    const statuses = statusesFor(query.filter);
    return this.prisma.shopOrder
      .findMany({
        where: {
          purchase: {
            buyerId: userId,
            ...(requiresConfirmedPaymentOrCod(query.filter)
              ? { OR: [{ paymentMethod: 'COD' }, { paymentStatus: 'PAID' }] }
              : {}),
          },
          ...(statuses ? { status: { in: statuses } } : {}),
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        include: buyerOrderSummaryInclude,
      })
      .then((rows) => rows as unknown as BuyerOrderSummaryGraph[]);
  }

  detail(
    userId: string,
    orderReference: string,
    reader: Pick<Prisma.TransactionClient, 'shopOrder'> = this.prisma,
  ): Promise<BuyerOrderDetailGraph | null> {
    return reader.shopOrder.findFirst({
      where: {
        id: orderReference,
        purchase: { buyerId: userId },
      },
      include: buyerOrderDetailInclude,
    });
  }
}
