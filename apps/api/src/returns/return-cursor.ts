import { createHash } from 'node:crypto';

import type { ReturnListQuery } from '@shopee-clone/contracts';

export interface ReturnCursorPosition {
  updatedAt: Date;
  id: string;
}

function fingerprint(query: ReturnListQuery): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        status: query.status,
        deadline: query.deadline,
        from: query.from,
        to: query.to,
        reference: query.reference,
      }),
    )
    .digest('base64url');
}

export function encodeReturnCursor(query: ReturnListQuery, position: ReturnCursorPosition): string {
  return Buffer.from(
    JSON.stringify({
      f: fingerprint(query),
      u: position.updatedAt.toISOString(),
      i: position.id,
    }),
  ).toString('base64url');
}

export function decodeReturnCursor(
  cursor: string,
  query: ReturnListQuery,
): ReturnCursorPosition | null {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      payload.f !== fingerprint(query) ||
      typeof payload.u !== 'string' ||
      typeof payload.i !== 'string'
    )
      return null;
    const updatedAt = new Date(payload.u);
    if (Number.isNaN(updatedAt.getTime()) || updatedAt.toISOString() !== payload.u) return null;
    return { updatedAt, id: payload.i };
  } catch {
    return null;
  }
}
