export type SellerAnalyticsChange = number | 'new';

/** Server-owned ratio helper: no NaN/Infinity reaches the API contract. */
export function safeAnalyticsRate(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0 || numerator < 0) return 0;
  return numerator / denominator;
}

/** Relative percent change with an explicit new-activity state for zero baseline. */
export function relativeAnalyticsChange(current: number, previous: number): SellerAnalyticsChange {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current < 0 || previous < 0) return 0;
  if (previous === 0) return current === 0 ? 0 : 'new';
  return ((current - previous) / previous) * 100;
}

export const calculateAnalyticsRate = safeAnalyticsRate;
export const calculateRelativeChange = relativeAnalyticsChange;
