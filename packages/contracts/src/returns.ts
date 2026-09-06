/**
 * Framework-neutral contracts for the post-delivery return workflow.  This
 * module deliberately has no transport, persistence, browser, or storage
 * dependencies so all three applications can agree on the public boundary.
 */

export const RETURN_VERSION = 'returns-v1' as const;
export const RETURN_DEFAULT_LIMIT = 20;
export const RETURN_MAX_LIMIT = 50;
export const RETURN_DESCRIPTION_MIN_LENGTH = 20;
export const RETURN_DESCRIPTION_MAX_LENGTH = 1_000;
export const RETURN_PUBLIC_REASON_MIN_LENGTH = 8;
export const RETURN_PUBLIC_REASON_MAX_LENGTH = 500;
export const RETURN_INTERNAL_NOTE_MAX_LENGTH = 1_000;
export const RETURN_EVIDENCE_MIN_ITEMS = 1;
export const RETURN_EVIDENCE_MAX_ITEMS = 5;
export const RETURN_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const RETURN_EVIDENCE_MAX_DIMENSION = 8_000;
export const RETURN_EVIDENCE_EXPIRY_MS = 24 * 60 * 60 * 1_000;
export const RETURN_ELIGIBILITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
export const RETURN_SELLER_RESPONSE_WINDOW_MS = 48 * 60 * 60 * 1_000;
export const RETURN_SHIPMENT_WINDOW_MS = 5 * 24 * 60 * 60 * 1_000;
export const RETURN_RECEIPT_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

export const RETURN_STATUSES = [
  'REQUESTED',
  'AWAITING_RETURN',
  'IN_TRANSIT',
  'ESCALATED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
  'REFUNDED',
] as const;
export const RETURN_REASON_CODES = [
  'DAMAGED',
  'WRONG_ITEM',
  'MISSING_ITEM',
  'NOT_AS_DESCRIBED',
  'OTHER',
] as const;
export const RETURN_ACTOR_TYPES = ['BUYER', 'SELLER', 'ADMIN', 'SYSTEM'] as const;
export const BUYER_RETURN_ACTIONS = ['CANCEL', 'SUBMIT_SHIPMENT'] as const;
export const SELLER_RETURN_ACTIONS = [
  'ACCEPT_RETURN',
  'REJECT_AND_ESCALATE',
  'ESCALATE',
  'CONFIRM_RECEIPT',
] as const;
export const ADMIN_RETURN_DECISIONS = ['APPROVE_RETURN', 'APPROVE_REFUND', 'REJECT'] as const;
export const RETURN_EVIDENCE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const RETURN_LEDGER_KINDS = ['MOCK_CREDIT'] as const;
export const RETURN_DEADLINE_FILTERS = ['ALL', 'OVERDUE', 'DUE_SOON'] as const;

export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export type ReturnReasonCode = (typeof RETURN_REASON_CODES)[number];
export type ReturnActorType = (typeof RETURN_ACTOR_TYPES)[number];
export type BuyerReturnAction = (typeof BUYER_RETURN_ACTIONS)[number];
export type SellerReturnAction = (typeof SELLER_RETURN_ACTIONS)[number];
export type AdminReturnDecision = (typeof ADMIN_RETURN_DECISIONS)[number];
export type ReturnEvidenceMimeType = (typeof RETURN_EVIDENCE_MIME_TYPES)[number];
export type ReturnLedgerKind = (typeof RETURN_LEDGER_KINDS)[number];
export type ReturnDeadlineFilter = (typeof RETURN_DEADLINE_FILTERS)[number];
export type ReturnAction = BuyerReturnAction | SellerReturnAction | AdminReturnDecision;

export interface ReturnRequestItemInput {
  lineReference: string;
  quantity: number;
}

export interface CreateReturnRequest {
  reasonCode: ReturnReasonCode;
  description: string;
  items: ReturnRequestItemInput[];
  evidenceIds: string[];
}

export interface BuyerReturnActionRequest {
  action: BuyerReturnAction;
}

export interface SellerReturnActionRequest {
  action: SellerReturnAction;
  publicReason?: string;
}

export interface AdminReturnDecisionRequest {
  decision: AdminReturnDecision;
  publicReason: string;
  internalNote?: string;
}

export interface ReturnListQuery {
  status: ReturnStatus | 'ALL';
  deadline: ReturnDeadlineFilter;
  from: string | null;
  to: string | null;
  reference: string | null;
  limit: number;
  cursor: string | null;
}

export interface ReturnAvailableAction {
  action: ReturnAction;
  requiresPublicReason: boolean;
}

export interface ReturnEvidence {
  evidenceId: string;
  mimeType: ReturnEvidenceMimeType;
  bytes: number;
  width: number;
  height: number;
  url: string;
}

export interface StagedReturnEvidence {
  evidenceId: string;
  expiresAt: string;
}

export interface ReturnLine {
  lineReference: string;
  productName: string;
  variantName: string;
  productImageUrl: string | null;
  purchasedQuantity: number;
  requestedQuantity: number;
  payableMerchandiseMinor: number;
  refundMinor: number;
}

export interface ReturnTimelineEvent {
  id: string;
  version: number;
  previousStatus: ReturnStatus | null;
  status: ReturnStatus;
  actorType: ReturnActorType;
  occurredAt: string;
  reasonCode: string;
  publicReason: string | null;
}

export interface ReturnShipment {
  trackingCode: string;
  submittedAt: string;
  destination: { shopName: string; address: string };
}

export interface ReturnRefundOutcome {
  kind: ReturnLedgerKind;
  amountMinor: number;
  finalizedAt: string;
}

export interface ReturnDeadline {
  eligibilityAt: string;
  sellerResponseAt: string | null;
  shipmentAt: string | null;
  receiptAt: string | null;
}

export interface ReturnSummary {
  returnReference: string;
  orderReference: string;
  preview?: {
    productId: string;
    productName: string;
    productImageUrl: string | null;
    shopId: string;
    shopName: string;
  };
  status: ReturnStatus;
  version: number;
  reasonCode: ReturnReasonCode;
  refundAmountMinor: number;
  deadline: ReturnDeadline;
  updatedAt: string;
  availableActions: ReturnAvailableAction[];
}

export interface ReturnDetail extends ReturnSummary {
  currency: 'VND';
  description: string;
  lines: ReturnLine[];
  evidence: ReturnEvidence[];
  timeline: ReturnTimelineEvent[];
  shipment: ReturnShipment | null;
  refund: ReturnRefundOutcome | null;
  sellerPublicReason: string | null;
}

export interface AdminReturnDetail extends ReturnDetail {
  buyer: { id: string; displayName: string };
  shop: { id: string; name: string };
  decisions: Array<{
    id: string;
    decision: AdminReturnDecision;
    publicReason: string;
    internalNote: string | null;
    decidedAt: string;
  }>;
}

export interface ReturnListResponse {
  returnVersion: typeof RETURN_VERSION;
  items: ReturnSummary[];
  page: { limit: number; nextCursor: string | null };
}

export interface ReturnDetailResponse {
  returnVersion: typeof RETURN_VERSION;
  return: ReturnDetail;
}

export interface AdminReturnDetailResponse {
  returnVersion: typeof RETURN_VERSION;
  return: AdminReturnDetail;
}

export interface ReturnProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  invalidParameters?: string[];
  currentVersion?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, required: string[], optional: string[] = []) => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
};
const has = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && values.includes(value as T);
const instant = (value: unknown): value is string =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const money = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => money(value) && value > 0;
const control = (value: string) =>
  [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });

export function normalizeReturnText(
  value: unknown,
  min: number,
  max: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || control(value)) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length >= min && normalized.length <= max ? normalized : null;
}

export const normalizeReturnDescription = (value: unknown) =>
  normalizeReturnText(value, RETURN_DESCRIPTION_MIN_LENGTH, RETURN_DESCRIPTION_MAX_LENGTH);
export const normalizeReturnPublicReason = (value: unknown) =>
  normalizeReturnText(value, RETURN_PUBLIC_REASON_MIN_LENGTH, RETURN_PUBLIC_REASON_MAX_LENGTH);
export const normalizeReturnInternalNote = (value: unknown) =>
  normalizeReturnText(value, 0, RETURN_INTERNAL_NOTE_MAX_LENGTH);

export function parseReturnReference(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

export function parseReturnEvidenceId(value: unknown): string | null {
  return parseReturnReference(value);
}

export function parseReturnIdempotencyKey(value: unknown): string | null {
  return parseReturnReference(value);
}

export function formatReturnVersionEtag(version: number): string {
  if (!Number.isSafeInteger(version) || version < 0) throw new RangeError('Invalid return version');
  return `"return-${version}"`;
}

export function parseReturnVersionEtag(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^"return-(0|[1-9]\d*)"$/.exec(value);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) ? version : null;
}

export function parseCreateReturnRequest(value: unknown): CreateReturnRequest | null {
  if (!record(value) || !exact(value, ['reasonCode', 'description', 'items', 'evidenceIds']))
    return null;
  const description = normalizeReturnDescription(value.description);
  if (
    !has(RETURN_REASON_CODES, value.reasonCode) ||
    !description ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.evidenceIds) ||
    value.items.length === 0 ||
    value.evidenceIds.length < RETURN_EVIDENCE_MIN_ITEMS ||
    value.evidenceIds.length > RETURN_EVIDENCE_MAX_ITEMS
  )
    return null;
  const items: ReturnRequestItemInput[] = [];
  const lineIds = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || !exact(item, ['lineReference', 'quantity'])) return null;
    const lineReference = parseReturnReference(item.lineReference);
    if (!lineReference || !positive(item.quantity) || lineIds.has(lineReference)) return null;
    lineIds.add(lineReference);
    items.push({ lineReference, quantity: item.quantity });
  }
  const evidenceIds = value.evidenceIds.map(parseReturnEvidenceId);
  if (
    evidenceIds.some((id): id is null => id === null) ||
    new Set(evidenceIds).size !== evidenceIds.length
  )
    return null;
  return { reasonCode: value.reasonCode, description, items, evidenceIds: evidenceIds as string[] };
}

export function parseBuyerReturnActionRequest(value: unknown): BuyerReturnActionRequest | null {
  return record(value) && exact(value, ['action']) && has(BUYER_RETURN_ACTIONS, value.action)
    ? { action: value.action }
    : null;
}

export function parseSellerReturnActionRequest(value: unknown): SellerReturnActionRequest | null {
  if (
    !record(value) ||
    !exact(value, ['action'], ['publicReason']) ||
    !has(SELLER_RETURN_ACTIONS, value.action)
  )
    return null;
  const publicReason = normalizeReturnPublicReason(value.publicReason);
  const needsReason = value.action === 'REJECT_AND_ESCALATE' || value.action === 'ESCALATE';
  if (
    publicReason === null ||
    (needsReason && !publicReason) ||
    (!needsReason && value.publicReason !== undefined)
  )
    return null;
  return { action: value.action, ...(publicReason ? { publicReason } : {}) };
}

export function parseAdminReturnDecisionRequest(value: unknown): AdminReturnDecisionRequest | null {
  if (
    !record(value) ||
    !exact(value, ['decision', 'publicReason'], ['internalNote']) ||
    !has(ADMIN_RETURN_DECISIONS, value.decision)
  )
    return null;
  const publicReason = normalizeReturnPublicReason(value.publicReason);
  const internalNote = normalizeReturnInternalNote(value.internalNote);
  if (!publicReason || internalNote === null) return null;
  return { decision: value.decision, publicReason, ...(internalNote ? { internalNote } : {}) };
}

export function parseReturnListQuery(value: unknown): ReturnListQuery | null {
  if (
    !record(value) ||
    !exact(value, [], ['status', 'deadline', 'from', 'to', 'reference', 'limit', 'cursor']) ||
    Object.values(value).some(Array.isArray)
  )
    return null;
  const text = (field: unknown): string | undefined =>
    typeof field === 'string' ? field : undefined;
  const status = text(value.status) ?? 'ALL';
  const deadline = text(value.deadline) ?? 'ALL';
  const from = text(value.from) ?? null;
  const to = text(value.to) ?? null;
  const reference = text(value.reference) ?? null;
  const rawLimit = text(value.limit) ?? String(RETURN_DEFAULT_LIMIT);
  const cursor = text(value.cursor) ?? null;
  const limit = Number(rawLimit);
  if (
    (!has(RETURN_STATUSES, status) && status !== 'ALL') ||
    !has(RETURN_DEADLINE_FILTERS, deadline) ||
    (from !== null && !DATE.test(from)) ||
    (to !== null && !DATE.test(to)) ||
    (from !== null && to !== null && from > to) ||
    (reference !== null && !parseReturnReference(reference)) ||
    !/^[1-9]\d*$/.test(rawLimit) ||
    !Number.isSafeInteger(limit) ||
    limit > RETURN_MAX_LIMIT ||
    (cursor !== null && !CURSOR.test(cursor))
  )
    return null;
  return { status, deadline, from, to, reference, limit, cursor };
}

export function isReturnProblemDetails(value: unknown): value is ReturnProblemDetails {
  return (
    record(value) &&
    exact(
      value,
      ['type', 'title', 'status', 'detail', 'code'],
      ['invalidParameters', 'currentVersion'],
    ) &&
    typeof value.type === 'string' &&
    typeof value.title === 'string' &&
    Number.isInteger(value.status) &&
    typeof value.detail === 'string' &&
    typeof value.code === 'string' &&
    (value.invalidParameters === undefined ||
      (Array.isArray(value.invalidParameters) &&
        value.invalidParameters.every((item) => typeof item === 'string'))) &&
    (value.currentVersion === undefined ||
      (typeof value.currentVersion === 'number' &&
        Number.isSafeInteger(value.currentVersion) &&
        value.currentVersion >= 0))
  );
}

function isDeadline(value: unknown): value is ReturnDeadline {
  return (
    record(value) &&
    exact(value, ['eligibilityAt', 'sellerResponseAt', 'shipmentAt', 'receiptAt']) &&
    instant(value.eligibilityAt) &&
    [value.sellerResponseAt, value.shipmentAt, value.receiptAt].every(
      (item) => item === null || instant(item),
    )
  );
}

function isAvailableAction(value: unknown): value is ReturnAvailableAction {
  return (
    record(value) &&
    exact(value, ['action', 'requiresPublicReason']) &&
    (has(BUYER_RETURN_ACTIONS, value.action) ||
      has(SELLER_RETURN_ACTIONS, value.action) ||
      has(ADMIN_RETURN_DECISIONS, value.action)) &&
    typeof value.requiresPublicReason === 'boolean'
  );
}

function isReturnSummaryShape(value: unknown, extra: string[] = []): value is ReturnSummary {
  const preview =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).preview
      : undefined;
  return (
    record(value) &&
    exact(
      value,
      [
        'returnReference',
        'orderReference',
        'status',
        'version',
        'reasonCode',
        'refundAmountMinor',
        'deadline',
        'updatedAt',
        'availableActions',
      ],
      ['preview', ...extra],
    ) &&
    !!parseReturnReference(value.returnReference) &&
    !!parseReturnReference(value.orderReference) &&
    (preview === undefined || isReturnPreview(preview)) &&
    has(RETURN_STATUSES, value.status) &&
    typeof value.version === 'number' &&
    Number.isSafeInteger(value.version) &&
    value.version >= 0 &&
    has(RETURN_REASON_CODES, value.reasonCode) &&
    money(value.refundAmountMinor) &&
    isDeadline(value.deadline) &&
    instant(value.updatedAt) &&
    Array.isArray(value.availableActions) &&
    value.availableActions.every(isAvailableAction)
  );
}

function isReturnPreview(value: unknown): value is ReturnSummary['preview'] {
  if (!record(value)) return false;
  return (
    exact(value, ['productId', 'productName', 'productImageUrl', 'shopId', 'shopName']) &&
    !!parseReturnReference(value.productId) &&
    typeof value.productName === 'string' &&
    value.productName.length > 0 &&
    (value.productImageUrl === null || typeof value.productImageUrl === 'string') &&
    !!parseReturnReference(value.shopId) &&
    typeof value.shopName === 'string' &&
    value.shopName.length > 0
  );
}

export function isReturnSummary(value: unknown): value is ReturnSummary {
  return isReturnSummaryShape(value);
}

export function isReturnListResponse(value: unknown): value is ReturnListResponse {
  return (
    record(value) &&
    exact(value, ['returnVersion', 'items', 'page']) &&
    value.returnVersion === RETURN_VERSION &&
    Array.isArray(value.items) &&
    value.items.every(isReturnSummary) &&
    record(value.page) &&
    exact(value.page, ['limit', 'nextCursor']) &&
    typeof value.page.limit === 'number' &&
    Number.isSafeInteger(value.page.limit) &&
    value.page.limit > 0 &&
    value.page.limit <= RETURN_MAX_LIMIT &&
    (value.page.nextCursor === null ||
      (typeof value.page.nextCursor === 'string' && CURSOR.test(value.page.nextCursor)))
  );
}

function isReturnLine(value: unknown): value is ReturnLine {
  return (
    record(value) &&
    exact(value, [
      'lineReference',
      'productName',
      'variantName',
      'productImageUrl',
      'purchasedQuantity',
      'requestedQuantity',
      'payableMerchandiseMinor',
      'refundMinor',
    ]) &&
    !!parseReturnReference(value.lineReference) &&
    typeof value.productName === 'string' &&
    value.productName.length > 0 &&
    typeof value.variantName === 'string' &&
    (value.productImageUrl === null || typeof value.productImageUrl === 'string') &&
    positive(value.purchasedQuantity) &&
    positive(value.requestedQuantity) &&
    value.requestedQuantity <= value.purchasedQuantity &&
    money(value.payableMerchandiseMinor) &&
    money(value.refundMinor) &&
    value.refundMinor <= value.payableMerchandiseMinor
  );
}

function isReturnEvidence(value: unknown): value is ReturnEvidence {
  return (
    record(value) &&
    exact(value, ['evidenceId', 'mimeType', 'bytes', 'width', 'height', 'url']) &&
    !!parseReturnEvidenceId(value.evidenceId) &&
    has(RETURN_EVIDENCE_MIME_TYPES, value.mimeType) &&
    positive(value.bytes) &&
    value.bytes <= RETURN_EVIDENCE_MAX_BYTES &&
    positive(value.width) &&
    value.width <= RETURN_EVIDENCE_MAX_DIMENSION &&
    positive(value.height) &&
    value.height <= RETURN_EVIDENCE_MAX_DIMENSION &&
    typeof value.url === 'string' &&
    value.url.startsWith('/api/v1/return-evidence/')
  );
}

function isReturnTimelineEvent(value: unknown): value is ReturnTimelineEvent {
  return (
    record(value) &&
    exact(value, [
      'id',
      'version',
      'previousStatus',
      'status',
      'actorType',
      'occurredAt',
      'reasonCode',
      'publicReason',
    ]) &&
    !!parseReturnReference(value.id) &&
    typeof value.version === 'number' &&
    Number.isSafeInteger(value.version) &&
    value.version >= 0 &&
    (value.previousStatus === null || has(RETURN_STATUSES, value.previousStatus)) &&
    has(RETURN_STATUSES, value.status) &&
    has(RETURN_ACTOR_TYPES, value.actorType) &&
    instant(value.occurredAt) &&
    typeof value.reasonCode === 'string' &&
    (value.publicReason === null || typeof value.publicReason === 'string')
  );
}

function isReturnShipment(value: unknown): value is ReturnShipment {
  return (
    record(value) &&
    exact(value, ['trackingCode', 'submittedAt', 'destination']) &&
    typeof value.trackingCode === 'string' &&
    /^MOCK-[A-F0-9]{16}$/.test(value.trackingCode) &&
    instant(value.submittedAt) &&
    record(value.destination) &&
    exact(value.destination, ['shopName', 'address']) &&
    typeof value.destination.shopName === 'string' &&
    typeof value.destination.address === 'string'
  );
}

function isRefund(value: unknown): value is ReturnRefundOutcome {
  return (
    record(value) &&
    exact(value, ['kind', 'amountMinor', 'finalizedAt']) &&
    has(RETURN_LEDGER_KINDS, value.kind) &&
    money(value.amountMinor) &&
    instant(value.finalizedAt)
  );
}

function isReturnDetailShape(value: unknown, extra: string[] = []): value is ReturnDetail {
  const fields = [
    'currency',
    'description',
    'lines',
    'evidence',
    'timeline',
    'shipment',
    'refund',
    'sellerPublicReason',
  ];
  if (
    !record(value) ||
    !isReturnSummaryShape(value, [...fields, ...extra]) ||
    !exact(
      value,
      [
        'returnReference',
        'orderReference',
        'status',
        'version',
        'reasonCode',
        'refundAmountMinor',
        'deadline',
        'updatedAt',
        'availableActions',
        'currency',
        'description',
        'lines',
        'evidence',
        'timeline',
        'shipment',
        'refund',
        'sellerPublicReason',
      ],
      ['preview', ...extra],
    )
  )
    return false;
  return (
    value.currency === 'VND' &&
    typeof value.description === 'string' &&
    Array.isArray(value.lines) &&
    value.lines.length > 0 &&
    value.lines.every(isReturnLine) &&
    Array.isArray(value.evidence) &&
    value.evidence.length >= RETURN_EVIDENCE_MIN_ITEMS &&
    value.evidence.length <= RETURN_EVIDENCE_MAX_ITEMS &&
    value.evidence.every(isReturnEvidence) &&
    Array.isArray(value.timeline) &&
    value.timeline.length > 0 &&
    value.timeline.every(isReturnTimelineEvent) &&
    value.timeline.every((event, index) => event.version === index) &&
    (value.shipment === null || isReturnShipment(value.shipment)) &&
    (value.refund === null || isRefund(value.refund)) &&
    (value.sellerPublicReason === null || typeof value.sellerPublicReason === 'string')
  );
}

export function isReturnDetail(value: unknown): value is ReturnDetail {
  return isReturnDetailShape(value);
}

export function isReturnDetailResponse(value: unknown): value is ReturnDetailResponse {
  return (
    record(value) &&
    exact(value, ['returnVersion', 'return']) &&
    value.returnVersion === RETURN_VERSION &&
    isReturnDetail(value.return)
  );
}

export function isAdminReturnDetailResponse(value: unknown): value is AdminReturnDetailResponse {
  if (
    !record(value) ||
    !exact(value, ['returnVersion', 'return']) ||
    value.returnVersion !== RETURN_VERSION ||
    !isReturnDetailShape(value.return, ['buyer', 'shop', 'decisions'])
  )
    return false;
  const detail = value.return as AdminReturnDetail;
  return (
    record(detail.buyer) &&
    exact(detail.buyer, ['id', 'displayName']) &&
    !!parseReturnReference(detail.buyer.id) &&
    typeof detail.buyer.displayName === 'string' &&
    record(detail.shop) &&
    exact(detail.shop, ['id', 'name']) &&
    !!parseReturnReference(detail.shop.id) &&
    typeof detail.shop.name === 'string' &&
    Array.isArray(detail.decisions) &&
    detail.decisions.every(
      (decision) =>
        record(decision) &&
        exact(decision, ['id', 'decision', 'publicReason', 'internalNote', 'decidedAt']) &&
        !!parseReturnReference(decision.id) &&
        has(ADMIN_RETURN_DECISIONS, decision.decision) &&
        typeof decision.publicReason === 'string' &&
        (decision.internalNote === null || typeof decision.internalNote === 'string') &&
        instant(decision.decidedAt),
    )
  );
}

export function returnActionsFor(
  status: ReturnStatus,
  actor: ReturnActorType,
): ReturnAvailableAction[] {
  const action = (name: ReturnAction, requiresPublicReason = false): ReturnAvailableAction => ({
    action: name,
    requiresPublicReason,
  });
  if (actor === 'BUYER') {
    if (status === 'REQUESTED') return [action('CANCEL')];
    if (status === 'AWAITING_RETURN') return [action('SUBMIT_SHIPMENT')];
  }
  if (actor === 'SELLER') {
    if (status === 'REQUESTED')
      return [
        action('ACCEPT_RETURN'),
        action('REJECT_AND_ESCALATE', true),
        action('ESCALATE', true),
      ];
    if (status === 'IN_TRANSIT') return [action('CONFIRM_RECEIPT'), action('ESCALATE', true)];
  }
  if (actor === 'ADMIN' && status === 'ESCALATED')
    return [action('APPROVE_RETURN', true), action('APPROVE_REFUND', true), action('REJECT', true)];
  return [];
}
