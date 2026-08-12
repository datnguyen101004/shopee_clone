import path from 'node:path';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export type RecoveryMode = 'capture' | 'file' | 'webhook';

export interface AuthConfig {
  nodeEnv: 'development' | 'test' | 'production';
  accessTokenSecret: string;
  limiterSecret: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  resetTokenTtlSeconds: number;
  refreshReuseToleranceSeconds: number;
  refreshCookieName: string;
  cookieSecure: boolean;
  allowedOrigins: string[];
  trustProxy: boolean;
  webBaseUrl: string;
  recoveryMode: RecoveryMode;
  recoveryCapturePath: string | null;
  recoveryOutboxDirectory: string;
  recoveryWebhookUrl: string | null;
  recoveryWebhookSecret: string | null;
  scrypt: {
    cost: number;
    blockSize: number;
    parallelization: number;
    keyLength: number;
    maxConcurrency: number;
  };
  limits: {
    loginIdentity: { max: number; windowSeconds: number };
    loginSource: { max: number; windowSeconds: number };
    registerSource: { max: number; windowSeconds: number };
    recoverySource: { max: number; windowSeconds: number };
    recoveryIdentity: { max: number; windowSeconds: number };
    resetSource: { max: number; windowSeconds: number };
    resetCredential: { max: number; windowSeconds: number };
    refreshSession: { max: number; windowSeconds: number };
  };
}

const developmentSecret = 'development-only-auth-secret-never-use-outside-local-tests-2026';
const developmentLimiterSecret =
  'development-only-limiter-secret-never-use-outside-local-tests-2026';

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
    throw new Error(`Invalid authentication configuration: ${key}.`);
  }
  return value;
}

function readBoolean(environment: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = environment[key];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid authentication configuration: ${key}.`);
}

function readLimit(
  environment: NodeJS.ProcessEnv,
  prefix: string,
  fallbackMax: number,
  fallbackWindowSeconds: number,
) {
  return {
    max: readInteger(environment, `${prefix}_MAX`, fallbackMax, 1, 10_000),
    windowSeconds: readInteger(
      environment,
      `${prefix}_WINDOW_SECONDS`,
      fallbackWindowSeconds,
      1,
      86_400,
    ),
  };
}

function readUrl(value: string, key: string, requireHttps: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid authentication configuration: ${key}.`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || (requireHttps && url.protocol !== 'https:')) {
    throw new Error(`Invalid authentication configuration: ${key}.`);
  }
  return url.origin;
}

function readEndpointUrl(value: string, key: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid authentication configuration: ${key}.`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`Invalid authentication configuration: ${key}.`);
  }
  return url.toString();
}

function readOrigins(environment: NodeJS.ProcessEnv, nodeEnv: AuthConfig['nodeEnv']): string[] {
  const raw = environment.AUTH_ALLOWED_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000';
  const origins = [
    ...new Set(
      raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
  if (origins.length === 0 || origins.includes('*')) {
    throw new Error('Invalid authentication configuration: AUTH_ALLOWED_ORIGINS.');
  }
  return origins.map((origin) => readUrl(origin, 'AUTH_ALLOWED_ORIGINS', nodeEnv === 'production'));
}

export function loadAuthConfig(environment: NodeJS.ProcessEnv = process.env): AuthConfig {
  const rawNodeEnv = environment.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(rawNodeEnv)) {
    throw new Error('Invalid authentication configuration: NODE_ENV.');
  }
  const nodeEnv = rawNodeEnv as AuthConfig['nodeEnv'];
  const accessTokenSecret = environment.AUTH_ACCESS_TOKEN_SECRET ?? developmentSecret;
  const limiterSecret = environment.AUTH_LIMITER_SECRET ?? developmentLimiterSecret;
  const cookieSecure = readBoolean(environment, 'AUTH_COOKIE_SECURE', nodeEnv === 'production');
  const recoveryMode = (environment.AUTH_RECOVERY_MODE ??
    (nodeEnv === 'test' ? 'capture' : 'file')) as RecoveryMode;
  if (!['capture', 'file', 'webhook'].includes(recoveryMode)) {
    throw new Error('Invalid authentication configuration: AUTH_RECOVERY_MODE.');
  }
  const webBaseUrl = readUrl(
    environment.AUTH_WEB_BASE_URL ?? 'http://localhost:3000',
    'AUTH_WEB_BASE_URL',
    nodeEnv === 'production',
  );
  const webhookUrl = environment.AUTH_RECOVERY_WEBHOOK_URL
    ? readEndpointUrl(environment.AUTH_RECOVERY_WEBHOOK_URL, 'AUTH_RECOVERY_WEBHOOK_URL')
    : null;
  const webhookSecret = environment.AUTH_RECOVERY_WEBHOOK_SECRET?.trim() || null;

  if (
    nodeEnv === 'production' &&
    (accessTokenSecret.length < 32 ||
      limiterSecret.length < 32 ||
      accessTokenSecret === developmentSecret ||
      limiterSecret === developmentLimiterSecret ||
      !cookieSecure ||
      recoveryMode !== 'webhook' ||
      !webhookUrl ||
      !webhookSecret ||
      webhookSecret.length < 32)
  ) {
    throw new Error('Unsafe production authentication configuration.');
  }

  const testScrypt = nodeEnv === 'test';
  const scryptCost = readInteger(
    environment,
    'AUTH_SCRYPT_COST',
    testScrypt ? 1_024 : 131_072,
    testScrypt ? 1_024 : 32_768,
    1_048_576,
  );
  if ((scryptCost & (scryptCost - 1)) !== 0) {
    throw new Error('Invalid authentication configuration: AUTH_SCRYPT_COST.');
  }

  return {
    nodeEnv,
    accessTokenSecret,
    limiterSecret,
    issuer: environment.AUTH_TOKEN_ISSUER?.trim() || 'shopee-clone-api',
    audience: environment.AUTH_TOKEN_AUDIENCE?.trim() || 'shopee-clone-web',
    accessTokenTtlSeconds: readInteger(environment, 'AUTH_ACCESS_TTL_SECONDS', 900, 60, 3_600),
    refreshTokenTtlSeconds: readInteger(
      environment,
      'AUTH_REFRESH_TTL_SECONDS',
      2_592_000,
      3_600,
      7_776_000,
    ),
    resetTokenTtlSeconds: readInteger(environment, 'AUTH_RESET_TTL_SECONDS', 1_800, 300, 86_400),
    refreshReuseToleranceSeconds: readInteger(
      environment,
      'AUTH_REFRESH_REUSE_TOLERANCE_SECONDS',
      5,
      0,
      30,
    ),
    refreshCookieName: 'sc_refresh',
    cookieSecure,
    allowedOrigins: readOrigins(environment, nodeEnv),
    trustProxy: readBoolean(environment, 'AUTH_TRUST_PROXY', false),
    webBaseUrl,
    recoveryMode,
    recoveryCapturePath: environment.AUTH_RECOVERY_CAPTURE_PATH
      ? path.resolve(environment.AUTH_RECOVERY_CAPTURE_PATH)
      : null,
    recoveryOutboxDirectory: path.resolve(
      environment.AUTH_RECOVERY_OUTBOX_DIR ?? path.join(process.cwd(), '.runtime', 'mail-outbox'),
    ),
    recoveryWebhookUrl: webhookUrl,
    recoveryWebhookSecret: webhookSecret,
    scrypt: {
      cost: scryptCost,
      blockSize: readInteger(environment, 'AUTH_SCRYPT_BLOCK_SIZE', 8, 8, 32),
      parallelization: readInteger(environment, 'AUTH_SCRYPT_PARALLELIZATION', 1, 1, 8),
      keyLength: readInteger(environment, 'AUTH_SCRYPT_KEY_LENGTH', 64, 32, 128),
      maxConcurrency: readInteger(environment, 'AUTH_SCRYPT_MAX_CONCURRENCY', 2, 1, 8),
    },
    limits: {
      loginIdentity: readLimit(environment, 'AUTH_LIMIT_LOGIN_IDENTITY', 5, 900),
      loginSource: readLimit(environment, 'AUTH_LIMIT_LOGIN_SOURCE', 20, 900),
      registerSource: readLimit(environment, 'AUTH_LIMIT_REGISTER_SOURCE', 10, 3_600),
      recoverySource: readLimit(environment, 'AUTH_LIMIT_RECOVERY_SOURCE', 5, 3_600),
      recoveryIdentity: readLimit(environment, 'AUTH_LIMIT_RECOVERY_IDENTITY', 3, 3_600),
      resetSource: readLimit(environment, 'AUTH_LIMIT_RESET_SOURCE', 5, 900),
      resetCredential: readLimit(environment, 'AUTH_LIMIT_RESET_CREDENTIAL', 5, 900),
      refreshSession: readLimit(environment, 'AUTH_LIMIT_REFRESH_SESSION', 60, 60),
    },
  };
}
