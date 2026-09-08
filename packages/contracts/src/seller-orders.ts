import type { CheckoutAddressSnapshot, PurchasePaymentStatus, ShopOrderStatus } from './checkout';
import type { ShippingBreakdown, ShippingServiceCode } from './pricing';

export const SELLER_ORDER_VERSION = 'seller-orders-v1' as const;
export const SELLER_ORDER_PAGE_SIZE = 10;
export const SELLER_ORDER_NOTE_MAX_LENGTH = 500;
export const SELLER_ORDER_QUEUE_FILTERS = [
  'ALL',
  'PENDING_CONFIRMATION',
  'AWAITING_PICKUP',
  'SHIPPING',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REFUND',
] as const;
export const SELLER_FULFILLMENT_STATES = [
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'HANDED_OFF',
  'REJECTED',
  'CANCELLED',
] as const;
export const SELLER_ORDER_FULFILLMENT_FILTERS = ['ALL', ...SELLER_FULFILLMENT_STATES] as const;
export const SELLER_ORDER_ACTIONS = [
  'CONFIRM',
  'START_PREPARING',
  'MARK_READY_FOR_PICKUP',
  'HAND_OFF',
  'REJECT',
] as const;
export const SELLER_ORDER_REJECTION_REASONS = [
  'OUT_OF_STOCK',
  'DAMAGED_OR_DEFECTIVE',
  'PRICE_OR_LISTING_ERROR',
  'CANNOT_FULFILL',
  'OTHER',
] as const;

export type SellerOrderQueueFilter = (typeof SELLER_ORDER_QUEUE_FILTERS)[number];
export type SellerOrderFulfillmentState = (typeof SELLER_FULFILLMENT_STATES)[number];
export type SellerOrderFulfillmentFilter = (typeof SELLER_ORDER_FULFILLMENT_FILTERS)[number];
export type SellerOrderAction = (typeof SELLER_ORDER_ACTIONS)[number];
export type SellerOrderRejectionReason = (typeof SELLER_ORDER_REJECTION_REASONS)[number];

export interface SellerOrderQueueQuery {
  status: SellerOrderQueueFilter;
  fulfillment: SellerOrderFulfillmentFilter;
  from: string | null;
  to: string | null;
  orderReference: string | null;
  page: number;
}

export interface SellerOrderActionRequest {
  action: SellerOrderAction;
  reasonCode?: SellerOrderRejectionReason;
  reasonNote?: string;
}

export interface SellerOrderAvailableAction {
  action: SellerOrderAction;
  reasonCodes: SellerOrderRejectionReason[];
}

export interface SellerOrderLine {
  lineId: string;
  productId: string;
  variantId: string;
  productName: string;
  productImageUrl: string | null;
  variantName: string;
  variantSku: string;
  quantity: number;
  unitPriceMinor: number;
  payableLineMinor: number;
  weightGrams: number;
}

export interface SellerOrderDeadline {
  confirmationAt: string;
  handoffAt: string | null;
  confirmationOverdue: boolean;
  handoffOverdue: boolean;
}

export interface SellerOrderFulfillmentEvent {
  id: string;
  previousState: SellerOrderFulfillmentState | null;
  state: SellerOrderFulfillmentState;
  version: number;
  actorType: 'SYSTEM' | 'SELLER' | 'BUYER' | 'ADMIN';
  actorUserId: string | null;
  action: SellerOrderAction | 'ORDER_CREATED' | 'BUYER_CANCELLED';
  reasonCode: string;
  reasonNote: string | null;
  late: boolean;
  occurredAt: string;
}

export interface SellerOrderShipmentEvent {
  status:
    | 'HANDED_OFF'
    | 'REGISTRATION_PENDING'
    | 'REGISTRATION_FAILED'
    | 'CREATED'
    | 'ACCEPTED'
    | 'IN_TRANSIT'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERY_FAILED'
    | 'RETURN_IN_TRANSIT'
    | 'DELIVERED'
    | 'RETURNED';
  previousStatus?: SellerOrderShipmentEvent['status'] | null;
  shipmentVersion?: number;
  externalEventId?: string | null;
  publicReason?: string | null;
  carrierOccurredAt?: string | null;
  occurredAt: string;
}

export interface SellerOrderShipment {
  id: string;
  provider: 'MOCK' | 'DEMO_CARRIER';
  version?: string;
  trackingCode: string;
  status: SellerOrderShipmentEvent['status'];
  service: ShippingServiceCode;
  handedOffAt: string;
  registeredAt?: string | null;
  deliveredAt?: string | null;
  returnedAt?: string | null;
  lastUpdatedAt?: string | null;
  events: SellerOrderShipmentEvent[];
}

export interface SellerOrderSummary {
  orderReference: string;
  purchaseReference: string;
  shopId: string;
  status: ShopOrderStatus;
  paymentStatus: PurchasePaymentStatus;
  fulfillmentState: SellerOrderFulfillmentState;
  orderVersion: number;
  fulfillmentVersion: number;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  itemQuantity: number;
  payableTotalMinor: number;
  shippingService: ShippingServiceCode;
  deadline: SellerOrderDeadline;
  lines: SellerOrderLine[];
  availableActions: SellerOrderAvailableAction[];
  returnInfo?: {
    returnReference: string;
    status:
      | 'REQUESTED'
      | 'AWAITING_RETURN'
      | 'IN_TRANSIT'
      | 'ESCALATED'
      | 'CANCELLED'
      | 'EXPIRED'
      | 'REJECTED'
      | 'REFUNDED';
  };
}

export interface SellerOrderDetail {
  summary: SellerOrderSummary;
  shop: { id: string; slug: string; name: string; pickupAddress: SellerOrderAddress | null };
  buyerNote: string;
  address: SellerOrderAddress;
  shipping: ShippingBreakdown;
  listSubtotalMinor: number;
  productDiscountMinor: number;
  merchandiseSubtotalMinor: number;
  voucherDiscountMinor: number;
  shippingPayableMinor: number;
  payableTotalMinor: number;
  fulfillmentTimeline: SellerOrderFulfillmentEvent[];
  orderTimeline: SellerOrderOrderTimelineEvent[];
  shipment: SellerOrderShipment | null;
}

export type SellerOrderAddress = Omit<CheckoutAddressSnapshot, 'id' | 'label'>;

export interface SellerOrderOrderTimelineEvent {
  id: string;
  previousStatus: ShopOrderStatus | null;
  status: ShopOrderStatus;
  orderVersion: number;
  actorType: 'SYSTEM' | 'SELLER' | 'BUYER' | 'ADMIN';
  actorUserId: string | null;
  reasonCode: string;
  reasonNote: string | null;
  occurredAt: string;
}

export interface SellerOrderListResponse {
  sellerOrderVersion: typeof SELLER_ORDER_VERSION;
  items: SellerOrderSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface SellerOrderDetailResponse {
  sellerOrderVersion: typeof SELLER_ORDER_VERSION;
  currency: 'VND';
  order: SellerOrderDetail;
}

export interface SellerOrderProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
  currentOrderVersion?: number;
  currentFulfillmentVersion?: number;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const exact = (value: Record<string, unknown>, required: string[], optional: string[] = []) => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
};
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const isSafeNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isInstant = (value: unknown): value is string =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const hasValue = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && values.includes(value as T);

export function normalizeSellerOrderNote(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || [...value].some((char) => char.charCodeAt(0) < 32)) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= SELLER_ORDER_NOTE_MAX_LENGTH ? normalized : null;
}

export function parseSellerOrderQueueQuery(value: unknown): SellerOrderQueueQuery | null {
  if (
    !record(value) ||
    !exact(value, [], ['status', 'fulfillment', 'from', 'to', 'orderReference', 'page'])
  )
    return null;
  if (Object.values(value).some((item) => Array.isArray(item))) return null;
  const one = (item: unknown) => (typeof item === 'string' ? item : undefined);
  const status = one(value.status) ?? 'ALL';
  const fulfillment = one(value.fulfillment) ?? 'ALL';
  const rawPage = one(value.page) ?? '1';
  const from = one(value.from) ?? null;
  const to = one(value.to) ?? null;
  const orderReference = one(value.orderReference) ?? null;
  const page = Number(rawPage);
  if (
    !hasValue(SELLER_ORDER_QUEUE_FILTERS, status) ||
    !hasValue(SELLER_ORDER_FULFILLMENT_FILTERS, fulfillment) ||
    !/^[1-9]\d*$/.test(rawPage) ||
    !Number.isSafeInteger(page)
  )
    return null;
  if (
    (from !== null && !date.test(from)) ||
    (to !== null && !date.test(to)) ||
    (from !== null && to !== null && from > to) ||
    (orderReference !== null && !isUuid(orderReference))
  )
    return null;
  return { status, fulfillment, from, to, orderReference, page };
}

export function parseSellerOrderReference(value: unknown): string | null {
  return isUuid(value) ? value : null;
}

export function formatSellerOrderVersionEtag(
  orderVersion: number,
  fulfillmentVersion: number,
): string {
  if (!isSafeNonNegative(orderVersion) || !isSafeNonNegative(fulfillmentVersion))
    throw new RangeError('Invalid seller order version');
  return `"seller-order-${orderVersion}-${fulfillmentVersion}"`;
}

export function parseSellerOrderVersionEtag(
  value: unknown,
): { orderVersion: number; fulfillmentVersion: number } | null {
  if (typeof value !== 'string') return null;
  const match = /^"seller-order-(0|[1-9]\d*)-(0|[1-9]\d*)"$/.exec(value);
  if (!match) return null;
  const orderVersion = Number(match[1]);
  const fulfillmentVersion = Number(match[2]);
  return isSafeNonNegative(orderVersion) && isSafeNonNegative(fulfillmentVersion)
    ? { orderVersion, fulfillmentVersion }
    : null;
}

export function parseSellerOrderIdempotencyKey(value: unknown): string | null {
  return typeof value === 'string' && uuid.test(value) ? value : null;
}

export function parseSellerOrderActionRequest(value: unknown): SellerOrderActionRequest | null {
  if (
    !record(value) ||
    !exact(value, ['action'], ['reasonCode', 'reasonNote']) ||
    !hasValue(SELLER_ORDER_ACTIONS, value.action)
  )
    return null;
  const reasonCode = value.reasonCode;
  const note = normalizeSellerOrderNote(value.reasonNote);
  if (
    note === null ||
    (reasonCode !== undefined && !hasValue(SELLER_ORDER_REJECTION_REASONS, reasonCode)) ||
    (value.action === 'REJECT' && reasonCode === undefined)
  )
    return null;
  if (value.action !== 'REJECT' && (reasonCode !== undefined || value.reasonNote !== undefined))
    return null;
  if (value.action === 'REJECT' && reasonCode === 'OTHER' && !note) return null;
  return {
    action: value.action,
    ...(reasonCode === undefined ? {} : { reasonCode }),
    ...(note && note.length > 0 ? { reasonNote: note } : {}),
  };
}

export function isSellerOrderSummary(value: unknown): value is SellerOrderSummary {
  if (
    !record(value) ||
    !exact(
      value,
      [
        'orderReference',
        'purchaseReference',
        'shopId',
        'status',
        'paymentStatus',
        'fulfillmentState',
        'orderVersion',
        'fulfillmentVersion',
        'createdAt',
        'updatedAt',
        'lineCount',
        'itemQuantity',
        'payableTotalMinor',
        'shippingService',
        'deadline',
        'lines',
        'availableActions',
      ],
      ['returnInfo'],
    )
  )
    return false;
  return (
    isUuid(value.orderReference) &&
    isUuid(value.purchaseReference) &&
    isUuid(value.shopId) &&
    hasValue(
      [
        'PENDING_CONFIRMATION',
        'AWAITING_PICKUP',
        'SHIPPING',
        'DELIVERED',
        'CANCELLED',
        'RETURN_REQUESTED',
        'RETURNED',
        'REFUNDED',
      ] as const,
      value.status,
    ) &&
    value.paymentStatus === 'UNPAID' &&
    hasValue(SELLER_FULFILLMENT_STATES, value.fulfillmentState) &&
    isSafeNonNegative(value.orderVersion) &&
    isSafeNonNegative(value.fulfillmentVersion) &&
    isInstant(value.createdAt) &&
    isInstant(value.updatedAt) &&
    isSafeNonNegative(value.lineCount) &&
    value.lineCount > 0 &&
    isSafeNonNegative(value.itemQuantity) &&
    value.itemQuantity > 0 &&
    isSafeNonNegative(value.payableTotalMinor) &&
    hasValue(['ECONOMY', 'STANDARD', 'EXPRESS'] as const, value.shippingService) &&
    record(value.deadline) &&
    exact(value.deadline, [
      'confirmationAt',
      'handoffAt',
      'confirmationOverdue',
      'handoffOverdue',
    ]) &&
    isInstant(value.deadline.confirmationAt) &&
    (value.deadline.handoffAt === null || isInstant(value.deadline.handoffAt)) &&
    typeof value.deadline.confirmationOverdue === 'boolean' &&
    typeof value.deadline.handoffOverdue === 'boolean' &&
    Array.isArray(value.lines) &&
    value.lines.length === value.lineCount &&
    Array.isArray(value.availableActions) &&
    value.availableActions.every(
      (action) =>
        record(action) &&
        exact(action, ['action', 'reasonCodes']) &&
        hasValue(SELLER_ORDER_ACTIONS, action.action) &&
        Array.isArray(action.reasonCodes) &&
        action.reasonCodes.every((reason) => hasValue(SELLER_ORDER_REJECTION_REASONS, reason)),
    ) &&
    (value.returnInfo === undefined ||
      (record(value.returnInfo) &&
        exact(value.returnInfo, ['returnReference', 'status']) &&
        isUuid(value.returnInfo.returnReference) &&
        hasValue(
          [
            'REQUESTED',
            'AWAITING_RETURN',
            'IN_TRANSIT',
            'ESCALATED',
            'CANCELLED',
            'EXPIRED',
            'REJECTED',
            'REFUNDED',
          ] as const,
          value.returnInfo.status,
        )))
  );
}

export function isSellerOrderListResponse(value: unknown): value is SellerOrderListResponse {
  return (
    record(value) &&
    exact(value, ['sellerOrderVersion', 'items', 'page', 'pageSize', 'totalItems', 'totalPages']) &&
    value.sellerOrderVersion === SELLER_ORDER_VERSION &&
    Array.isArray(value.items) &&
    value.items.every(isSellerOrderSummary) &&
    typeof value.page === 'number' && Number.isSafeInteger(value.page) && value.page >= 1 &&
    value.pageSize === SELLER_ORDER_PAGE_SIZE &&
    isSafeNonNegative(value.totalItems) &&
    isSafeNonNegative(value.totalPages)
  );
}

export function isSellerOrderDetailResponse(value: unknown): value is SellerOrderDetailResponse {
  return (
    record(value) &&
    exact(value, ['sellerOrderVersion', 'currency', 'order']) &&
    value.sellerOrderVersion === SELLER_ORDER_VERSION &&
    value.currency === 'VND' &&
    record(value.order) &&
    exact(value.order, [
      'summary',
      'shop',
      'buyerNote',
      'address',
      'shipping',
      'listSubtotalMinor',
      'productDiscountMinor',
      'merchandiseSubtotalMinor',
      'voucherDiscountMinor',
      'shippingPayableMinor',
      'payableTotalMinor',
      'fulfillmentTimeline',
      'orderTimeline',
      'shipment',
    ]) &&
    isSellerOrderSummary(value.order.summary) &&
    record(value.order.shop) &&
    record(value.order.address) &&
    Array.isArray(value.order.fulfillmentTimeline) &&
    Array.isArray(value.order.orderTimeline) &&
    (value.order.shipment === null || record(value.order.shipment))
  );
}
