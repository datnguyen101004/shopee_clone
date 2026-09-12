import type { SellerAnalyticsOverviewQuery, SellerAnalyticsPreset } from '@shopee-clone/contracts';
import { SELLER_ANALYTICS_OVERVIEW_MAX_RANGE_DAYS } from '@shopee-clone/contracts';

const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type SellerAnalyticsResolvedPeriod = {
  preset: SellerAnalyticsPreset | 'custom';
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  fromDate: string;
  toDate: string;
  interval: 'hour' | 'day';
};

function validDate(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function localParts(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  if (![values.year, values.month, values.day].every(Number.isFinite)) throw new Error('Invalid shop timezone');
  return { year: values.year!, month: values.month!, day: values.day! };
}

function dateFromParts(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function shiftDate(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function offsetAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const hour = values.hour === 24 ? 0 : values.hour;
  return Date.UTC(values.year!, values.month! - 1, values.day!, hour, values.minute!, values.second!) - instant.getTime();
}

/** Convert a shop-local date boundary to an exact UTC instant, including DST zones. */
export function shopLocalMidnight(date: string, timeZone: string): Date {
  if (!validDate(date)) throw new Error('Invalid local date');
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); } catch { throw new Error('Invalid shop timezone'); }
  const wallClock = Date.parse(`${date}T00:00:00.000Z`);
  let guess = wallClock;
  for (let attempt = 0; attempt < 4; attempt += 1) guess = wallClock - offsetAt(new Date(guess), timeZone);
  const result = new Date(guess);
  if (Number.isNaN(result.getTime())) throw new Error('Invalid local date');
  return result;
}

/** Resolve current/previous equal-duration windows using one caller-provided now. */
export function resolveSellerAnalyticsPeriod(
  query: SellerAnalyticsOverviewQuery,
  timeZone: string,
  now: Date = new Date(),
): SellerAnalyticsResolvedPeriod {
  if (Number.isNaN(now.getTime())) throw new Error('Invalid now');
  const today = dateFromParts(localParts(now, timeZone));
  const selectedPreset: SellerAnalyticsPreset | 'custom' = query.preset ?? (query.from && query.to ? 'custom' : 'today');
  const preset: SellerAnalyticsPreset | 'custom' = selectedPreset;
  let fromDate: string;
  let toDate: string;
  if (selectedPreset === 'today') {
    fromDate = today;
    toDate = today;
  } else if (selectedPreset === 'yesterday') {
    fromDate = shiftDate(today, -1);
    toDate = fromDate;
  } else if (selectedPreset === 'last_7_days') {
    fromDate = shiftDate(today, -6);
    toDate = today;
  } else if (selectedPreset === 'last_30_days') {
    fromDate = shiftDate(today, -29);
    toDate = today;
  } else {
    if (!query.from || !query.to || !validDate(query.from) || !validDate(query.to) || query.from > query.to) throw new Error('Invalid analytics range');
    fromDate = query.from;
    toDate = query.to;
    const days = Math.floor((Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / DAY_MS) + 1;
    if (days > SELLER_ANALYTICS_OVERVIEW_MAX_RANGE_DAYS || fromDate > today || toDate > today) throw new Error('Invalid analytics range');
  }
  const from = shopLocalMidnight(fromDate, timeZone);
  const next = shopLocalMidnight(shiftDate(toDate, 1), timeZone);
  const endsToday = toDate === today && preset !== 'yesterday';
  const to = endsToday ? now : next;
  const elapsed = Math.max(0, to.getTime() - from.getTime());
  const previousFrom = preset === 'today'
    ? shopLocalMidnight(shiftDate(today, -1), timeZone)
    : preset === 'yesterday'
      ? shopLocalMidnight(shiftDate(fromDate, -1), timeZone)
      : new Date(from.getTime() - elapsed);
  const previousTo = preset === 'today' ? new Date(previousFrom.getTime() + elapsed) : new Date(from);
  if (to <= from || previousTo <= previousFrom) throw new Error('Invalid analytics range');
  return { preset, from, to, previousFrom, previousTo, fromDate, toDate, interval: preset === 'today' || preset === 'yesterday' ? 'hour' : 'day' };
}

export function inclusiveRangeDays(from: string, to: string): number {
  if (!validDate(from) || !validDate(to) || from > to) return 0;
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS) + 1;
}
