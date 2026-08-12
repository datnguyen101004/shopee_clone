import { createHash } from 'node:crypto';

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function deterministicUuid(namespace: string): string {
  const bytes = Buffer.from(sha256(namespace).slice(0, 32), 'hex');
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function deterministicInteger(
  namespace: string,
  stableKey: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) {
    throw new Error('Invalid deterministic integer range.');
  }
  const value = Number.parseInt(sha256(`${namespace}:${stableKey}`).slice(0, 8), 16);
  return minimum + (value % (maximum - minimum + 1));
}

export function slugifyVietnamese(value: string): string {
  return value
    .replace(/[Đđ]/g, (character) => (character === 'Đ' ? 'D' : 'd'))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
