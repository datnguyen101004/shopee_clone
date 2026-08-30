import { INVENTORY_RESERVATION_TTL_MS } from '../inventory/inventory.constants';

export const MOMO_CONFIG = Symbol('MOMO_CONFIG');
export const MOMO_SANDBOX_ORIGIN = 'https://test-payment.momo.vn' as const;

export interface MomoConfig {
  enabled: boolean;
  environment: 'sandbox';
  baseUrl: typeof MOMO_SANDBOX_ORIGIN;
  partnerCode: string | null;
  accessKey: string | null;
  secretKey: string | null;
  ipnUrl: string | null;
  redirectUrl: string | null;
  paymentTtlSeconds: number;
  httpTimeoutMs: number;
}

function readBoolean(environment: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = environment[key];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid MoMo configuration: ${key}.`);
}

function readInteger(
  environment: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid MoMo configuration: ${key}.`);
  }
  return value;
}

function readCredential(
  environment: NodeJS.ProcessEnv,
  key: 'MOMO_PARTNER_CODE' | 'MOMO_ACCESS_KEY' | 'MOMO_SECRET_KEY',
  minimumLength: number,
): string {
  const value = environment[key]?.trim() ?? '';
  if (
    value.length < minimumLength ||
    /replace|placeholder|example|your[-_ ]|change[-_ ]me/i.test(value)
  ) {
    throw new Error(`Invalid MoMo configuration: ${key}.`);
  }
  return value;
}

function readHttpsEndpoint(
  environment: NodeJS.ProcessEnv,
  key: 'MOMO_IPN_URL' | 'MOMO_REDIRECT_URL',
) {
  const raw = environment[key]?.trim() ?? '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid MoMo configuration: ${key}.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
    throw new Error(`Invalid MoMo configuration: ${key}.`);
  }
  if (key === 'MOMO_IPN_URL' && url.pathname !== '/api/v1/payment-providers/momo/ipn') {
    throw new Error(`Invalid MoMo configuration: ${key}.`);
  }
  return url.toString();
}

export function loadMomoConfig(environment: NodeJS.ProcessEnv = process.env): MomoConfig {
  const enabled = readBoolean(environment, 'MOMO_ENABLED', false);
  const configuredEnvironment = environment.MOMO_ENV?.trim() || 'sandbox';
  if (configuredEnvironment !== 'sandbox') {
    throw new Error('Invalid MoMo configuration: MOMO_ENV.');
  }

  const paymentTtlSeconds = readInteger(
    environment,
    'MOMO_PAYMENT_TTL_SECONDS',
    600,
    60,
    INVENTORY_RESERVATION_TTL_MS / 1_000,
  );
  if (paymentTtlSeconds * 1_000 > INVENTORY_RESERVATION_TTL_MS) {
    throw new Error('Invalid MoMo configuration: MOMO_PAYMENT_TTL_SECONDS.');
  }

  const httpTimeoutMs = readInteger(environment, 'MOMO_HTTP_TIMEOUT_MS', 30_000, 30_000, 120_000);

  if (!enabled) {
    return {
      enabled,
      environment: 'sandbox',
      baseUrl: MOMO_SANDBOX_ORIGIN,
      partnerCode: null,
      accessKey: null,
      secretKey: null,
      ipnUrl: null,
      redirectUrl: null,
      paymentTtlSeconds,
      httpTimeoutMs,
    };
  }

  if (environment.NODE_ENV === 'production') {
    throw new Error('MoMo sandbox cannot be enabled in production.');
  }

  return {
    enabled,
    environment: 'sandbox',
    baseUrl: MOMO_SANDBOX_ORIGIN,
    partnerCode: readCredential(environment, 'MOMO_PARTNER_CODE', 3),
    accessKey: readCredential(environment, 'MOMO_ACCESS_KEY', 8),
    secretKey: readCredential(environment, 'MOMO_SECRET_KEY', 16),
    ipnUrl: readHttpsEndpoint(environment, 'MOMO_IPN_URL'),
    redirectUrl: readHttpsEndpoint(environment, 'MOMO_REDIRECT_URL'),
    paymentTtlSeconds,
    httpTimeoutMs,
  };
}
