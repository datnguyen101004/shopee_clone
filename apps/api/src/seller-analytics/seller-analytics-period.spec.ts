import { inclusiveRangeDays, resolveSellerAnalyticsPeriod, shopLocalMidnight } from './seller-analytics-period';

const now = new Date('2026-09-12T08:00:00.000Z');

describe('seller analytics period resolution', () => {
  it.each([
    ['today', '2026-09-11T17:00:00.000Z', '2026-09-12T08:00:00.000Z', '2026-09-10T17:00:00.000Z', '2026-09-11T08:00:00.000Z'],
    ['yesterday', '2026-09-10T17:00:00.000Z', '2026-09-11T17:00:00.000Z', '2026-09-09T17:00:00.000Z', '2026-09-10T17:00:00.000Z'],
  ] as const)('%s compares the expected local windows', (preset, from, to, previousFrom, previousTo) => {
    const resolved = resolveSellerAnalyticsPeriod({ preset: preset as 'today' | 'yesterday', page: 1, pageSize: 10 }, 'Asia/Ho_Chi_Minh', now);
    expect(resolved.from.toISOString()).toBe(from);
    expect(resolved.to.toISOString()).toBe(to);
    expect(resolved.previousFrom.toISOString()).toBe(previousFrom);
    expect(resolved.previousTo.toISOString()).toBe(previousTo);
  });

  it('uses equal elapsed durations for custom and 7-day windows', () => {
    const custom = resolveSellerAnalyticsPeriod({ from: '2026-09-05', to: '2026-09-10', page: 1, pageSize: 10 }, 'Asia/Ho_Chi_Minh', now);
    expect(custom.to.getTime() - custom.from.getTime()).toBe(custom.previousTo.getTime() - custom.previousFrom.getTime());
    const seven = resolveSellerAnalyticsPeriod({ preset: 'last_7_days', page: 1, pageSize: 10 }, 'Asia/Ho_Chi_Minh', now);
    expect(seven.fromDate).toBe('2026-09-06');
    expect(seven.toDate).toBe('2026-09-12');
    expect(seven.to.toISOString()).toBe('2026-09-12T08:00:00.000Z');
    expect(seven.to.getTime() - seven.from.getTime()).toBe(seven.previousTo.getTime() - seven.previousFrom.getTime());
    const pastCustom = resolveSellerAnalyticsPeriod({ from: '2026-09-05', to: '2026-09-10', page: 1, pageSize: 10 }, 'Asia/Ho_Chi_Minh', now);
    expect(pastCustom.to.toISOString()).toBe('2026-09-10T17:00:00.000Z');
  });

  it('rejects invalid and future-only custom ranges and caps the range at 31 days', () => {
    expect(() => resolveSellerAnalyticsPeriod({ from: '2026-09-13', to: '2026-09-13', page: 1, pageSize: 10 }, 'Asia/Ho_Chi_Minh', now)).toThrow();
    expect(() => resolveSellerAnalyticsPeriod({ from: '2026-08-01', to: '2026-09-12', page: 1, pageSize: 10 }, 'Asia/Ho_Chi_Minh', now)).toThrow();
    expect(inclusiveRangeDays('2026-09-01', '2026-09-12')).toBe(12);
    expect(inclusiveRangeDays('2026-09-12', '2026-09-01')).toBe(0);
  });

  it('resolves DST-aware boundaries without assuming 24-hour days', () => {
    expect(shopLocalMidnight('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    const range = resolveSellerAnalyticsPeriod({ from: '2026-03-08', to: '2026-03-08', page: 1, pageSize: 10 }, 'America/New_York', new Date('2026-03-10T17:00:00.000Z'));
    expect(range.to.getTime() - range.from.getTime()).toBe(23 * 60 * 60 * 1000);
  });
});
