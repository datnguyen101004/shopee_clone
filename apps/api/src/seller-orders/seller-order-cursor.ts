import type { SellerOrderQueueQuery } from '@shopee-clone/contracts';

export interface SellerOrderCursorPosition {
  createdAt: Date;
  id: string;
}

type CursorPayload = {
  v: 1;
  status: SellerOrderQueueQuery['status'];
  fulfillment: SellerOrderQueueQuery['fulfillment'];
  from: string | null;
  to: string | null;
  orderReference: string | null;
  createdAt: string;
  id: string;
};

function digest(query: SellerOrderQueueQuery): string {
  return [
    query.status,
    query.fulfillment,
    query.from ?? '',
    query.to ?? '',
    query.orderReference ?? '',
  ].join('|');
}

export function encodeSellerOrderCursor(
  query: SellerOrderQueueQuery,
  position: SellerOrderCursorPosition,
): string {
  const payload: CursorPayload = {
    v: 1,
    status: query.status,
    fulfillment: query.fulfillment,
    from: query.from,
    to: query.to,
    orderReference: query.orderReference,
    createdAt: position.createdAt.toISOString(),
    id: position.id,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeSellerOrderCursor(
  value: string,
  query: SellerOrderQueueQuery,
): SellerOrderCursorPosition | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<CursorPayload>;
    if (
      decoded.v !== 1 ||
      decoded.status !== query.status ||
      decoded.fulfillment !== query.fulfillment ||
      decoded.from !== query.from ||
      decoded.to !== query.to ||
      decoded.orderReference !== query.orderReference ||
      !decoded.id ||
      !decoded.createdAt ||
      digest(query) !==
        [
          decoded.status,
          decoded.fulfillment,
          decoded.from ?? '',
          decoded.to ?? '',
          decoded.orderReference ?? '',
        ].join('|')
    )
      return null;
    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(decoded.id)) return null;
    return { createdAt, id: decoded.id };
  } catch {
    return null;
  }
}
