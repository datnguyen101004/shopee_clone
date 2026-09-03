import type { ReturnListQuery } from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import type { Prisma as PrismaTypes } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ReturnCursorPosition } from './return-cursor';

export const returnRequestInclude = {
  buyer: { select: { id: true, displayName: true } },
  shop: { select: { id: true, name: true } },
  order: {
    select: {
      id: true,
      version: true,
      status: true,
      shopSnapshot: true,
      purchase: { select: { id: true, buyerId: true, addressSnapshot: true } },
      timelineEvents: { orderBy: [{ orderVersion: 'asc' as const }, { id: 'asc' as const }] },
    },
  },
  items: {
    include: { orderLine: true },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  events: { orderBy: [{ version: 'asc' as const }, { id: 'asc' as const }] },
  evidence: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  shipment: true,
  decisions: { orderBy: [{ decidedAt: 'asc' as const }, { id: 'asc' as const }] },
  refundLedger: true,
} satisfies PrismaTypes.ReturnRequestInclude;

export type ReturnRequestGraph = PrismaTypes.ReturnRequestGetPayload<{
  include: typeof returnRequestInclude;
}>;

function dateWhere(query: ReturnListQuery): PrismaTypes.ReturnRequestWhereInput {
  if (!query.from && !query.to) return {};
  const updatedAt: PrismaTypes.DateTimeFilter = {};
  if (query.from) updatedAt.gte = new Date(`${query.from}T00:00:00.000Z`);
  if (query.to) {
    const end = new Date(`${query.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    updatedAt.lt = end;
  }
  return { updatedAt };
}

function queryWhere(
  query: ReturnListQuery,
  cursor: ReturnCursorPosition | null,
  now: Date,
): PrismaTypes.ReturnRequestWhereInput {
  const deadline =
    query.deadline === 'ALL'
      ? {}
      : query.deadline === 'OVERDUE'
        ? {
            OR: [
              { sellerResponseDeadlineAt: { lt: now } },
              { shipmentDeadlineAt: { lt: now } },
              { receiptDeadlineAt: { lt: now } },
            ],
          }
        : {
            OR: [
              {
                sellerResponseDeadlineAt: {
                  gte: now,
                  lt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
                },
              },
              {
                shipmentDeadlineAt: {
                  gte: now,
                  lt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
                },
              },
              {
                receiptDeadlineAt: { gte: now, lt: new Date(now.getTime() + 24 * 60 * 60 * 1_000) },
              },
            ],
          };
  const filters: PrismaTypes.ReturnRequestWhereInput[] = [
    ...(query.status === 'ALL' ? [] : [{ status: query.status }]),
    dateWhere(query),
    ...(query.reference ? [{ OR: [{ id: query.reference }, { orderId: query.reference }] }] : []),
    deadline,
    ...(cursor
      ? [
          {
            OR: [
              { updatedAt: { lt: cursor.updatedAt } },
              { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
            ],
          },
        ]
      : []),
  ];
  return filters.length > 0 ? { AND: filters } : {};
}

@Injectable()
export class ReturnRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listBuyer(
    userId: string,
    query: ReturnListQuery,
    cursor: ReturnCursorPosition | null,
    now: Date,
  ): Promise<ReturnRequestGraph[]> {
    return this.prisma.returnRequest.findMany({
      where: { buyerId: userId, ...queryWhere(query, cursor, now) },
      include: returnRequestInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
  }

  async listSeller(
    userId: string,
    query: ReturnListQuery,
    cursor: ReturnCursorPosition | null,
    now: Date,
  ): Promise<ReturnRequestGraph[]> {
    return this.prisma.returnRequest.findMany({
      where: {
        shop: { ownerId: userId, deletedAt: null, status: 'ACTIVE', onboardingStatus: 'APPROVED' },
        ...queryWhere(query, cursor, now),
      },
      include: returnRequestInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
  }

  async listAdmin(
    query: ReturnListQuery,
    cursor: ReturnCursorPosition | null,
    now: Date,
  ): Promise<ReturnRequestGraph[]> {
    return this.prisma.returnRequest.findMany({
      where: queryWhere(query, cursor, now),
      include: returnRequestInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
  }

  detailBuyer(
    userId: string,
    reference: string,
    reader: Pick<PrismaTypes.TransactionClient, 'returnRequest'> = this.prisma,
  ): Promise<ReturnRequestGraph | null> {
    return reader.returnRequest.findFirst({
      where: { id: reference, buyerId: userId },
      include: returnRequestInclude,
    });
  }

  detailSeller(
    userId: string,
    reference: string,
    reader: Pick<PrismaTypes.TransactionClient, 'returnRequest'> = this.prisma,
  ): Promise<ReturnRequestGraph | null> {
    return reader.returnRequest.findFirst({
      where: {
        id: reference,
        shop: { ownerId: userId, deletedAt: null, status: 'ACTIVE', onboardingStatus: 'APPROVED' },
      },
      include: returnRequestInclude,
    });
  }

  detailAdmin(
    reference: string,
    reader: Pick<PrismaTypes.TransactionClient, 'returnRequest'> = this.prisma,
  ): Promise<ReturnRequestGraph | null> {
    return reader.returnRequest.findFirst({
      where: { id: reference },
      include: returnRequestInclude,
    });
  }

  async lockBuyerOrder(
    tx: PrismaTypes.TransactionClient,
    userId: string,
    orderReference: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT so."id" FROM "shop_orders" so
      INNER JOIN "purchases" p ON p."id" = so."purchase_id"
      WHERE so."id" = ${orderReference}::uuid AND p."buyer_id" = ${userId}::uuid
      FOR UPDATE OF so
    `);
    if (!rows[0]) throw new Error('RETURN_NOT_FOUND');
  }

  async lockReturn(tx: PrismaTypes.TransactionClient, reference: string): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "return_requests" WHERE "id" = ${reference}::uuid FOR UPDATE`,
    );
  }

  async lockOrder(tx: PrismaTypes.TransactionClient, reference: string): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "shop_orders" WHERE "id" = ${reference}::uuid FOR UPDATE`,
    );
  }

  async lockEvidence(tx: PrismaTypes.TransactionClient, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "return_evidence_assets" WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) FOR UPDATE`,
    );
  }

  async deadlineBatch(
    tx: PrismaTypes.TransactionClient,
    now: Date,
    take: number,
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "return_requests"
      WHERE ("status" = 'requested' AND "seller_response_deadline_at" < ${now})
         OR ("status" = 'awaiting_return' AND "shipment_deadline_at" < ${now})
         OR ("status" = 'in_transit' AND "receipt_deadline_at" < ${now})
      ORDER BY "updated_at" ASC, "id" ASC
      LIMIT ${take}
      FOR UPDATE SKIP LOCKED
    `);
    return rows.map((row) => row.id);
  }
}
