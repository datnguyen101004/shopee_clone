/**
 * Framework-neutral contracts for the multi-channel notification inbox,
 * preferences, and delivery engine. No transport or persistence dependencies.
 */

export const NOTIFICATION_VERSION = 'notifications-v1' as const;
export const NOTIFICATION_DEFAULT_LIMIT = 20;
export const NOTIFICATION_MAX_LIMIT = 50;
export const NOTIFICATION_POPOVER_LIMIT = 5;
export const NOTIFICATION_TITLE_MAX_LENGTH = 160;
export const NOTIFICATION_BODY_MAX_LENGTH = 500;
export const NOTIFICATION_DEDUPE_KEY_MAX_LENGTH = 240;
export const NOTIFICATION_TARGET_URL_MAX_LENGTH = 500;
export const NOTIFICATION_THUMBNAIL_URL_MAX_LENGTH = 500;

export const NOTIFICATION_CATEGORIES = [
  'ORDERS',
  'PROMOTIONS',
  'ACCOUNT',
  'SYSTEM',
  'CHAT',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  'ORDER_CONFIRMED',
  'ORDER_SHIPPING',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'RETURN_REQUESTED',
  'RETURN_ACCEPTED',
  'DISPUTE_ESCALATED',
  'REFUNDED',
  'PRODUCT_APPROVED',
  'PRODUCT_REJECTED',
  'VOUCHER_ASSIGNED',
  'CHAT_MESSAGE',
  'SYSTEM_NOTICE',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_DELIVERY_STATUSES = [
  'PENDING',
  'DELIVERED',
  'FAILED',
] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

/** Types that must always deliver regardless of user preference opt-outs. */
export const MANDATORY_NOTIFICATION_TYPES = [
  'ORDER_CONFIRMED',
  'ORDER_CANCELLED',
  'DISPUTE_ESCALATED',
  'REFUNDED',
] as const;
export type MandatoryNotificationType = (typeof MANDATORY_NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CATEGORY_BY_TYPE: Record<NotificationType, NotificationCategory> = {
  ORDER_CONFIRMED: 'ORDERS',
  ORDER_SHIPPING: 'ORDERS',
  ORDER_DELIVERED: 'ORDERS',
  ORDER_CANCELLED: 'ORDERS',
  RETURN_REQUESTED: 'ORDERS',
  RETURN_ACCEPTED: 'ORDERS',
  DISPUTE_ESCALATED: 'ORDERS',
  REFUNDED: 'ORDERS',
  PRODUCT_APPROVED: 'SYSTEM',
  PRODUCT_REJECTED: 'SYSTEM',
  VOUCHER_ASSIGNED: 'PROMOTIONS',
  CHAT_MESSAGE: 'CHAT',
  SYSTEM_NOTICE: 'SYSTEM',
};

export interface NotificationMetadata {
  targetUrl: string;
  thumbnailUrl: string | null;
  referenceId: string | null;
  amountMinor: number | null;
  currency: string | null;
  chat?: {
    conversationId: string;
    unreadCount: number;
    newestSequence: number;
    preview: string;
    avatarUrl: string | null;
    activityAt: string;
  };
}

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  body: string;
  metadata: NotificationMetadata;
  isRead: boolean;
  readAt: string | null;
  isArchived: boolean;
  createdAt: string;
  activityAt?: string;
}

export interface NotificationListQuery {
  category: NotificationCategory | 'ALL';
  limit: number;
  cursor: string | null;
}

export interface NotificationListResponse {
  notificationVersion: typeof NOTIFICATION_VERSION;
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface NotificationUnreadCountResponse {
  unreadCount: number;
}

export interface MarkNotificationReadResponse {
  id: string;
  isRead: true;
  readAt: string;
}

export interface MarkAllNotificationsReadResponse {
  updatedCount: number;
  readAt: string;
}

export interface ArchiveNotificationResponse {
  id: string;
  isArchived: true;
}

export interface NotificationChannelPreference {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
  mandatory: boolean;
}

export interface NotificationPreferencesResponse {
  notificationVersion: typeof NOTIFICATION_VERSION;
  preferences: NotificationChannelPreference[];
}

export interface UpdateNotificationPreferenceRequest {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface NotificationProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
}

const canonicalUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const problemType =
  /^https:\/\/shopee-clone\.local\/problems\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const problemStatuses = new Set([400, 401, 403, 404, 409, 503]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasExactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isCanonicalDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return (
    typeof value === 'string' &&
    (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return (
    typeof value === 'string' && (NOTIFICATION_CHANNELS as readonly string[]).includes(value)
  );
}

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function isMandatoryNotificationType(value: unknown): value is MandatoryNotificationType {
  return (
    typeof value === 'string' &&
    (MANDATORY_NOTIFICATION_TYPES as readonly string[]).includes(value)
  );
}

export function isNotificationMetadata(value: unknown): value is NotificationMetadata {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ['targetUrl', 'thumbnailUrl', 'referenceId', 'amountMinor', 'currency'],
      ['chat'],
    )
  ) {
    return false;
  }
  const chat = value.chat;
  const chatValid =
    chat === undefined ||
    (isRecord(chat) &&
      hasExactKeys(chat, [
        'conversationId',
        'unreadCount',
        'newestSequence',
        'preview',
        'avatarUrl',
        'activityAt',
      ]) &&
      canonicalUuid.test(String(chat.conversationId)) &&
      isNonNegativeInteger(chat.unreadCount) &&
      isNonNegativeInteger(chat.newestSequence) &&
      typeof chat.preview === 'string' &&
      chat.preview.length <= NOTIFICATION_BODY_MAX_LENGTH &&
      (chat.avatarUrl === null || typeof chat.avatarUrl === 'string') &&
      isCanonicalDateTime(chat.activityAt));
  return (
    isBoundedString(value.targetUrl, NOTIFICATION_TARGET_URL_MAX_LENGTH) &&
    (value.thumbnailUrl === null ||
      isBoundedString(value.thumbnailUrl, NOTIFICATION_THUMBNAIL_URL_MAX_LENGTH)) &&
    (value.referenceId === null ||
      (typeof value.referenceId === 'string' && value.referenceId.length <= 120)) &&
    (value.amountMinor === null || isNonNegativeInteger(value.amountMinor)) &&
    (value.currency === null ||
      (typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency))) &&
    chatValid
  );
}

export function isNotificationItem(value: unknown): value is NotificationItem {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'category',
      'type',
      'title',
      'body',
      'metadata',
      'isRead',
      'readAt',
      'isArchived',
      'createdAt',
    ], ['activityAt'])
  ) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    canonicalUuid.test(value.id) &&
    isNotificationCategory(value.category) &&
    isNotificationType(value.type) &&
    isBoundedString(value.title, NOTIFICATION_TITLE_MAX_LENGTH) &&
    isBoundedString(value.body, NOTIFICATION_BODY_MAX_LENGTH) &&
    isNotificationMetadata(value.metadata) &&
    typeof value.isRead === 'boolean' &&
    (value.readAt === null || isCanonicalDateTime(value.readAt)) &&
    typeof value.isArchived === 'boolean' &&
    isCanonicalDateTime(value.createdAt) &&
    (value.activityAt === undefined || isCanonicalDateTime(value.activityAt)) &&
    (!value.isRead ? value.readAt === null : value.readAt !== null)
  );
}

export function isNotificationListResponse(value: unknown): value is NotificationListResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'notificationVersion',
      'items',
      'nextCursor',
      'unreadCount',
    ])
  ) {
    return false;
  }
  return (
    value.notificationVersion === NOTIFICATION_VERSION &&
    Array.isArray(value.items) &&
    value.items.every(isNotificationItem) &&
    (value.nextCursor === null || typeof value.nextCursor === 'string') &&
    isNonNegativeInteger(value.unreadCount)
  );
}

export function isNotificationUnreadCountResponse(
  value: unknown,
): value is NotificationUnreadCountResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['unreadCount']) &&
    isNonNegativeInteger(value.unreadCount)
  );
}

export function isMarkNotificationReadResponse(
  value: unknown,
): value is MarkNotificationReadResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'isRead', 'readAt']) &&
    typeof value.id === 'string' &&
    canonicalUuid.test(value.id) &&
    value.isRead === true &&
    isCanonicalDateTime(value.readAt)
  );
}

export function isMarkAllNotificationsReadResponse(
  value: unknown,
): value is MarkAllNotificationsReadResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['updatedCount', 'readAt']) &&
    isNonNegativeInteger(value.updatedCount) &&
    isCanonicalDateTime(value.readAt)
  );
}

export function isArchiveNotificationResponse(
  value: unknown,
): value is ArchiveNotificationResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'isArchived']) &&
    typeof value.id === 'string' &&
    canonicalUuid.test(value.id) &&
    value.isArchived === true
  );
}

export function isNotificationChannelPreference(
  value: unknown,
): value is NotificationChannelPreference {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['category', 'channel', 'enabled', 'mandatory']) &&
    isNotificationCategory(value.category) &&
    isNotificationChannel(value.channel) &&
    typeof value.enabled === 'boolean' &&
    typeof value.mandatory === 'boolean'
  );
}

export function isNotificationPreferencesResponse(
  value: unknown,
): value is NotificationPreferencesResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['notificationVersion', 'preferences']) &&
    value.notificationVersion === NOTIFICATION_VERSION &&
    Array.isArray(value.preferences) &&
    value.preferences.every(isNotificationChannelPreference)
  );
}

export function isUpdateNotificationPreferenceRequest(
  value: unknown,
): value is UpdateNotificationPreferenceRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['category', 'channel', 'enabled']) &&
    isNotificationCategory(value.category) &&
    isNotificationChannel(value.channel) &&
    typeof value.enabled === 'boolean'
  );
}

export function isNotificationProblemDetails(
  value: unknown,
): value is NotificationProblemDetails {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['type', 'title', 'status', 'detail'], ['invalidParameters'])
  ) {
    return false;
  }
  return (
    typeof value.type === 'string' &&
    problemType.test(value.type) &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    typeof value.status === 'number' &&
    problemStatuses.has(value.status) &&
    typeof value.detail === 'string' &&
    value.detail.length > 0 &&
    (value.invalidParameters === undefined ||
      (Array.isArray(value.invalidParameters) &&
        value.invalidParameters.every((item) => typeof item === 'string')))
  );
}

export function parseNotificationProblemDetails(
  value: unknown,
): NotificationProblemDetails | null {
  return isNotificationProblemDetails(value) ? value : null;
}

export function parseNotificationListResponse(value: unknown): NotificationListResponse | null {
  return isNotificationListResponse(value) ? value : null;
}

export function parseNotificationUnreadCountResponse(
  value: unknown,
): NotificationUnreadCountResponse | null {
  return isNotificationUnreadCountResponse(value) ? value : null;
}

export function parseMarkNotificationReadResponse(
  value: unknown,
): MarkNotificationReadResponse | null {
  return isMarkNotificationReadResponse(value) ? value : null;
}

export function parseMarkAllNotificationsReadResponse(
  value: unknown,
): MarkAllNotificationsReadResponse | null {
  return isMarkAllNotificationsReadResponse(value) ? value : null;
}

export function parseArchiveNotificationResponse(
  value: unknown,
): ArchiveNotificationResponse | null {
  return isArchiveNotificationResponse(value) ? value : null;
}

export function parseNotificationPreferencesResponse(
  value: unknown,
): NotificationPreferencesResponse | null {
  return isNotificationPreferencesResponse(value) ? value : null;
}

export function parseUpdateNotificationPreferenceRequest(
  value: unknown,
): UpdateNotificationPreferenceRequest | null {
  return isUpdateNotificationPreferenceRequest(value) ? value : null;
}

export function parseNotificationListQuery(
  value: Record<string, unknown>,
): NotificationListQuery | null {
  const keys = Object.keys(value);
  const allowed = new Set(['category', 'limit', 'cursor']);
  if (keys.some((key) => !allowed.has(key))) return null;

  let category: NotificationCategory | 'ALL' = 'ALL';
  if (Object.hasOwn(value, 'category')) {
    if (value.category === 'ALL' || isNotificationCategory(value.category)) {
      category = value.category;
    } else {
      return null;
    }
  }

  let limit = NOTIFICATION_DEFAULT_LIMIT;
  if (Object.hasOwn(value, 'limit')) {
    const raw = value.limit;
    const parsed =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && /^\d+$/.test(raw)
          ? Number(raw)
          : NaN;
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 1 ||
      parsed > NOTIFICATION_MAX_LIMIT
    ) {
      return null;
    }
    limit = parsed;
  }

  let cursor: string | null = null;
  if (Object.hasOwn(value, 'cursor')) {
    if (value.cursor === null || value.cursor === undefined || value.cursor === '') {
      cursor = null;
    } else if (typeof value.cursor === 'string') {
      cursor = value.cursor;
    } else {
      return null;
    }
  }

  return { category, limit, cursor };
}

export function parseNotificationId(value: unknown): string | null {
  return typeof value === 'string' && canonicalUuid.test(value) ? value.toLowerCase() : null;
}
