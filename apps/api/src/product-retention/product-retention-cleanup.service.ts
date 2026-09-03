import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ProductRetentionCleanupStatus } from '@shopee-clone/contracts';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SellerProductMediaStorage } from '../seller-products/seller-product-media.storage';
import { isProductRetentionCleanupEnabled, PRODUCT_RETENTION_BATCH_SIZE, PRODUCT_RETENTION_DAYS } from './product-retention.constants';

type PendingMedia = { id: string; storageKey: string };
type CleanupAggregate = Pick<ProductRetentionCleanupStatus, 'deletedCount' | 'retainedCount' | 'failedCount' | 'remainingCount'>;
type RetentionTransaction = Prisma.TransactionClient;
type HistoryFlags = {
  hasOrderLine: boolean;
  hasReview: boolean;
  hasReservation: boolean;
  hasDatasetRecord: boolean;
  hasSoldOrReservedInventory: boolean;
  hasCommerceAdjustment: boolean;
};

function bool(value: unknown): boolean {
  return value === true || value === 't' || value === 1;
}

@Injectable()
export class ProductRetentionCleanupService {
  private readonly logger = new Logger(ProductRetentionCleanupService.name);
  private status: ProductRetentionCleanupStatus = {
    enabled: isProductRetentionCleanupEnabled(),
    running: false,
    lastAttemptAt: null,
    lastSuccessAt: null,
    deletedCount: 0,
    retainedCount: 0,
    failedCount: 0,
    remainingCount: null,
  };

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SellerProductMediaStorage) private readonly mediaStorage: SellerProductMediaStorage,
  ) {}

  getStatus(): ProductRetentionCleanupStatus { return { ...this.status }; }

  async run(): Promise<void> {
    this.status.enabled = isProductRetentionCleanupEnabled();
    if (!this.status.enabled || this.status.running) return;
    const runId = randomUUID();
    const startedAt = Date.now();
    this.status.running = true;
    this.status.lastAttemptAt = new Date().toISOString();
    try {
      const aggregate = await this.runBatch();
      this.status.deletedCount = aggregate.deletedCount;
      this.status.retainedCount = aggregate.retainedCount;
      this.status.failedCount = aggregate.failedCount;
      this.status.remainingCount = aggregate.remainingCount;
      this.status.lastSuccessAt = new Date().toISOString();
      this.logger.log(JSON.stringify({ event: 'product_retention_cleanup', runId, durationMs: Date.now() - startedAt, ...aggregate }));
    } catch (error) {
      this.status.failedCount += 1;
      this.logger.error(JSON.stringify({ event: 'product_retention_cleanup_failed', runId, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      this.status.running = false;
    }
  }

  private async databaseNow(tx: RetentionTransaction): Promise<Date> {
    const rows = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
    const value = rows[0]?.now;
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error('Database clock unavailable');
    return value;
  }

  private async runBatch(): Promise<CleanupAggregate> {
    const aggregate: CleanupAggregate = { deletedCount: 0, retainedCount: 0, failedCount: 0, remainingCount: null };
    const pendingMedia: PendingMedia[] = [];
    let lockAcquired = false;
    await this.prisma.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended('shopee.product-retention.cleanup', 0)) AS "locked"`);
      lockAcquired = bool(lock[0]?.locked);
      if (!lockAcquired) return;
      const candidates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT p."id"
        FROM "products" p
        WHERE p."deleted_at" IS NOT NULL
          AND p."purge_blocked_at" IS NULL
          AND p."deleted_at" < clock_timestamp() - (${PRODUCT_RETENTION_DAYS} * INTERVAL '1 day')
        ORDER BY p."deleted_at" ASC, p."id" ASC
        LIMIT ${PRODUCT_RETENTION_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `);
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index]!;
        const savepoint = `product_retention_${index}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
        try {
          const outcome = await this.processCandidate(tx, candidate.id, pendingMedia);
          if (outcome === 'deleted') aggregate.deletedCount += 1;
          else aggregate.retainedCount += 1;
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (error) {
          aggregate.failedCount += 1;
          await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
          this.logger.warn(`product retention candidate ${candidate.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });
    if (lockAcquired) {
      for (const media of pendingMedia) {
        try {
          await this.mediaStorage.remove(media.storageKey);
          await this.prisma.sellerProductMediaAsset.deleteMany({ where: { id: media.id, state: 'STAGED' } });
        } catch (error) {
          aggregate.failedCount += 1;
          this.logger.warn(`product retention media ${media.id} cleanup deferred: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else this.logger.debug('product retention cleanup skipped because another API instance owns the advisory lock');
    const remaining = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "products" p
      WHERE p."deleted_at" IS NOT NULL
        AND p."purge_blocked_at" IS NULL
        AND p."deleted_at" < clock_timestamp() - (${PRODUCT_RETENTION_DAYS} * INTERVAL '1 day')
    `);
    const count = remaining[0]?.count;
    aggregate.remainingCount = typeof count === 'bigint' ? Number(count) : null;
    return aggregate;
  }

  private async historyFlags(tx: RetentionTransaction, productId: string): Promise<HistoryFlags> {
    const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        EXISTS (SELECT 1 FROM "order_lines" ol WHERE ol."product_id" = ${productId}::uuid) AS "hasOrderLine",
        EXISTS (SELECT 1 FROM "product_reviews" r WHERE r."product_id" = ${productId}::uuid) AS "hasReview",
        EXISTS (SELECT 1 FROM "inventory_reservation_lines" rl JOIN "product_variants" v ON v."id" = rl."variant_id" WHERE v."product_id" = ${productId}::uuid) AS "hasReservation",
        EXISTS (SELECT 1 FROM "dataset_product_records" d WHERE d."product_id" = ${productId}::uuid) AS "hasDatasetRecord",
        EXISTS (SELECT 1 FROM "inventory" i JOIN "product_variants" v ON v."id" = i."variant_id" WHERE v."product_id" = ${productId}::uuid AND (i."quantity_sold" > 0 OR i."quantity_reserved" > 0)) AS "hasSoldOrReservedInventory",
        EXISTS (SELECT 1 FROM "inventory_adjustments" a JOIN "product_variants" v ON v."id" = a."variant_id" WHERE v."product_id" = ${productId}::uuid AND a."reason" NOT IN ('initial_stock', 'product_edit')) AS "hasCommerceAdjustment"
    `);
    const row = rows[0] ?? {};
    return {
      hasOrderLine: bool(row.hasOrderLine),
      hasReview: bool(row.hasReview),
      hasReservation: bool(row.hasReservation),
      hasDatasetRecord: bool(row.hasDatasetRecord),
      hasSoldOrReservedInventory: bool(row.hasSoldOrReservedInventory),
      hasCommerceAdjustment: bool(row.hasCommerceAdjustment),
    };
  }

  private async processCandidate(tx: RetentionTransaction, productId: string, pendingMedia: PendingMedia[]): Promise<'deleted' | 'retained'> {
    const now = await this.databaseNow(tx);
    const flags = await this.historyFlags(tx, productId);
    if (Object.values(flags).some(Boolean)) {
      await tx.product.update({ where: { id: productId }, data: { purgeBlockedAt: now, purgeBlockReason: 'HISTORICAL_TOMBSTONE' } });
      return 'retained';
    }
    const media = await tx.sellerProductMediaAsset.findMany({ where: { productId, state: 'ATTACHED' }, select: { id: true, storageKey: true } });
    if (media.length > 0) {
      await tx.sellerProductMediaAsset.updateMany({ where: { id: { in: media.map((item) => item.id) } }, data: { productId: null, productImageId: null, state: 'STAGED', expiresAt: now } });
    }
    const variantIds = (await tx.productVariant.findMany({ where: { productId }, select: { id: true } })).map((variant) => variant.id);
    if (variantIds.length > 0) {
      const cartLines = await tx.cartLine.findMany({ where: { variantId: { in: variantIds } }, select: { cartId: true } });
      const cartIds = [...new Set(cartLines.map((line) => line.cartId))];
      await tx.cartLine.deleteMany({ where: { variantId: { in: variantIds } } });
      if (cartIds.length > 0) await tx.cart.updateMany({ where: { id: { in: cartIds } }, data: { version: { increment: 1 } } });
    }
    await tx.productFavorite.deleteMany({ where: { productId } });
    await tx.recentlyViewedProduct.deleteMany({ where: { productId } });
    await tx.homepageModuleProduct.deleteMany({ where: { productId } });
    await tx.voucherProductScope.deleteMany({ where: { productId } });
    await tx.productImage.deleteMany({ where: { productId } });
    // Authoring-only inventory audits reference the variant with RESTRICT;
    // remove them before deleting the inventory/variant graph. Durable
    // commerce-linked adjustments were classified above and never reach this path.
    if (variantIds.length > 0) await tx.inventoryAdjustment.deleteMany({ where: { variantId: { in: variantIds } } });
    await tx.productVariant.deleteMany({ where: { productId } });
    await tx.product.delete({ where: { id: productId } });
    pendingMedia.push(...media);
    return 'deleted';
  }
}
