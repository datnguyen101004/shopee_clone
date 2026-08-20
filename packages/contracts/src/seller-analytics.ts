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
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, optional: string[]) => Object.keys(value).every((key) => optional.includes(key));
const isDate = (value: unknown): value is string => typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value);
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
