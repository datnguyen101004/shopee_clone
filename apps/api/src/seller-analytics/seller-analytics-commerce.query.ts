import { Prisma } from '../generated/prisma/client';

export type SellerCommerceQuery = {
  shopId: string;
  timeZone: string;
  currentFrom: Date;
  currentTo: Date;
  previousFrom: Date;
  previousTo: Date;
  interval: 'hour' | 'day';
};

export type SellerCommerceRow = {
  rowType: 'summary' | 'trend' | 'product' | 'catalog';
  period: 'current' | 'previous';
  bucketStart: Date | string | null;
  productId: string | null;
  productName: string | null;
  productImageUrl: string | null;
  orders: bigint | number;
  unitsSold: bigint | number;
  revenue: bigint | number;
};

const ELIGIBLE_STATUSES = ['awaiting_pickup', 'shipping', 'delivered'] as const;

function bucketExpression(query: SellerCommerceQuery): Prisma.Sql {
  const granularity = query.interval === 'hour' ? 'hour' : 'day';
  return Prisma.sql`date_trunc(${granularity}, "createdAt" AT TIME ZONE ${query.timeZone}) AT TIME ZONE ${query.timeZone}`;
}

/**
 * One bounded PostgreSQL statement for the current and previous periods.
 * Catalog rows are included solely to supply names/images for engagement-only
 * products; all commerce counts still come from the period-window CTE.
 */
export function buildSellerCommerceAggregationQuery(query: SellerCommerceQuery): Prisma.Sql {
  const statuses = Prisma.join(ELIGIBLE_STATUSES.map((status) => Prisma.sql`${status}`));
  const bucket = bucketExpression(query);
  return Prisma.sql`
WITH period_window AS (
  SELECT
    CASE WHEN so."created_at" >= ${query.currentFrom} AND so."created_at" < ${query.currentTo} THEN 'current' ELSE 'previous' END AS "period",
    so."id" AS "orderId",
    so."created_at" AS "createdAt",
    ol."product_id" AS "productId",
    ol."product_name" AS "productName",
    ol."product_image_url" AS "productImageUrl",
    ol."quantity" AS "quantity",
    ol."payable_merchandise_minor" AS "revenue"
  FROM "shop_orders" so
  INNER JOIN "order_lines" ol ON ol."order_id" = so."id"
  WHERE so."shop_id" = ${query.shopId}::uuid
    AND so."status" IN (${statuses})
    AND so."created_at" >= ${query.previousFrom}
    AND so."created_at" < ${query.currentTo}
), period_buckets AS (
  SELECT "period", "orderId", "quantity", "revenue", ${bucket} AS "bucketStart"
  FROM period_window
), summary AS (
  SELECT 'summary'::text AS "rowType", "period", NULL::timestamptz AS "bucketStart", NULL::uuid AS "productId", NULL::text AS "productName", NULL::text AS "productImageUrl",
    COUNT(DISTINCT "orderId")::bigint AS "orders", COALESCE(SUM("quantity"), 0)::bigint AS "unitsSold", COALESCE(SUM("revenue"), 0)::bigint AS "revenue"
  FROM period_window GROUP BY "period"
), trend AS (
  SELECT 'trend'::text AS "rowType", "period", "bucketStart", NULL::uuid AS "productId", NULL::text AS "productName", NULL::text AS "productImageUrl",
    COUNT(DISTINCT "orderId")::bigint AS "orders", COALESCE(SUM("quantity"), 0)::bigint AS "unitsSold", COALESCE(SUM("revenue"), 0)::bigint AS "revenue"
  FROM period_buckets GROUP BY "period", "bucketStart"
), product AS (
  SELECT 'product'::text AS "rowType", "period", NULL::timestamptz AS "bucketStart", "productId", MAX("productName") AS "productName", MAX("productImageUrl") AS "productImageUrl",
    COUNT(DISTINCT "orderId")::bigint AS "orders", COALESCE(SUM("quantity"), 0)::bigint AS "unitsSold", COALESCE(SUM("revenue"), 0)::bigint AS "revenue"
  FROM period_window GROUP BY "period", "productId"
), catalog AS (
  SELECT 'catalog'::text AS "rowType", 'current'::text AS "period", NULL::timestamptz AS "bucketStart", p."id" AS "productId", p."name" AS "productName", image."url" AS "productImageUrl",
    0::bigint AS "orders", 0::bigint AS "unitsSold", 0::bigint AS "revenue"
  FROM "products" p
  LEFT JOIN LATERAL (
    SELECT pi."url" FROM "product_images" pi WHERE pi."product_id" = p."id" AND pi."variant_id" IS NULL ORDER BY pi."sort_order", pi."id" LIMIT 1
  ) image ON true
  WHERE p."shop_id" = ${query.shopId}::uuid AND p."deleted_at" IS NULL
)
SELECT * FROM summary
UNION ALL SELECT * FROM trend
UNION ALL SELECT * FROM product
UNION ALL SELECT * FROM catalog
ORDER BY "rowType", "period", "bucketStart" NULLS FIRST, "productId"`;
}

export const buildCommerceAggregationQuery = buildSellerCommerceAggregationQuery;
