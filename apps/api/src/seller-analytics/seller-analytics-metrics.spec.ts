import { calculateAnalyticsRate, calculateRelativeChange, relativeAnalyticsChange, safeAnalyticsRate } from './seller-analytics-metrics';

describe('seller analytics metric helpers', () => {
  it('returns zero for zero or invalid denominators', () => {
    expect(safeAnalyticsRate(4, 0)).toBe(0);
    expect(calculateAnalyticsRate(4, -1)).toBe(0);
    expect(safeAnalyticsRate(4, Number.NaN)).toBe(0);
  });

  it('returns percentage changes and an explicit new state', () => {
    expect(relativeAnalyticsChange(120, 100)).toBe(20);
    expect(calculateRelativeChange(0, 0)).toBe(0);
    expect(calculateRelativeChange(1, 0)).toBe('new');
  });
});
