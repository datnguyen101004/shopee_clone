import { isProductRetentionCleanupStatus } from '../src';
import { describe, expect, it } from 'vitest';

describe('product retention cleanup status contract', () => {
  it('accepts sanitized aggregate status', () => {
    expect(isProductRetentionCleanupStatus({
      enabled: true,
      running: false,
      lastAttemptAt: '2026-08-18T04:00:00.000Z',
      lastSuccessAt: '2026-08-18T04:00:01.000Z',
      deletedCount: 2,
      retainedCount: 1,
      failedCount: 0,
      remainingCount: 4,
    })).toBe(true);
  });

  it('rejects sensitive or unknown fields', () => {
    expect(isProductRetentionCleanupStatus({
      enabled: true,
      running: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      deletedCount: 0,
      retainedCount: 0,
      failedCount: 0,
      remainingCount: null,
      productIds: ['secret'],
    })).toBe(false);
  });
});
