export const PRICING_VERSION = 'pricing-v1' as const;
export const MOCK_SHIPPING_VERSION = 'mock-v1' as const;
export const PRICING_CURRENCY = 'VND' as const;
export const SHIPPING_SERVICES = ['ECONOMY', 'STANDARD', 'EXPRESS'] as const;

export type ShippingServiceCode = (typeof SHIPPING_SERVICES)[number];
export type ShippingZone = 'SAME_PROVINCE' | 'SAME_REGION' | 'CROSS_REGION' | 'UNKNOWN';
export type PricingExclusionCode = 'unavailable' | 'insufficient-stock';

export interface ShopShippingServiceSelection {
  shopId: string;
  service: ShippingServiceCode;
}

export interface PricingQuoteRequest {
  shippingAddressId: string;
  services?: ShopShippingServiceSelection[];
}

export interface PricingQuoteAddress {
  id: string;
  province: string;
  district: string;
}

export interface PricingQuoteLine {
  lineId: string;
  productId: string;
  variantId: string;
  quantity: number;
  unitWeightGrams: number;
  shipmentWeightGrams: number;
  listUnitPriceMinor: number;
  sellingUnitPriceMinor: number;
  listSubtotalMinor: number;
  productDiscountMinor: number;
  merchandiseSubtotalMinor: number;
}

export interface MockShippingBreakdown {
  provider: 'MOCK';
  version: typeof MOCK_SHIPPING_VERSION;
  shopId: string;
  originProvince: string;
  destinationProvince: string;
  zone: ShippingZone;
  shipmentWeightGrams: number;
  service: ShippingServiceCode;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  baseFeeMinor: number;
  zoneSurchargeMinor: number;
  weightSurchargeMinor: number;
  shippingFeeMinor: number;
}

export interface PricingQuoteShop {
  shop: { id: string; slug: string; name: string };
  lines: PricingQuoteLine[];
  shipping: MockShippingBreakdown;
  listSubtotalMinor: number;
  productDiscountMinor: number;
  merchandiseSubtotalMinor: number;
  payableTotalMinor: number;
}

export interface PricingQuoteExclusion {
  lineId: string;
  code: PricingExclusionCode;
  message: string;
}

export interface PricingQuoteSummary {
  selectedLineCount: number;
  selectedQuantity: number;
  listSubtotalMinor: number;
  productDiscountMinor: number;
  merchandiseSubtotalMinor: number;
  shippingTotalMinor: number;
  payableTotalMinor: number;
}

export interface PricingQuoteResponse {
  pricingVersion: typeof PRICING_VERSION;
  shippingVersion: typeof MOCK_SHIPPING_VERSION;
  currency: typeof PRICING_CURRENCY;
  cartVersion: number;
  address: PricingQuoteAddress;
  shops: PricingQuoteShop[];
  exclusions: PricingQuoteExclusion[];
  summary: PricingQuoteSummary;
}

export interface PricingProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
}

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const canonicalSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const problemType = /^https:\/\/shopee-clone\.local\/problems\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const problemStatuses = new Set([400, 401, 403, 404, 409, 413, 415, 503]);
const services = new Set<string>(SHIPPING_SERVICES);
const zones = new Set<ShippingZone>(['SAME_PROVINCE', 'SAME_REGION', 'CROSS_REGION', 'UNKNOWN']);
const exclusionCodes = new Set<PricingExclusionCode>(['unavailable', 'insufficient-stock']);

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
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isMoney = isNonNegativeInteger;

function safeAdd(values: number[]): number | null {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total) || total < 0) return null;
  }
  return total;
}

function safeMultiply(left: number, right: number): number | null {
  const result = left * right;
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

function isService(value: unknown): value is ShippingServiceCode {
  return typeof value === 'string' && services.has(value);
}

function isSelection(value: unknown): value is ShopShippingServiceSelection {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['shopId', 'service']) &&
    isUuid(value.shopId) &&
    isService(value.service)
  );
}

export function isPricingQuoteRequest(value: unknown): value is PricingQuoteRequest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['shippingAddressId'], ['services']) ||
    !isUuid(value.shippingAddressId) ||
    !(
      value.services === undefined ||
      (Array.isArray(value.services) && value.services.every(isSelection))
    )
  ) {
    return false;
  }
  const selections = (value.services ?? []) as ShopShippingServiceSelection[];
  return new Set(selections.map(({ shopId }) => shopId)).size === selections.length;
}

function isAddress(value: unknown): value is PricingQuoteAddress {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'province', 'district']) &&
    isUuid(value.id) &&
    isText(value.province) &&
    isText(value.district)
  );
}

function isLine(value: unknown): value is PricingQuoteLine {
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
    ]) ||
    !isUuid(value.lineId) ||
    !isUuid(value.productId) ||
    !isUuid(value.variantId) ||
    !isPositiveInteger(value.quantity) ||
    !isPositiveInteger(value.unitWeightGrams) ||
    !isPositiveInteger(value.shipmentWeightGrams) ||
    !isMoney(value.listUnitPriceMinor) ||
    !isMoney(value.sellingUnitPriceMinor) ||
    value.listUnitPriceMinor < value.sellingUnitPriceMinor ||
    !isMoney(value.listSubtotalMinor) ||
    !isMoney(value.productDiscountMinor) ||
    !isMoney(value.merchandiseSubtotalMinor)
  )
    return false;

  const shipmentWeight = safeMultiply(value.unitWeightGrams, value.quantity);
  const listSubtotal = safeMultiply(value.listUnitPriceMinor, value.quantity);
  const merchandiseSubtotal = safeMultiply(value.sellingUnitPriceMinor, value.quantity);
  return (
    shipmentWeight === value.shipmentWeightGrams &&
    listSubtotal === value.listSubtotalMinor &&
    merchandiseSubtotal === value.merchandiseSubtotalMinor &&
    listSubtotal !== null &&
    merchandiseSubtotal !== null &&
    listSubtotal - merchandiseSubtotal === value.productDiscountMinor
  );
}

const SERVICE_RULES: Record<
  ShippingServiceCode,
  {
    base: number;
    perBlock: number;
    etaMin: number;
    etaMax: number;
  }
> = {
  ECONOMY: { base: 15_000, perBlock: 3_000, etaMin: 4, etaMax: 6 },
  STANDARD: { base: 22_000, perBlock: 4_000, etaMin: 2, etaMax: 4 },
  EXPRESS: { base: 35_000, perBlock: 6_000, etaMin: 1, etaMax: 2 },
};

function isShipping(value: unknown): value is MockShippingBreakdown {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
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
    value.provider !== 'MOCK' ||
    value.version !== MOCK_SHIPPING_VERSION ||
    !isUuid(value.shopId) ||
    !isText(value.originProvince) ||
    !isText(value.destinationProvince) ||
    typeof value.zone !== 'string' ||
    !zones.has(value.zone as ShippingZone) ||
    !isPositiveInteger(value.shipmentWeightGrams) ||
    !isService(value.service) ||
    !isPositiveInteger(value.estimatedDaysMin) ||
    !isPositiveInteger(value.estimatedDaysMax) ||
    value.estimatedDaysMin > value.estimatedDaysMax ||
    !isMoney(value.baseFeeMinor) ||
    !isMoney(value.zoneSurchargeMinor) ||
    !isMoney(value.weightSurchargeMinor) ||
    !isMoney(value.shippingFeeMinor)
  )
    return false;

  const rule = SERVICE_RULES[value.service];
  const expectedZone =
    value.zone === 'SAME_PROVINCE' ? 0 : value.zone === 'SAME_REGION' ? 6_000 : 12_000;
  const extraBlocks = Math.ceil(Math.max(0, value.shipmentWeightGrams - 500) / 500);
  const expectedWeight = safeMultiply(extraBlocks, rule.perBlock);
  const expectedFee =
    expectedWeight === null ? null : safeAdd([rule.base, expectedZone, expectedWeight]);
  return (
    value.baseFeeMinor === rule.base &&
    value.zoneSurchargeMinor === expectedZone &&
    value.weightSurchargeMinor === expectedWeight &&
    value.shippingFeeMinor === expectedFee &&
    value.estimatedDaysMin === rule.etaMin &&
    value.estimatedDaysMax === rule.etaMax
  );
}

function isShop(value: unknown): value is PricingQuoteShop {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'shop',
      'lines',
      'shipping',
      'listSubtotalMinor',
      'productDiscountMinor',
      'merchandiseSubtotalMinor',
      'payableTotalMinor',
    ]) ||
    !isRecord(value.shop) ||
    !hasExactKeys(value.shop, ['id', 'slug', 'name']) ||
    !isUuid(value.shop.id) ||
    typeof value.shop.slug !== 'string' ||
    !canonicalSlug.test(value.shop.slug) ||
    !isText(value.shop.name) ||
    !Array.isArray(value.lines) ||
    value.lines.length === 0 ||
    !value.lines.every(isLine) ||
    !isShipping(value.shipping) ||
    value.shipping.shopId !== value.shop.id ||
    !isMoney(value.listSubtotalMinor) ||
    !isMoney(value.productDiscountMinor) ||
    !isMoney(value.merchandiseSubtotalMinor) ||
    !isMoney(value.payableTotalMinor)
  )
    return false;

  const lines = value.lines as PricingQuoteLine[];
  const list = safeAdd(lines.map((line) => line.listSubtotalMinor));
  const discount = safeAdd(lines.map((line) => line.productDiscountMinor));
  const merchandise = safeAdd(lines.map((line) => line.merchandiseSubtotalMinor));
  const weight = safeAdd(lines.map((line) => line.shipmentWeightGrams));
  const payable = safeAdd([value.merchandiseSubtotalMinor, value.shipping.shippingFeeMinor]);
  return (
    new Set(lines.map((line) => line.lineId)).size === lines.length &&
    list === value.listSubtotalMinor &&
    discount === value.productDiscountMinor &&
    merchandise === value.merchandiseSubtotalMinor &&
    weight === value.shipping.shipmentWeightGrams &&
    payable === value.payableTotalMinor &&
    list !== null &&
    merchandise !== null &&
    list - merchandise === discount
  );
}

function isExclusion(value: unknown): value is PricingQuoteExclusion {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['lineId', 'code', 'message']) &&
    isUuid(value.lineId) &&
    typeof value.code === 'string' &&
    exclusionCodes.has(value.code as PricingExclusionCode) &&
    isText(value.message)
  );
}

function isSummary(value: unknown): value is PricingQuoteSummary {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'selectedLineCount',
      'selectedQuantity',
      'listSubtotalMinor',
      'productDiscountMinor',
      'merchandiseSubtotalMinor',
      'shippingTotalMinor',
      'payableTotalMinor',
    ]) &&
    isNonNegativeInteger(value.selectedLineCount) &&
    isNonNegativeInteger(value.selectedQuantity) &&
    isMoney(value.listSubtotalMinor) &&
    isMoney(value.productDiscountMinor) &&
    isMoney(value.merchandiseSubtotalMinor) &&
    isMoney(value.shippingTotalMinor) &&
    isMoney(value.payableTotalMinor)
  );
}

export function isPricingQuoteResponse(value: unknown): value is PricingQuoteResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'pricingVersion',
      'shippingVersion',
      'currency',
      'cartVersion',
      'address',
      'shops',
      'exclusions',
      'summary',
    ]) ||
    value.pricingVersion !== PRICING_VERSION ||
    value.shippingVersion !== MOCK_SHIPPING_VERSION ||
    value.currency !== PRICING_CURRENCY ||
    !isNonNegativeInteger(value.cartVersion) ||
    !isAddress(value.address) ||
    !Array.isArray(value.shops) ||
    !value.shops.every(isShop) ||
    !Array.isArray(value.exclusions) ||
    !value.exclusions.every(isExclusion) ||
    !isSummary(value.summary)
  )
    return false;

  const shops = value.shops as PricingQuoteShop[];
  const lines = shops.flatMap((shop) => shop.lines);
  const exclusions = value.exclusions as PricingQuoteExclusion[];
  const list = safeAdd(shops.map((shop) => shop.listSubtotalMinor));
  const discount = safeAdd(shops.map((shop) => shop.productDiscountMinor));
  const merchandise = safeAdd(shops.map((shop) => shop.merchandiseSubtotalMinor));
  const shipping = safeAdd(shops.map((shop) => shop.shipping.shippingFeeMinor));
  const payable = safeAdd(shops.map((shop) => shop.payableTotalMinor));
  const quantity = safeAdd(lines.map((line) => line.quantity));
  return (
    new Set(shops.map((shop) => shop.shop.id)).size === shops.length &&
    new Set(lines.map((line) => line.lineId)).size === lines.length &&
    new Set(exclusions.map((item) => item.lineId)).size === exclusions.length &&
    exclusions.every((item) => !lines.some((line) => line.lineId === item.lineId)) &&
    value.summary.selectedLineCount === lines.length &&
    value.summary.selectedQuantity === quantity &&
    value.summary.listSubtotalMinor === list &&
    value.summary.productDiscountMinor === discount &&
    value.summary.merchandiseSubtotalMinor === merchandise &&
    value.summary.shippingTotalMinor === shipping &&
    value.summary.payableTotalMinor === payable &&
    list !== null &&
    merchandise !== null &&
    list - merchandise === discount &&
    safeAdd([value.summary.merchandiseSubtotalMinor, value.summary.shippingTotalMinor]) === payable
  );
}

export function isPricingProblemDetails(value: unknown): value is PricingProblemDetails {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['type', 'title', 'status', 'detail'], ['invalidParameters']) ||
    !isText(value.type) ||
    !problemType.test(value.type) ||
    !isText(value.title) ||
    value.title.length > 120 ||
    typeof value.status !== 'number' ||
    !problemStatuses.has(value.status) ||
    !isText(value.detail) ||
    value.detail.length > 500
  )
    return false;
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

export const parsePricingQuoteResponse = (value: unknown): PricingQuoteResponse | null =>
  isPricingQuoteResponse(value) ? value : null;
export const parsePricingProblemDetails = (value: unknown): PricingProblemDetails | null =>
  isPricingProblemDetails(value) ? value : null;
