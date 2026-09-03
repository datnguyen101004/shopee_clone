export type ProductRetentionCleanupStatus = {
  enabled: boolean;
  running: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  deletedCount: number;
  retainedCount: number;
  failedCount: number;
  remainingCount: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanonicalDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isProductRetentionCleanupStatus(value: unknown): value is ProductRetentionCleanupStatus {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = ['deletedCount', 'enabled', 'failedCount', 'lastAttemptAt', 'lastSuccessAt', 'remainingCount', 'retainedCount', 'running'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  return typeof value.enabled === 'boolean' &&
    typeof value.running === 'boolean' &&
    (value.lastAttemptAt === null || isCanonicalDate(value.lastAttemptAt)) &&
    (value.lastSuccessAt === null || isCanonicalDate(value.lastSuccessAt)) &&
    nonNegativeInteger(value.deletedCount) &&
    nonNegativeInteger(value.retainedCount) &&
    nonNegativeInteger(value.failedCount) &&
    (value.remainingCount === null || nonNegativeInteger(value.remainingCount));
}
