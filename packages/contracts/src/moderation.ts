export const REPORT_TARGET_TYPES = [
  'PRODUCT',
  'SHOP',
  'CHAT_CONVERSATION',
  'CHAT_MESSAGE',
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const PRODUCT_REPORT_REASON_CODES = [
  'PROHIBITED_ITEM',
  'COUNTERFEIT',
  'MISLEADING_INFORMATION',
  'INAPPROPRIATE_CONTENT',
  'OTHER',
] as const;
export type ProductReportReasonCode = (typeof PRODUCT_REPORT_REASON_CODES)[number];

export const SHOP_REPORT_REASON_CODES = [
  'FRAUD_SCAM',
  'ABUSIVE_BEHAVIOR',
  'PROHIBITED_SELLER',
  'INAPPROPRIATE_CONTENT',
  'OTHER',
] as const;
export type ShopReportReasonCode = (typeof SHOP_REPORT_REASON_CODES)[number];

export const REPORT_REASON_CODES = [
  'PROHIBITED_ITEM',
  'COUNTERFEIT',
  'MISLEADING_INFORMATION',
  'INAPPROPRIATE_CONTENT',
  'FRAUD_SCAM',
  'ABUSIVE_BEHAVIOR',
  'PROHIBITED_SELLER',
  'OTHER',
] as const;
export type ReportReasonCode = (typeof REPORT_REASON_CODES)[number];

export const REPORT_STATUSES = ['SUBMITTED', 'REVIEWED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_DETAILS_MIN_LENGTH = 20;
export const REPORT_DETAILS_MAX_LENGTH = 1_000;
export const REPORT_MAX_EVIDENCE_URLS = 3;
export const REPORT_EVIDENCE_URL_MAX_LENGTH = 2_048;
export const REPORT_RATE_LIMIT_HOURLY_ATTEMPTS = 20;
export const REPORT_RATE_LIMIT_DAILY_ACCEPTED = 10;
export const REPORT_REASON_MIN_LENGTH = 8;
export const REPORT_REASON_MAX_LENGTH = 240;
export const MODERATION_PRIVATE_NOTE_MAX_LENGTH = 2_000;
export const MODERATION_DEFAULT_LIMIT = 20;
export const MODERATION_MAX_LIMIT = 50;
export const SELLER_NOTICES_DEFAULT_LIMIT = 20;
export const SELLER_NOTICES_MAX_LIMIT = 50;
export const SELLER_REVIEWS_DEFAULT_LIMIT = 20;
export const SELLER_REVIEWS_MAX_LIMIT = 50;

export const MODERATION_CASE_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED'] as const;
export type ModerationCaseStatus = (typeof MODERATION_CASE_STATUSES)[number];

export const MODERATION_CASE_OUTCOMES = [
  'NO_ACTION',
  'SUSPEND_TARGET',
  'RESTORE_TARGET',
  'WARN_USER',
  'RESTRICT_CHAT_TEMPORARY',
  'RESTRICT_CHAT_INDEFINITE',
  'RESTORE_CHAT',
] as const;
export type ModerationCaseOutcome = (typeof MODERATION_CASE_OUTCOMES)[number];

export const MODERATION_DECISION_OUTCOMES = [
  'NO_ACTION',
  'SUSPEND_TARGET',
  'RESTORE_TARGET',
  'WARN_USER',
  'RESTRICT_CHAT_TEMPORARY',
  'RESTRICT_CHAT_INDEFINITE',
  'RESTORE_CHAT',
] as const;
export type ModerationDecisionOutcome = (typeof MODERATION_DECISION_OUTCOMES)[number];

export const MODERATION_CASE_EVENT_TYPES = [
  'REPORT_ATTACHED',
  'ASSIGNED',
  'UNASSIGNED',
  'NOTE_ADDED',
  'DECISION_MADE',
  'DECISION_REVERSED',
] as const;
export type ModerationCaseEventType = (typeof MODERATION_CASE_EVENT_TYPES)[number];

export const ADMIN_REVIEW_VISIBILITY_ACTIONS = ['HIDE', 'RESTORE', 'KEEP_VISIBLE'] as const;
export type AdminReviewVisibilityAction = (typeof ADMIN_REVIEW_VISIBILITY_ACTIONS)[number];

export const SELLER_REVIEW_REPORT_REASON_CODES = [
  'ABUSIVE_CONTENT',
  'IRRELEVANT_CONTENT',
  'SPAM_OR_FRAUD',
  'OTHER',
] as const;
export type SellerReviewReportReasonCode = (typeof SELLER_REVIEW_REPORT_REASON_CODES)[number];

export const SELLER_NOTICE_ACTIONS = [
  'PRODUCT_SUSPENDED',
  'PRODUCT_RESTORED',
  'SHOP_SUSPENDED',
  'SHOP_RESTORED',
] as const;
export type SellerNoticeAction = (typeof SELLER_NOTICE_ACTIONS)[number];

// ==========================================
// Buyer Reporting Interfaces
// ==========================================

export interface CreateReportRequest {
  targetType: ReportTargetType;
  targetId: string;
  reasonCode: ReportReasonCode;
  details: string;
  evidenceUrls?: string[];
}

export interface CreateReportResponse {
  reportId: string;
  targetType: ReportTargetType;
  targetId: string;
  reasonCode: ReportReasonCode;
  status: ReportStatus;
  createdAt: string;
}

export interface ReporterReportSummary {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetName: string;
  reasonCode: ReportReasonCode;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReporterReportDetail {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetName: string;
  targetSlug: string | null;
  reasonCode: ReportReasonCode;
  details: string;
  evidenceUrls: string[];
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReporterReportListQuery {
  limit?: number;
  cursor?: string;
  targetType?: ReportTargetType;
  status?: ReportStatus;
}

export interface ReporterReportListResponse {
  items: ReporterReportSummary[];
  nextCursor: string | null;
}

// ==========================================
// Admin Moderation Workflow Interfaces
// ==========================================

export interface ModerationCaseSummary {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetName: string;
  targetImageUrl?: string | null;
  targetStatus: string;
  status: ModerationCaseStatus;
  reportCount: number;
  primaryReasonCode: ReportReasonCode;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  currentOutcome: ModerationCaseOutcome | null;
  version: number;
  createdAt: string;
  lastActivityAt: string;
  resolvedAt: string | null;
}

export interface ModerationCaseReportItem {
  id: string;
  reporterOpaqueId: string;
  reasonCode: ReportReasonCode;
  details: string;
  evidenceUrls: string[];
  createdAt: string;
}

export interface ModerationCaseEventItem {
  id: string;
  eventType: ModerationCaseEventType;
  actorUserId: string | null;
  actorName: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ModerationCaseDecisionItem {
  id: string;
  outcome: ModerationDecisionOutcome;
  publicReason: string;
  privateNote: string | null;
  previousTargetStatus: string;
  nextTargetStatus: string;
  reversesDecisionId: string | null;
  actorUserId: string;
  actorName: string;
  createdAt: string;
}

export interface ModerationCaseTargetDetails {
  id: string;
  targetType: ReportTargetType;
  name: string;
  imageUrl?: string | null;
  slug: string | null;
  currentStatus: string;
  moderationStatus?: string;
  shopId?: string;
  shopName?: string;
  ownerUserId?: string;
  chat?: {
    conversationId: string;
    messageId: string | null;
    reportedUserId: string;
    reportedUserName: string;
    messages: Array<{
      sequence: number;
      senderUserId: string;
      senderLabel: string;
      content: string;
      createdAt: string;
    }>;
  };
}

export interface ModerationCaseDetail extends ModerationCaseSummary {
  reports: ModerationCaseReportItem[];
  events: ModerationCaseEventItem[];
  decisions: ModerationCaseDecisionItem[];
  targetDetails: ModerationCaseTargetDetails;
}

export interface ModerationCaseListQuery {
  page?: number;
  status?: ModerationCaseStatus;
  targetType?: ReportTargetType;
  targetId?: string;
  /** Exact moderation case, product, or shop identifier search. */
  searchId?: string;
  reasonCode?: ReportReasonCode;
  assignedAdminId?: string;
  assignedState?: 'ALL' | 'ASSIGNED' | 'UNASSIGNED' | 'ASSIGNED_TO_ME';
}

export interface ModerationCaseListResponse {
  items: ModerationCaseSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface AssignModerationCaseRequest {
  assignedAdminId: string | null;
  expectedVersion: number;
}

export interface AddModerationCaseNoteRequest {
  note: string;
  expectedVersion: number;
}

export interface CreateModerationDecisionRequest {
  outcome: ModerationDecisionOutcome;
  publicReason: string;
  privateNote?: string | null;
  reversesDecisionId?: string | null;
  /** Required for temporary chat restrictions; ISO UTC timestamp from the admin form. */
  restrictionUntil?: string | null;
  expectedVersion: number;
}

export interface ModerationDecisionResult {
  caseId: string;
  outcome: ModerationDecisionOutcome;
  version: number;
  targetStatus: string;
  resolvedAt: string;
}

// ==========================================
// Admin Review Moderation Interfaces
// ==========================================

export interface AdminReviewDetail {
  id: string;
  productId: string;
  productName: string;
  productImageUrl?: string | null;
  authorUserId: string;
  authorDisplayName: string;
  rating: number;
  comment: string | null;
  visibility: 'VISIBLE' | 'HIDDEN';
  version: number;
  createdAt: string;
  updatedAt: string;
  sellerReportCount: number;
  sellerReports: Array<{
    id: string;
    reasonCode: SellerReviewReportReasonCode;
    details: string | null;
    createdAt: string;
  }>;
}

export interface AdminReviewActionRequest {
  action: AdminReviewVisibilityAction;
  reason: string;
  expectedVersion: number;
}

export interface AdminReviewActionResult {
  reviewId: string;
  visibility: 'VISIBLE' | 'HIDDEN';
  version: number;
  updatedAt: string;
}

export interface CreateSellerReviewReportRequest {
  reasonCode: SellerReviewReportReasonCode;
  details?: string;
}

export interface SellerReviewReportReceipt {
  id: string;
  reviewId: string;
  status: 'SUBMITTED' | 'ALREADY_SUBMITTED';
  createdAt: string;
}

/** A seller-safe projection of a review on a product in the seller's current shop. */
export interface SellerShopReviewSummary {
  id: string;
  productId: string;
  productName: string;
  rating: number;
  comment: string | null;
  visibility: 'VISIBLE' | 'HIDDEN';
  createdAt: string;
  updatedAt: string;
  /** Only the current seller's latest report state; never another seller's report. */
  reportStatus: 'NOT_REPORTED' | 'OPEN' | 'RESOLVED';
}

export interface SellerShopReviewListResponse {
  items: SellerShopReviewSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface AdminReportedReviewSummary {
  reviewId: string;
  productId: string;
  productName: string;
  productImageUrl?: string | null;
  shopId: string;
  shopName: string;
  shopLogoUrl?: string | null;
  rating: number;
  comment: string | null;
  visibility: 'VISIBLE' | 'HIDDEN';
  reportCount: number;
  latestReportedAt: string;
}

export interface AdminReportedReviewListResponse {
  items: AdminReportedReviewSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

// ==========================================
// Seller Moderation Notices Interfaces
// ==========================================

export interface SellerModerationNoticeSummary {
  id: string;
  targetType: ReportTargetType;
  targetId: string | null;
  targetName: string;
  targetSlug: string | null;
  action: SellerNoticeAction;
  reason: string;
  effectiveAt: string;
  readAt: string | null;
}

export interface SellerModerationNoticeListQuery {
  limit?: number;
  cursor?: string;
  unreadOnly?: boolean;
}

export interface SellerModerationNoticeListResponse {
  items: SellerModerationNoticeSummary[];
  unreadCount: number;
  nextCursor: string | null;
}

export interface MarkSellerNoticeReadResponse {
  noticeId: string;
  readAt: string;
}

// ==========================================
// Problem Details & Common Errors
// ==========================================

export interface ModerationProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
  currentVersion?: number;
  currentCase?: ModerationCaseSummary;
  retryAfterSeconds?: number;
}

// ==========================================
// Type Guards & Validators
// ==========================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTPS_URL_REGEX = /^https:\/\/[^\s$.?#].[^\s]*$/i;

const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

const exact = (
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean => {
  const allowedKeys = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowedKeys.has(key))
  );
};

const hasControlCharacters = (val: string): boolean => {
  return [...val].some((ch) => {
    const code = ch.codePointAt(0)!;
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  });
};

export function isCanonicalUuid(val: unknown): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

export function isReportTargetType(val: unknown): val is ReportTargetType {
  return typeof val === 'string' && REPORT_TARGET_TYPES.includes(val as ReportTargetType);
}

export function isReportReasonCode(val: unknown): val is ReportReasonCode {
  return typeof val === 'string' && REPORT_REASON_CODES.includes(val as ReportReasonCode);
}

export function isValidProductReportReason(val: unknown): val is ProductReportReasonCode {
  return (
    typeof val === 'string' && PRODUCT_REPORT_REASON_CODES.includes(val as ProductReportReasonCode)
  );
}

export function isValidShopReportReason(val: unknown): val is ShopReportReasonCode {
  return typeof val === 'string' && SHOP_REPORT_REASON_CODES.includes(val as ShopReportReasonCode);
}

export function isReportStatus(val: unknown): val is ReportStatus {
  return typeof val === 'string' && REPORT_STATUSES.includes(val as ReportStatus);
}

export function isModerationCaseStatus(val: unknown): val is ModerationCaseStatus {
  return typeof val === 'string' && MODERATION_CASE_STATUSES.includes(val as ModerationCaseStatus);
}

export function isModerationDecisionOutcome(val: unknown): val is ModerationDecisionOutcome {
  return (
    typeof val === 'string' &&
    MODERATION_DECISION_OUTCOMES.includes(val as ModerationDecisionOutcome)
  );
}

export function isModerationCaseEventType(val: unknown): val is ModerationCaseEventType {
  return (
    typeof val === 'string' && MODERATION_CASE_EVENT_TYPES.includes(val as ModerationCaseEventType)
  );
}

export function isSellerNoticeAction(val: unknown): val is SellerNoticeAction {
  return typeof val === 'string' && SELLER_NOTICE_ACTIONS.includes(val as SellerNoticeAction);
}

export function isSellerReviewReportReasonCode(val: unknown): val is SellerReviewReportReasonCode {
  return (
    typeof val === 'string' &&
    SELLER_REVIEW_REPORT_REASON_CODES.includes(val as SellerReviewReportReasonCode)
  );
}

export function isValidSellerReviewReportDetails(val: unknown): val is string {
  if (typeof val !== 'string' || hasControlCharacters(val)) return false;
  const trimmed = val.trim();
  return trimmed.length >= 1 && trimmed.length <= REPORT_DETAILS_MAX_LENGTH;
}

export function isValidReportDetails(val: unknown): val is string {
  if (typeof val !== 'string' || hasControlCharacters(val)) return false;
  const trimmed = val.trim();
  return trimmed.length >= REPORT_DETAILS_MIN_LENGTH && trimmed.length <= REPORT_DETAILS_MAX_LENGTH;
}

export function isValidPublicReason(val: unknown): val is string {
  if (typeof val !== 'string' || hasControlCharacters(val)) return false;
  const trimmed = val.trim();
  return trimmed.length >= REPORT_REASON_MIN_LENGTH && trimmed.length <= REPORT_REASON_MAX_LENGTH;
}

export function isValidPrivateNote(val: unknown): val is string {
  if (typeof val !== 'string' || hasControlCharacters(val)) return false;
  const trimmed = val.trim();
  return trimmed.length >= 1 && trimmed.length <= MODERATION_PRIVATE_NOTE_MAX_LENGTH;
}

export function isValidEvidenceUrl(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= REPORT_EVIDENCE_URL_MAX_LENGTH &&
    trimmed.startsWith('https://') &&
    HTTPS_URL_REGEX.test(trimmed)
  );
}

export function isValidEvidenceUrlList(val: unknown): val is string[] {
  if (val === undefined) return true;
  if (!Array.isArray(val)) return false;
  if (val.length > REPORT_MAX_EVIDENCE_URLS) return false;
  return val.every(isValidEvidenceUrl);
}

export function parseCreateReportRequest(val: unknown): CreateReportRequest | null {
  if (
    !isRecord(val) ||
    !exact(val, ['targetType', 'targetId', 'reasonCode', 'details'], ['evidenceUrls'])
  ) {
    return null;
  }
  if (!isReportTargetType(val.targetType) || !isCanonicalUuid(val.targetId)) {
    return null;
  }
  if (!isReportReasonCode(val.reasonCode) || !isValidReportDetails(val.details)) {
    return null;
  }
  if (val.targetType === 'PRODUCT' && !isValidProductReportReason(val.reasonCode)) {
    return null;
  }
  if (val.targetType === 'SHOP' && !isValidShopReportReason(val.reasonCode)) {
    return null;
  }
  if (val.evidenceUrls !== undefined && !isValidEvidenceUrlList(val.evidenceUrls)) {
    return null;
  }
  return {
    targetType: val.targetType,
    targetId: val.targetId,
    reasonCode: val.reasonCode,
    details: (val.details as string).trim(),
    ...(val.evidenceUrls !== undefined
      ? { evidenceUrls: (val.evidenceUrls as string[]).map((u) => u.trim()) }
      : {}),
  };
}

export function parseCreateSellerReviewReportRequest(
  val: unknown,
): CreateSellerReviewReportRequest | null {
  if (!isRecord(val) || !exact(val, ['reasonCode'], ['details'])) {
    return null;
  }
  if (!isSellerReviewReportReasonCode(val.reasonCode)) {
    return null;
  }
  if (val.details !== undefined && !isValidSellerReviewReportDetails(val.details)) {
    return null;
  }
  return {
    reasonCode: val.reasonCode,
    ...(val.details !== undefined ? { details: (val.details as string).trim() } : {}),
  };
}

export function parseReporterReportListQuery(val: unknown): ReporterReportListQuery | null {
  if (!isRecord(val) || !exact(val, [], ['limit', 'cursor', 'targetType', 'status'])) {
    return null;
  }
  let limit: number | undefined;
  if (val.limit !== undefined) {
    const rawLimit = typeof val.limit === 'number' ? val.limit : Number(val.limit);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MODERATION_MAX_LIMIT) return null;
    limit = rawLimit;
  }
  let cursor: string | undefined;
  if (val.cursor !== undefined) {
    if (typeof val.cursor !== 'string' || val.cursor.trim().length === 0) return null;
    cursor = val.cursor.trim();
  }
  let targetType: ReportTargetType | undefined;
  if (val.targetType !== undefined) {
    if (!isReportTargetType(val.targetType)) return null;
    targetType = val.targetType;
  }
  let status: ReportStatus | undefined;
  if (val.status !== undefined) {
    if (!isReportStatus(val.status)) return null;
    status = val.status;
  }
  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(targetType !== undefined ? { targetType } : {}),
    ...(status !== undefined ? { status } : {}),
  };
}

export function parseModerationCaseListQuery(val: unknown): ModerationCaseListQuery | null {
  if (
    !isRecord(val) ||
    !exact(
      val,
      [],
      [
        'limit',
        'cursor',
        'status',
        'targetType',
        'targetId',
        'searchId',
        'reasonCode',
        'assignedAdminId',
        'assignedState',
      ],
    )
  ) {
    return null;
  }
  let limit: number | undefined;
  if (val.limit !== undefined) {
    const rawLimit = typeof val.limit === 'number' ? val.limit : Number(val.limit);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MODERATION_MAX_LIMIT) return null;
    limit = rawLimit;
  }
  let cursor: string | undefined;
  if (val.cursor !== undefined) {
    if (typeof val.cursor !== 'string' || val.cursor.trim().length === 0) return null;
    cursor = val.cursor.trim();
  }
  let status: ModerationCaseStatus | undefined;
  if (val.status !== undefined) {
    if (!isModerationCaseStatus(val.status)) return null;
    status = val.status;
  }
  let targetType: ReportTargetType | undefined;
  if (val.targetType !== undefined) {
    if (!isReportTargetType(val.targetType)) return null;
    targetType = val.targetType;
  }
  let targetId: string | undefined;
  if (val.targetId !== undefined) {
    if (!isCanonicalUuid(val.targetId)) return null;
    targetId = val.targetId;
  }
  let searchId: string | undefined;
  if (val.searchId !== undefined) {
    if (!isCanonicalUuid(val.searchId)) return null;
    searchId = val.searchId;
  }
  let reasonCode: ReportReasonCode | undefined;
  if (val.reasonCode !== undefined) {
    if (!isReportReasonCode(val.reasonCode)) return null;
    reasonCode = val.reasonCode;
  }
  let assignedAdminId: string | undefined;
  if (val.assignedAdminId !== undefined) {
    if (!isCanonicalUuid(val.assignedAdminId)) return null;
    assignedAdminId = val.assignedAdminId;
  }
  let assignedState: 'ALL' | 'ASSIGNED' | 'UNASSIGNED' | 'ASSIGNED_TO_ME' | undefined;
  if (val.assignedState !== undefined) {
    if (!['ALL', 'ASSIGNED', 'UNASSIGNED', 'ASSIGNED_TO_ME'].includes(val.assignedState as string))
      return null;
    assignedState = val.assignedState as 'ALL' | 'ASSIGNED' | 'UNASSIGNED' | 'ASSIGNED_TO_ME';
  }
  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(targetType !== undefined ? { targetType } : {}),
    ...(targetId !== undefined ? { targetId } : {}),
    ...(searchId !== undefined ? { searchId } : {}),
    ...(reasonCode !== undefined ? { reasonCode } : {}),
    ...(assignedAdminId !== undefined ? { assignedAdminId } : {}),
    ...(assignedState !== undefined ? { assignedState } : {}),
  };
}

export function parseAssignModerationCaseRequest(val: unknown): AssignModerationCaseRequest | null {
  if (!isRecord(val) || !exact(val, ['assignedAdminId', 'expectedVersion'])) {
    return null;
  }
  if (val.assignedAdminId !== null && !isCanonicalUuid(val.assignedAdminId)) {
    return null;
  }
  const version =
    typeof val.expectedVersion === 'number' ? val.expectedVersion : Number(val.expectedVersion);
  if (!Number.isInteger(version) || version < 0) {
    return null;
  }
  return {
    assignedAdminId: val.assignedAdminId,
    expectedVersion: version,
  };
}

export function parseAddModerationCaseNoteRequest(
  val: unknown,
): AddModerationCaseNoteRequest | null {
  if (!isRecord(val) || !exact(val, ['note', 'expectedVersion'])) {
    return null;
  }
  if (!isValidPrivateNote(val.note)) {
    return null;
  }
  const version =
    typeof val.expectedVersion === 'number' ? val.expectedVersion : Number(val.expectedVersion);
  if (!Number.isInteger(version) || version < 0) {
    return null;
  }
  return {
    note: (val.note as string).trim(),
    expectedVersion: version,
  };
}

export function parseCreateModerationDecisionRequest(
  val: unknown,
): CreateModerationDecisionRequest | null {
  if (
    !isRecord(val) ||
    !exact(
      val,
      ['outcome', 'publicReason', 'expectedVersion'],
      ['privateNote', 'reversesDecisionId', 'restrictionUntil'],
    )
  ) {
    return null;
  }
  if (!isModerationDecisionOutcome(val.outcome) || !isValidPublicReason(val.publicReason)) {
    return null;
  }
  const version =
    typeof val.expectedVersion === 'number' ? val.expectedVersion : Number(val.expectedVersion);
  if (!Number.isInteger(version) || version < 0) {
    return null;
  }
  if (
    val.privateNote !== undefined &&
    val.privateNote !== null &&
    !isValidPrivateNote(val.privateNote)
  ) {
    return null;
  }
  if (
    val.reversesDecisionId !== undefined &&
    val.reversesDecisionId !== null &&
    !isCanonicalUuid(val.reversesDecisionId)
  ) {
    return null;
  }
  if (
    val.restrictionUntil !== undefined &&
    val.restrictionUntil !== null &&
    (typeof val.restrictionUntil !== 'string' ||
      Number.isNaN(Date.parse(val.restrictionUntil)) ||
      new Date(val.restrictionUntil).toISOString() !== val.restrictionUntil)
  ) {
    return null;
  }
  return {
    outcome: val.outcome,
    publicReason: (val.publicReason as string).trim(),
    expectedVersion: version,
    ...(val.privateNote !== undefined && val.privateNote !== null
      ? { privateNote: (val.privateNote as string).trim() }
      : {}),
    ...(val.reversesDecisionId !== undefined && val.reversesDecisionId !== null
      ? { reversesDecisionId: val.reversesDecisionId }
      : {}),
    ...(val.restrictionUntil !== undefined && val.restrictionUntil !== null
      ? { restrictionUntil: val.restrictionUntil as string }
      : {}),
  };
}

export function parseAdminReviewActionRequest(val: unknown): AdminReviewActionRequest | null {
  if (!isRecord(val) || !exact(val, ['action', 'reason', 'expectedVersion'])) {
    return null;
  }
  if (!ADMIN_REVIEW_VISIBILITY_ACTIONS.includes(val.action as AdminReviewVisibilityAction)) {
    return null;
  }
  if (!isValidPublicReason(val.reason)) {
    return null;
  }
  const version =
    typeof val.expectedVersion === 'number' ? val.expectedVersion : Number(val.expectedVersion);
  if (!Number.isInteger(version) || version < 0) {
    return null;
  }
  return {
    action: val.action as AdminReviewVisibilityAction,
    reason: (val.reason as string).trim(),
    expectedVersion: version,
  };
}

export function parseSellerModerationNoticeListQuery(
  val: unknown,
): SellerModerationNoticeListQuery | null {
  if (!isRecord(val) || !exact(val, [], ['limit', 'cursor', 'unreadOnly'])) {
    return null;
  }
  let limit: number | undefined;
  if (val.limit !== undefined) {
    const rawLimit = typeof val.limit === 'number' ? val.limit : Number(val.limit);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > SELLER_NOTICES_MAX_LIMIT)
      return null;
    limit = rawLimit;
  }
  let cursor: string | undefined;
  if (val.cursor !== undefined) {
    if (typeof val.cursor !== 'string' || val.cursor.trim().length === 0) return null;
    cursor = val.cursor.trim();
  }
  let unreadOnly: boolean | undefined;
  if (val.unreadOnly !== undefined) {
    if (typeof val.unreadOnly === 'boolean') {
      unreadOnly = val.unreadOnly;
    } else if (val.unreadOnly === 'true') {
      unreadOnly = true;
    } else if (val.unreadOnly === 'false') {
      unreadOnly = false;
    } else {
      return null;
    }
  }
  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(unreadOnly !== undefined ? { unreadOnly } : {}),
  };
}

export function parseModerationProblemDetails(val: unknown): ModerationProblemDetails | null {
  if (
    !isRecord(val) ||
    !exact(
      val,
      ['type', 'title', 'status', 'detail'],
      ['invalidParameters', 'currentVersion', 'currentCase', 'retryAfterSeconds'],
    )
  ) {
    return null;
  }
  if (
    typeof val.type !== 'string' ||
    typeof val.title !== 'string' ||
    typeof val.status !== 'number' ||
    typeof val.detail !== 'string'
  ) {
    return null;
  }
  return val as unknown as ModerationProblemDetails;
}
