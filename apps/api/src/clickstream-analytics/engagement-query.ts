import { RAW_CLICKSTREAM_SCHEMA_VERSION } from '@shopee-clone/contracts';

/** The two windows are deliberately passed to Athena together so one scan can
 * produce comparison values as well as the current trend. */
export type SellerEngagementQuery = {
  currentFrom: string;
  currentTo: string;
  previousFrom: string;
  previousTo: string;
  shopId: string;
  timeZone: string;
  interval: 'hour' | 'day';
};

export type EngagementPartition = { dt: string; hour: string };

const HOUR_MS = 60 * 60 * 1000;
const MAX_PARTITIONS = 24 * 62 + 2;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function asUtcDate(value: string, field: string): Date {
  const date = new Date(value);
  if (!ISO_UTC.test(value) || Number.isNaN(date.getTime())) throw new Error(`Invalid ${field}`);
  return date;
}

/** Return every raw partition touched by the half-open UTC range. */
export function utcPartitions(fromValue: string, toValue: string): EngagementPartition[] {
  const from = asUtcDate(fromValue, 'from');
  const to = asUtcDate(toValue, 'to');
  if (to <= from) throw new Error('The engagement range must end after it starts.');
  const first = new Date(from);
  first.setUTCMinutes(0, 0, 0);
  const partitions: EngagementPartition[] = [];
  for (let cursor = first; cursor < to; cursor = new Date(cursor.getTime() + HOUR_MS)) {
    partitions.push({ dt: cursor.toISOString().slice(0, 10), hour: cursor.toISOString().slice(11, 13) });
    if (partitions.length > MAX_PARTITIONS) throw new Error('The engagement range is too large.');
  }
  return partitions;
}

export function buildEngagementPartitionPredicate(query: SellerEngagementQuery): string {
  const from = new Date(Math.min(asUtcDate(query.currentFrom, 'currentFrom').getTime(), asUtcDate(query.previousFrom, 'previousFrom').getTime())).toISOString();
  const to = new Date(Math.max(asUtcDate(query.currentTo, 'currentTo').getTime(), asUtcDate(query.previousTo, 'previousTo').getTime())).toISOString();
  const partitions = utcPartitions(from, to);
  const values = partitions.map((partition) => `(dt = ${sqlString(partition.dt)} AND hour = ${sqlString(partition.hour)})`);
  return `(schema_version = ${sqlString(String(RAW_CLICKSTREAM_SCHEMA_VERSION))} AND (${values.join(' OR ')}))`;
}

/**
 * Build the single partition-bounded Athena aggregation used by the overview.
 * Result rows are tagged summary/trend/product so the adapter can map
 * them without relying on result ordering.
 */
export function buildEngagementQuery(query: SellerEngagementQuery, database: string, table: string): string {
  const currentFrom = asUtcDate(query.currentFrom, 'currentFrom').toISOString();
  const currentTo = asUtcDate(query.currentTo, 'currentTo').toISOString();
  const previousFrom = asUtcDate(query.previousFrom, 'previousFrom').toISOString();
  const previousTo = asUtcDate(query.previousTo, 'previousTo').toISOString();
  if (new Date(currentTo) <= new Date(currentFrom) || new Date(previousTo) <= new Date(previousFrom)) throw new Error('Invalid engagement range.');
  const bucket = query.interval === 'hour'
    ? `date_trunc('hour', from_iso8601_timestamp(occurredAt) AT TIME ZONE ${sqlString(query.timeZone)}) AT TIME ZONE 'UTC'`
    : `date_trunc('day', from_iso8601_timestamp(occurredAt) AT TIME ZONE ${sqlString(query.timeZone)}) AT TIME ZONE 'UTC'`;
  const partitionPredicate = buildEngagementPartitionPredicate(query);
  const eventTypes = "'product_impression', 'recommendation_impression', 'product_clicked', 'recommendation_clicked', 'product_viewed', 'cart_changed'";
  const uniqueVisitor = "COALESCE(NULLIF(buyerPseudonym, ''), NULLIF(sessionPseudonym, ''))";
  const addToCart = "eventType = 'cart_changed' AND properties.action = 'add'";
  const metrics = `
    SUM(CASE WHEN eventType IN ('product_impression', 'recommendation_impression') THEN 1 ELSE 0 END) AS impressions,
    SUM(CASE WHEN eventType = 'product_viewed' THEN 1 ELSE 0 END) AS productViews,
    COUNT(DISTINCT CASE WHEN eventType = 'product_viewed' THEN ${uniqueVisitor} END) AS uniqueVisitors,
    SUM(CASE WHEN eventType IN ('product_clicked', 'recommendation_clicked') THEN 1 ELSE 0 END) AS clicks,
    SUM(CASE WHEN ${addToCart} THEN 1 ELSE 0 END) AS addToCart`;
  return `WITH filtered AS (
  SELECT *, CASE WHEN occurredAt >= ${sqlString(currentFrom)} AND occurredAt < ${sqlString(currentTo)} THEN 'current' ELSE 'previous' END AS period,
    ${bucket} AS bucketStart
  FROM ${database}.${table}
  WHERE ${partitionPredicate}
    AND occurredAt >= ${sqlString(previousFrom)}
    AND occurredAt < ${sqlString(currentTo)}
    AND shopId = ${sqlString(query.shopId)}
    AND eventType IN (${eventTypes})
), summary AS (
  SELECT 'summary' AS rowType, period, CAST(NULL AS timestamp with time zone) AS bucketStart, CAST(NULL AS varchar) AS productId, ${metrics}
  FROM filtered GROUP BY period
), trend AS (
  SELECT 'trend' AS rowType, period, bucketStart, CAST(NULL AS varchar) AS productId, ${metrics}
  FROM filtered GROUP BY period, bucketStart
), product AS (
  SELECT 'product' AS rowType, period, CAST(NULL AS timestamp with time zone) AS bucketStart, productId, ${metrics}
  FROM filtered WHERE productId IS NOT NULL GROUP BY period, productId
)
SELECT * FROM summary
UNION ALL SELECT * FROM trend
UNION ALL SELECT * FROM product
ORDER BY rowType, period, bucketStart, productId`;
}

// Names kept as small aliases for callers that use the domain term rather
// than the storage-specific "engagement" term.
export const buildSellerEngagementQuery = buildEngagementQuery;
export const buildPartitionPredicate = buildEngagementPartitionPredicate;
