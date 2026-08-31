import {
  isPricingQuoteResponse,
  parsePricingQuoteRequest,
  type ShippingBreakdown,
  type PricingQuoteLine,
  type PricingQuoteResponse,
  type PricingQuoteShop,
  type PricingQuoteSummary,
  type ShopShippingServiceSelection,
} from './pricing';
import {
  normalizeVoucherCode,
  type VoucherCodeSelection,
  type VoucherSelectionResult,
} from './vouchers';

export const CHECKOUT_VERSION = 'checkout-v1' as const;
export const CHECKOUT_FINGERPRINT_VERSION = 'checkout-fingerprint-v1' as const;
export const CHECKOUT_DRAFT_VERSION = 1 as const;
export const CHECKOUT_NOTE_MAX_LENGTH = 500;
export const CHECKOUT_IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const CHECKOUT_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
export const CHECKOUT_BLOCKER_CODES = [
  'EMPTY_SELECTION',
  'LINE_UNAVAILABLE',
  'VOUCHER_REJECTED',
  'MISSING_SHIPPING_SERVICE',
] as const;
export const PURCHASE_PAYMENT_METHODS = ['COD', 'MOMO'] as const;
export const PURCHASE_PAYMENT_STATUSES = [
  'UNPAID',
  'PENDING',
  'PENDING_RECONCILIATION',
  'UNKNOWN',
  'PAID',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export const SHOP_ORDER_STATUSES = [
  'PENDING_CONFIRMATION',
  'AWAITING_PICKUP',
  'SHIPPING',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUNDED',
] as const;

export type CheckoutBlockerCode = (typeof CHECKOUT_BLOCKER_CODES)[number];
export type PurchasePaymentMethod = (typeof PURCHASE_PAYMENT_METHODS)[number];
export type PurchasePaymentStatus = (typeof PURCHASE_PAYMENT_STATUSES)[number];
export type ShopOrderStatus = (typeof SHOP_ORDER_STATUSES)[number];
export const INVENTORY_HOLD_STATUSES = ['ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED'] as const;
export type InventoryHoldStatus = (typeof INVENTORY_HOLD_STATUSES)[number];

export interface CheckoutShopNote {
  shopId: string;
  note: string;
}

export interface CheckoutPreviewRequest {
  shippingAddressId: string;
  services: ShopShippingServiceSelection[];
  vouchers?: VoucherCodeSelection;
  notes?: CheckoutShopNote[];
}

export interface CheckoutConfirmationRequest extends CheckoutPreviewRequest {
  checkoutFingerprint: string;
}

export interface CheckoutDraft {
  version: typeof CHECKOUT_DRAFT_VERSION;
  cartVersion: number;
  shippingAddressId: string | null;
  services: ShopShippingServiceSelection[];
  vouchers?: VoucherCodeSelection;
}

export interface CheckoutAddressSnapshot {
  id: string;
  recipientName: string;
  phoneNumber: string;
  province: string;
  district: string;
  ward: string;
  addressLine: string;
  label: string | null;
}

export interface CheckoutPreviewLine extends PricingQuoteLine {
  productName: string;
  productImageUrl: string | null;
  variantName: string;
  variantSku: string;
}

export interface CheckoutPreviewShop extends Omit<PricingQuoteShop, 'lines'> {
  note: string;
  lines: CheckoutPreviewLine[];
}

export interface CheckoutBlocker {
  code: CheckoutBlockerCode;
  message: string;
  shopId: string | null;
  lineId: string | null;
  voucherCode: string | null;
}

export interface CheckoutPreviewResponse {
  checkoutVersion: typeof CHECKOUT_VERSION;
  pricingVersion: PricingQuoteResponse['pricingVersion'];
  voucherVersion: PricingQuoteResponse['voucherVersion'];
  shippingVersion: PricingQuoteResponse['shippingVersion'];
  currency: PricingQuoteResponse['currency'];
  evaluatedAt: string;
  cartVersion: number;
  ready: boolean;
  checkoutFingerprint: string | null;
  address: CheckoutAddressSnapshot;
  shops: CheckoutPreviewShop[];
  vouchers: VoucherSelectionResult[];
  exclusions: PricingQuoteResponse['exclusions'];
  blockers: CheckoutBlocker[];
  summary: PricingQuoteSummary;
}

export interface PurchaseShopOrder extends Omit<CheckoutPreviewShop, 'note'> {
  orderReference: string;
  status: ShopOrderStatus;
  paymentStatus: PurchasePaymentStatus;
  note: string;
  inventoryHold?: {
    status: InventoryHoldStatus;
    expiresAt: string | null;
    terminalReason: string | null;
  };
}

export interface PurchaseResult {
  checkoutVersion: typeof CHECKOUT_VERSION;
  pricingVersion: PricingQuoteResponse['pricingVersion'];
  voucherVersion: PricingQuoteResponse['voucherVersion'];
  shippingVersion: PricingQuoteResponse['shippingVersion'];
  currency: PricingQuoteResponse['currency'];
  purchaseReference: string;
  createdAt: string;
  sourceCartVersion: number;
  paymentMethod: PurchasePaymentMethod;
  paymentStatus: PurchasePaymentStatus;
  address: CheckoutAddressSnapshot;
  orders: PurchaseShopOrder[];
  vouchers: VoucherSelectionResult[];
  summary: PricingQuoteSummary;
}

export interface CheckoutConfirmationResponse {
  replayed: boolean;
  purchase: PurchaseResult;
}

export interface CheckoutProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code?: string;
  invalidParameters?: string[];
  currentCartVersion?: number;
  availableQuantity?: number;
  preview?: CheckoutPreviewResponse;
}

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const problemType = /^https:\/\/shopee-clone\.local\/problems\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const problemStatuses = new Set([400, 401, 403, 404, 409, 413, 415, 503]);
const blockerCodes = new Set<string>(CHECKOUT_BLOCKER_CODES);
const shopOrderStatuses = new Set<string>(SHOP_ORDER_STATUSES);
const inventoryHoldStatuses = new Set<string>(INVENTORY_HOLD_STATUSES);
const purchasePaymentMethods = new Set<string>(PURCHASE_PAYMENT_METHODS);
const purchasePaymentStatuses = new Set<string>(PURCHASE_PAYMENT_STATUSES);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && canonicalUuid.test(value);
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isNonEmptyString = (value: unknown, maximum = 500): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint < 32 || codePoint === 127;
  });
}

function normalizeNote(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (hasControlCharacter(value)) return null;
  const note = value.trim();
  if (note.length > CHECKOUT_NOTE_MAX_LENGTH) return null;
  return note;
}

function parseNotes(value: unknown): CheckoutShopNote[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) return null;
  const parsed: CheckoutShopNote[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !hasExactKeys(item, ['shopId', 'note']) || !isUuid(item.shopId)) {
      return null;
    }
    const note = normalizeNote(item.note);
    if (note === null || seen.has(item.shopId)) return null;
    seen.add(item.shopId);
    if (note.length > 0) parsed.push({ shopId: item.shopId, note });
  }
  return parsed.sort((left, right) => left.shopId.localeCompare(right.shopId));
}

function normalizedCheckoutInput(value: Record<string, unknown>): CheckoutPreviewRequest | null {
  const pricing = parsePricingQuoteRequest({
    shippingAddressId: value.shippingAddressId,
    services: value.services,
    ...(value.vouchers === undefined ? {} : { vouchers: value.vouchers }),
  });
  const notes = parseNotes(value.notes);
  if (!pricing?.shippingAddressId || !Array.isArray(pricing.services) || notes === null)
    return null;
  const services = [...pricing.services].sort((left, right) =>
    left.shopId.localeCompare(right.shopId),
  );
  return {
    shippingAddressId: pricing.shippingAddressId,
    services,
    ...(pricing.vouchers ? { vouchers: pricing.vouchers } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

export function parseCheckoutPreviewRequest(value: unknown): CheckoutPreviewRequest | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['shippingAddressId', 'services'], ['vouchers', 'notes'])
  ) {
    return null;
  }
  return normalizedCheckoutInput(value);
}

export function isCheckoutPreviewRequest(value: unknown): value is CheckoutPreviewRequest {
  return parseCheckoutPreviewRequest(value) !== null;
}

export function parseCheckoutConfirmationRequest(
  value: unknown,
): CheckoutConfirmationRequest | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ['shippingAddressId', 'services', 'checkoutFingerprint'],
      ['vouchers', 'notes'],
    ) ||
    typeof value.checkoutFingerprint !== 'string' ||
    !CHECKOUT_FINGERPRINT_PATTERN.test(value.checkoutFingerprint)
  ) {
    return null;
  }
  const preview = normalizedCheckoutInput(value);
  return preview ? { ...preview, checkoutFingerprint: value.checkoutFingerprint } : null;
}

export function isCheckoutConfirmationRequest(
  value: unknown,
): value is CheckoutConfirmationRequest {
  return parseCheckoutConfirmationRequest(value) !== null;
}

function isServiceSelection(value: unknown): value is ShopShippingServiceSelection {
  const parsed = parsePricingQuoteRequest({
    shippingAddressId: '00000000-0000-4000-8000-000000000000',
    services: [value],
  });
  return parsed?.services?.length === 1;
}

function isVoucherSelection(value: unknown): value is VoucherCodeSelection {
  const parsed = parsePricingQuoteRequest({
    shippingAddressId: '00000000-0000-4000-8000-000000000000',
    services: [],
    vouchers: value,
  });
  return parsed?.vouchers !== undefined;
}

export function isCheckoutDraft(value: unknown): value is CheckoutDraft {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ['version', 'cartVersion', 'shippingAddressId', 'services'],
      ['vouchers'],
    ) ||
    value.version !== CHECKOUT_DRAFT_VERSION ||
    !isNonNegativeInteger(value.cartVersion) ||
    !(value.shippingAddressId === null || isUuid(value.shippingAddressId)) ||
    !Array.isArray(value.services) ||
    value.services.length > 100 ||
    !value.services.every(isServiceSelection) ||
    new Set(value.services.map((service) => service.shopId)).size !== value.services.length ||
    !(value.vouchers === undefined || isVoucherSelection(value.vouchers))
  ) {
    return false;
  }
  return true;
}

function isCanonicalDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isAddress(value: unknown): value is CheckoutAddressSnapshot {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
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
    isNonEmptyString(value.recipientName, 120) &&
    typeof value.phoneNumber === 'string' &&
    /^[0-9]{10}$/.test(value.phoneNumber) &&
    isNonEmptyString(value.province, 100) &&
    isNonEmptyString(value.district, 100) &&
    isNonEmptyString(value.ward, 100) &&
    isNonEmptyString(value.addressLine, 255) &&
    (value.label === null || isNonEmptyString(value.label, 50))
  );
}

function isPreviewLine(value: unknown): value is CheckoutPreviewLine {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
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
      'variantName',
      'variantSku',
    ]) ||
    !isNonEmptyString(value.productName, 240) ||
    !(value.productImageUrl === null || isNonEmptyString(value.productImageUrl, 2048)) ||
    !isNonEmptyString(value.variantName, 160) ||
    !isNonEmptyString(value.variantSku, 80)
  ) {
    return false;
  }
  const line = value as unknown as CheckoutPreviewLine;
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
  if (
    !isUuid(line.lineId) ||
    !isUuid(line.productId) ||
    !isUuid(line.variantId) ||
    !Number.isSafeInteger(line.quantity) ||
    line.quantity < 1 ||
    !Number.isSafeInteger(line.unitWeightGrams) ||
    line.unitWeightGrams < 1 ||
    !Number.isSafeInteger(line.shipmentWeightGrams) ||
    line.shipmentWeightGrams < 1 ||
    !money.every(isNonNegativeInteger) ||
    line.listUnitPriceMinor < line.sellingUnitPriceMinor
  ) {
    return false;
  }
  const shipmentWeight = line.unitWeightGrams * line.quantity;
  const listSubtotal = line.listUnitPriceMinor * line.quantity;
  const merchandiseSubtotal = line.sellingUnitPriceMinor * line.quantity;
  const merchandiseVoucherDiscount =
    line.shopVoucherDiscountMinor + line.platformVoucherDiscountMinor;
  return (
    Number.isSafeInteger(shipmentWeight) &&
    shipmentWeight === line.shipmentWeightGrams &&
    Number.isSafeInteger(listSubtotal) &&
    listSubtotal === line.listSubtotalMinor &&
    Number.isSafeInteger(merchandiseSubtotal) &&
    merchandiseSubtotal === line.merchandiseSubtotalMinor &&
    listSubtotal - merchandiseSubtotal === line.productDiscountMinor &&
    merchandiseVoucherDiscount === line.merchandiseVoucherDiscountMinor &&
    line.merchandiseVoucherDiscountMinor <= merchandiseSubtotal &&
    line.payableMerchandiseMinor === merchandiseSubtotal - line.merchandiseVoucherDiscountMinor
  );
}

function pricingLine(line: CheckoutPreviewLine): PricingQuoteLine {
  return {
    lineId: line.lineId,
    productId: line.productId,
    variantId: line.variantId,
    quantity: line.quantity,
    unitWeightGrams: line.unitWeightGrams,
    shipmentWeightGrams: line.shipmentWeightGrams,
    listUnitPriceMinor: line.listUnitPriceMinor,
    sellingUnitPriceMinor: line.sellingUnitPriceMinor,
    listSubtotalMinor: line.listSubtotalMinor,
    productDiscountMinor: line.productDiscountMinor,
    merchandiseSubtotalMinor: line.merchandiseSubtotalMinor,
    shopVoucherDiscountMinor: line.shopVoucherDiscountMinor,
    platformVoucherDiscountMinor: line.platformVoucherDiscountMinor,
    merchandiseVoucherDiscountMinor: line.merchandiseVoucherDiscountMinor,
    payableMerchandiseMinor: line.payableMerchandiseMinor,
  };
}

function pricingShop(shop: CheckoutPreviewShop | PurchaseShopOrder): PricingQuoteShop {
  return {
    shop: shop.shop,
    lines: shop.lines.map(pricingLine),
    shipping: shop.shipping,
    listSubtotalMinor: shop.listSubtotalMinor,
    productDiscountMinor: shop.productDiscountMinor,
    merchandiseSubtotalMinor: shop.merchandiseSubtotalMinor,
    shopVoucherDiscountMinor: shop.shopVoucherDiscountMinor,
    platformVoucherDiscountMinor: shop.platformVoucherDiscountMinor,
    merchandiseVoucherDiscountMinor: shop.merchandiseVoucherDiscountMinor,
    shippingVoucherDiscountMinor: shop.shippingVoucherDiscountMinor,
    voucherDiscountMinor: shop.voucherDiscountMinor,
    shippingPayableMinor: shop.shippingPayableMinor,
    payableTotalMinor: shop.payableTotalMinor,
  };
}

function isShopCommon(value: unknown): value is CheckoutPreviewShop {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
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
    ]) ||
    typeof value.note !== 'string' ||
    value.note.length > CHECKOUT_NOTE_MAX_LENGTH ||
    hasControlCharacter(value.note) ||
    !Array.isArray(value.lines) ||
    value.lines.length === 0 ||
    !value.lines.every(isPreviewLine)
  ) {
    return false;
  }
  return true;
}

function isBlocker(value: unknown): value is CheckoutBlocker {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['code', 'message', 'shopId', 'lineId', 'voucherCode']) &&
    typeof value.code === 'string' &&
    blockerCodes.has(value.code) &&
    isNonEmptyString(value.message) &&
    (value.shopId === null || isUuid(value.shopId)) &&
    (value.lineId === null || isUuid(value.lineId)) &&
    (value.voucherCode === null || normalizeVoucherCode(value.voucherCode) === value.voucherCode)
  );
}

function quoteFromPreview(value: CheckoutPreviewResponse): PricingQuoteResponse {
  return {
    pricingVersion: value.pricingVersion,
    voucherVersion: value.voucherVersion,
    shippingVersion: value.shippingVersion,
    currency: value.currency,
    evaluatedAt: value.evaluatedAt,
    cartVersion: value.cartVersion,
    address: {
      id: value.address.id,
      province: value.address.province,
      district: value.address.district,
    },
    shops: value.shops.map(pricingShop),
    vouchers: value.vouchers,
    exclusions: value.exclusions,
    summary: value.summary,
  };
}

export function isCheckoutPreviewResponse(value: unknown): value is CheckoutPreviewResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'checkoutVersion',
      'pricingVersion',
      'voucherVersion',
      'shippingVersion',
      'currency',
      'evaluatedAt',
      'cartVersion',
      'ready',
      'checkoutFingerprint',
      'address',
      'shops',
      'vouchers',
      'exclusions',
      'blockers',
      'summary',
    ]) ||
    value.checkoutVersion !== CHECKOUT_VERSION ||
    typeof value.ready !== 'boolean' ||
    !isAddress(value.address) ||
    !Array.isArray(value.shops) ||
    !value.shops.every(isShopCommon) ||
    !Array.isArray(value.blockers) ||
    !value.blockers.every(isBlocker) ||
    !(
      value.checkoutFingerprint === null ||
      (typeof value.checkoutFingerprint === 'string' &&
        CHECKOUT_FINGERPRINT_PATTERN.test(value.checkoutFingerprint))
    )
  ) {
    return false;
  }
  const preview = value as unknown as CheckoutPreviewResponse;
  if (!isPricingQuoteResponse(quoteFromPreview(preview))) return false;
  return preview.ready
    ? preview.checkoutFingerprint !== null &&
        preview.blockers.length === 0 &&
        preview.summary.selectedLineCount > 0
    : preview.checkoutFingerprint === null && preview.blockers.length > 0;
}

export const parseCheckoutPreviewResponse = (value: unknown): CheckoutPreviewResponse | null =>
  isCheckoutPreviewResponse(value) ? value : null;

function isOrder(value: unknown): value is PurchaseShopOrder {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      [
        'orderReference',
        'status',
        'paymentStatus',
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
      ],
      ['inventoryHold'],
    ) ||
    !isUuid(value.orderReference) ||
    typeof value.status !== 'string' ||
    !shopOrderStatuses.has(value.status) ||
    typeof value.paymentStatus !== 'string' ||
    !purchasePaymentStatuses.has(value.paymentStatus) ||
    (value.inventoryHold !== undefined &&
      (!isRecord(value.inventoryHold) ||
        !hasExactKeys(value.inventoryHold, ['status', 'expiresAt', 'terminalReason']) ||
        typeof value.inventoryHold.status !== 'string' ||
        !inventoryHoldStatuses.has(value.inventoryHold.status) ||
        !(
          value.inventoryHold.expiresAt === null ||
          isCanonicalDateTime(value.inventoryHold.expiresAt)
        ) ||
        !(
          value.inventoryHold.terminalReason === null ||
          isNonEmptyString(value.inventoryHold.terminalReason, 120)
        )))
  ) {
    return false;
  }
  const common: Record<string, unknown> = { ...value };
  delete common.orderReference;
  delete common.status;
  delete common.paymentStatus;
  delete common.inventoryHold;
  return isShopCommon(common);
}

function quoteFromPurchase(value: PurchaseResult): PricingQuoteResponse {
  return {
    pricingVersion: value.pricingVersion,
    voucherVersion: value.voucherVersion,
    shippingVersion: value.shippingVersion,
    currency: value.currency,
    evaluatedAt: value.createdAt,
    cartVersion: value.sourceCartVersion,
    address: {
      id: value.address.id,
      province: value.address.province,
      district: value.address.district,
    },
    shops: value.orders.map(pricingShop),
    vouchers: value.vouchers,
    exclusions: [],
    summary: value.summary,
  };
}

export function isPurchaseResult(value: unknown): value is PurchaseResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'checkoutVersion',
      'pricingVersion',
      'voucherVersion',
      'shippingVersion',
      'currency',
      'purchaseReference',
      'createdAt',
      'sourceCartVersion',
      'paymentMethod',
      'paymentStatus',
      'address',
      'orders',
      'vouchers',
      'summary',
    ]) ||
    value.checkoutVersion !== CHECKOUT_VERSION ||
    !isUuid(value.purchaseReference) ||
    !isCanonicalDateTime(value.createdAt) ||
    !isNonNegativeInteger(value.sourceCartVersion) ||
    typeof value.paymentMethod !== 'string' ||
    !purchasePaymentMethods.has(value.paymentMethod) ||
    typeof value.paymentStatus !== 'string' ||
    !purchasePaymentStatuses.has(value.paymentStatus) ||
    !isAddress(value.address) ||
    !Array.isArray(value.orders) ||
    value.orders.length === 0 ||
    !value.orders.every((order) => {
      const valid = isOrder(order);
      return valid;
    })
  ) {
    return false;
  }
  const purchase = value as unknown as PurchaseResult;
  return (
    new Set(purchase.orders.map((order) => order.orderReference)).size === purchase.orders.length &&
    new Set(purchase.orders.map((order) => order.shop.id)).size === purchase.orders.length &&
    isPricingQuoteResponse(quoteFromPurchase(purchase))
  );
}

export const parsePurchaseResult = (value: unknown): PurchaseResult | null =>
  isPurchaseResult(value) ? value : null;

export function isCheckoutConfirmationResponse(
  value: unknown,
): value is CheckoutConfirmationResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['replayed', 'purchase']) &&
    typeof value.replayed === 'boolean' &&
    isPurchaseResult(value.purchase)
  );
}

export const parseCheckoutConfirmationResponse = (
  value: unknown,
): CheckoutConfirmationResponse | null => (isCheckoutConfirmationResponse(value) ? value : null);

export function isCheckoutProblemDetails(value: unknown): value is CheckoutProblemDetails {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ['type', 'title', 'status', 'detail'],
      ['code', 'invalidParameters', 'currentCartVersion', 'availableQuantity', 'preview'],
    ) ||
    !isNonEmptyString(value.type) ||
    !problemType.test(value.type) ||
    !isNonEmptyString(value.title, 120) ||
    typeof value.status !== 'number' ||
    !problemStatuses.has(value.status) ||
    !isNonEmptyString(value.detail, 500) ||
    !(
      value.code === undefined ||
      (typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(value.code))
    ) ||
    !(value.currentCartVersion === undefined || isNonNegativeInteger(value.currentCartVersion)) ||
    !(value.availableQuantity === undefined || isNonNegativeInteger(value.availableQuantity)) ||
    !(value.preview === undefined || isCheckoutPreviewResponse(value.preview))
  ) {
    return false;
  }
  return (
    value.invalidParameters === undefined ||
    (Array.isArray(value.invalidParameters) &&
      value.invalidParameters.length > 0 &&
      value.invalidParameters.length <= 20 &&
      value.invalidParameters.every(
        (parameter) =>
          typeof parameter === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(parameter),
      ) &&
      new Set(value.invalidParameters).size === value.invalidParameters.length)
  );
}

export const parseCheckoutProblemDetails = (value: unknown): CheckoutProblemDetails | null =>
  isCheckoutProblemDetails(value) ? value : null;

export type { ShippingBreakdown };
