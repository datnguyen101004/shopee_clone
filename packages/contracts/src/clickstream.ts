/** Versioned, framework-neutral clickstream contract. */
export const CLICKSTREAM_SCHEMA_VERSION = 1 as const;

export const CLICKSTREAM_EVENT_TYPES = [
  'search_submitted',
  'product_impression',
  'product_clicked',
  'product_viewed',
  'recommendation_impression',
  'recommendation_clicked',
  'favorite_changed',
  'cart_changed',
  'order_completed',
] as const;
export type ClickstreamEventType = (typeof CLICKSTREAM_EVENT_TYPES)[number];

export const CLICKSTREAM_SURFACES = [
  'search',
  'homepage',
  'product_detail',
  'favorite',
  'cart',
  'checkout',
  'order_history',
] as const;
export type ClickstreamSurface = (typeof CLICKSTREAM_SURFACES)[number];

type RankingContext = {
  projectionVersion?: string;
  profileVersion?: string;
  modelVersion?: string;
  scriptVersion?: string;
};

type BaseEvent = RankingContext & {
  eventId: string;
  schemaVersion: typeof CLICKSTREAM_SCHEMA_VERSION;
  eventType: ClickstreamEventType;
  occurredAt: string;
  surface: ClickstreamSurface;
  sessionId: string;
  productId?: string;
  placement?: string;
  position?: number;
  query?: string;
  requestId?: string;
  recommendationId?: string;
  properties: Record<string, string | number | boolean | null>;
};

export type SearchSubmittedEvent = BaseEvent & {
  eventType: 'search_submitted';
  surface: 'search';
  query: string;
  requestId?: string;
};
export type ProductImpressionEvent = BaseEvent & {
  eventType: 'product_impression';
  productId: string;
  placement: string;
  position: number;
  requestId: string;
};
export type ProductClickedEvent = BaseEvent & {
  eventType: 'product_clicked';
  productId: string;
  placement: string;
  position: number;
  requestId: string;
};
export type ProductViewedEvent = BaseEvent & {
  eventType: 'product_viewed';
  surface: 'product_detail';
  productId: string;
};
export type RecommendationImpressionEvent = BaseEvent & {
  eventType: 'recommendation_impression';
  productId: string;
  placement: string;
  position: number;
  recommendationId: string;
};
export type RecommendationClickedEvent = BaseEvent & {
  eventType: 'recommendation_clicked';
  productId: string;
  placement: string;
  position: number;
  recommendationId: string;
};
export type FavoriteChangedEvent = BaseEvent & {
  eventType: 'favorite_changed';
  productId: string;
  properties: { isFavorite: boolean };
};
export type CartChangedEvent = BaseEvent & {
  eventType: 'cart_changed';
  productId: string;
  properties: {
    action: 'add' | 'update' | 'remove' | 'select';
    quantity?: number;
    selected?: boolean;
  };
};
export type OrderCompletedEvent = BaseEvent & {
  eventType: 'order_completed';
  properties: { orderId: string; itemCount: number };
};

export type ClickstreamEvent =
  | SearchSubmittedEvent
  | ProductImpressionEvent
  | ProductClickedEvent
  | ProductViewedEvent
  | RecommendationImpressionEvent
  | RecommendationClickedEvent
  | FavoriteChangedEvent
  | CartChangedEvent
  | OrderCompletedEvent;

/** The durable export shape sent to the external clickstream boundary. */
export type ClickstreamExportEvent = Omit<ClickstreamEvent, 'sessionId'> & {
  sessionPseudonym: string;
  buyerPseudonym: string | null;
  pseudonymKeyId: string;
  /** Derived from the server-owned Product row; never accepted from the browser. */
  shopId?: string;
};

export type ClickstreamCollectionRequest = Omit<ClickstreamEvent, 'schemaVersion'> & {
  schemaVersion?: typeof CLICKSTREAM_SCHEMA_VERSION;
};

export type ClickstreamAcceptanceDisposition =
  'accepted' | 'idempotent' | 'disabled' | 'sampled_out';
export interface ClickstreamAcceptanceResponse {
  eventId: string;
  disposition: ClickstreamAcceptanceDisposition;
}

export interface ClickstreamBatch {
  contractVersion: '1';
  batchId: string;
  producer: 'shopee-clone-api';
  sentAt: string;
  events: ClickstreamExportEvent[];
}

export interface ClickstreamRejectedEvent {
  eventId: string;
  code: string;
  retryable: boolean;
}
export interface ClickstreamAcknowledgement {
  batchId: string;
  acceptedEventIds: string[];
  rejectedEvents: ClickstreamRejectedEvent[];
}

export type ClickstreamStatus = 'PENDING' | 'LEASED' | 'DELIVERED' | 'TERMINAL' | 'DROPPED';
export interface ClickstreamHealthResponse {
  ready: boolean;
  configured: boolean;
  captureEnabled: boolean;
  dispatchEnabled: boolean;
  statusCounts: Record<ClickstreamStatus, number>;
  oldestEligibleBacklogAgeSeconds: number | null;
  accepted: number;
  delivered: number;
  retried: number;
  rejected: number;
  terminal: number;
  dropped: number;
  deliveryLatencyMs: { count: number; average: number | null; p95: number | null };
  lastPollAt: string | null;
  lastErrorAt: string | null;
}

export interface ClickstreamProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  traceId?: string;
  errors?: Array<{ field: string; message: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_QUERY_LENGTH = 256;
const MAX_STRING_LENGTH = 128;
const EVENT_FIELDS = new Set([
  'eventId',
  'schemaVersion',
  'eventType',
  'occurredAt',
  'surface',
  'sessionId',
  'productId',
  'placement',
  'position',
  'query',
  'requestId',
  'recommendationId',
  'projectionVersion',
  'profileVersion',
  'modelVersion',
  'scriptVersion',
  'properties',
]);
const PROHIBITED_FIELDS = new Set([
  'buyerId',
  'userId',
  'email',
  'address',
  'postalAddress',
  'accessToken',
  'token',
  'password',
  'credential',
  'payment',
  'paymentMethod',
  'cardNumber',
  'profile',
  'modelWeights',
]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const hasOnlyKeys = (value: Record<string, unknown>, allowed: Set<string>): boolean =>
  Object.keys(value).every((key) => allowed.has(key));

function normalizedString(value: unknown, max = MAX_STRING_LENGTH): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value
  );
}

function normalizeProperties(
  value: unknown,
  eventType: ClickstreamEventType,
): Record<string, string | number | boolean | null> | null {
  if (!isRecord(value) || [...PROHIBITED_FIELDS].some((key) => Object.hasOwn(value, key)))
    return null;
  const allowed = new Set<string>(
    eventType === 'favorite_changed'
      ? ['isFavorite']
      : eventType === 'cart_changed'
        ? ['action', 'quantity', 'selected']
        : eventType === 'order_completed'
          ? ['orderId', 'itemCount']
          : [],
  );
  if (!hasOnlyKeys(value, allowed)) return null;
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item !== 'string' &&
      typeof item !== 'number' &&
      typeof item !== 'boolean' &&
      item !== null
    )
      return null;
    result[key] = item;
  }
  if (eventType === 'favorite_changed' && typeof value.isFavorite !== 'boolean') return null;
  if (
    eventType === 'cart_changed' &&
    value.action !== 'add' &&
    value.action !== 'update' &&
    value.action !== 'remove' &&
    value.action !== 'select'
  )
    return null;
  if (
    eventType === 'cart_changed' &&
    value.selected !== undefined &&
    typeof value.selected !== 'boolean'
  )
    return null;
  if (
    eventType === 'cart_changed' &&
    value.quantity !== undefined &&
    (!Number.isInteger(value.quantity) ||
      (value.quantity as number) < 0 ||
      (value.quantity as number) > 999)
  )
    return null;
  if (
    eventType === 'order_completed' &&
    (!isUuid(value.orderId) ||
      !Number.isInteger(value.itemCount) ||
      (value.itemCount as number) < 1 ||
      (value.itemCount as number) > 10_000)
  )
    return null;
  return result;
}

/** Parse and normalize a browser/server event. Returns null for contract violations. */
export function parseClickstreamEvent(value: unknown): ClickstreamEvent | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, EVENT_FIELDS) ||
    [...PROHIBITED_FIELDS].some((key) => Object.hasOwn(value, key))
  )
    return null;
  if (
    value.schemaVersion !== CLICKSTREAM_SCHEMA_VERSION ||
    !isUuid(value.eventId) ||
    !isUuid(value.sessionId) ||
    typeof value.eventType !== 'string' ||
    !(CLICKSTREAM_EVENT_TYPES as readonly string[]).includes(value.eventType) ||
    typeof value.surface !== 'string' ||
    !(CLICKSTREAM_SURFACES as readonly string[]).includes(value.surface) ||
    typeof value.occurredAt !== 'string' ||
    !ISO_UTC.test(value.occurredAt) ||
    Number.isNaN(Date.parse(value.occurredAt)) ||
    !isRecord(value.properties)
  )
    return null;
  const eventType = value.eventType as ClickstreamEventType;
  const surface = value.surface as ClickstreamSurface;
  const compatibleSurface =
    (eventType === 'search_submitted' && surface === 'search') ||
    ((eventType === 'product_impression' || eventType === 'product_clicked') &&
      (surface === 'search' || surface === 'homepage' || surface === 'product_detail')) ||
    (eventType === 'product_viewed' && surface === 'product_detail') ||
    ((eventType === 'recommendation_impression' || eventType === 'recommendation_clicked') &&
      surface === 'homepage') ||
    (eventType === 'favorite_changed' && surface === 'favorite') ||
    (eventType === 'cart_changed' && surface === 'cart') ||
    (eventType === 'order_completed' &&
      (surface === 'checkout' || surface === 'order_history'));
  if (!compatibleSurface) return null;
  if (value.productId !== undefined && !isUuid(value.productId)) return null;
  if (value.placement !== undefined && !normalizedString(value.placement)) return null;
  if (
    value.position !== undefined &&
    (!Number.isInteger(value.position) ||
      (value.position as number) < 0 ||
      (value.position as number) > 10_000)
  )
    return null;
  for (const key of [
    'requestId',
    'recommendationId',
    'projectionVersion',
    'profileVersion',
    'modelVersion',
    'scriptVersion',
  ]) {
    if (value[key] !== undefined && !normalizedString(value[key])) return null;
  }
  if (
    value.query !== undefined &&
    (typeof value.query !== 'string' ||
      value.query.trim().length === 0 ||
      value.query.length > MAX_QUERY_LENGTH)
  )
    return null;
  const properties = normalizeProperties(value.properties, eventType);
  if (!properties) return null;
  if (
    eventType === 'search_submitted' &&
    (surface !== 'search' || typeof value.query !== 'string' || value.query.trim().length === 0)
  )
    return null;
  if (eventType === 'product_impression' || eventType === 'product_clicked') {
    if (
      !isUuid(value.productId) ||
      !normalizedString(value.placement) ||
      !isUuid(value.requestId) ||
      !Number.isInteger(value.position)
    )
      return null;
  }
  if (eventType === 'product_viewed' && !isUuid(value.productId)) return null;
  if (eventType === 'recommendation_impression' || eventType === 'recommendation_clicked') {
    if (
      !isUuid(value.productId) ||
      !normalizedString(value.placement) ||
      !isUuid(value.recommendationId) ||
      !Number.isInteger(value.position)
    )
      return null;
  }
  if (eventType === 'favorite_changed' || eventType === 'cart_changed')
    if (!isUuid(value.productId)) return null;
  if (eventType === 'order_completed' && surface !== 'checkout' && surface !== 'order_history')
    return null;
  return {
    ...value,
    query:
      typeof value.query === 'string'
        ? value.query.normalize('NFKC').trim().slice(0, MAX_QUERY_LENGTH)
        : undefined,
    properties,
  } as ClickstreamEvent;
}

export function parseClickstreamCollectionRequest(
  value: unknown,
): ClickstreamCollectionRequest | null {
  if (!isRecord(value)) return null;
  const withVersion = { schemaVersion: CLICKSTREAM_SCHEMA_VERSION, ...value };
  return parseClickstreamEvent(withVersion) as ClickstreamCollectionRequest | null;
}

export function parseClickstreamAcknowledgement(
  value: unknown,
  batchId: string,
  eventIds: string[],
): ClickstreamAcknowledgement | null {
  if (
    !isRecord(value) ||
    value.batchId !== batchId ||
    !Array.isArray(value.acceptedEventIds) ||
    !Array.isArray(value.rejectedEvents) ||
    !hasOnlyKeys(value, new Set(['batchId', 'acceptedEventIds', 'rejectedEvents']))
  )
    return null;
  const accepted = value.acceptedEventIds;
  if (!accepted.every(isUuid) || new Set(accepted).size !== accepted.length) return null;
  const rejected: ClickstreamRejectedEvent[] = [];
  for (const item of value.rejectedEvents) {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, new Set(['eventId', 'code', 'retryable'])) ||
      !isUuid(item.eventId) ||
      typeof item.code !== 'string' ||
      !/^[A-Z0-9_]{2,64}$/.test(item.code) ||
      typeof item.retryable !== 'boolean'
    )
      return null;
    rejected.push(item as unknown as ClickstreamRejectedEvent);
  }
  if (new Set(rejected.map((item) => item.eventId)).size !== rejected.length) return null;
  const ids = new Set(eventIds);
  if (
    accepted.some((id) => !ids.has(id)) ||
    rejected.some((item) => !ids.has(item.eventId)) ||
    new Set([...accepted, ...rejected.map((item) => item.eventId)]).size !== eventIds.length
  )
    return null;
  return { batchId, acceptedEventIds: [...accepted], rejectedEvents: rejected };
}

export function isClickstreamHealthResponse(value: unknown): value is ClickstreamHealthResponse {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      new Set([
        'ready',
        'configured',
        'captureEnabled',
        'dispatchEnabled',
        'statusCounts',
        'oldestEligibleBacklogAgeSeconds',
        'accepted',
        'delivered',
        'retried',
        'rejected',
        'terminal',
        'dropped',
        'deliveryLatencyMs',
        'lastPollAt',
        'lastErrorAt',
      ]),
    ) ||
    typeof value.ready !== 'boolean' ||
    typeof value.configured !== 'boolean' ||
    typeof value.captureEnabled !== 'boolean' ||
    typeof value.dispatchEnabled !== 'boolean' ||
    !isRecord(value.statusCounts) ||
    !isRecord(value.deliveryLatencyMs)
  )
    return false;
  const statusCounts = value.statusCounts;
  const latency = value.deliveryLatencyMs;
  const statuses = ['PENDING', 'LEASED', 'DELIVERED', 'TERMINAL', 'DROPPED'];
  const isCount = (item: unknown): item is number =>
    typeof item === 'number' && Number.isSafeInteger(item) && item >= 0;
  const isNullableNumber = (item: unknown): item is number | null =>
    item === null || (typeof item === 'number' && Number.isFinite(item) && item >= 0);
  return (
    hasOnlyKeys(statusCounts, new Set(statuses)) &&
    statuses.every((key) => isCount(statusCounts[key])) &&
    isNullableNumber(value.oldestEligibleBacklogAgeSeconds) &&
    ['accepted', 'delivered', 'retried', 'rejected', 'terminal', 'dropped'].every((key) =>
      isCount(value[key]),
    ) &&
    hasOnlyKeys(latency, new Set(['count', 'average', 'p95'])) &&
    isCount(latency.count) &&
    isNullableNumber(latency.average) &&
    isNullableNumber(latency.p95) &&
    (value.lastPollAt === null || typeof value.lastPollAt === 'string') &&
    (value.lastErrorAt === null || typeof value.lastErrorAt === 'string')
  );
}
