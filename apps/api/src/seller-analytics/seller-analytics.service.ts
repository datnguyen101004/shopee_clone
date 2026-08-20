import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SELLER_ANALYTICS_MAX_RANGE_DAYS,
  SELLER_ANALYTICS_TIME_ZONE,
  type SellerAnalyticsGranularity,
  type SellerAnalyticsProductPage,
  type SellerAnalyticsQuery,
  type SellerDashboardResponse,
} from '@shopee-clone/contracts';
import { SellerAnalyticsNotFoundError, SellerAnalyticsUnavailableError, SellerAnalyticsValidationError } from './seller-analytics.errors';
import { SellerShopScopeNotFoundError, SellerShopScopeService } from '../seller-scope/seller-shop-scope.service';

const ELIGIBLE_STATUSES = ['awaiting_pickup', 'shipping', 'delivered'] as const;
const LOW_STOCK_THRESHOLD = 10;
const ANALYTICS_STATEMENT_TIMEOUT = '2000ms';

type ShopAnalytics = { id: string; timeZone: string };
type ProductCursor = { digest: string; unitsSold: number; merchandiseRevenueMinor: number; productId: string };

const toSafe = (value: bigint | number | null | undefined): number => {
  const numeric = typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
  if (!Number.isSafeInteger(numeric) || numeric < 0) throw new SellerAnalyticsUnavailableError();
  return numeric;
};

function validateTimeZone(timeZone: string): void {
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); } catch { throw new SellerAnalyticsUnavailableError(); }
}

function timeZoneOffsetMilliseconds(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const year = values.year ?? NaN;
  const month = values.month ?? NaN;
  const day = values.day ?? NaN;
  const hour = values.hour ?? NaN;
  const minute = values.minute ?? NaN;
  const second = values.second ?? NaN;
  return Date.UTC(year, month - 1, day, hour === 24 ? 0 : hour, minute, second) - instant.getTime();
}

function localMidnight(date: string, timeZone: string): Date {
  validateTimeZone(timeZone);
  const wallClock = Date.parse(`${date}T00:00:00.000Z`);
  let guess = wallClock;
  for (let attempt = 0; attempt < 3; attempt += 1) guess = wallClock - timeZoneOffsetMilliseconds(new Date(guess), timeZone);
  const result = new Date(guess);
  if (Number.isNaN(result.getTime())) throw new SellerAnalyticsUnavailableError();
  return result;
}

function nextLocalDate(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function rangeFor(query: SellerAnalyticsQuery, timeZone: string): { from: Date; to: Date; days: number } {
  const from = localMidnight(query.from, timeZone);
  const to = localMidnight(nextLocalDate(query.to), timeZone);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (days < 1 || days > SELLER_ANALYTICS_MAX_RANGE_DAYS) throw new SellerAnalyticsValidationError(['from', 'to']);
  return { from, to, days };
}

function bucketExpression(granularity: SellerAnalyticsGranularity, timeZone: string): Prisma.Sql {
  if (granularity === 'MONTH') return Prisma.sql`to_char(date_trunc('month', so."created_at" AT TIME ZONE ${timeZone}), 'YYYY-MM')`;
  if (granularity === 'WEEK') return Prisma.sql`to_char(date_trunc('week', so."created_at" AT TIME ZONE ${timeZone}), 'YYYY-MM-DD')`;
  return Prisma.sql`to_char(so."created_at" AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
}

function bucketStart(value: string, granularity: SellerAnalyticsGranularity): Date {
  if (granularity === 'MONTH') return new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (granularity === 'WEEK') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
}

function nextBucket(value: Date, granularity: SellerAnalyticsGranularity): Date {
  const next = new Date(value);
  if (granularity === 'MONTH') next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCDate(next.getUTCDate() + (granularity === 'WEEK' ? 7 : 1));
  return next;
}

function analyticsDigest(query: SellerAnalyticsQuery): string {
  return createHash('sha256').update(JSON.stringify({ from: query.from, to: query.to, granularity: query.granularity })).digest('hex');
}

function encodeCursor(query: SellerAnalyticsQuery, row: Omit<ProductCursor, 'digest'>): string {
  return Buffer.from(JSON.stringify({ ...row, digest: analyticsDigest(query) }), 'utf8').toString('base64url');
}

function decodeCursor(query: SellerAnalyticsQuery, value: string | null): ProductCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<ProductCursor>;
    const unitsSold = parsed.unitsSold;
    const merchandiseRevenueMinor = parsed.merchandiseRevenueMinor;
    if (parsed.digest !== analyticsDigest(query) || typeof parsed.productId !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.productId) || typeof unitsSold !== 'number' || typeof merchandiseRevenueMinor !== 'number' || !Number.isSafeInteger(unitsSold) || !Number.isSafeInteger(merchandiseRevenueMinor) || unitsSold < 0 || merchandiseRevenueMinor < 0) throw new Error('invalid cursor');
    return { digest: parsed.digest, productId: parsed.productId, unitsSold: unitsSold as number, merchandiseRevenueMinor: merchandiseRevenueMinor as number };
  } catch { throw new SellerAnalyticsValidationError(['cursor']); }
}

@Injectable()
export class SellerAnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(SellerShopScopeService) private readonly sellerScope?: SellerShopScopeService) {}

  private async ownedShop(userId: string): Promise<ShopAnalytics> {
    if (this.sellerScope) {
      try { const shop = await this.sellerScope.resolve(userId); validateTimeZone(shop.timeZone || SELLER_ANALYTICS_TIME_ZONE); return { id: shop.id, timeZone: shop.timeZone || SELLER_ANALYTICS_TIME_ZONE }; }
      catch (error) { if (error instanceof SellerShopScopeNotFoundError) throw new SellerAnalyticsNotFoundError(); throw error; }
    }
    const shop = await this.prisma.shop.findFirst({ where: { ownerId: userId, deletedAt: null, status: 'ACTIVE', onboardingStatus: 'APPROVED' }, select: { id: true, timeZone: true } });
    if (!shop) throw new SellerAnalyticsNotFoundError();
    validateTimeZone(shop.timeZone || SELLER_ANALYTICS_TIME_ZONE);
    return { id: shop.id, timeZone: shop.timeZone || SELLER_ANALYTICS_TIME_ZONE };
  }

  private async dashboardInTransaction(tx: Prisma.TransactionClient, shop: ShopAnalytics, query: SellerAnalyticsQuery): Promise<SellerDashboardResponse> {
    await tx.$executeRaw(Prisma.sql`SELECT set_config('statement_timeout', ${ANALYTICS_STATEMENT_TIMEOUT}, true)`);
    const range = rangeFor(query, shop.timeZone);
    const statusList = Prisma.join(ELIGIBLE_STATUSES.map((status) => Prisma.sql`${status}`));
    const [nowRows, kpiRows, seriesRows, bestRows, lowRows] = await Promise.all([
      tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`),
      tx.$queryRaw<Array<{ eligibleOrderCount: bigint; unitsSold: bigint; merchandiseRevenueMinor: bigint }>>(Prisma.sql`
        SELECT COUNT(DISTINCT so."id")::bigint AS "eligibleOrderCount", COALESCE(SUM(ol."quantity"), 0)::bigint AS "unitsSold", COALESCE(SUM(ol."payable_merchandise_minor"), 0)::bigint AS "merchandiseRevenueMinor"
        FROM "shop_orders" so INNER JOIN "order_lines" ol ON ol."order_id" = so."id"
        WHERE so."shop_id" = ${shop.id}::uuid AND so."status" IN (${statusList}) AND so."created_at" >= ${range.from} AND so."created_at" < ${range.to}`),
      tx.$queryRaw<Array<{ bucket: string; eligibleOrderCount: bigint; unitsSold: bigint; merchandiseRevenueMinor: bigint }>>(Prisma.sql`
        SELECT ${bucketExpression(query.granularity, shop.timeZone)} AS "bucket", COUNT(DISTINCT so."id")::bigint AS "eligibleOrderCount", COALESCE(SUM(ol."quantity"), 0)::bigint AS "unitsSold", COALESCE(SUM(ol."payable_merchandise_minor"), 0)::bigint AS "merchandiseRevenueMinor"
        FROM "shop_orders" so INNER JOIN "order_lines" ol ON ol."order_id" = so."id"
        WHERE so."shop_id" = ${shop.id}::uuid AND so."status" IN (${statusList}) AND so."created_at" >= ${range.from} AND so."created_at" < ${range.to}
        GROUP BY 1 ORDER BY 1`),
      tx.$queryRaw<Array<{ productId: string; productName: string; productImageUrl: string | null; unitsSold: bigint; merchandiseRevenueMinor: bigint; currentProductAvailable: boolean }>>(Prisma.sql`
        WITH eligible AS (SELECT ol."id", ol."product_id", ol."product_name", ol."product_image_url", ol."quantity", ol."payable_merchandise_minor", ol."created_at" FROM "order_lines" ol INNER JOIN "shop_orders" so ON so."id" = ol."order_id" WHERE so."shop_id" = ${shop.id}::uuid AND so."status" IN (${statusList}) AND so."created_at" >= ${range.from} AND so."created_at" < ${range.to}), aggregated AS (SELECT "product_id", SUM("quantity")::bigint AS "unitsSold", SUM("payable_merchandise_minor")::bigint AS "merchandiseRevenueMinor" FROM eligible GROUP BY "product_id"), snapshots AS (SELECT DISTINCT ON ("product_id") "product_id", "product_name", "product_image_url" FROM eligible ORDER BY "product_id", "created_at" DESC, "id" DESC)
        SELECT a."product_id" AS "productId", s."product_name" AS "productName", s."product_image_url" AS "productImageUrl", a."unitsSold", a."merchandiseRevenueMinor", EXISTS (SELECT 1 FROM "products" p WHERE p."id" = a."product_id" AND p."shop_id" = ${shop.id}::uuid AND p."status" = 'active' AND p."deleted_at" IS NULL) AS "currentProductAvailable" FROM aggregated a INNER JOIN snapshots s ON s."product_id" = a."product_id" ORDER BY a."unitsSold" DESC, a."merchandiseRevenueMinor" DESC, a."product_id" ASC LIMIT 10`),
      tx.$queryRaw<Array<{ variantId: string; productId: string; productName: string; productImageUrl: string | null; variantName: string; sku: string; quantityOnHand: number; quantityReserved: number; availableQuantity: number }>>(Prisma.sql`
        SELECT pv."id" AS "variantId", p."id" AS "productId", p."name" AS "productName", pi."url" AS "productImageUrl", pv."name" AS "variantName", pv."sku", i."quantity_on_hand" AS "quantityOnHand", i."quantity_reserved" AS "quantityReserved", (i."quantity_on_hand" - i."quantity_reserved") AS "availableQuantity"
        FROM "inventory" i INNER JOIN "product_variants" pv ON pv."id" = i."variant_id" INNER JOIN "products" p ON p."id" = pv."product_id" LEFT JOIN LATERAL (SELECT "url" FROM "product_images" WHERE "product_id" = p."id" AND "variant_id" IS NULL ORDER BY "sort_order", "id" LIMIT 1) pi ON true
        WHERE p."shop_id" = ${shop.id}::uuid AND p."status" = 'active' AND p."deleted_at" IS NULL AND pv."status" = 'active' AND pv."deleted_at" IS NULL AND (i."quantity_on_hand" - i."quantity_reserved") <= ${LOW_STOCK_THRESHOLD}
        ORDER BY (i."quantity_on_hand" - i."quantity_reserved"), pv."id" LIMIT 10`),
    ]);
    const kpi = kpiRows[0] ?? { eligibleOrderCount: 0n, unitsSold: 0n, merchandiseRevenueMinor: 0n };
    const actual = new Map(seriesRows.map((row) => [row.bucket, row]));
    const series: SellerDashboardResponse['timeSeries'] = [];
    for (let cursor = bucketStart(query.from, query.granularity); localMidnight(cursor.toISOString().slice(0, 10), shop.timeZone) < range.to; cursor = nextBucket(cursor, query.granularity)) {
      const key = query.granularity === 'MONTH' ? cursor.toISOString().slice(0, 7) : cursor.toISOString().slice(0, 10);
      const row = actual.get(key);
      series.push({ bucket: key, eligibleOrderCount: toSafe(row?.eligibleOrderCount), unitsSold: toSafe(row?.unitsSold), merchandiseRevenueMinor: toSafe(row?.merchandiseRevenueMinor) });
    }
    const generatedAt = nowRows[0]?.now;
    if (!(generatedAt instanceof Date) || Number.isNaN(generatedAt.getTime())) throw new SellerAnalyticsUnavailableError();
    return {
      sellerAnalyticsVersion: 'seller-analytics-v1', currency: 'VND',
      range: { from: query.from, to: query.to, timeZone: shop.timeZone, fromUtc: range.from.toISOString(), toUtcExclusive: range.to.toISOString() },
      generatedAt: generatedAt.toISOString(),
      kpis: { eligibleOrderCount: toSafe(kpi.eligibleOrderCount), unitsSold: toSafe(kpi.unitsSold), merchandiseRevenueMinor: toSafe(kpi.merchandiseRevenueMinor) },
      timeSeries: series,
      bestSellers: bestRows.map((row) => ({ productId: row.productId, productName: row.productName, productImageUrl: row.productImageUrl, unitsSold: toSafe(row.unitsSold), merchandiseRevenueMinor: toSafe(row.merchandiseRevenueMinor), currentProductAvailable: row.currentProductAvailable })),
      lowStock: { threshold: LOW_STOCK_THRESHOLD, items: lowRows },
      conversion: { status: 'NOT_AVAILABLE', rateBasisPoints: null, visits: null },
    };
  }

  async dashboard(userId: string, query: SellerAnalyticsQuery): Promise<SellerDashboardResponse> {
    const shop = await this.ownedShop(userId);
    try { return await this.prisma.$transaction((tx) => this.dashboardInTransaction(tx, shop, query)); }
    catch (error) { if (error instanceof SellerAnalyticsValidationError || error instanceof SellerAnalyticsUnavailableError) throw error; throw new SellerAnalyticsUnavailableError(); }
  }

  private async productsInTransaction(tx: Prisma.TransactionClient, shop: ShopAnalytics, query: SellerAnalyticsQuery & { limit: number; cursor: string | null }): Promise<SellerAnalyticsProductPage> {
    await tx.$executeRaw(Prisma.sql`SELECT set_config('statement_timeout', ${ANALYTICS_STATEMENT_TIMEOUT}, true)`);
    const range = rangeFor(query, shop.timeZone);
    const cursor = decodeCursor(query, query.cursor);
    const statusList = Prisma.join(ELIGIBLE_STATUSES.map((status) => Prisma.sql`${status}`));
    const cursorFilter = cursor ? Prisma.sql`WHERE r."unitsSold" < ${cursor.unitsSold} OR (r."unitsSold" = ${cursor.unitsSold} AND r."merchandiseRevenueMinor" < ${cursor.merchandiseRevenueMinor}) OR (r."unitsSold" = ${cursor.unitsSold} AND r."merchandiseRevenueMinor" = ${cursor.merchandiseRevenueMinor} AND r."productId" > ${cursor.productId}::uuid)` : Prisma.empty;
    const rows = await tx.$queryRaw<Array<{ productId: string; productName: string; productImageUrl: string | null; unitsSold: bigint; merchandiseRevenueMinor: bigint; currentProductAvailable: boolean }>>(Prisma.sql`
      WITH eligible AS (SELECT ol."id", ol."product_id", ol."product_name", ol."product_image_url", ol."quantity", ol."payable_merchandise_minor", ol."created_at" FROM "order_lines" ol INNER JOIN "shop_orders" so ON so."id" = ol."order_id" WHERE so."shop_id" = ${shop.id}::uuid AND so."status" IN (${statusList}) AND so."created_at" >= ${range.from} AND so."created_at" < ${range.to}), aggregated AS (SELECT "product_id", SUM("quantity")::bigint AS "unitsSold", SUM("payable_merchandise_minor")::bigint AS "merchandiseRevenueMinor" FROM eligible GROUP BY "product_id"), snapshots AS (SELECT DISTINCT ON ("product_id") "product_id", "product_name", "product_image_url" FROM eligible ORDER BY "product_id", "created_at" DESC, "id" DESC), ranked AS (SELECT a."product_id" AS "productId", s."product_name" AS "productName", s."product_image_url" AS "productImageUrl", a."unitsSold", a."merchandiseRevenueMinor", EXISTS (SELECT 1 FROM "products" p WHERE p."id" = a."product_id" AND p."shop_id" = ${shop.id}::uuid AND p."status" = 'active' AND p."deleted_at" IS NULL) AS "currentProductAvailable" FROM aggregated a INNER JOIN snapshots s ON s."product_id" = a."product_id")
      SELECT * FROM ranked r ${cursorFilter} ORDER BY r."unitsSold" DESC, r."merchandiseRevenueMinor" DESC, r."productId" ASC LIMIT ${query.limit + 1}`);
    const items = rows.slice(0, query.limit).map((row) => ({ productId: row.productId, productName: row.productName, productImageUrl: row.productImageUrl, unitsSold: toSafe(row.unitsSold), merchandiseRevenueMinor: toSafe(row.merchandiseRevenueMinor), currentProductAvailable: row.currentProductAvailable }));
    const last = items.at(-1);
    return { sellerAnalyticsVersion: 'seller-analytics-v1', currency: 'VND', range: { from: query.from, to: query.to, timeZone: shop.timeZone, fromUtc: range.from.toISOString(), toUtcExclusive: range.to.toISOString() }, items, nextCursor: rows.length > query.limit && last ? encodeCursor(query, last) : null };
  }

  async products(userId: string, query: SellerAnalyticsQuery & { limit: number; cursor: string | null }): Promise<SellerAnalyticsProductPage> {
    const shop = await this.ownedShop(userId);
    try { return await this.prisma.$transaction((tx) => this.productsInTransaction(tx, shop, query)); }
    catch (error) { if (error instanceof SellerAnalyticsValidationError || error instanceof SellerAnalyticsUnavailableError) throw error; throw new SellerAnalyticsUnavailableError(); }
  }
}
