export const AUTH_EMAIL_MAX_LENGTH = 320;
export const AUTH_DISPLAY_NAME_MIN_LENGTH = 2;
export const AUTH_DISPLAY_NAME_MAX_LENGTH = 120;
export const AUTH_PASSWORD_MIN_LENGTH = 8;
export const AUTH_PASSWORD_MAX_LENGTH = 128;

export type AuthUserStatus = 'active' | 'suspended';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  status: AuthUserStatus;
}

export interface AuthSessionResponse {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
}

export interface RegisterRequest {
  displayName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export const googleSignInOutcomeValues = [
  'success',
  'cancelled',
  'failed',
  'account-method-required',
] as const;

export type GoogleSignInOutcome = (typeof googleSignInOutcomeValues)[number];

export interface GoogleSignInCompletion {
  outcome: GoogleSignInOutcome;
  returnTo: string;
}

export interface AuthProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
  retryAfterSeconds?: number;
}

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const opaqueTokenPattern = /^[A-Za-z0-9_-]{43,128}$/;
const commonPasswords = new Set(['12345678', 'password', 'password1', 'qwerty123', 'shopee123']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

export function normalizeAuthEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidAuthEmail(value: unknown): value is string {
  if (typeof value !== 'string' || value !== normalizeAuthEmail(value)) return false;
  return value.length >= 3 && value.length <= AUTH_EMAIL_MAX_LENGTH && emailPattern.test(value);
}

export function isAcceptedAuthPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= AUTH_PASSWORD_MIN_LENGTH &&
    value.length <= AUTH_PASSWORD_MAX_LENGTH &&
    !commonPasswords.has(value.toLowerCase())
  );
}

export function isAuthUser(value: unknown): value is AuthUser {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'email', 'displayName', 'status']) &&
    typeof value.id === 'string' &&
    canonicalUuid.test(value.id) &&
    isValidAuthEmail(value.email) &&
    typeof value.displayName === 'string' &&
    value.displayName === value.displayName.trim() &&
    value.displayName.length >= AUTH_DISPLAY_NAME_MIN_LENGTH &&
    value.displayName.length <= AUTH_DISPLAY_NAME_MAX_LENGTH &&
    ['active', 'suspended'].includes(String(value.status))
  );
}

export function isAuthSessionResponse(value: unknown): value is AuthSessionResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['accessToken', 'expiresAt', 'user'])) return false;
  if (
    typeof value.accessToken !== 'string' ||
    value.accessToken.length > 4096 ||
    !jwtPattern.test(value.accessToken) ||
    typeof value.expiresAt !== 'string' ||
    !isAuthUser(value.user)
  ) {
    return false;
  }
  const expiresAt = Date.parse(value.expiresAt);
  return Number.isFinite(expiresAt) && new Date(expiresAt).toISOString() === value.expiresAt;
}

export function parseAuthSessionResponse(value: unknown): AuthSessionResponse | null {
  return isAuthSessionResponse(value) ? value : null;
}

export function isRegisterRequest(value: unknown): value is RegisterRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['displayName', 'email', 'password']) &&
    typeof value.displayName === 'string' &&
    value.displayName === value.displayName.trim() &&
    value.displayName.length >= AUTH_DISPLAY_NAME_MIN_LENGTH &&
    value.displayName.length <= AUTH_DISPLAY_NAME_MAX_LENGTH &&
    isValidAuthEmail(value.email) &&
    isAcceptedAuthPassword(value.password)
  );
}

export function isLoginRequest(value: unknown): value is LoginRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['email', 'password']) &&
    isValidAuthEmail(value.email) &&
    typeof value.password === 'string' &&
    value.password.length >= 1 &&
    value.password.length <= AUTH_PASSWORD_MAX_LENGTH
  );
}

export function isForgotPasswordRequest(value: unknown): value is ForgotPasswordRequest {
  return isRecord(value) && hasExactKeys(value, ['email']) && isValidAuthEmail(value.email);
}

export function isResetPasswordRequest(value: unknown): value is ResetPasswordRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['token', 'password']) &&
    typeof value.token === 'string' &&
    opaqueTokenPattern.test(value.token) &&
    isAcceptedAuthPassword(value.password)
  );
}

export function isSafeAuthReturnTo(value: unknown): value is string {
  return (
    value === '/' ||
    (typeof value === 'string' &&
      /^\/products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))
  );
}

export function isGoogleSignInCompletion(value: unknown): value is GoogleSignInCompletion {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['outcome', 'returnTo']) &&
    googleSignInOutcomeValues.includes(value.outcome as GoogleSignInOutcome) &&
    isSafeAuthReturnTo(value.returnTo)
  );
}

export function parseGoogleSignInCompletion(value: unknown): GoogleSignInCompletion | null {
  return isGoogleSignInCompletion(value) ? value : null;
}

export function isAuthProblemDetails(value: unknown): value is AuthProblemDetails {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ['type', 'title', 'status', 'detail'],
      ['invalidParameters', 'retryAfterSeconds'],
    ) ||
    typeof value.type !== 'string' ||
    !value.type.startsWith('https://shopee-clone.local/problems/') ||
    typeof value.title !== 'string' ||
    value.title.length === 0 ||
    typeof value.status !== 'number' ||
    !Number.isInteger(value.status) ||
    value.status < 400 ||
    value.status > 599 ||
    typeof value.detail !== 'string' ||
    value.detail.length === 0
  ) {
    return false;
  }
  if (
    value.invalidParameters !== undefined &&
    (!Array.isArray(value.invalidParameters) ||
      !value.invalidParameters.every((entry) => typeof entry === 'string' && entry.length > 0))
  ) {
    return false;
  }
  return (
    value.retryAfterSeconds === undefined ||
    (typeof value.retryAfterSeconds === 'number' &&
      Number.isSafeInteger(value.retryAfterSeconds) &&
      value.retryAfterSeconds > 0)
  );
}

export function parseAuthProblemDetails(value: unknown): AuthProblemDetails | null {
  return isAuthProblemDetails(value) ? value : null;
}
