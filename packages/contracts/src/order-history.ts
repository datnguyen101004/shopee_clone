import {
  CHECKOUT_IDEMPOTENCY_KEY_PATTERN,
  PURCHASE_PAYMENT_STATUSES,
  SHOP_ORDER_STATUSES,
  type CheckoutAddressSnapshot,
  type CheckoutPreviewLine,
  type PurchasePaymentStatus,
  type ShopOrderStatus,
  type InventoryHoldStatus,
} from './checkout';
import { isShippingBreakdown, type ShippingBreakdown, type ShippingServiceCode } from './pricing';
import type { ReviewEligibility } from './reviews';

export const ORDER_HISTORY_VERSION = 'order-history-v1' as const;
export const ORDER_LIST_DEFAULT_LIMIT = 20;
export const ORDER_LIST_MAX_LIMIT = 50;
export const ORDER_LIST_FILTERS = [
  'ALL',
  'PENDING_PAYMENT',
  'PENDING_CONFIRMATION',
  'SHIPPING',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REFUND',
] as const;
export const ORDER_TIMELINE_ACTORS = ['SYSTEM', 'BUYER', 'SELLER', 'ADMIN'] as const;
export const ORDER_CANCELLATION_REASON_CODES = [
  'CHANGE_ADDRESS',
  'CHANGE_PRODUCT',
  'FOUND_BETTER_PRICE',
  'NO_LONGER_NEEDED',
  'OTHER',
] as const;
export const ORDER_CANCELLATION_NOTE_MAX_LENGTH = 500;

export type BuyerOrderListFilter = (typeof ORDER_LIST_FILTERS)[number];
export type OrderTimelineActor = (typeof ORDER_TIMELINE_ACTORS)[number];
export type OrderCancellationReasonCode = (typeof ORDER_CANCELLATION_REASON_CODES)[number];

export interface BuyerOrderListQuery {
  filter: BuyerOrderListFilter;
  limit: number;
  cursor: string | null;
}

export interface CancelOrderRequest {
  reasonCode: OrderCancellationReasonCode;
  reasonNote?: string;
}

export interface BuyerOrderCancellationCapability {
  allowed: boolean;
  reasonCodes: OrderCancellationReasonCode[];
}

/** Server-authoritative post-delivery return capability. */
export interface BuyerOrderReturnCapability {
  allowed: boolean;
  deadlineAt: string | null;
  returnReference: string | null;
}

export interface BuyerOrderInventoryHold {
  status: InventoryHoldStatus;
  expiresAt: string | null;
  terminalReason: string | null;
}

export interface BuyerOrderVoucherAllocation {
  lineId: string | null;
  kind: 'MERCHANDISE' | 'SHIPPING';
  amountMinor: number;
}

export interface BuyerOrderVoucherSnapshot {
  code: string;
  name: string;
  slot: 'PLATFORM' | 'SHOP' | 'FREE_SHIPPING';
  issuer: 'PLATFORM' | 'SHOP';
  benefitType: 'FIXED_AMOUNT' | 'PERCENTAGE' | 'FREE_SHIPPING';
  merchandiseDiscountMinor: number;
  shippingDiscountMinor: number;
  discountMinor: number;
  allocations: BuyerOrderVoucherAllocation[];
}

export interface BuyerOrderShipmentEvent {
  status: string;
  previousStatus: string | null;
  shipmentVersion: number;
  externalEventId: string | null;
  publicReason: string | null;
  carrierOccurredAt: string | null;
  occurredAt: string;
}

export interface BuyerOrderShipment {
  provider: 'MOCK' | 'DEMO_CARRIER';
  version: string | null;
  trackingCode: string;
  status: string;
  service: ShippingServiceCode;
  handedOffAt: string;
  registeredAt: string | null;
  deliveredAt: string | null;
  returnedAt: string | null;
  lastUpdatedAt: string | null;
  events: BuyerOrderShipmentEvent[];
}

export interface BuyerOrderTimelineEvent {
  id: string;
  previousStatus: ShopOrderStatus | null;
  status: ShopOrderStatus;
  orderVersion: number;
  actorType: OrderTimelineActor;
  actorUserId: string | null;
  reasonCode: string;
  reasonNote: string | null;
  occurredAt: string;
}

export interface BuyerOrderSummary {
  orderReference: string;
  purchaseReference: string;
  status: ShopOrderStatus;
  paymentStatus: PurchasePaymentStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  shop: { id: string; slug: string; name: string };
  note: string;
  lines: BuyerOrderLine[];
  shipping: ShippingBreakdown;
  shipment?: BuyerOrderShipment | null;
  listSubtotalMinor: number;
  productDiscountMinor: number;
  merchandiseSubtotalMinor: number;
  shopVoucherDiscountMinor: number;
  platformVoucherDiscountMinor: number;
  merchandiseVoucherDiscountMinor: number;
  shippingVoucherDiscountMinor: number;
  voucherDiscountMinor: number;
  shippingPayableMinor: number;
  payableTotalMinor: number;
  cancellation: BuyerOrderCancellationCapability;
  returnCapability?: BuyerOrderReturnCapability;
  inventoryHold?: BuyerOrderInventoryHold;
}

export interface BuyerOrderLine extends CheckoutPreviewLine {
  productAvailable: boolean;
  review?: ReviewEligibility;
}

export interface BuyerOrderListResponse {
  orderHistoryVersion: typeof ORDER_HISTORY_VERSION;
  items: BuyerOrderSummary[];
  page: { limit: number; nextCursor: string | null };
}

export interface BuyerOrderDetailResponse {
  orderHistoryVersion: typeof ORDER_HISTORY_VERSION;
  currency: 'VND';
  order: BuyerOrderSummary;
  address: CheckoutAddressSnapshot;
  vouchers: BuyerOrderVoucherSnapshot[];
  timeline: BuyerOrderTimelineEvent[];
}

export interface OrderHistoryProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
  currentVersion?: number;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const cursorPattern = /^[A-Za-z0-9_-]{1,2048}$/;
const problemType = /^https:\/\/shopee-clone\.local\/problems\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const statuses = new Set<string>(SHOP_ORDER_STATUSES);
const paymentStatuses = new Set<string>(PURCHASE_PAYMENT_STATUSES);
const filters = new Set<string>(ORDER_LIST_FILTERS);
const actors = new Set<string>(ORDER_TIMELINE_ACTORS);
const cancellationReasons = new Set<string>(ORDER_CANCELLATION_REASON_CODES);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function exact(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

const isUuid = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const isMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isPositive = (value: unknown): value is number => isMoney(value) && value > 0;
const isText = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum;

function isInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function containsControl(value: string): boolean {
  return [...value].some((character) => {
    const point = character.codePointAt(0)!;
    return point < 32 || point === 127;
  });
}

export function normalizeOrderCancellationNote(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || containsControl(value)) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= ORDER_CANCELLATION_NOTE_MAX_LENGTH ? normalized : null;
}

export function parseBuyerOrderListQuery(value: unknown): BuyerOrderListQuery | null {
  if (!isRecord(value) || !exact(value, [], ['filter', 'limit', 'cursor'])) return null;
  const rawFilter = value.filter === undefined ? 'ALL' : value.filter;
  const filter = rawFilter === 'AWAITING_PICKUP' ? 'SHIPPING' : rawFilter;
  const rawLimit = value.limit === undefined ? `${ORDER_LIST_DEFAULT_LIMIT}` : value.limit;
  if (
    typeof filter !== 'string' ||
    !filters.has(filter) ||
    typeof rawLimit !== 'string' ||
    !/^[1-9][0-9]*$/.test(rawLimit)
  )
    return null;
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit > ORDER_LIST_MAX_LIMIT) return null;
  if (!(
    value.cursor === undefined ||
    (typeof value.cursor === 'string' && cursorPattern.test(value.cursor))
  )) {
    return null;
  }
  return {
    filter: filter as BuyerOrderListFilter,
    limit,
    cursor: (value.cursor as string | undefined) ?? null,
  };
}

export function parseCanonicalOrderReference(value: unknown): string | null {
  return isUuid(value) ? value : null;
}

export function parseOrderVersionEtag(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^"order-(0|[1-9][0-9]*)"$/.exec(value);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) ? version : null;
}

export function formatOrderVersionEtag(version: number): string {
  if (!Number.isSafeInteger(version) || version < 0) throw new RangeError('Invalid order version');
  return `"order-${version}"`;
}

export function parseOrderIdempotencyKey(value: unknown): string | null {
  return typeof value === 'string' && CHECKOUT_IDEMPOTENCY_KEY_PATTERN.test(value) ? value : null;
}

export function parseCancelOrderRequest(value: unknown): CancelOrderRequest | null {
  if (!isRecord(value) || !exact(value, ['reasonCode'], ['reasonNote'])) return null;
  if (typeof value.reasonCode !== 'string' || !cancellationReasons.has(value.reasonCode))
    return null;
  const note = normalizeOrderCancellationNote(value.reasonNote);
  if (note === null || (value.reasonCode === 'OTHER' && !note)) return null;
  return {
    reasonCode: value.reasonCode as OrderCancellationReasonCode,
    ...(note === undefined || note.length === 0 ? {} : { reasonNote: note }),
  };
}

function isLine(value: unknown): value is BuyerOrderLine {
  if (
    !isRecord(value) ||
    !exact(
      value,
      [
        'lineId',
        'productId',
        'variantId',
        'quantity',
        'unitWeightGrams',
        'shipmentWeightGrams',
        'listUnitPriceMinor',
        'sellingUnitPriceMinor',
        'listSubtotalMinor',
        'productDiscountMinor',
        'merchandiseSubtotalMinor',
        'shopVoucherDiscountMinor',
        'platformVoucherDiscountMinor',
        'merchandiseVoucherDiscountMinor',
        'payableMerchandiseMinor',
        'productName',
        'productImageUrl',
        'productAvailable',
        'variantName',
        'variantSku',
      ],
      ['review'],
    )
  )
    return false;
  const line = value as unknown as BuyerOrderLine;
  const money = [
    line.listUnitPriceMinor,
    line.sellingUnitPriceMinor,
    line.listSubtotalMinor,
    line.productDiscountMinor,
    line.merchandiseSubtotalMinor,
    line.shopVoucherDiscountMinor,
    line.platformVoucherDiscountMinor,
    line.merchandiseVoucherDiscountMinor,
    line.payableMerchandiseMinor,
  ];
  return (
    isUuid(line.lineId) &&
    isUuid(line.productId) &&
    isUuid(line.variantId) &&
    isPositive(line.quantity) &&
    isPositive(line.unitWeightGrams) &&
    isPositive(line.shipmentWeightGrams) &&
    money.every(isMoney) &&
    isText(line.productName, 240) &&
    (line.productImageUrl === null || isText(line.productImageUrl, 2048)) &&
    typeof line.productAvailable === 'boolean' &&
    isText(line.variantName, 160) &&
    isText(line.variantSku, 80) &&
    line.shipmentWeightGrams === line.unitWeightGrams * line.quantity &&
    line.listSubtotalMinor === line.listUnitPriceMinor * line.quantity &&
    line.merchandiseSubtotalMinor === line.sellingUnitPriceMinor * line.quantity &&
    line.productDiscountMinor === line.listSubtotalMinor - line.merchandiseSubtotalMinor &&
    line.merchandiseVoucherDiscountMinor ===
      line.shopVoucherDiscountMinor + line.platformVoucherDiscountMinor &&
    line.payableMerchandiseMinor ===
      line.merchandiseSubtotalMinor - line.merchandiseVoucherDiscountMinor &&
    (line.review === undefined ||
      (isRecord(line.review) &&
        exact(line.review, ['state', 'reviewId']) &&
        ['ELIGIBLE', 'REVIEWED', 'INELIGIBLE'].includes(String(line.review.state)) &&
        (line.review.reviewId === null || isUuid(line.review.reviewId)) &&
        (line.review.state === 'REVIEWED') === (line.review.reviewId !== null)))
  );
}

function isCancellation(value: unknown): value is BuyerOrderCancellationCapability {
  if (
    !isRecord(value) ||
    !exact(value, ['allowed', 'reasonCodes']) ||
    typeof value.allowed !== 'boolean' ||
    !Array.isArray(value.reasonCodes) ||
    !value.reasonCodes.every(
      (reason) => typeof reason === 'string' && cancellationReasons.has(reason),
    )
  )
    return false;
  return value.allowed
    ? value.reasonCodes.length === ORDER_CANCELLATION_REASON_CODES.length &&
        new Set(value.reasonCodes).size === value.reasonCodes.length
    : value.reasonCodes.length === 0;
}

function isReturnCapability(value: unknown): value is BuyerOrderReturnCapability {
  return (
    isRecord(value) &&
    exact(value, ['allowed', 'deadlineAt', 'returnReference']) &&
    typeof value.allowed === 'boolean' &&
    (value.deadlineAt === null || isInstant(value.deadlineAt)) &&
    (value.returnReference === null || isUuid(value.returnReference)) &&
    (!value.allowed || (value.deadlineAt !== null && value.returnReference === null))
  );
}

function isInventoryHold(value: unknown): value is BuyerOrderInventoryHold {
  return (
    isRecord(value) &&
    exact(value, ['status', 'expiresAt', 'terminalReason']) &&
    ['ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED'].includes(String(value.status)) &&
    (value.expiresAt === null || isInstant(value.expiresAt)) &&
    (value.terminalReason === null || isText(value.terminalReason, 120))
  );
}

// Historical order snapshots intentionally keep the original mock quote
// numbers, even when they predate the current tariff table. New demo quotes
// still use the shared strict validator.
function isOrderHistoryShipping(value: unknown): value is ShippingBreakdown {
  if (!isRecord(value)) return false;
  if (value.provider !== 'MOCK') return isShippingBreakdown(value);
  if (
    !exact(value, [
      'provider',
      'version',
      'shopId',
      'originProvince',
      'destinationProvince',
      'zone',
      'shipmentWeightGrams',
      'service',
      'estimatedDaysMin',
      'estimatedDaysMax',
      'baseFeeMinor',
      'zoneSurchargeMinor',
      'weightSurchargeMinor',
      'shippingFeeMinor',
    ]) ||
    value.version !== 'mock-v1' ||
    !isUuid(value.shopId) ||
    !isText(value.originProvince, 100) ||
    !isText(value.destinationProvince, 100) ||
    !['SAME_PROVINCE', 'SAME_REGION', 'CROSS_REGION', 'UNKNOWN'].includes(String(value.zone)) ||
    !isPositive(value.shipmentWeightGrams) ||
    !['ECONOMY', 'STANDARD', 'EXPRESS'].includes(String(value.service)) ||
    !isPositive(value.estimatedDaysMin) ||
    !isPositive(value.estimatedDaysMax) ||
    value.estimatedDaysMin > value.estimatedDaysMax ||
    !isMoney(value.baseFeeMinor) ||
    !isMoney(value.zoneSurchargeMinor) ||
    !isMoney(value.weightSurchargeMinor) ||
    !isMoney(value.shippingFeeMinor)
  )
    return false;
  return (
    value.shippingFeeMinor ===
    value.baseFeeMinor + value.zoneSurchargeMinor + value.weightSurchargeMinor
  );
}

function isShipment(value: unknown): value is BuyerOrderShipment {
  if (
    !isRecord(value) ||
    !exact(value, [
      'provider',
      'version',
      'trackingCode',
      'status',
      'service',
      'handedOffAt',
      'registeredAt',
      'deliveredAt',
      'returnedAt',
      'lastUpdatedAt',
      'events',
    ]) ||
    !['MOCK', 'DEMO_CARRIER'].includes(String(value.provider)) ||
    !(value.version === null || isText(value.version, 80)) ||
    !isText(value.trackingCode, 120) ||
    !isText(value.status, 60) ||
    !['ECONOMY', 'STANDARD', 'EXPRESS'].includes(String(value.service)) ||
    !isInstant(value.handedOffAt) ||
    !(value.registeredAt === null || isInstant(value.registeredAt)) ||
    !(value.deliveredAt === null || isInstant(value.deliveredAt)) ||
    !(value.returnedAt === null || isInstant(value.returnedAt)) ||
    !(value.lastUpdatedAt === null || isInstant(value.lastUpdatedAt)) ||
    !Array.isArray(value.events)
  )
    return false;
  return value.events.every(
    (event) =>
      isRecord(event) &&
      exact(event, [
        'status',
        'previousStatus',
        'shipmentVersion',
        'externalEventId',
        'publicReason',
        'carrierOccurredAt',
        'occurredAt',
      ]) &&
      isText(event.status, 60) &&
      (event.previousStatus === null || isText(event.previousStatus, 60)) &&
      isMoney(event.shipmentVersion) &&
      (event.externalEventId === null || isText(event.externalEventId, 120)) &&
      (event.publicReason === null || isText(event.publicReason, 120)) &&
      (event.carrierOccurredAt === null || isInstant(event.carrierOccurredAt)) &&
      isInstant(event.occurredAt),
  );
}

function sum(values: number[]): number | null {
  const total = values.reduce((result, value) => result + value, 0);
  return Number.isSafeInteger(total) ? total : null;
}

export function isBuyerOrderSummary(value: unknown): value is BuyerOrderSummary {
  if (
    !isRecord(value) ||
    !exact(
      value,
      [
        'orderReference',
        'purchaseReference',
        'status',
        'paymentStatus',
        'version',
        'createdAt',
        'updatedAt',
        'shop',
        'note',
        'lines',
        'shipping',
        'listSubtotalMinor',
        'productDiscountMinor',
        'merchandiseSubtotalMinor',
        'shopVoucherDiscountMinor',
        'platformVoucherDiscountMinor',
        'merchandiseVoucherDiscountMinor',
        'shippingVoucherDiscountMinor',
        'voucherDiscountMinor',
        'shippingPayableMinor',
        'payableTotalMinor',
        'cancellation',
      ],
      ['inventoryHold', 'returnCapability', 'shipment'],
    )
  )
    return false;
  const order = value as unknown as BuyerOrderSummary;
  if (
    !isUuid(order.orderReference) ||
    !isUuid(order.purchaseReference) ||
    !statuses.has(order.status) ||
    !paymentStatuses.has(order.paymentStatus) ||
    !isMoney(order.version) ||
    !isInstant(order.createdAt) ||
    !isInstant(order.updatedAt) ||
    !isRecord(order.shop) ||
    !exact(order.shop, ['id', 'slug', 'name']) ||
    !isUuid(order.shop.id) ||
    !isText(order.shop.slug, 200) ||
    !slug.test(order.shop.slug) ||
    !isText(order.shop.name, 160) ||
    typeof order.note !== 'string' ||
    order.note.length > 500 ||
    containsControl(order.note) ||
    !Array.isArray(order.lines) ||
    order.lines.length === 0 ||
    !order.lines.every(isLine) ||
    !isOrderHistoryShipping(order.shipping) ||
    (order.shipment !== undefined && order.shipment !== null && !isShipment(order.shipment)) ||
    order.shipping.shopId !== order.shop.id ||
    !isCancellation(order.cancellation) ||
    (order.inventoryHold !== undefined && !isInventoryHold(order.inventoryHold)) ||
    (order.returnCapability !== undefined && !isReturnCapability(order.returnCapability))
  )
    return false;
  const money = [
    order.listSubtotalMinor,
    order.productDiscountMinor,
    order.merchandiseSubtotalMinor,
    order.shopVoucherDiscountMinor,
    order.platformVoucherDiscountMinor,
    order.merchandiseVoucherDiscountMinor,
    order.shippingVoucherDiscountMinor,
    order.voucherDiscountMinor,
    order.shippingPayableMinor,
    order.payableTotalMinor,
  ];
  if (!money.every(isMoney)) return false;
  const list = sum(order.lines.map((line) => line.listSubtotalMinor));
  const merchandise = sum(order.lines.map((line) => line.merchandiseSubtotalMinor));
  const shopDiscount = sum(order.lines.map((line) => line.shopVoucherDiscountMinor));
  const platformDiscount = sum(order.lines.map((line) => line.platformVoucherDiscountMinor));
  return (
    list === order.listSubtotalMinor &&
    merchandise === order.merchandiseSubtotalMinor &&
    order.productDiscountMinor === order.listSubtotalMinor - order.merchandiseSubtotalMinor &&
    shopDiscount === order.shopVoucherDiscountMinor &&
    platformDiscount === order.platformVoucherDiscountMinor &&
    order.merchandiseVoucherDiscountMinor ===
      order.shopVoucherDiscountMinor + order.platformVoucherDiscountMinor &&
    order.shippingVoucherDiscountMinor <= order.shipping.shippingFeeMinor &&
    order.shippingPayableMinor ===
      order.shipping.shippingFeeMinor - order.shippingVoucherDiscountMinor &&
    order.voucherDiscountMinor ===
      order.merchandiseVoucherDiscountMinor + order.shippingVoucherDiscountMinor &&
    order.payableTotalMinor ===
      order.merchandiseSubtotalMinor +
        order.shipping.shippingFeeMinor -
        order.voucherDiscountMinor &&
    order.cancellation.allowed === (order.status === 'PENDING_CONFIRMATION')
  );
}

function isAddress(value: unknown): value is CheckoutAddressSnapshot {
  return (
    isRecord(value) &&
    exact(value, [
      'id',
      'recipientName',
      'phoneNumber',
      'province',
      'district',
      'ward',
      'addressLine',
      'label',
    ]) &&
    isUuid(value.id) &&
    isText(value.recipientName, 120) &&
    typeof value.phoneNumber === 'string' &&
    /^[0-9]{10}$/.test(value.phoneNumber) &&
    isText(value.province, 100) &&
    isText(value.district, 100) &&
    isText(value.ward, 100) &&
    isText(value.addressLine, 255) &&
    (value.label === null || isText(value.label, 50))
  );
}

function isVoucher(value: unknown): value is BuyerOrderVoucherSnapshot {
  if (
    !isRecord(value) ||
    !exact(value, [
      'code',
      'name',
      'slot',
      'issuer',
      'benefitType',
      'merchandiseDiscountMinor',
      'shippingDiscountMinor',
      'discountMinor',
      'allocations',
    ]) ||
    !isText(value.code, 32) ||
    !isText(value.name, 160) ||
    !['PLATFORM', 'SHOP', 'FREE_SHIPPING'].includes(String(value.slot)) ||
    !['PLATFORM', 'SHOP'].includes(String(value.issuer)) ||
    !['FIXED_AMOUNT', 'PERCENTAGE', 'FREE_SHIPPING'].includes(String(value.benefitType)) ||
    !isMoney(value.merchandiseDiscountMinor) ||
    !isMoney(value.shippingDiscountMinor) ||
    !isMoney(value.discountMinor) ||
    value.discountMinor !== value.merchandiseDiscountMinor + value.shippingDiscountMinor ||
    !Array.isArray(value.allocations)
  )
    return false;
  return value.allocations.every(
    (allocation) =>
      isRecord(allocation) &&
      exact(allocation, ['lineId', 'kind', 'amountMinor']) &&
      (allocation.lineId === null || isUuid(allocation.lineId)) &&
      ['MERCHANDISE', 'SHIPPING'].includes(String(allocation.kind)) &&
      isMoney(allocation.amountMinor) &&
      (allocation.kind === 'SHIPPING') === (allocation.lineId === null),
  );
}

function isTimeline(value: unknown): value is BuyerOrderTimelineEvent {
  return (
    isRecord(value) &&
    exact(value, [
      'id',
      'previousStatus',
      'status',
      'orderVersion',
      'actorType',
      'actorUserId',
      'reasonCode',
      'reasonNote',
      'occurredAt',
    ]) &&
    isUuid(value.id) &&
    (value.previousStatus === null ||
      (typeof value.previousStatus === 'string' && statuses.has(value.previousStatus))) &&
    typeof value.status === 'string' &&
    statuses.has(value.status) &&
    isMoney(value.orderVersion) &&
    typeof value.actorType === 'string' &&
    actors.has(value.actorType) &&
    (value.actorUserId === null || isUuid(value.actorUserId)) &&
    (value.actorType === 'SYSTEM') === (value.actorUserId === null) &&
    isText(value.reasonCode, 80) &&
    (value.reasonNote === null ||
      (isText(value.reasonNote, ORDER_CANCELLATION_NOTE_MAX_LENGTH) &&
        !containsControl(value.reasonNote))) &&
    isInstant(value.occurredAt)
  );
}

export function isBuyerOrderListResponse(value: unknown): value is BuyerOrderListResponse {
  return (
    isRecord(value) &&
    exact(value, ['orderHistoryVersion', 'items', 'page']) &&
    value.orderHistoryVersion === ORDER_HISTORY_VERSION &&
    Array.isArray(value.items) &&
    value.items.every(isBuyerOrderSummary) &&
    isRecord(value.page) &&
    exact(value.page, ['limit', 'nextCursor']) &&
    isPositive(value.page.limit) &&
    value.page.limit <= ORDER_LIST_MAX_LIMIT &&
    (value.page.nextCursor === null ||
      (typeof value.page.nextCursor === 'string' && cursorPattern.test(value.page.nextCursor)))
  );
}

export function isBuyerOrderDetailResponse(value: unknown): value is BuyerOrderDetailResponse {
  if (
    !isRecord(value) ||
    !exact(value, [
      'orderHistoryVersion',
      'currency',
      'order',
      'address',
      'vouchers',
      'timeline',
    ]) ||
    value.orderHistoryVersion !== ORDER_HISTORY_VERSION ||
    value.currency !== 'VND' ||
    !isBuyerOrderSummary(value.order) ||
    !isAddress(value.address) ||
    !Array.isArray(value.vouchers) ||
    !value.vouchers.every(isVoucher) ||
    !Array.isArray(value.timeline) ||
    value.timeline.length === 0 ||
    !value.timeline.every(isTimeline)
  )
    return false;
  const detail = value as unknown as BuyerOrderDetailResponse;
  if (detail.timeline.length !== detail.order.version + 1) return false;
  for (let index = 0; index < detail.timeline.length; index += 1) {
    const event = detail.timeline[index]!;
    if (event.orderVersion !== index) return false;
    if (index === 0) {
      if (
        event.previousStatus !== null ||
        (event.status !== 'PENDING_CONFIRMATION' && event.status !== 'PENDING_PAYMENT') ||
        event.actorType !== 'SYSTEM'
      )
        return false;
    } else if (event.previousStatus !== detail.timeline[index - 1]!.status) return false;
  }
  return detail.timeline.at(-1)!.status === detail.order.status;
}

export const parseBuyerOrderListResponse = (value: unknown): BuyerOrderListResponse | null =>
  isBuyerOrderListResponse(value) ? value : null;
export const parseBuyerOrderDetailResponse = (value: unknown): BuyerOrderDetailResponse | null =>
  isBuyerOrderDetailResponse(value) ? value : null;

export function isOrderHistoryProblemDetails(value: unknown): value is OrderHistoryProblemDetails {
  return (
    isRecord(value) &&
    exact(value, ['type', 'title', 'status', 'detail'], ['invalidParameters', 'currentVersion']) &&
    typeof value.type === 'string' &&
    problemType.test(value.type) &&
    isText(value.title, 200) &&
    typeof value.status === 'number' &&
    [400, 401, 403, 404, 409, 503].includes(value.status) &&
    isText(value.detail, 500) &&
    (value.invalidParameters === undefined ||
      (Array.isArray(value.invalidParameters) &&
        value.invalidParameters.every((item) => isText(item, 100)))) &&
    (value.currentVersion === undefined || isMoney(value.currentVersion))
  );
}
