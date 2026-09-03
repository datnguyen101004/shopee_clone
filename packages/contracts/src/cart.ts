export const CART_MAX_LINES = 100;
export const CART_MAX_QUANTITY = 99;

export type CartOwnerKind = 'authenticated';
export type CartIssueCode = 'unavailable' | 'price-changed' | 'insufficient-stock';
export type CartAdjustmentCode = 'quantity-capped' | 'price-changed';

export interface CartLineIssue {
  code: CartIssueCode;
  message: string;
  previousUnitPriceMinor: number | null;
  currentUnitPriceMinor: number | null;
  availableQuantity: number | null;
}

export interface CartAdjustment {
  code: CartAdjustmentCode;
  variantId: string;
  lineId: string | null;
  requestedQuantity: number | null;
  acceptedQuantity: number | null;
  message: string;
}

export interface CartProductSummary {
  id: string;
  name: string;
  href: string | null;
  imageUrl: string | null;
  imageAlt: string;
}

export interface CartVariantSummary {
  id: string;
  name: string;
}

export interface CartShopSummary {
  id: string;
  slug: string;
  name: string;
  href: string | null;
}

export interface CartLine {
  id: string;
  product: CartProductSummary;
  variant: CartVariantSummary;
  unitPriceMinor: number;
  previousUnitPriceMinor: number | null;
  availableQuantity: number;
  maxPurchaseQuantity: number;
  quantity: number;
  selected: boolean;
  effectivelySelected: boolean;
  eligible: boolean;
  lineSubtotalMinor: number;
  issues: CartLineIssue[];
}

export interface CartShopGroup {
  shop: CartShopSummary;
  lines: CartLine[];
  selectedEligibleLineCount: number;
  eligibleLineCount: number;
}

export interface CartSummary {
  distinctLineCount: number;
  selectedValidLineCount: number;
  selectedValidQuantity: number;
  selectedMerchandiseSubtotalMinor: number;
}

export interface CartResponse {
  owner: CartOwnerKind;
  version: number;
  groups: CartShopGroup[];
  summary: CartSummary;
}

export interface CartMutationResponse {
  cart: CartResponse;
  adjustments: CartAdjustment[];
}

export interface AddCartItemRequest {
  variantId: string;
  quantity: number;
}

export interface UpdateCartQuantityRequest {
  quantity: number;
}

export interface UpdateCartSelectionRequest {
  selected: boolean;
}

export interface CartProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
}

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const canonicalSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const problemType = /^https:\/\/shopee-clone\.local\/problems\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const issueCodes = new Set<CartIssueCode>(['unavailable', 'price-changed', 'insufficient-stock']);
const adjustmentCodes = new Set<CartAdjustmentCode>(['quantity-capped', 'price-changed']);
const problemStatuses = new Set([400, 401, 403, 404, 409, 413, 415, 503]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && canonicalUuid.test(value);
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isMoney = (value: unknown): value is number => isNonNegativeInteger(value);

function isProduct(value: unknown): value is CartProductSummary {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'name', 'href', 'imageUrl', 'imageAlt']) &&
    isUuid(value.id) &&
    isString(value.name) &&
    (value.href === null || (isString(value.href) && value.href.startsWith('/products/'))) &&
    (value.imageUrl === null || isString(value.imageUrl)) &&

    isString(value.imageAlt)
  );
}

function isVariant(value: unknown): value is CartVariantSummary {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'name']) &&
    isUuid(value.id) &&
    isString(value.name)
  );
}

function isShop(value: unknown): value is CartShopSummary {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'slug', 'name', 'href']) &&
    isUuid(value.id) &&
    typeof value.slug === 'string' &&
    canonicalSlug.test(value.slug) &&
    isString(value.name) &&
    (value.href === null || value.href === `/shops/${value.slug}`)
  );
}

function isIssue(value: unknown): value is CartLineIssue {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'code',
      'message',
      'previousUnitPriceMinor',
      'currentUnitPriceMinor',
      'availableQuantity',
    ]) ||
    typeof value.code !== 'string' ||
    !issueCodes.has(value.code as CartIssueCode) ||
    !isString(value.message) ||
    !(value.previousUnitPriceMinor === null || isMoney(value.previousUnitPriceMinor)) ||
    !(value.currentUnitPriceMinor === null || isMoney(value.currentUnitPriceMinor)) ||
    !(value.availableQuantity === null || isNonNegativeInteger(value.availableQuantity))
  ) {
    return false;
  }
  if (value.code === 'price-changed') {
    return (
      value.previousUnitPriceMinor !== null &&
      value.currentUnitPriceMinor !== null &&
      value.previousUnitPriceMinor !== value.currentUnitPriceMinor
    );
  }
  return value.code !== 'insufficient-stock' || value.availableQuantity !== null;
}

function isLine(value: unknown): value is CartLine {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'product',
      'variant',
      'unitPriceMinor',
      'previousUnitPriceMinor',
      'availableQuantity',
      'maxPurchaseQuantity',
      'quantity',
      'selected',
      'effectivelySelected',
      'eligible',
      'lineSubtotalMinor',
      'issues',
    ]) ||
    !isUuid(value.id) ||
    !isProduct(value.product) ||
    !isVariant(value.variant) ||
    !isMoney(value.unitPriceMinor) ||
    !(value.previousUnitPriceMinor === null || isMoney(value.previousUnitPriceMinor)) ||
    !isNonNegativeInteger(value.availableQuantity) ||
    !isNonNegativeInteger(value.maxPurchaseQuantity) ||
    value.maxPurchaseQuantity > CART_MAX_QUANTITY ||
    !isPositiveInteger(value.quantity) ||
    value.quantity > CART_MAX_QUANTITY ||
    typeof value.selected !== 'boolean' ||
    typeof value.effectivelySelected !== 'boolean' ||
    typeof value.eligible !== 'boolean' ||
    !isMoney(value.lineSubtotalMinor) ||
    !Array.isArray(value.issues) ||
    !value.issues.every(isIssue)
  ) {
    return false;
  }
  const issues = value.issues as CartLineIssue[];
  const hasBlockingIssue = issues.some(
    (issue) => issue.code === 'unavailable' || issue.code === 'insufficient-stock',
  );
  return (
    value.lineSubtotalMinor === value.unitPriceMinor * value.quantity &&
    Number.isSafeInteger(value.lineSubtotalMinor) &&
    new Set(issues.map((issue) => issue.code)).size === issues.length &&
    value.effectivelySelected === (value.selected && value.eligible && !hasBlockingIssue) &&
    (value.eligible || value.product.href === null)
  );
}

function isGroup(value: unknown): value is CartShopGroup {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['shop', 'lines', 'selectedEligibleLineCount', 'eligibleLineCount']) ||
    !isShop(value.shop) ||
    !Array.isArray(value.lines) ||
    value.lines.length > CART_MAX_LINES ||
    !value.lines.every(isLine) ||
    !isNonNegativeInteger(value.selectedEligibleLineCount) ||
    !isNonNegativeInteger(value.eligibleLineCount)
  ) {
    return false;
  }
  const lines = value.lines as CartLine[];
  return (
    lines.length > 0 &&
    new Set(lines.map((line) => line.id)).size === lines.length &&
    value.eligibleLineCount === lines.filter((line) => line.eligible).length &&
    value.selectedEligibleLineCount === lines.filter((line) => line.effectivelySelected).length
  );
}

function isSummary(value: unknown): value is CartSummary {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'distinctLineCount',
      'selectedValidLineCount',
      'selectedValidQuantity',
      'selectedMerchandiseSubtotalMinor',
    ]) &&
    isNonNegativeInteger(value.distinctLineCount) &&
    value.distinctLineCount <= CART_MAX_LINES &&
    isNonNegativeInteger(value.selectedValidLineCount) &&
    isNonNegativeInteger(value.selectedValidQuantity) &&
    isMoney(value.selectedMerchandiseSubtotalMinor)
  );
}

export function isCartResponse(value: unknown): value is CartResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['owner', 'version', 'groups', 'summary']) ||
    value.owner !== 'authenticated' ||
    !isNonNegativeInteger(value.version) ||
    !Array.isArray(value.groups) ||
    !value.groups.every(isGroup) ||
    !isSummary(value.summary)
  ) {
    return false;
  }
  const groups = value.groups as CartShopGroup[];
  const lines = groups.flatMap((group) => group.lines);
  const selected = lines.filter((line) => line.effectivelySelected);
  return (
    new Set(groups.map((group) => group.shop.id)).size === groups.length &&
    new Set(lines.map((line) => line.id)).size === lines.length &&
    value.summary.distinctLineCount === lines.length &&
    value.summary.selectedValidLineCount === selected.length &&
    value.summary.selectedValidQuantity ===
      selected.reduce((total, line) => total + line.quantity, 0) &&
    value.summary.selectedMerchandiseSubtotalMinor ===
      selected.reduce((total, line) => total + line.lineSubtotalMinor, 0)
  );
}

function isAdjustment(value: unknown): value is CartAdjustment {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'code',
      'variantId',
      'lineId',
      'requestedQuantity',
      'acceptedQuantity',
      'message',
    ]) &&
    typeof value.code === 'string' &&
    adjustmentCodes.has(value.code as CartAdjustmentCode) &&
    isUuid(value.variantId) &&
    (value.lineId === null || isUuid(value.lineId)) &&
    (value.requestedQuantity === null || isPositiveInteger(value.requestedQuantity)) &&
    (value.acceptedQuantity === null || isNonNegativeInteger(value.acceptedQuantity)) &&
    isString(value.message)
  );
}

export function isCartMutationResponse(value: unknown): value is CartMutationResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['cart', 'adjustments']) &&
    isCartResponse(value.cart) &&
    Array.isArray(value.adjustments) &&
    value.adjustments.every(isAdjustment)
  );
}

export function isCartProblemDetails(value: unknown): value is CartProblemDetails {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['type', 'title', 'status', 'detail'], ['invalidParameters']) ||
    !isString(value.type) ||
    !problemType.test(value.type) ||
    !isString(value.title) ||
    value.title.length > 120 ||
    typeof value.status !== 'number' ||
    !problemStatuses.has(value.status) ||
    !isString(value.detail) ||
    value.detail.length > 500
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

export const parseCartResponse = (value: unknown): CartResponse | null =>
  isCartResponse(value) ? value : null;
export const parseCartMutationResponse = (value: unknown): CartMutationResponse | null =>
  isCartMutationResponse(value) ? value : null;
export const parseCartProblemDetails = (value: unknown): CartProblemDetails | null =>
  isCartProblemDetails(value) ? value : null;
