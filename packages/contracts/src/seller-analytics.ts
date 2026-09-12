export const SELLER_ANALYTICS_VERSION = 'seller-analytics-v1' as const;
export const SELLER_ANALYTICS_DEFAULT_LIMIT = 20;
export const SELLER_ANALYTICS_MAX_LIMIT = 100;
export const SELLER_ANALYTICS_MAX_RANGE_DAYS = 366;
export const SELLER_ANALYTICS_TIME_ZONE = 'Asia/Ho_Chi_Minh' as const;
export const SELLER_ANALYTICS_GRANULARITIES = ['DAY', 'WEEK', 'MONTH'] as const;
export type SellerAnalyticsGranularity = (typeof SELLER_ANALYTICS_GRANULARITIES)[number];

export interface SellerAnalyticsQuery {
  from: string;
  to: string;
  granularity: SellerAnalyticsGranularity;
}

export interface SellerAnalyticsRange {
  from: string;
  to: string;
  timeZone: string;
  fromUtc: string;
  toUtcExclusive: string;
}

export interface SellerAnalyticsKpis {
  eligibleOrderCount: number;
  unitsSold: number;
  merchandiseRevenueMinor: number;
}

export interface SellerAnalyticsTimeSeriesPoint {
  bucket: string;
  eligibleOrderCount: number;
  unitsSold: number;
  merchandiseRevenueMinor: number;
}

export interface SellerAnalyticsBestSeller {
  productId: string;
  productName: string;
  productImageUrl: string | null;
  unitsSold: number;
  merchandiseRevenueMinor: number;
  currentProductAvailable: boolean;
}

export interface SellerAnalyticsLowStockItem {
  variantId: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  variantName: string;
  sku: string;
  availableQuantity: number;
  quantityOnHand: number;
  quantityReserved: number;
}

export interface SellerAnalyticsConversion {
  status: 'NOT_AVAILABLE';
  rateBasisPoints: null;
  visits: null;
}

export interface SellerDashboardResponse {
  sellerAnalyticsVersion: typeof SELLER_ANALYTICS_VERSION;
  currency: 'VND';
  range: SellerAnalyticsRange;
  generatedAt: string;
  kpis: SellerAnalyticsKpis;
  timeSeries: SellerAnalyticsTimeSeriesPoint[];
  bestSellers: SellerAnalyticsBestSeller[];
  lowStock: { threshold: number; items: SellerAnalyticsLowStockItem[] };
  conversion: SellerAnalyticsConversion;
}

export interface SellerAnalyticsProductRow {
  productId: string;
  productName: string;
  productImageUrl: string | null;
  unitsSold: number;
  merchandiseRevenueMinor: number;
  currentProductAvailable: boolean;
}

export interface SellerAnalyticsProductPage {
  sellerAnalyticsVersion: typeof SELLER_ANALYTICS_VERSION;
  currency: 'VND';
  range: SellerAnalyticsRange;
  items: SellerAnalyticsProductRow[];
  nextCursor: string | null;
}

export interface SellerAnalyticsProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code?: string;
  invalidParameters?: string[];
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const cursorPattern = /^[A-Za-z0-9_-]{1,512}$/;
const uuidPattern = cursorPattern;
const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, optional: string[]) => Object.keys(value).every((key) => optional.includes(key));
const isDate = (value: unknown): value is string => typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value);
const isCanonicalUuid = (value: unknown): value is string => typeof value === 'string' && canonicalUuidPattern.test(value);
const isSafeNonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function parseSellerAnalyticsQuery(value: unknown): SellerAnalyticsQuery | null {
  if (!record(value) || !exact(value, ['from', 'to', 'granularity'])) return null;
  const from = value.from === undefined ? null : value.from;
  const to = value.to === undefined ? null : value.to;
  const granularity = value.granularity === undefined ? 'DAY' : value.granularity;
  if (!isDate(from) || !isDate(to) || typeof granularity !== 'string' || !SELLER_ANALYTICS_GRANULARITIES.includes(granularity as SellerAnalyticsGranularity)) return null;
  if (from > to) return null;
  const days = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days < 1 || days > SELLER_ANALYTICS_MAX_RANGE_DAYS) return null;
  return { from, to, granularity: granularity as SellerAnalyticsGranularity };
}

export function parseSellerAnalyticsProductQuery(value: unknown): (SellerAnalyticsQuery & { limit: number; cursor: string | null }) | null {
  if (!record(value) || !exact(value, ['from', 'to', 'granularity', 'limit', 'cursor'])) return null;
  const base = parseSellerAnalyticsQuery({ from: value.from, to: value.to, granularity: value.granularity });
  const rawLimit = value.limit === undefined ? String(SELLER_ANALYTICS_DEFAULT_LIMIT) : value.limit;
  const cursor = value.cursor === undefined ? null : value.cursor;
  if (!base || typeof rawLimit !== 'string' || !/^[1-9][0-9]*$/.test(rawLimit) || (cursor !== null && (typeof cursor !== 'string' || !cursorPattern.test(cursor)))) return null;
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit > SELLER_ANALYTICS_MAX_LIMIT) return null;
  return { ...base, limit, cursor: cursor as string | null };
}

function isKpis(value: unknown): value is SellerAnalyticsKpis {
  return record(value) && Object.keys(value).length === 3 && isSafeNonNegative(value.eligibleOrderCount) && isSafeNonNegative(value.unitsSold) && isSafeNonNegative(value.merchandiseRevenueMinor);
}

export function isSellerDashboardResponse(value: unknown): value is SellerDashboardResponse {
  if (!record(value) || !exact(value, ['sellerAnalyticsVersion', 'currency', 'range', 'generatedAt', 'kpis', 'timeSeries', 'bestSellers', 'lowStock', 'conversion'])) return false;
  const range = value.range;
  const lowStock = value.lowStock;
  const conversion = value.conversion;
  return value.sellerAnalyticsVersion === SELLER_ANALYTICS_VERSION && value.currency === 'VND' && record(range) && Object.keys(range).length === 5 && isDate(range.from) && isDate(range.to) && typeof range.timeZone === 'string' && isInstant(range.fromUtc) && isInstant(range.toUtcExclusive) && isInstant(value.generatedAt) && isKpis(value.kpis) && Array.isArray(value.timeSeries) && value.timeSeries.every((item) => record(item) && typeof item.bucket === 'string' && isSafeNonNegative(item.eligibleOrderCount) && isSafeNonNegative(item.unitsSold) && isSafeNonNegative(item.merchandiseRevenueMinor)) && Array.isArray(value.bestSellers) && value.bestSellers.every((item) => record(item) && isUuid(item.productId) && typeof item.productName === 'string' && (item.productImageUrl === null || typeof item.productImageUrl === 'string') && isSafeNonNegative(item.unitsSold) && isSafeNonNegative(item.merchandiseRevenueMinor) && typeof item.currentProductAvailable === 'boolean') && record(lowStock) && Object.keys(lowStock).length === 2 && isSafeNonNegative(lowStock.threshold) && Array.isArray(lowStock.items) && lowStock.items.every((item) => record(item) && isUuid(item.variantId) && isUuid(item.productId) && typeof item.productName === 'string' && (item.productImageUrl === null || typeof item.productImageUrl === 'string') && typeof item.variantName === 'string' && typeof item.sku === 'string' && isSafeNonNegative(item.availableQuantity) && isSafeNonNegative(item.quantityOnHand) && isSafeNonNegative(item.quantityReserved)) && record(conversion) && Object.keys(conversion).length === 3 && conversion.status === 'NOT_AVAILABLE' && conversion.rateBasisPoints === null && conversion.visits === null;
}

export function isSellerAnalyticsProductPage(value: unknown): value is SellerAnalyticsProductPage {
  if (!record(value) || !exact(value, ['sellerAnalyticsVersion', 'currency', 'range', 'items', 'nextCursor'])) return false;
  return value.sellerAnalyticsVersion === SELLER_ANALYTICS_VERSION && value.currency === 'VND' && Array.isArray(value.items) && value.items.every((item) => record(item) && isUuid(item.productId) && typeof item.productName === 'string' && (item.productImageUrl === null || typeof item.productImageUrl === 'string') && isSafeNonNegative(item.unitsSold) && isSafeNonNegative(item.merchandiseRevenueMinor) && typeof item.currentProductAvailable === 'boolean') && (value.nextCursor === null || (typeof value.nextCursor === 'string' && cursorPattern.test(value.nextCursor)));
}

/** Unified seller product-funnel overview contract. Kept framework neutral for API and web. */
export const SELLER_ANALYTICS_OVERVIEW_VERSION = 'seller-analytics-overview-v1' as const;
export const SELLER_ANALYTICS_PRESETS = ['today', 'yesterday', 'last_7_days', 'last_30_days'] as const;
export type SellerAnalyticsPreset = (typeof SELLER_ANALYTICS_PRESETS)[number];
export const SELLER_ANALYTICS_OVERVIEW_MAX_RANGE_DAYS = 31;
export const SELLER_ANALYTICS_PAGE_SIZE = 10;
export const SELLER_ANALYTICS_MAX_PAGE_SIZE = 50;
export type SellerAnalyticsOverviewQuery = {
  preset?: SellerAnalyticsPreset;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};
export type SellerAnalyticsMetricKey =
  | 'impressions'
  | 'productViews'
  | 'uniqueVisitors'
  | 'clicks'
  | 'ctr'
  | 'addToCart'
  | 'orders'
  | 'unitsSold'
  | 'revenue'
  | 'conversionRate';
export type SellerAnalyticsMetric = {
  current: number;
  previous: number;
  change: number | 'new';
};
export type SellerAnalyticsMetrics = Record<SellerAnalyticsMetricKey, SellerAnalyticsMetric>;
export type SellerAnalyticsTrendBucket = {
  bucketStart: string;
  metrics: SellerAnalyticsMetrics;
};
export type SellerAnalyticsProductRowV2 = {
  productId: string;
  productName: string;
  productImageUrl: string | null;
  metrics: SellerAnalyticsMetrics;
};
export type SellerAnalyticsOverviewResponse = {
  sellerAnalyticsVersion: typeof SELLER_ANALYTICS_OVERVIEW_VERSION;
  currency: 'VND';
  generatedAt: string;
  freshness: 'near_real_time';
  range: {
    preset: SellerAnalyticsPreset | 'custom';
    from: string;
    to: string;
    timeZone: string;
    fromUtc: string;
    toUtcExclusive: string;
    previousFromUtc: string;
    previousToUtcExclusive: string;
  };
  summary: SellerAnalyticsMetrics;
  trend: {
    interval: 'hour' | 'day';
    buckets: SellerAnalyticsTrendBucket[];
  };
  products: {
    items: SellerAnalyticsProductRowV2[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

const OVERVIEW_METRIC_KEYS: readonly SellerAnalyticsMetricKey[] = [
  'impressions', 'productViews', 'uniqueVisitors', 'clicks', 'ctr', 'addToCart',
  'orders', 'unitsSold', 'revenue', 'conversionRate',
];
const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isMetric = (value: unknown): value is SellerAnalyticsMetric =>
  record(value) && Object.keys(value).length === 3 && isFiniteNonNegative(value.current) && isFiniteNonNegative(value.previous) &&
  (value.change === 'new' || (typeof value.change === 'number' && Number.isFinite(value.change)));
const isMetrics = (value: unknown): value is SellerAnalyticsMetrics =>
  record(value) && Object.keys(value).length === OVERVIEW_METRIC_KEYS.length && OVERVIEW_METRIC_KEYS.every((key) => isMetric(value[key]));

export function parseSellerAnalyticsOverviewQuery(
  value: Record<string, string | string[] | undefined>,
): SellerAnalyticsOverviewQuery | null {
  if (!Object.keys(value).every((key) => ['preset', 'from', 'to', 'page', 'pageSize'].includes(key))) return null;
  const get = (key: string): string | undefined => typeof value[key] === 'string' ? value[key] as string : undefined;
  const preset = get('preset');
  const from = get('from');
  const to = get('to');
  const rawPage = get('page') ?? '1';
  const rawPageSize = get('pageSize') ?? String(SELLER_ANALYTICS_PAGE_SIZE);
  const page = Number(rawPage);
  const pageSize = Number(rawPageSize);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > SELLER_ANALYTICS_MAX_PAGE_SIZE) return null;
  if (preset !== undefined && !(SELLER_ANALYTICS_PRESETS as readonly string[]).includes(preset)) return null;
  if (preset && (from !== undefined || to !== undefined)) return null;
  if (!preset && ((from === undefined) !== (to === undefined))) return null;
  if (!preset && !from && !to) return { page, pageSize };
  if (!preset && (!isDate(from) || !isDate(to) || from! > to!)) return null;
  if (from && to) {
    const days = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
    if (days > SELLER_ANALYTICS_OVERVIEW_MAX_RANGE_DAYS) return null;
  }
  return { ...(preset ? { preset: preset as SellerAnalyticsPreset } : { from, to }), page, pageSize };
}

export function isSellerAnalyticsOverviewResponse(value: unknown): value is SellerAnalyticsOverviewResponse {
  if (!record(value) || Object.keys(value).length !== 8 || value.sellerAnalyticsVersion !== SELLER_ANALYTICS_OVERVIEW_VERSION || value.currency !== 'VND' || value.freshness !== 'near_real_time' || !isInstant(value.generatedAt)) return false;
  const range = value.range;
  const trend = value.trend;
  const products = value.products;
  if (!record(range) || Object.keys(range).length !== 8 || (!SELLER_ANALYTICS_PRESETS.includes(range.preset as SellerAnalyticsPreset) && range.preset !== 'custom') || !isDate(range.from) || !isDate(range.to) || typeof range.timeZone !== 'string' || !isInstant(range.fromUtc) || !isInstant(range.toUtcExclusive) || !isInstant(range.previousFromUtc) || !isInstant(range.previousToUtcExclusive)) return false;
  if (!isMetrics(value.summary) || !record(trend) || Object.keys(trend).length !== 2 || (trend.interval !== 'hour' && trend.interval !== 'day') || !Array.isArray(trend.buckets) || !trend.buckets.every((bucket) => record(bucket) && Object.keys(bucket).length === 2 && isInstant(bucket.bucketStart) && isMetrics(bucket.metrics))) return false;
  if (!record(products) || Object.keys(products).length !== 5 || !Array.isArray(products.items)) return false;
  const page = products.page;
  const pageSize = products.pageSize;
  const totalPages = products.totalPages;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 || typeof pageSize !== 'number' || !Number.isSafeInteger(pageSize) || pageSize < 1 || !isSafeNonNegative(products.totalItems) || typeof totalPages !== 'number' || !Number.isSafeInteger(totalPages) || totalPages < 0) return false;
  return products.items.every((item) => record(item) && Object.keys(item).length === 4 && isCanonicalUuid(item.productId) && typeof item.productName === 'string' && (item.productImageUrl === null || typeof item.productImageUrl === 'string') && isMetrics(item.metrics));
}
