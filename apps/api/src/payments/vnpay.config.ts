import { INVENTORY_RESERVATION_TTL_MS } from '../inventory/inventory.constants';

export const VNPAY_CONFIG = Symbol('VNPAY_CONFIG');
export const VNPAY_SANDBOX_PAY_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html' as const;
export const VNPAY_SANDBOX_API_URL =
  'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction' as const;

export interface VnpayConfig {
  enabled: boolean;
  environment: 'sandbox';
  tmnCode: string | null;
  hashSecret: string | null;
  payUrl: typeof VNPAY_SANDBOX_PAY_URL;
  returnUrl: string | null;
  ipnUrl: string | null;
  apiUrl: typeof VNPAY_SANDBOX_API_URL;
  paymentTtlSeconds: number;
  httpTimeoutMs: number;
}

function readBoolean(environment: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = environment[key];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid VNPAY configuration: ${key}.`);
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
    throw new Error(`Invalid VNPAY configuration: ${key}.`);
  }
  return value;
}

function required(
  environment: NodeJS.ProcessEnv,
  key: 'VNPAY_TMN_CODE' | 'VNPAY_HASH_SECRET',
): string {
  const value = environment[key]?.trim() ?? '';
  if (
    !value ||
    value.length > 256 ||
    /replace|placeholder|example|your[-_ ]|change[-_ ]me/i.test(value)
  ) {
    throw new Error(`Invalid VNPAY configuration: ${key}.`);
  }
  return value;
}

function endpoint(
  environment: NodeJS.ProcessEnv,
  key: 'VNPAY_RETURN_URL' | 'VNPAY_IPN_URL',
): string {
  const raw = environment[key]?.trim() ?? '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid VNPAY configuration: ${key}.`);
  }
  const localReturn =
    key === 'VNPAY_RETURN_URL' &&
    environment.NODE_ENV !== 'production' &&
    url.hostname === 'localhost' &&
    url.port === '3000' &&
    url.pathname === '/payment/callback';
  const publicReturn =
    key === 'VNPAY_RETURN_URL' && url.protocol === 'https:' && url.pathname === '/payment/callback';
  const publicIpn =
    key === 'VNPAY_IPN_URL' &&
    url.protocol === 'https:' &&
    (url.pathname === '/api/v1/payment-providers/vnpay/ipn' ||
      url.pathname === '/api/v1/callback/payment-callback');
  if ((!localReturn && !publicReturn && !publicIpn) || url.username || url.password || url.hash || url.search) {
    throw new Error(`Invalid VNPAY configuration: ${key}.`);
  }
  return url.toString();
}

function fixedSandboxUrl(
  environment: NodeJS.ProcessEnv,
  key: 'VNPAY_PAY_URL' | 'VNPAY_API_URL',
  expected: string,
): typeof VNPAY_SANDBOX_PAY_URL | typeof VNPAY_SANDBOX_API_URL {
  const value = environment[key]?.trim() || expected;
  if (value !== expected) throw new Error(`Invalid VNPAY configuration: ${key}.`);
  return expected as typeof VNPAY_SANDBOX_PAY_URL | typeof VNPAY_SANDBOX_API_URL;
}

export function loadVnpayConfig(environment: NodeJS.ProcessEnv = process.env): VnpayConfig {
  const enabled = readBoolean(environment, 'VNPAY_ENABLED', false);
  if ((environment.VNPAY_ENV?.trim() || 'sandbox') !== 'sandbox') {
    throw new Error('Invalid VNPAY configuration: VNPAY_ENV.');
  }
  const paymentTtlSeconds = readInteger(
    environment,
    'VNPAY_PAYMENT_TTL_SECONDS',
    600,
    60,
    INVENTORY_RESERVATION_TTL_MS / 1_000,
  );
  const httpTimeoutMs = readInteger(environment, 'VNPAY_HTTP_TIMEOUT_MS', 30_000, 1_000, 120_000);
  if (!enabled) {
    return {
      enabled,
      environment: 'sandbox',
      tmnCode: null,
      hashSecret: null,
      payUrl: fixedSandboxUrl(
        environment,
        'VNPAY_PAY_URL',
        VNPAY_SANDBOX_PAY_URL,
      ) as typeof VNPAY_SANDBOX_PAY_URL,
      returnUrl: null,
      ipnUrl: null,
      apiUrl: fixedSandboxUrl(
        environment,
        'VNPAY_API_URL',
        VNPAY_SANDBOX_API_URL,
      ) as typeof VNPAY_SANDBOX_API_URL,
      paymentTtlSeconds,
      httpTimeoutMs,
    };
  }
  // This project intentionally runs the VNPAY sandbox on a production-like
  // demo host. The payment environment remains fixed to sandbox URLs above;
  // production still requires public HTTPS callback endpoints.
  return {
    enabled,
    environment: 'sandbox',
    tmnCode: required(environment, 'VNPAY_TMN_CODE'),
    hashSecret: required(environment, 'VNPAY_HASH_SECRET'),
    payUrl: fixedSandboxUrl(
      environment,
      'VNPAY_PAY_URL',
      VNPAY_SANDBOX_PAY_URL,
    ) as typeof VNPAY_SANDBOX_PAY_URL,
    returnUrl: endpoint(environment, 'VNPAY_RETURN_URL'),
    ipnUrl: endpoint(environment, 'VNPAY_IPN_URL'),
    apiUrl: fixedSandboxUrl(
      environment,
      'VNPAY_API_URL',
      VNPAY_SANDBOX_API_URL,
    ) as typeof VNPAY_SANDBOX_API_URL,
    paymentTtlSeconds,
    httpTimeoutMs,
  };
}
