import { createHash } from 'node:crypto';

import type { NotificationCategory } from '@shopee-clone/contracts';

export interface NotificationCursorPosition {
  activityAt: Date;
  id: string;
}

function fingerprint(category: NotificationCategory | 'ALL'): string {
  return createHash('sha256').update(JSON.stringify({ category })).digest('base64url');
}

export function encodeNotificationCursor(
  category: NotificationCategory | 'ALL',
  position: NotificationCursorPosition,
): string {
  return Buffer.from(
    JSON.stringify({
      f: fingerprint(category),
      c: position.activityAt.toISOString(),
      i: position.id,
    }),
  ).toString('base64url');
}

export function decodeNotificationCursor(
  cursor: string,
  category: NotificationCategory | 'ALL',
): NotificationCursorPosition | null {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      payload.f !== fingerprint(category) ||
      typeof payload.c !== 'string' ||
      typeof payload.i !== 'string'
    ) {
      return null;
    }
    const activityAt = new Date(payload.c);
    if (Number.isNaN(activityAt.getTime()) || activityAt.toISOString() !== payload.c) return null;
    return { activityAt, id: payload.i };
  } catch {
    return null;
  }
}
