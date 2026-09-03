export const PRODUCT_RETENTION_DAYS = 7;
// Nest cron uses seconds-first syntax: 04:00:00 every day in the configured zone.
export const PRODUCT_RETENTION_CRON = '0 0 4 * * *';
export const PRODUCT_RETENTION_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const PRODUCT_RETENTION_BATCH_SIZE = 100;

export function isProductRetentionCleanupEnabled(): boolean {
  return process.env.PRODUCT_RETENTION_CLEANUP_ENABLED !== 'false';
}
