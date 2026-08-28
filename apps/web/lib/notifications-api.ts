import {
  NOTIFICATION_DEFAULT_LIMIT,
  NOTIFICATION_MAX_LIMIT,
  NOTIFICATION_POPOVER_LIMIT,
  isNotificationCategory,
  isUpdateNotificationPreferenceRequest,
  parseArchiveNotificationResponse,
  parseMarkAllNotificationsReadResponse,
  parseMarkNotificationReadResponse,
  parseNotificationId,
  parseNotificationListResponse,
  parseNotificationPreferencesResponse,
  parseNotificationProblemDetails,
  parseNotificationUnreadCountResponse,
  type ArchiveNotificationResponse,
  type MarkAllNotificationsReadResponse,
  type MarkNotificationReadResponse,
  type NotificationCategory,
  type NotificationItem,
  type NotificationListResponse,
  type NotificationPreferencesResponse,
  type NotificationProblemDetails,
  type NotificationUnreadCountResponse,
  type UpdateNotificationPreferenceRequest,
} from '@shopee-clone/contracts';

import type { AuthenticatedFetch } from './account-api';

const fallbackBaseUrl = 'http://localhost:3001';

export class NotificationsApiError extends Error {
  constructor(
    readonly kind: 'input' | 'transport' | 'status' | 'contract',
    readonly status = 0,
    readonly problem: NotificationProblemDetails | null = null,
  ) {
    super(`Notifications API ${kind} error`);
    this.name = 'NotificationsApiError';
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function request(
  path: string,
  init: RequestInit,
  authenticatedFetch: AuthenticatedFetch,
): Promise<Response> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json, application/problem+json');
    if (init.body) headers.set('Content-Type', 'application/json');
    response = await authenticatedFetch(endpoint(path), {
      ...init,
      headers,
      cache: 'no-store',
    });
  } catch {
    throw new NotificationsApiError('transport');
  }
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Status remains useful when a dependency returns a malformed error body.
    }
    throw new NotificationsApiError(
      'status',
      response.status,
      parseNotificationProblemDetails(body),
    );
  }
  return response;
}

async function parsed<T>(response: Response, parser: (value: unknown) => T | null): Promise<T> {
  const value = parser(await response.json());
  if (!value) throw new NotificationsApiError('contract', response.status);
  return value;
}

export type NotificationListParams = {
  category?: NotificationCategory | 'ALL';
  limit?: number;
  cursor?: string | null;
};

function listQuery({
  category = 'ALL',
  limit = NOTIFICATION_DEFAULT_LIMIT,
  cursor = null,
}: NotificationListParams = {}): string {
  if (category !== 'ALL' && !isNotificationCategory(category)) {
    throw new NotificationsApiError('input');
  }
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > NOTIFICATION_MAX_LIMIT
  ) {
    throw new NotificationsApiError('input');
  }
  const params = new URLSearchParams();
  if (category !== 'ALL') params.set('category', category);
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export async function listNotifications(
  params: NotificationListParams,
  authenticatedFetch: AuthenticatedFetch,
): Promise<NotificationListResponse> {
  const query = listQuery(params);
  return parsed(
    await request(`/api/v1/account/notifications?${query}`, { method: 'GET' }, authenticatedFetch),
    parseNotificationListResponse,
  );
}

export async function listNotificationPopover(
  authenticatedFetch: AuthenticatedFetch,
): Promise<NotificationListResponse> {
  return listNotifications(
    { category: 'ALL', limit: NOTIFICATION_POPOVER_LIMIT },
    authenticatedFetch,
  );
}

export async function getNotificationUnreadCount(
  authenticatedFetch: AuthenticatedFetch,
): Promise<NotificationUnreadCountResponse> {
  return parsed(
    await request(
      '/api/v1/account/notifications/unread-count',
      { method: 'GET' },
      authenticatedFetch,
    ),
    parseNotificationUnreadCountResponse,
  );
}

export async function markNotificationRead(
  notificationId: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<MarkNotificationReadResponse> {
  const id = parseNotificationId(notificationId);
  if (!id) throw new NotificationsApiError('input');
  return parsed(
    await request(
      `/api/v1/account/notifications/${encodeURIComponent(id)}/read`,
      { method: 'POST' },
      authenticatedFetch,
    ),
    parseMarkNotificationReadResponse,
  );
}

export function isNotificationAtOrBefore(
  candidate: NotificationItem,
  selected: NotificationItem,
): boolean {
  const candidateActivity = Date.parse(candidate.activityAt ?? candidate.createdAt);
  const selectedActivity = Date.parse(selected.activityAt ?? selected.createdAt);
  if (candidateActivity !== selectedActivity) return candidateActivity < selectedActivity;
  return candidate.id.localeCompare(selected.id) <= 0;
}

export async function markAllNotificationsRead(
  authenticatedFetch: AuthenticatedFetch,
): Promise<MarkAllNotificationsReadResponse> {
  return parsed(
    await request(
      '/api/v1/account/notifications/read-all',
      { method: 'POST' },
      authenticatedFetch,
    ),
    parseMarkAllNotificationsReadResponse,
  );
}

export async function archiveNotification(
  notificationId: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<ArchiveNotificationResponse> {
  const id = parseNotificationId(notificationId);
  if (!id) throw new NotificationsApiError('input');
  return parsed(
    await request(
      `/api/v1/account/notifications/${encodeURIComponent(id)}/archive`,
      { method: 'POST' },
      authenticatedFetch,
    ),
    parseArchiveNotificationResponse,
  );
}

export async function getNotificationPreferences(
  authenticatedFetch: AuthenticatedFetch,
): Promise<NotificationPreferencesResponse> {
  return parsed(
    await request(
      '/api/v1/account/notifications/preferences',
      { method: 'GET' },
      authenticatedFetch,
    ),
    parseNotificationPreferencesResponse,
  );
}

export async function updateNotificationPreference(
  input: UpdateNotificationPreferenceRequest,
  authenticatedFetch: AuthenticatedFetch,
): Promise<NotificationPreferencesResponse> {
  if (!isUpdateNotificationPreferenceRequest(input)) {
    throw new NotificationsApiError('input');
  }
  return parsed(
    await request(
      '/api/v1/account/notifications/preferences',
      { method: 'PUT', body: JSON.stringify(input) },
      authenticatedFetch,
    ),
    parseNotificationPreferencesResponse,
  );
}
