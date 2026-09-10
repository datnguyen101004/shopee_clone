import {
  CLICKSTREAM_EVENT_TYPES,
  CLICKSTREAM_SURFACES,
  type ClickstreamEventType,
} from '@shopee-clone/contracts';

export const CLICKSTREAM_CONFIG = Symbol('CLICKSTREAM_CONFIG');

export interface ClickstreamConfig {
  captureEnabled: boolean;
  dispatchEnabled: boolean;
  endpoint: string | null;
  hmacKeyId: string | null;
  hmacSecret: string | null;
  pseudonymKeyId: string;
  pseudonymSecret: string | null;
  sampling: Record<string, number>;
  defaultSampleRate: number;
  authoritativeSampleRate: number;
  batchSize: number;
  timeoutMs: number;
  pollIntervalMs: number;
  leaseSeconds: number;
  retryBaseMs: number;
  retryCapMs: number;
  maxAttempts: number;
  retentionSeconds: number;
  readinessMaxAgeSeconds: number;
  replayMaxRows: number;
  replayMaxAgeSeconds: number;
}

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (value !== 'true' && value !== 'false')
    throw new Error(`Invalid clickstream configuration: ${name}`);
  return value === 'true';
}
function integer(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid clickstream configuration: ${name}`);
  return value;
}
function rate(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(`Invalid clickstream configuration: ${name}`);
  return value;
}
function optionalSecret(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}
function isPlaceholder(value: string): boolean {
  return /^(?:local-disabled|change[-_]?me|replace[-_]?me|your[-_]|example(?:[-_]|$))/i.test(value);
}
function parseSampling(): Record<string, number> {
  const raw = process.env.CLICKSTREAM_SAMPLING_JSON;
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid clickstream configuration: CLICKSTREAM_SAMPLING_JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('Invalid clickstream configuration: CLICKSTREAM_SAMPLING_JSON');
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const [surface, eventType, ...extra] = key.split(':');
    const exactEventType = CLICKSTREAM_EVENT_TYPES.includes(key as ClickstreamEventType);
    const exactSurfaceEvent =
      extra.length === 0 &&
      CLICKSTREAM_SURFACES.includes(surface as (typeof CLICKSTREAM_SURFACES)[number]) &&
      CLICKSTREAM_EVENT_TYPES.includes(eventType as ClickstreamEventType);
    if (!exactEventType && !exactSurfaceEvent)
      throw new Error('Invalid clickstream configuration: unsupported sampling key');
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
      throw new Error('Invalid clickstream configuration: sampling rate');
    result[key] = value;
  }
  return result;
}

export function loadClickstreamConfig(): ClickstreamConfig {
  const captureEnabled = bool('CLICKSTREAM_CAPTURE_ENABLED');
  const dispatchEnabled = bool('CLICKSTREAM_DISPATCH_ENABLED');
  const endpoint = optionalSecret('CLICKSTREAM_API_GATEWAY_URL');
  const hmacKeyId = optionalSecret('CLICKSTREAM_HMAC_KEY_ID');
  const hmacSecret = optionalSecret('CLICKSTREAM_HMAC_SECRET');
  const pseudonymSecret = optionalSecret('CLICKSTREAM_PSEUDONYM_SECRET');
  const pseudonymKeyId = optionalSecret('CLICKSTREAM_PSEUDONYM_KEY_ID') ?? 'local-disabled';
  if (captureEnabled && (!pseudonymSecret || !pseudonymKeyId || isPlaceholder(pseudonymKeyId)))
    throw new Error(
      'Invalid clickstream configuration: pseudonym identity settings are required when capture is enabled',
    );
  if (dispatchEnabled && (!endpoint || !hmacKeyId || !hmacSecret))
    throw new Error(
      'Invalid clickstream configuration: delivery settings are required when dispatch is enabled',
    );
  if (endpoint && (!endpoint.startsWith('https://') || endpoint.includes('#')))
    throw new Error('Invalid clickstream configuration: API Gateway URL must use HTTPS');
  return {
    captureEnabled,
    dispatchEnabled,
    endpoint,
    hmacKeyId,
    hmacSecret,
    pseudonymKeyId,
    pseudonymSecret,
    sampling: parseSampling(),
    defaultSampleRate: rate('CLICKSTREAM_DEFAULT_SAMPLE_RATE', 0.1),
    authoritativeSampleRate: rate('CLICKSTREAM_AUTHORITATIVE_SAMPLE_RATE', 1),
    batchSize: integer('CLICKSTREAM_BATCH_SIZE', 50, 1, 500),
    timeoutMs: integer('CLICKSTREAM_TIMEOUT_MS', 5_000, 250, 30_000),
    pollIntervalMs: integer('CLICKSTREAM_POLL_INTERVAL_MS', 5_000, 250, 300_000),
    leaseSeconds: integer('CLICKSTREAM_LEASE_SECONDS', 30, 5, 900),
    retryBaseMs: integer('CLICKSTREAM_RETRY_BASE_MS', 1_000, 100, 60_000),
    retryCapMs: integer('CLICKSTREAM_RETRY_CAP_MS', 60_000, 1_000, 3_600_000),
    maxAttempts: integer('CLICKSTREAM_MAX_ATTEMPTS', 8, 1, 100),
    retentionSeconds: integer('CLICKSTREAM_RETENTION_SECONDS', 604_800, 60, 31_536_000),
    readinessMaxAgeSeconds: integer('CLICKSTREAM_READINESS_MAX_AGE_SECONDS', 60, 5, 3_600),
    replayMaxRows: integer('CLICKSTREAM_REPLAY_MAX_ROWS', 100, 1, 10_000),
    replayMaxAgeSeconds: integer('CLICKSTREAM_REPLAY_MAX_AGE_SECONDS', 604_800, 60, 31_536_000),
  };
}
