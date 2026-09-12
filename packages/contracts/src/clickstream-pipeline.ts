/**
 * Contract shared by the API Gateway ingestion Lambda, Athena and Glue.
 *
 * This is deliberately separate from the first-party API clickstream
 * collection contract. The pipeline contract is already pseudonymised and
 * carries the shop identifier required by downstream seller analytics.
 */
export const RAW_CLICKSTREAM_SCHEMA_VERSION = 1 as const;
export const RAW_CLICKSTREAM_EVENT_TYPES = [
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
export type RawClickstreamEventType = (typeof RAW_CLICKSTREAM_EVENT_TYPES)[number];

export const RAW_CLICKSTREAM_SURFACES = [
  'search',
  'homepage',
  'product_detail',
  'favorite',
  'cart',
  'checkout',
  'order_history',
] as const;
export type RawClickstreamSurface = (typeof RAW_CLICKSTREAM_SURFACES)[number];

export type RawClickstreamEvent = {
  eventId: string;
  schemaVersion: typeof RAW_CLICKSTREAM_SCHEMA_VERSION;
  eventType: RawClickstreamEventType;
  occurredAt: string;
  shopId?: string;
  productId?: string;
  surface: RawClickstreamSurface;
  sessionPseudonym?: string;
  buyerPseudonym?: string | null;
  placement?: string;
  position?: number;
  requestId?: string;
  recommendationId?: string;
  query?: string;
  projectionVersion?: string;
  profileVersion?: string;
  modelVersion?: string;
  scriptVersion?: string;
  pseudonymKeyId?: string;
  properties?: Record<string, string | number | boolean | null>;
};

export type RawClickstreamBatch = {
  contractVersion: '1';
  batchId: string;
  producer: 'shopee-clone-api';
  sentAt: string;
  events: RawClickstreamEvent[];
};

/** The exact object emitted to Firehose as one newline-delimited record. */
export type RawClickstreamRecord = RawClickstreamEvent & {
  ingestedAt: string;
};

export const RAW_CLICKSTREAM_PROHIBITED_FIELDS = [
  'accessToken',
  'address',
  'cardNumber',
  'credential',
  'email',
  'modelWeights',
  'password',
  'payment',
  'paymentDetails',
  'postalAddress',
  'profile',
  'token',
  'userId',
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_STRING_LENGTH = 256;
const EVENT_FIELDS = new Set([
  'eventId',
  'schemaVersion',
  'eventType',
  'occurredAt',
  'shopId',
  'productId',
  'surface',
  'sessionPseudonym',
  'buyerPseudonym',
  'placement',
  'position',
  'requestId',
  'recommendationId',
  'query',
  'projectionVersion',
  'profileVersion',
  'modelVersion',
  'scriptVersion',
  'pseudonymKeyId',
  'properties',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown, max = MAX_STRING_LENGTH): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

/** Parse and validate an already-pseudonymised pipeline batch. */
export function parseRawClickstreamBatch(value: unknown): RawClickstreamBatch | null {
  if (!isRecord(value) || value.contractVersion !== '1' || value.producer !== 'shopee-clone-api' || !UUID.test(String(value.batchId))) {
    return null;
  }
  if (!ISO_UTC.test(String(value.sentAt)) || Number.isNaN(Date.parse(String(value.sentAt)))) {
    return null;
  }
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 500) {
    return null;
  }
  const events = value.events.map(parseRawClickstreamEvent);
  if (events.some((event): event is null => event === null)) return null;
  const normalized = events as RawClickstreamEvent[];
  if (new Set(normalized.map((event) => event.eventId)).size !== normalized.length) return null;
  return { contractVersion: '1', batchId: value.batchId as string, producer: 'shopee-clone-api', sentAt: value.sentAt as string, events: normalized };
}

export function parseRawClickstreamEvent(value: unknown): RawClickstreamEvent | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, EVENT_FIELDS) ||
    RAW_CLICKSTREAM_PROHIBITED_FIELDS.some((field) => Object.hasOwn(value, field))
  ) {
    return null;
  }
  if (
    value.schemaVersion !== RAW_CLICKSTREAM_SCHEMA_VERSION ||
    !isNonEmptyString(value.eventId) ||
    !UUID.test(value.eventId) ||
    typeof value.eventType !== 'string' ||
    !(RAW_CLICKSTREAM_EVENT_TYPES as readonly string[]).includes(value.eventType) ||
    !isNonEmptyString(value.occurredAt) ||
    !ISO_UTC.test(value.occurredAt) ||
    Number.isNaN(Date.parse(value.occurredAt)) ||
    !isNonEmptyString(value.surface) ||
    !(RAW_CLICKSTREAM_SURFACES as readonly string[]).includes(value.surface) ||
    (value.sessionPseudonym === undefined && value.buyerPseudonym === undefined)
  ) {
    return null;
  }
  for (const key of ['sessionPseudonym', 'buyerPseudonym'] as const) {
    if (value[key] !== undefined && value[key] !== null && !isNonEmptyString(value[key])) return null;
  }
  if (!isNonEmptyString(value.sessionPseudonym) && !isNonEmptyString(value.buyerPseudonym)) return null;
  for (const key of [
    'placement',
    'requestId',
    'recommendationId',
    'projectionVersion',
    'profileVersion',
    'modelVersion',
    'scriptVersion',
  ] as const) {
    if (value[key] !== undefined && !isNonEmptyString(value[key])) return null;
  }
  if (value.query !== undefined && !isNonEmptyString(value.query)) return null;
  if (value.pseudonymKeyId !== undefined && !isNonEmptyString(value.pseudonymKeyId)) return null;
  if (value.properties !== undefined) {
    if (!isRecord(value.properties) || RAW_CLICKSTREAM_PROHIBITED_FIELDS.some((field) => Object.hasOwn(value.properties as object, field))) return null;
    for (const item of Object.values(value.properties)) {
      if (item !== null && typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') return null;
    }
  }
  const position = value.position as number | undefined;
  if (position !== undefined && (!Number.isInteger(position) || position < 0 || position > 100_000)) {
    return null;
  }
  if (
    (value.eventType === 'product_impression' || value.eventType === 'product_clicked') &&
    (!isNonEmptyString(value.shopId) || !isNonEmptyString(value.productId) || !isNonEmptyString(value.placement) || !Number.isInteger(value.position) || !isNonEmptyString(value.requestId))
  ) {
    return null;
  }
  if (
    (value.eventType === 'recommendation_impression' || value.eventType === 'recommendation_clicked') &&
    (!isNonEmptyString(value.shopId) || !isNonEmptyString(value.productId) || !isNonEmptyString(value.placement) || !Number.isInteger(value.position) || !isNonEmptyString(value.recommendationId))
  ) {
    return null;
  }
  if (value.eventType === 'product_viewed' && (!isNonEmptyString(value.shopId) || !isNonEmptyString(value.productId) || value.surface !== 'product_detail')) return null;
  if ((value.eventType === 'favorite_changed' || value.eventType === 'cart_changed') && (!isNonEmptyString(value.shopId) || !isNonEmptyString(value.productId))) return null;
  if (value.eventType === 'search_submitted' && (value.surface !== 'search' || (value.productId !== undefined && !isNonEmptyString(value.productId)))) return null;
  return value as RawClickstreamEvent;
}

export const RAW_CLICKSTREAM_HAPPY_PATH_BATCH: RawClickstreamBatch = {
  contractVersion: '1',
  batchId: '00000000-0000-4000-8000-000000000001',
  producer: 'shopee-clone-api',
  sentAt: '2026-09-10T17:00:00.000Z',
  events: [
    {
      eventId: '00000000-0000-4000-8000-000000000011',
      schemaVersion: RAW_CLICKSTREAM_SCHEMA_VERSION,
      eventType: 'product_impression',
      occurredAt: '2026-09-10T16:59:00.000Z',
      shopId: '00000000-0000-4000-8000-000000000101',
      productId: '00000000-0000-4000-8000-000000000201',
      surface: 'search',
      sessionPseudonym: 'session-hash-01',
      placement: 'search_results',
      position: 1,
      requestId: '00000000-0000-4000-8000-000000000301',
      modelVersion: 'baseline-v1',
      pseudonymKeyId: 'clickstream-prod-2026',
      properties: {},
    },
    {
      eventId: '00000000-0000-4000-8000-000000000012',
      schemaVersion: RAW_CLICKSTREAM_SCHEMA_VERSION,
      eventType: 'product_clicked',
      occurredAt: '2026-09-10T16:59:12.000Z',
      shopId: '00000000-0000-4000-8000-000000000101',
      productId: '00000000-0000-4000-8000-000000000201',
      surface: 'search',
      sessionPseudonym: 'session-hash-01',
      placement: 'search_results',
      position: 1,
      requestId: '00000000-0000-4000-8000-000000000301',
      modelVersion: 'baseline-v1',
      pseudonymKeyId: 'clickstream-prod-2026',
      properties: {},
    },
  ],
};
