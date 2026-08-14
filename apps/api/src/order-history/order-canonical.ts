import { createHash, timingSafeEqual } from 'node:crypto';

import {
  ORDER_LIST_FILTERS,
  type BuyerOrderListFilter,
  type CancelOrderRequest,
} from '@shopee-clone/contracts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const filters = new Set<string>(ORDER_LIST_FILTERS);

interface OrderCursorPayload {
  version: 1;
  filter: BuyerOrderListFilter;
  createdAt: string;
  id: string;
}

export interface OrderCursorPosition {
  createdAt: Date;
  id: string;
}

export function encodeOrderCursor(
  filter: BuyerOrderListFilter,
  position: OrderCursorPosition,
): string {
  const payload: OrderCursorPayload = {
    version: 1,
    filter,
    createdAt: position.createdAt.toISOString(),
    id: position.id,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeOrderCursor(
  encoded: string,
  expectedFilter: BuyerOrderListFilter,
): OrderCursorPosition | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(',') !== 'createdAt,filter,id,version' ||
      record.version !== 1 ||
      typeof record.filter !== 'string' ||
      !filters.has(record.filter) ||
      record.filter !== expectedFilter ||
      typeof record.createdAt !== 'string' ||
      typeof record.id !== 'string' ||
      !uuid.test(record.id)
    )
      return null;
    const timestamp = Date.parse(record.createdAt);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== record.createdAt)
      return null;
    return { createdAt: new Date(timestamp), id: record.id };
  } catch {
    return null;
  }
}

export function cancellationRequestDigest(
  userId: string,
  orderReference: string,
  expectedVersion: number,
  input: CancelOrderRequest,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 'order-cancellation-v1',
        userId,
        orderReference,
        expectedVersion,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote ?? null,
      }),
    )
    .digest('hex');
}

export function orderDigestsEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
