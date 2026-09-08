import { Inject, Injectable } from '@nestjs/common';
import type {
  Prisma,
  ShopOrderStatus,
  SellerOrderFulfillmentState,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SellerOrderQueueQuery } from '@shopee-clone/contracts';

export const sellerOrderInclude = {
  shop: {
    select: {
      id: true,
      ownerId: true,
      slug: true,
      name: true,
      pickupRecipientName: true,
      pickupPhoneNumber: true,
      pickupProvince: true,
      pickupDistrict: true,
      pickupWard: true,
      pickupAddressLine: true,
    },
  },
  purchase: { select: { id: true, addressSnapshot: true, paymentMethod: true } },
  lines: {
    orderBy: [{ sourceCartLineId: 'asc' as const }, { id: 'asc' as const }],
    include: {
      product: {
        select: {
          images: {
            where: { variantId: null },
            orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
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
  timelineEvents: { orderBy: [{ orderVersion: 'asc' as const }, { id: 'asc' as const }] },
  fulfillment: {
    include: {
      events: { orderBy: [{ fulfillmentVersion: 'asc' as const }, { id: 'asc' as const }] },
    },
  },
  shipment: {
    include: { events: { orderBy: [{ occurredAt: 'asc' as const }, { id: 'asc' as const }] } },
  },
  returnRequest: { select: { id: true, status: true } },
} satisfies Prisma.ShopOrderInclude;

export type SellerOrderGraph = Prisma.ShopOrderGetPayload<{ include: typeof sellerOrderInclude }>;

function statusesFor(filter: SellerOrderQueueQuery['status']): ShopOrderStatus[] | null {
  if (filter === 'ALL') return null;
  if (filter === 'RETURN_REFUND') return ['RETURN_REQUESTED', 'RETURNED', 'REFUNDED'];
  return [filter as ShopOrderStatus];
}

function dateRange(query: SellerOrderQueueQuery): Prisma.ShopOrderWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (query.from) createdAt.gte = new Date(`${query.from}T00:00:00.000Z`);
  if (query.to) {
    const end = new Date(`${query.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    createdAt.lt = end;
  }
  return Object.keys(createdAt).length > 0 ? { createdAt } : {};
}

const sellerPaymentGate: Prisma.ShopOrderWhereInput = {
  AND: [
    { NOT: { status: 'PENDING_PAYMENT' } },
    { NOT: { status: 'CANCELLED', purchase: { paymentMethod: 'VNPAY' } } },
  ],
};

@Injectable()
export class SellerOrderRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private ownership(userId: string): Prisma.ShopOrderWhereInput {
    return {
      shop: { ownerId: userId, deletedAt: null, status: 'ACTIVE', onboardingStatus: 'APPROVED' },
    };
  }

  async list(
    userId: string,
    query: SellerOrderQueueQuery,
  ): Promise<{ rows: SellerOrderGraph[]; totalItems: number }> {
    const statuses = statusesFor(query.status);
    const fulfillmentState =
      query.fulfillment === 'ALL' ? null : (query.fulfillment as SellerOrderFulfillmentState);
    const where: Prisma.ShopOrderWhereInput = {
        ...this.ownership(userId),
        ...sellerPaymentGate,
        ...(statuses ? { status: { in: statuses } } : {}),
        ...(fulfillmentState ? { fulfillment: { is: { state: fulfillmentState } } } : {}),
        ...(query.orderReference ? { id: query.orderReference } : {}),
        ...dateRange(query),
      };
    const [totalItems, rows] = await Promise.all([
      this.prisma.shopOrder.count({ where }),
      this.prisma.shopOrder.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * 10,
        take: 10,
        include: sellerOrderInclude,
      }),
    ]);
    return { rows, totalItems };
  }

  async detail(
    userId: string,
    orderReference: string,
    reader: Pick<Prisma.TransactionClient, 'shopOrder'> = this.prisma,
  ): Promise<SellerOrderGraph | null> {
    return reader.shopOrder.findFirst({
      where: { id: orderReference, ...this.ownership(userId), ...sellerPaymentGate },
      include: sellerOrderInclude,
    });
  }

  async ownedForMutation(
    userId: string,
    orderReference: string,
    tx: Prisma.TransactionClient,
  ): Promise<SellerOrderGraph | null> {
    const result = await tx.shopOrder.findFirst({
      where: { id: orderReference, ...this.ownership(userId), ...sellerPaymentGate },
      include: sellerOrderInclude,
    });
    return result;
  }
}
