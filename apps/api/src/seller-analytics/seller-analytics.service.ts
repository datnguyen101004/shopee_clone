import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SELLER_ANALYTICS_MAX_RANGE_DAYS,
  SELLER_ANALYTICS_TIME_ZONE,
  type SellerAnalyticsGranularity,
  type SellerAnalyticsProductPage,
  type SellerAnalyticsQuery,
  type SellerDashboardResponse,
  type SellerAnalyticsOverviewQuery,
  type SellerAnalyticsOverviewResponse,
  type SellerAnalyticsMetric,
  type SellerAnalyticsMetrics,
} from '@shopee-clone/contracts';
import { SellerAnalyticsNotFoundError, SellerAnalyticsUnavailableError, SellerAnalyticsValidationError } from './seller-analytics.errors';
import { SellerShopScopeNotFoundError, SellerShopScopeService } from '../seller-scope/seller-shop-scope.service';
import { publicSellerProductMediaUrl } from '../seller-products/seller-product-media.storage';
import { AthenaEngagementQueryAdapter, type EngagementMetricCounts } from '../clickstream-analytics/athena-engagement.adapter';
import { buildSellerCommerceAggregationQuery, type SellerCommerceQuery, type SellerCommerceRow } from './seller-analytics-commerce.query';
import { resolveSellerAnalyticsPeriod, shopLocalMidnight, type SellerAnalyticsResolvedPeriod } from './seller-analytics-period';
import { relativeAnalyticsChange, safeAnalyticsRate } from './seller-analytics-metrics';

const ELIGIBLE_STATUSES = ['awaiting_pickup', 'shipping', 'delivered'] as const;
const LOW_STOCK_THRESHOLD = 10;
const ANALYTICS_STATEMENT_TIMEOUT = '2000ms';

type ShopAnalytics = { id: string; timeZone: string };
type ProductCursor = { digest: string; unitsSold: number; merchandiseRevenueMinor: number; productId: string };

type CommerceCounts = { orders: number; unitsSold: number; revenue: number };
type OverviewCounts = EngagementMetricCounts & CommerceCounts;
type CommerceAggregate = { current: CommerceCounts; previous: CommerceCounts; trends: Array<CommerceCounts & { period: 'current' | 'previous'; bucketStart: string }>; products: Array<CommerceCounts & { period: 'current' | 'previous'; productId: string; productName: string | null; productImageUrl: string | null }>; catalog: Map<string, { productName: string; productImageUrl: string | null }> };

const ZERO_ENGAGEMENT: EngagementMetricCounts = { impressions: 0, productViews: 0, uniqueVisitors: 0, clicks: 0, addToCart: 0 };
const ZERO_COMMERCE: CommerceCounts = { orders: 0, unitsSold: 0, revenue: 0 };
const ZERO_OVERVIEW: OverviewCounts = { ...ZERO_ENGAGEMENT, ...ZERO_COMMERCE };

function safeAggregateNumber(value: bigint | number | null | undefined): number {
  const numberValue = typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) throw new SellerAnalyticsUnavailableError();
  return numberValue;
}

function zeroCommerceAggregate(): CommerceAggregate {
  return { current: { ...ZERO_COMMERCE }, previous: { ...ZERO_COMMERCE }, trends: [], products: [], catalog: new Map() };
}

function mapCommerceRows(rows: SellerCommerceRow[]): CommerceAggregate {
  const result = zeroCommerceAggregate();
  for (const row of rows) {
    if (row.rowType === 'catalog') {
      if (row.productId && row.productName) result.catalog.set(row.productId, { productName: row.productName, productImageUrl: row.productImageUrl ?? null });
      continue;
    }
    if (row.period !== 'current' && row.period !== 'previous') continue;
    const counts: CommerceCounts = { orders: safeAggregateNumber(row.orders), unitsSold: safeAggregateNumber(row.unitsSold), revenue: safeAggregateNumber(row.revenue) };
    if (row.rowType === 'summary') result[row.period] = counts;
    else if (row.rowType === 'trend' && row.bucketStart) result.trends.push({ ...counts, period: row.period, bucketStart: row.bucketStart instanceof Date ? row.bucketStart.toISOString() : new Date(row.bucketStart).toISOString() });
    else if (row.rowType === 'product' && row.productId) result.products.push({ ...counts, period: row.period, productId: row.productId, productName: row.productName, productImageUrl: row.productImageUrl });
  }
  result.trends.sort((a, b) => a.period.localeCompare(b.period) || a.bucketStart.localeCompare(b.bucketStart));
  result.products.sort((a, b) => a.productId.localeCompare(b.productId) || a.period.localeCompare(b.period));
  return result;
}

export const mapSellerCommerceRows = mapCommerceRows;

function countFromEngagement(value: EngagementMetricCounts | undefined): EngagementMetricCounts {
  return value ? { ...value } : { ...ZERO_ENGAGEMENT };
}

function countFromCommerce(value: CommerceCounts | undefined): CommerceCounts {
  return value ? { ...value } : { ...ZERO_COMMERCE };
}

function combinedCounts(engagement: EngagementMetricCounts | undefined, commerce: CommerceCounts | undefined): OverviewCounts {
  return { ...countFromEngagement(engagement), ...countFromCommerce(commerce) };
}

function overviewMetrics(current: OverviewCounts, previous: OverviewCounts): SellerAnalyticsMetrics {
  const metric = (key: keyof OverviewCounts): SellerAnalyticsMetric => ({ current: current[key], previous: previous[key], change: relativeAnalyticsChange(current[key], previous[key]) });
  return {
    impressions: metric('impressions'),
    productViews: metric('productViews'),
    uniqueVisitors: metric('uniqueVisitors'),
    clicks: metric('clicks'),
    ctr: { current: safeAnalyticsRate(current.clicks, current.impressions), previous: safeAnalyticsRate(previous.clicks, previous.impressions), change: relativeAnalyticsChange(safeAnalyticsRate(current.clicks, current.impressions), safeAnalyticsRate(previous.clicks, previous.impressions)) },
    addToCart: metric('addToCart'),
    orders: metric('orders'),
    unitsSold: metric('unitsSold'),
    revenue: metric('revenue'),
    conversionRate: { current: safeAnalyticsRate(current.orders, current.uniqueVisitors), previous: safeAnalyticsRate(previous.orders, previous.uniqueVisitors), change: relativeAnalyticsChange(safeAnalyticsRate(current.orders, current.uniqueVisitors), safeAnalyticsRate(previous.orders, previous.uniqueVisitors)) },
  };
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDateOf(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return `${String(values.year).padStart(4, '0')}-${String(values.month).padStart(2, '0')}-${String(values.day).padStart(2, '0')}`;
}

function expectedTrendStarts(period: SellerAnalyticsResolvedPeriod, timeZone: string, from = period.from, to = period.to, fromDate = period.fromDate, toDate = period.toDate): string[] {
  if (period.interval === 'day') {
    const values: string[] = [];
    for (let date = fromDate; date <= toDate; date = shiftDate(date, 1)) values.push(shopLocalMidnight(date, timeZone).toISOString());
    return values;
  }
  const values: string[] = [];
  for (let cursor = from.getTime(); cursor < to.getTime(); cursor += 3_600_000) values.push(new Date(cursor).toISOString());
  return values;
}

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
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SellerShopScopeService) private readonly sellerScope?: SellerShopScopeService,
    @Optional() @Inject(AthenaEngagementQueryAdapter) private readonly athena?: AthenaEngagementQueryAdapter,
  ) {}

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
    const imageProductIds = [...new Set([...bestRows.map((row) => row.productId), ...lowRows.map((row) => row.productId)])];
    const currentImages = imageProductIds.length
      ? await tx.productImage.findMany({
          where: { productId: { in: imageProductIds }, variantId: null },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: { productId: true, url: true, sellerProductMediaAsset: { select: { storageKey: true } } },
        })
      : [];
    const currentImageByProduct = new Map<string, (typeof currentImages)[number]>();
    for (const image of currentImages) if (!currentImageByProduct.has(image.productId)) currentImageByProduct.set(image.productId, image);
    const currentImageUrl = (productId: string, snapshotUrl: string | null): string | null => {
      const image = currentImageByProduct.get(productId);
      const cdnUrl = image?.sellerProductMediaAsset?.storageKey ? publicSellerProductMediaUrl(image.sellerProductMediaAsset.storageKey) : null;
      return cdnUrl ?? snapshotUrl ?? image?.url ?? null;
    };
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
      bestSellers: bestRows.map((row) => ({ productId: row.productId, productName: row.productName, productImageUrl: currentImageUrl(row.productId, row.productImageUrl), unitsSold: toSafe(row.unitsSold), merchandiseRevenueMinor: toSafe(row.merchandiseRevenueMinor), currentProductAvailable: row.currentProductAvailable })),
      lowStock: { threshold: LOW_STOCK_THRESHOLD, items: lowRows.map((row) => ({ ...row, productImageUrl: currentImageUrl(row.productId, row.productImageUrl) })) },
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
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const currentImages = productIds.length
      ? await tx.productImage.findMany({
          where: { productId: { in: productIds }, variantId: null },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: { productId: true, url: true, sellerProductMediaAsset: { select: { storageKey: true } } },
        })
      : [];
    const currentImageByProduct = new Map<string, (typeof currentImages)[number]>();
    for (const image of currentImages) if (!currentImageByProduct.has(image.productId)) currentImageByProduct.set(image.productId, image);
    const items = rows.slice(0, query.limit).map((row) => {
      const image = currentImageByProduct.get(row.productId);
      const cdnUrl = image?.sellerProductMediaAsset?.storageKey ? publicSellerProductMediaUrl(image.sellerProductMediaAsset.storageKey) : null;
      return { productId: row.productId, productName: row.productName, productImageUrl: cdnUrl ?? row.productImageUrl ?? image?.url ?? null, unitsSold: toSafe(row.unitsSold), merchandiseRevenueMinor: toSafe(row.merchandiseRevenueMinor), currentProductAvailable: row.currentProductAvailable };
    });
    const last = items.at(-1);
    return { sellerAnalyticsVersion: 'seller-analytics-v1', currency: 'VND', range: { from: query.from, to: query.to, timeZone: shop.timeZone, fromUtc: range.from.toISOString(), toUtcExclusive: range.to.toISOString() }, items, nextCursor: rows.length > query.limit && last ? encodeCursor(query, last) : null };
  }

  async products(userId: string, query: SellerAnalyticsQuery & { limit: number; cursor: string | null }): Promise<SellerAnalyticsProductPage> {
    const shop = await this.ownedShop(userId);
    try { return await this.prisma.$transaction((tx) => this.productsInTransaction(tx, shop, query)); }
    catch (error) { if (error instanceof SellerAnalyticsValidationError || error instanceof SellerAnalyticsUnavailableError) throw error; throw new SellerAnalyticsUnavailableError(); }
  }

  private async commerceOverviewRows(query: SellerCommerceQuery): Promise<SellerCommerceRow[]> {
    const sql = buildSellerCommerceAggregationQuery(query);
    const transaction = this.prisma.$transaction as unknown as ((work: (tx: { $executeRaw?: (query: Prisma.Sql) => Promise<unknown>; $queryRaw<T>(query: Prisma.Sql): Promise<T> }) => Promise<unknown>) => Promise<unknown>);
    if (typeof transaction === 'function') return await transaction.call(this.prisma, async (tx) => {
      if (typeof tx.$executeRaw === 'function') await tx.$executeRaw(Prisma.sql`SELECT set_config('statement_timeout', ${ANALYTICS_STATEMENT_TIMEOUT}, true)`);
      return tx.$queryRaw<SellerCommerceRow[]>(sql);
    }) as SellerCommerceRow[];
    return await (this.prisma as unknown as { $queryRaw<T>(query: Prisma.Sql): Promise<T> }).$queryRaw<SellerCommerceRow[]>(sql);
  }

  /** Compose one server-authoritative engagement/commerce overview response. */
  async overview(userId: string, query: SellerAnalyticsOverviewQuery): Promise<SellerAnalyticsOverviewResponse> {
    if (!this.athena) throw new SellerAnalyticsUnavailableError();
    // Capture once before either source starts. This keeps all boundaries and
    // the generated timestamp on one server-side clock sample.
    const generatedAt = new Date();
    const shop = await this.ownedShop(userId);
    let period: SellerAnalyticsResolvedPeriod;
    try { period = resolveSellerAnalyticsPeriod(query, shop.timeZone, generatedAt); }
    catch { throw new SellerAnalyticsValidationError(['preset', 'from', 'to']); }
    const [engagement, commerceRows] = await Promise.all([
      this.athena.query({ currentFrom: period.from.toISOString(), currentTo: period.to.toISOString(), previousFrom: period.previousFrom.toISOString(), previousTo: period.previousTo.toISOString(), shopId: shop.id, timeZone: shop.timeZone, interval: period.interval }),
      this.commerceOverviewRows({ shopId: shop.id, timeZone: shop.timeZone, currentFrom: period.from, currentTo: period.to, previousFrom: period.previousFrom, previousTo: period.previousTo, interval: period.interval }),
    ]).catch(() => { throw new SellerAnalyticsUnavailableError(); });
    const commerce = mapCommerceRows(commerceRows);

    const currentSummary = combinedCounts(countFromEngagement(engagement.current), countFromCommerce(commerce.current));
    const previousSummary = combinedCounts(countFromEngagement(engagement.previous), countFromCommerce(commerce.previous));

    const engagementCurrentTrend = new Map(engagement.trends.filter((row) => row.period === 'current').map((row) => [row.bucketStart, row]));
    const engagementPreviousTrend = engagement.trends.filter((row) => row.period === 'previous').sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
    const commerceCurrentTrend = new Map(commerce.trends.filter((row) => row.period === 'current').map((row) => [row.bucketStart, row]));
    const commercePreviousTrend = commerce.trends.filter((row) => row.period === 'previous').sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
    const trendStarts = expectedTrendStarts(period, shop.timeZone);
    const previousFromDate = localDateOf(period.previousFrom, shop.timeZone);
    const previousToDate = localDateOf(new Date(period.previousTo.getTime() - 1), shop.timeZone);
    const previousTrendStarts = expectedTrendStarts(period, shop.timeZone, period.previousFrom, period.previousTo, previousFromDate, previousToDate);
    const previousEngagementByBucket = new Map(engagementPreviousTrend.map((row) => [row.bucketStart, row]));
    const previousCommerceByBucket = new Map(commercePreviousTrend.map((row) => [row.bucketStart, row]));
    const seenTrendStarts = new Set(trendStarts);
    for (const row of engagement.trends) if (row.period === 'current' && !seenTrendStarts.has(row.bucketStart)) { trendStarts.push(row.bucketStart); seenTrendStarts.add(row.bucketStart); }
    for (const row of commerce.trends) if (row.period === 'current' && !seenTrendStarts.has(row.bucketStart)) { trendStarts.push(row.bucketStart); seenTrendStarts.add(row.bucketStart); }
    trendStarts.sort();
    const trendBuckets = trendStarts.map((bucketStart, index) => {
      const current = combinedCounts(engagementCurrentTrend.get(bucketStart), commerceCurrentTrend.get(bucketStart));
      const previousBucketStart = previousTrendStarts[index];
      const previousEngagement = previousBucketStart ? previousEngagementByBucket.get(previousBucketStart) : undefined;
      const previousCommerce = previousBucketStart ? previousCommerceByBucket.get(previousBucketStart) : undefined;
      const previous = combinedCounts(previousEngagement, previousCommerce);
      return { bucketStart, metrics: overviewMetrics(current, previous) };
    });

    type ProductAggregate = { current: OverviewCounts; previous: OverviewCounts; productName: string; productImageUrl: string | null };
    const productMap = new Map<string, ProductAggregate>();
    const ensureProduct = (productId: string): ProductAggregate => {
      const existing = productMap.get(productId);
      if (existing) return existing;
      const catalog = commerce.catalog.get(productId);
      const created: ProductAggregate = { current: { ...ZERO_OVERVIEW }, previous: { ...ZERO_OVERVIEW }, productName: catalog?.productName ?? productId, productImageUrl: catalog?.productImageUrl ?? null };
      productMap.set(productId, created);
      return created;
    };
    for (const row of engagement.products) {
      const target = ensureProduct(row.productId);
      target[row.period] = { ...target[row.period], ...row };
    }
    for (const row of commerce.products) {
      const target = ensureProduct(row.productId);
      target[row.period] = { ...target[row.period], orders: row.orders, unitsSold: row.unitsSold, revenue: row.revenue };
      if (row.productName) target.productName = row.productName;
      if (row.productImageUrl) target.productImageUrl = row.productImageUrl;
    }
    const products = [...productMap.entries()].map(([productId, row]) => ({ productId, productName: row.productName, productImageUrl: row.productImageUrl, metrics: overviewMetrics(row.current, row.previous) }));
    products.sort((a, b) => b.metrics.revenue.current - a.metrics.revenue.current || b.metrics.orders.current - a.metrics.orders.current || b.metrics.productViews.current - a.metrics.productViews.current || a.productId.localeCompare(b.productId));
    const totalItems = products.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const start = (query.page - 1) * query.pageSize;
    const items = start >= totalItems ? [] : products.slice(start, start + query.pageSize);
    return {
      sellerAnalyticsVersion: 'seller-analytics-overview-v1', currency: 'VND', generatedAt: generatedAt.toISOString(), freshness: 'near_real_time',
      range: { preset: period.preset, from: period.fromDate, to: period.toDate, timeZone: shop.timeZone, fromUtc: period.from.toISOString(), toUtcExclusive: period.to.toISOString(), previousFromUtc: period.previousFrom.toISOString(), previousToUtcExclusive: period.previousTo.toISOString() },
      summary: overviewMetrics(currentSummary, previousSummary),
      trend: { interval: period.interval, buckets: trendBuckets },
      products: { items, page: query.page, pageSize: query.pageSize, totalItems, totalPages },
    };
  }
}
