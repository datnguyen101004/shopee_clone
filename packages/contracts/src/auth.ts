export const AUTH_EMAIL_MAX_LENGTH = 320;
export const AUTH_DISPLAY_NAME_MIN_LENGTH = 2;
export const AUTH_DISPLAY_NAME_MAX_LENGTH = 120;
export const AUTH_PASSWORD_MIN_LENGTH = 8;
export const AUTH_PASSWORD_MAX_LENGTH = 128;
export const ROLE_REASON_MIN_LENGTH = 8;
export const ROLE_REASON_MAX_LENGTH = 240;

export const marketplaceRoleValues = ['buyer', 'seller', 'admin'] as const;
export const elevatedMarketplaceRoleValues = ['seller', 'admin'] as const;
export const roleAuditActionValues = ['grant', 'revoke'] as const;
export const roleAuditSourceValues = ['system', 'migration', 'seed', 'bootstrap', 'admin'] as const;
export const authorizationProblemTypeValues = [
  'invalid-role-request',
  'authorization-denied',
  'role-target-unavailable',
  'role-conflict',
] as const;

export type MarketplaceRole = (typeof marketplaceRoleValues)[number];
export type ElevatedMarketplaceRole = (typeof elevatedMarketplaceRoleValues)[number];
export type RoleAuditAction = (typeof roleAuditActionValues)[number];
export type RoleAuditSource = (typeof roleAuditSourceValues)[number];
export type AuthorizationProblemType = (typeof authorizationProblemTypeValues)[number];

export type AuthUserStatus = 'active' | 'suspended';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  status: AuthUserStatus;
  roles: MarketplaceRole[];
}

export interface RoleGrantRequest {
  role: ElevatedMarketplaceRole;
  reason: string;
}

export interface RoleRevokeRequest {
  reason: string;
}

export interface RoleAssignmentResult {
  userId: string;
  roles: MarketplaceRole[];
}

export interface SellerShop {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'inactive';
}

export interface RoleAuditEvent {
  id: string;
  targetUserId: string;
  role: MarketplaceRole;
  action: RoleAuditAction;
  source: RoleAuditSource;
  actorUserId: string | null;
  reason: string;
  createdAt: string;
}

export interface RoleAuditPage {
  items: RoleAuditEvent[];
  nextCursor: string | null;
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
const roleAuditCursorPattern = /^[A-Za-z0-9_-]{16,512}$/;

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

export function isMarketplaceRole(value: unknown): value is MarketplaceRole {
  return marketplaceRoleValues.includes(value as MarketplaceRole);
}

export function isElevatedMarketplaceRole(value: unknown): value is ElevatedMarketplaceRole {
  return elevatedMarketplaceRoleValues.includes(value as ElevatedMarketplaceRole);
}

export function isCanonicalMarketplaceRoles(value: unknown): value is MarketplaceRole[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > marketplaceRoleValues.length) {
    return false;
  }
  if (!value.every(isMarketplaceRole) || value[0] !== 'buyer') return false;
  const expected = marketplaceRoleValues.filter((role) => value.includes(role));
  return expected.length === value.length && expected.every((role, index) => role === value[index]);
}

export function hasMarketplaceRole(user: Pick<AuthUser, 'roles'>, role: MarketplaceRole): boolean {
  return user.roles.includes(role);
}

export function isCanonicalRoleTargetId(value: unknown): value is string {
  return typeof value === 'string' && canonicalUuid.test(value);
}

export function isAcceptedRoleReason(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    value.length >= ROLE_REASON_MIN_LENGTH &&
    value.length <= ROLE_REASON_MAX_LENGTH
  );
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
    hasExactKeys(value, ['id', 'email', 'displayName', 'status', 'roles']) &&
    typeof value.id === 'string' &&
    canonicalUuid.test(value.id) &&
    isValidAuthEmail(value.email) &&
    typeof value.displayName === 'string' &&
    value.displayName === value.displayName.trim() &&
    value.displayName.length >= AUTH_DISPLAY_NAME_MIN_LENGTH &&
    value.displayName.length <= AUTH_DISPLAY_NAME_MAX_LENGTH &&
    ['active', 'suspended'].includes(String(value.status)) &&
    isCanonicalMarketplaceRoles(value.roles)
  );
}

export function isRoleGrantRequest(value: unknown): value is RoleGrantRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['role', 'reason']) &&
    isElevatedMarketplaceRole(value.role) &&
    isAcceptedRoleReason(value.reason)
  );
}

export function isRoleRevokeRequest(value: unknown): value is RoleRevokeRequest {
  return isRecord(value) && hasExactKeys(value, ['reason']) && isAcceptedRoleReason(value.reason);
}

export function isRoleAssignmentResult(value: unknown): value is RoleAssignmentResult {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['userId', 'roles']) &&
    isCanonicalRoleTargetId(value.userId) &&
    isCanonicalMarketplaceRoles(value.roles)
  );
}

export function isSellerShop(value: unknown): value is SellerShop {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'slug', 'name', 'status']) &&
    isCanonicalRoleTargetId(value.id) &&
    typeof value.slug === 'string' &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) &&
    typeof value.name === 'string' &&
    value.name === value.name.trim() &&
    value.name.length >= 1 &&
    value.name.length <= 160 &&
    ['active', 'inactive'].includes(String(value.status))
  );
}

function isCanonicalDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function isRoleAuditEvent(value: unknown): value is RoleAuditEvent {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'id',
      'targetUserId',
      'role',
      'action',
      'source',
      'actorUserId',
      'reason',
      'createdAt',
    ]) &&
    isCanonicalRoleTargetId(value.id) &&
    isCanonicalRoleTargetId(value.targetUserId) &&
    isMarketplaceRole(value.role) &&
    roleAuditActionValues.includes(value.action as RoleAuditAction) &&
    roleAuditSourceValues.includes(value.source as RoleAuditSource) &&
    (value.actorUserId === null || isCanonicalRoleTargetId(value.actorUserId)) &&
    isAcceptedRoleReason(value.reason) &&
    isCanonicalDateTime(value.createdAt)
  );
}

export function isRoleAuditPage(value: unknown): value is RoleAuditPage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['items', 'nextCursor']) &&
    Array.isArray(value.items) &&
    value.items.length <= 100 &&
    value.items.every(isRoleAuditEvent) &&
    (value.nextCursor === null ||
      (typeof value.nextCursor === 'string' && roleAuditCursorPattern.test(value.nextCursor)))
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
    value === '/account/profile' ||
    value === '/account/addresses' ||
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

export function isAuthorizationProblemDetails(value: unknown): value is AuthProblemDetails {
  if (!isAuthProblemDetails(value)) return false;
  const prefix = 'https://shopee-clone.local/problems/';
  const problemType = value.type.slice(prefix.length) as AuthorizationProblemType;
  if (!authorizationProblemTypeValues.includes(problemType)) return false;
  const statusByType: Record<AuthorizationProblemType, number> = {
    'invalid-role-request': 400,
    'authorization-denied': 403,
    'role-target-unavailable': 404,
    'role-conflict': 409,
  };
  return value.status === statusByType[problemType];
}

export function parseAuthProblemDetails(value: unknown): AuthProblemDetails | null {
  return isAuthProblemDetails(value) ? value : null;
}
