/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { InventoryAdjustmentReason, InventoryBalance, InventoryPage, InventoryAdjustment, InventoryAdjustmentPage } from '@shopee-clone/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { INVENTORY_LOW_STOCK_THRESHOLD, INVENTORY_RESERVATION_TTL_MS } from './inventory.constants';
import { InventoryIdempotencyConflictError, InventoryInsufficientError, InventoryNotFoundError, InventoryStaleError } from './inventory.errors';
import { InventoryReservationQueueService } from './inventory-reservation-queue.service';
import { publicSellerProductMediaUrl } from '../seller-products/seller-product-media.storage';

type Tx = Prisma.TransactionClient;
const inventoryInclude = { variant: { include: { product: { include: { images: { select: { url: true, sortOrder: true, id: true, sellerProductMediaAsset: { select: { storageKey: true } } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1 } } } } } } satisfies Prisma.InventoryInclude;
type InventoryRow = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;

function sellerInventoryEligibility(userId: string, variantId?: string): Prisma.ProductVariantWhereInput {
  return {
    ...(variantId ? { id: variantId } : {}),
    status: 'ACTIVE',
    deletedAt: null,
    product: {
      deletedAt: null,
      status: 'ACTIVE',
      moderationStatus: 'ACTIVE',
      category: { isActive: true, deletedAt: null },
      shop: { ownerId: userId, deletedAt: null, status: 'ACTIVE', onboardingStatus: 'APPROVED' },
    },
  };
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const SERIALIZABLE_RETRY_LIMIT = 3;

function isRetryableTransactionError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2034';
}

@Injectable()
export class InventoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(InventoryReservationQueueService) private readonly expiryQueue: InventoryReservationQueueService) {}

  private async databaseNow(tx: Pick<Tx, '$queryRaw'>): Promise<Date> {
    const rows = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
    const value = rows[0]?.now;
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error('Database clock unavailable');
    return value;
  }

  private async lockInventoryRows(tx: Tx, variantIds: string[]): Promise<void> {
    const ids = [...new Set(variantIds)].sort((left, right) => left.localeCompare(right));
    if (ids.length === 0) return;
    await tx.$queryRaw(Prisma.sql`
      SELECT "variant_id"
      FROM "inventory"
      WHERE "variant_id" IN (${Prisma.join(ids)})
      ORDER BY "variant_id"
      FOR UPDATE
    `);
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await operation();
      } catch (error) {
        attempt += 1;
        if (!isRetryableTransactionError(error) || attempt >= SERIALIZABLE_RETRY_LIMIT) throw error;
      }
    }
  }

  private async sellerVariant(tx: Tx, userId: string, variantId: string) {
    const variant = await tx.productVariant.findFirst({ where: sellerInventoryEligibility(userId, variantId), include: { product: true } });
    if (!variant) throw new InventoryNotFoundError();
    return variant;
  }

  private mapBalance(row: InventoryRow | null, variant?: any): InventoryBalance {
    const item = row?.variant ?? variant;
    const onHand = row?.quantityOnHand ?? 0;
    const reserved = row?.quantityReserved ?? 0;
    const sold = row?.quantitySold ?? 0;
    const version = row?.version ?? 0;
    const image = item.product.images[0];
    const cdnUrl = image?.sellerProductMediaAsset?.storageKey ? publicSellerProductMediaUrl(image.sellerProductMediaAsset.storageKey) : null;
    return { variantId: item.id, productId: item.productId, productName: item.product.name, productImageUrl: cdnUrl ?? image?.url ?? null, variantName: item.name, sku: item.sku, lifecycle: item.status === 'ACTIVE' && !item.deletedAt ? 'active' : 'inactive', quantityOnHand: onHand, quantityReserved: reserved, quantitySold: sold, availableQuantity: onHand - reserved, lowStock: onHand - reserved <= INVENTORY_LOW_STOCK_THRESHOLD, version, updatedAt: (row?.updatedAt ?? item.updatedAt).toISOString() };
  }

  async list(userId: string, query: { cursor: string | null; limit: number; productId: string | null; lowStock: boolean | null }): Promise<InventoryPage> {
    const cursorClause = query.cursor ? Prisma.sql`AND i."variant_id" > ${query.cursor}::uuid` : Prisma.empty;
    const productClause = query.productId ? Prisma.sql`AND p."id" = ${query.productId}::uuid` : Prisma.empty;
    // `lowStock` is an opt-in filter: omitted/false shows the complete
    // published inventory, while true keeps only rows at/below the threshold.
    const lowStockClause = query.lowStock === true ? Prisma.sql`AND (i."quantity_on_hand" - i."quantity_reserved") <= ${INVENTORY_LOW_STOCK_THRESHOLD}` : Prisma.empty;
    const ids = await this.prisma.$queryRaw<Array<{ variantId: string }>>(Prisma.sql`
      SELECT i."variant_id" AS "variantId"
      FROM "inventory" i
      JOIN "product_variants" v ON v."id" = i."variant_id"
      JOIN "products" p ON p."id" = v."product_id"
      JOIN "categories" c ON c."id" = p."category_id"
      JOIN "shops" s ON s."id" = p."shop_id"
      WHERE v."status" = 'active' AND v."deleted_at" IS NULL
        AND p."deleted_at" IS NULL AND p."status" = 'active' AND p."moderation_status" = 'active'
        AND c."is_active" = TRUE AND c."deleted_at" IS NULL
        AND s."owner_id" = ${userId}::uuid AND s."deleted_at" IS NULL
        AND s."status" = 'active' AND s."onboarding_status" = 'approved'
        ${productClause} ${cursorClause} ${lowStockClause}
      ORDER BY i."variant_id" ASC
      LIMIT ${query.limit + 1}
    `);
    if (ids.length === 0) return { items: [], nextCursor: null };
    const rows = await this.prisma.inventory.findMany({ where: { variantId: { in: ids.map((row) => row.variantId) } }, include: inventoryInclude });
    const byId = new Map(rows.map((row) => [row.variantId, row]));
    const ordered = ids.map((row) => byId.get(row.variantId)).filter((row): row is InventoryRow => Boolean(row));
    const items = ordered.slice(0, query.limit).map((row) => this.mapBalance(row));
    return { items, nextCursor: ids.length > query.limit ? items.at(-1)?.variantId ?? null : null };
  }

  async history(userId: string, variantId: string, query: { cursor: string | null; limit: number }): Promise<InventoryAdjustmentPage> {
    await this.sellerVariant(this.prisma as unknown as Tx, userId, variantId);
    const items = await this.prisma.inventoryAdjustment.findMany({ where: { variantId, ...(query.cursor ? { id: { lt: query.cursor } } : {}) }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 });
    const visible = items.slice(0, query.limit).map((item) => this.mapAdjustment(item));
    return { items: visible, nextCursor: items.length > query.limit ? visible.at(-1)!.id : null };
  }

  private mapAdjustment(item: any): InventoryAdjustment {
    return { id: item.id, variantId: item.variantId, actorUserId: item.actorUserId ?? null, reason: item.reason.toUpperCase() as InventoryAdjustmentReason, note: item.note ?? null, delta: item.delta, quantityOnHandBefore: item.quantityOnHandBefore, quantityOnHandAfter: item.quantityOnHandAfter, quantityReserved: item.quantityReserved, quantitySold: item.quantitySold, availableQuantity: item.quantityOnHandAfter - item.quantityReserved, inventoryVersion: item.inventoryVersion, idempotencyKey: item.idempotencyKey ?? null, occurredAt: item.occurredAt.toISOString() };
  }

  async adjust(userId: string, variantId: string, expectedVersion: number, idempotencyKey: string, input: { delta: number; reason: InventoryAdjustmentReason; note: string | null }): Promise<InventoryAdjustment> {
    const requestDigest = digest({ variantId, ...input });
    return this.withSerializableRetry(() => this.prisma.$transaction(async (tx) => this.adjustInTransaction(tx, userId, variantId, expectedVersion, idempotencyKey, requestDigest, input), { isolationLevel: 'Serializable' }));
  }

  async adjustInTransaction(tx: Tx, userId: string, variantId: string, expectedVersion: number, idempotencyKey: string, requestDigest: string, input: { delta: number; reason: InventoryAdjustmentReason; note: string | null }): Promise<InventoryAdjustment> {
    const variant = await this.sellerVariant(tx, userId, variantId);
    const prior = await tx.inventoryAdjustment.findFirst({ where: { variantId, idempotencyKey } });
    if (prior) { if (prior.requestDigest !== requestDigest) throw new InventoryIdempotencyConflictError(); return this.mapAdjustment(prior); }
    await this.lockInventoryRows(tx, [variantId]);
    const inventory = await tx.inventory.findUnique({ where: { variantId } });
    const current = inventory ?? await tx.inventory.create({ data: { variantId, quantityOnHand: 0, quantityReserved: 0, quantitySold: 0, version: 0 } });
    if (current.version !== expectedVersion) throw new InventoryStaleError(current.version);
    const nextOnHand = current.quantityOnHand + input.delta;
    if (nextOnHand < current.quantityReserved) throw new InventoryInsufficientError(current.quantityOnHand - current.quantityReserved);
    const next = await tx.inventory.update({ where: { variantId }, data: { quantityOnHand: nextOnHand, version: { increment: 1 } } });
    const adjustment = await tx.inventoryAdjustment.create({ data: { variantId, shopId: variant.product.shopId, actorUserId: userId, reason: input.reason, note: input.note, delta: input.delta, quantityOnHandBefore: current.quantityOnHand, quantityOnHandAfter: next.quantityOnHand, quantityReserved: next.quantityReserved, quantitySold: next.quantitySold, inventoryVersion: next.version, idempotencyKey, requestDigest } });
    return this.mapAdjustment(adjustment);
  }

  async reserveForCheckout(tx: Tx, buyerId: string, cartVersion: number, idempotencyKey: string, requestDigest: string, lines: Array<{ variantId: string; quantity: number }>) {
    const prior = await tx.inventoryReservation.findFirst({ where: { buyerId, idempotencyKey }, include: { lines: true } });
    if (prior) { if (prior.requestDigest !== requestDigest) throw new InventoryIdempotencyConflictError(); return prior; }
    const sorted = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
    if (sorted.length === 0 || new Set(sorted.map((line) => line.variantId)).size !== sorted.length) throw new InventoryInsufficientError(0);
    const databaseNow = await this.databaseNow(tx);
    const due = await tx.inventoryReservation.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: databaseNow }, lines: { some: { variantId: { in: sorted.map((line) => line.variantId) } } } }, include: { lines: true } });
    await this.lockInventoryRows(tx, [
      ...sorted.map((line) => line.variantId),
      ...due.flatMap((reservation) => reservation.lines.map((line) => line.variantId)),
    ]);
    for (const expired of due) {
      for (const line of [...expired.lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        await tx.inventory.update({ where: { variantId: line.variantId }, data: { quantityReserved: { decrement: line.quantity }, version: { increment: 1 } } });
      }
      await tx.inventoryReservation.update({ where: { id: expired.id }, data: { status: 'EXPIRED', releasedAt: databaseNow, terminalReason: 'expired' } });
    }
    for (const line of sorted) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new InventoryInsufficientError(0);
      const inventory = await tx.inventory.findUnique({ where: { variantId: line.variantId } });
      const available = (inventory?.quantityOnHand ?? 0) - (inventory?.quantityReserved ?? 0);
      if (!inventory || available < line.quantity) throw new InventoryInsufficientError(Math.max(available, 0));
    }
    const expiresAt = new Date(databaseNow.getTime() + INVENTORY_RESERVATION_TTL_MS);
    const reservation = await tx.inventoryReservation.create({ data: { buyerId, cartVersion, idempotencyKey, requestDigest, generationToken: randomUUID(), expiresAt, lines: { create: sorted.map((line) => ({ variantId: line.variantId, quantity: line.quantity })) } }, include: { lines: true } });
    for (const line of sorted) await tx.inventory.update({ where: { variantId: line.variantId }, data: { quantityReserved: { increment: line.quantity }, version: { increment: 1 } } });
    await this.expiryQueue.enqueue(tx, reservation.id, reservation.generationToken, reservation.expiresAt);
    return reservation;
  }

  /**
   * Reacquire stock for a pending order after its previous hold was released or
   * expired. A new idempotency key/generation is required so an old delayed job
   * can never release the new hold.
   */
  async reacquireForPendingOrder(
    tx: Tx,
    buyerId: string,
    previousReservationId: string,
    cartVersion: number,
    idempotencyKey: string,
    requestDigest: string,
    lines: Array<{ variantId: string; quantity: number }>,
  ) {
    const previous = await tx.inventoryReservation.findUnique({ where: { id: previousReservationId } });
    if (!previous || previous.buyerId !== buyerId) throw new InventoryNotFoundError();
    if (previous.status === 'ACTIVE') return previous;
    return this.reserveForCheckout(tx, buyerId, cartVersion, idempotencyKey, requestDigest, lines);
  }

  async consumeInTransaction(tx: Tx, reservationId: string, buyerId: string, purchaseId: string) {
    const reservation = await tx.inventoryReservation.findFirst({ where: { id: reservationId, buyerId }, include: { lines: true } });
    if (!reservation || reservation.status !== 'ACTIVE') return reservation;
    const databaseNow = await this.databaseNow(tx);
    await this.lockInventoryRows(tx, reservation.lines.map((line) => line.variantId));
    for (const line of [...reservation.lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      await tx.inventory.update({ where: { variantId: line.variantId }, data: { quantityReserved: { decrement: line.quantity }, quantityOnHand: { decrement: line.quantity }, quantitySold: { increment: line.quantity }, version: { increment: 1 } } });
      const variant = await tx.productVariant.findUnique({ where: { id: line.variantId }, select: { productId: true } });
      if (variant) await tx.product.update({ where: { id: variant.productId }, data: { soldCount: { increment: line.quantity } } });
    }
    return tx.inventoryReservation.update({ where: { id: reservationId }, data: { status: 'CONSUMED', purchaseId, consumedAt: databaseNow, terminalReason: 'checkout-completed' } });
  }

  async release(reservationId: string, reason: 'expired' | 'checkout-failed' | 'payment-failed' | 'released') {
    return this.withSerializableRetry(() => this.prisma.$transaction(async (tx) => {
      const reservation = await tx.inventoryReservation.findUnique({ where: { id: reservationId }, include: { lines: true } });
      if (!reservation || reservation.status !== 'ACTIVE') return reservation;
      const databaseNow = await this.databaseNow(tx);
      await this.lockInventoryRows(tx, reservation.lines.map((line) => line.variantId));
      for (const line of [...reservation.lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        await tx.inventory.update({ where: { variantId: line.variantId }, data: { quantityReserved: { decrement: line.quantity }, version: { increment: 1 } } });
      }
      return tx.inventoryReservation.update({ where: { id: reservationId }, data: { status: reason === 'expired' ? 'EXPIRED' : 'RELEASED', releasedAt: databaseNow, terminalReason: reason } });
    }, { isolationLevel: 'Serializable' }));
  }

  async expireDue(limit = 100) {
    const databaseNow = await this.databaseNow(this.prisma as unknown as Tx);
    const due = await this.prisma.inventoryReservation.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: databaseNow } }, select: { id: true }, take: limit });
    for (const reservation of due) await this.release(reservation.id, 'expired');
    return due.length;
  }
}
