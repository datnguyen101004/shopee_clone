import {
  VOUCHER_BENEFIT_TYPES,
  VOUCHER_ISSUERS,
  VOUCHER_REJECTION_REASONS,
  VOUCHER_SLOTS,
  VOUCHER_VERSION,
  normalizeVoucherCode,
  type ShopVoucherCodeSelection,
  type VoucherBenefitType,
  type VoucherCodeSelection,
  type VoucherDiscountAllocation,
  type VoucherIssuer,
  type VoucherRejectionReason,
  type VoucherSelectionResult,
  type VoucherSlot,
} from './vouchers';

export const PRICING_VERSION = 'pricing-v2' as const;
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
  vouchers?: VoucherCodeSelection;
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
  shopVoucherDiscountMinor: number;
  platformVoucherDiscountMinor: number;
  merchandiseVoucherDiscountMinor: number;
  payableMerchandiseMinor: number;
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
  shopVoucherDiscountMinor: number;
  platformVoucherDiscountMinor: number;
  merchandiseVoucherDiscountMinor: number;
  shippingVoucherDiscountMinor: number;
  voucherDiscountMinor: number;
  shippingPayableMinor: number;
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
  shopVoucherDiscountMinor: number;
  platformVoucherDiscountMinor: number;
  merchandiseVoucherDiscountMinor: number;
  shippingVoucherDiscountMinor: number;
  voucherDiscountMinor: number;
  shippingPayableMinor: number;
  payableTotalMinor: number;
}

export interface PricingQuoteResponse {
  pricingVersion: typeof PRICING_VERSION;
  voucherVersion: typeof VOUCHER_VERSION;
  shippingVersion: typeof MOCK_SHIPPING_VERSION;
  currency: typeof PRICING_CURRENCY;
  evaluatedAt: string;
  cartVersion: number;
  address: PricingQuoteAddress;
  shops: PricingQuoteShop[];
  vouchers: VoucherSelectionResult[];
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
const voucherSlots = new Set<string>(VOUCHER_SLOTS);
const voucherIssuers = new Set<string>(VOUCHER_ISSUERS);
const voucherBenefitTypes = new Set<string>(VOUCHER_BENEFIT_TYPES);
const voucherRejectionReasons = new Set<string>(VOUCHER_REJECTION_REASONS);

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
const isNullableText = (value: unknown): value is string | null => value === null || isText(value);
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isMoney = isNonNegativeInteger;

function safeAdd(values: readonly number[]): number | null {
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

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
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

function isShopVoucherSelection(value: unknown): value is ShopVoucherCodeSelection {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['shopId', 'code']) &&
    isUuid(value.shopId) &&
    normalizeVoucherCode(value.code) !== null
  );
}

function isVoucherCodeSelection(value: unknown): value is VoucherCodeSelection {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [], ['platformCode', 'shopCodes', 'freeShippingCode']) ||
    !(value.platformCode === undefined || normalizeVoucherCode(value.platformCode) !== null) ||
    !(
      value.freeShippingCode === undefined || normalizeVoucherCode(value.freeShippingCode) !== null
    ) ||
    !(
      value.shopCodes === undefined ||
      (Array.isArray(value.shopCodes) &&
        value.shopCodes.length <= 50 &&
        value.shopCodes.every(isShopVoucherSelection))
    )
  ) {
    return false;
  }
  const shopCodes = (value.shopCodes ?? []) as ShopVoucherCodeSelection[];
  const codes = [value.platformCode, ...shopCodes.map(({ code }) => code), value.freeShippingCode]
    .filter((code): code is string => typeof code === 'string')
    .map((code) => normalizeVoucherCode(code)!);
  return (
    new Set(shopCodes.map(({ shopId }) => shopId)).size === shopCodes.length &&
    new Set(codes).size === codes.length
  );
}

export function isPricingQuoteRequest(value: unknown): value is PricingQuoteRequest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['shippingAddressId'], ['services', 'vouchers']) ||
    !isUuid(value.shippingAddressId) ||
    !(
      value.services === undefined ||
      (Array.isArray(value.services) &&
        value.services.length <= 50 &&
        value.services.every(isSelection))
    ) ||
    !(value.vouchers === undefined || isVoucherCodeSelection(value.vouchers))
  ) {
    return false;
  }
  const selections = (value.services ?? []) as ShopShippingServiceSelection[];
  return new Set(selections.map(({ shopId }) => shopId)).size === selections.length;
}

export function parsePricingQuoteRequest(value: unknown): PricingQuoteRequest | null {
  if (!isPricingQuoteRequest(value)) return null;
  const vouchers = value.vouchers;
  return {
    shippingAddressId: value.shippingAddressId,
    ...(value.services ? { services: value.services.map((selection) => ({ ...selection })) } : {}),
    ...(vouchers
      ? {
          vouchers: {
            ...(vouchers.platformCode
              ? { platformCode: normalizeVoucherCode(vouchers.platformCode)! }
              : {}),
            ...(vouchers.shopCodes
              ? {
                  shopCodes: vouchers.shopCodes.map(({ shopId, code }) => ({
                    shopId,
                    code: normalizeVoucherCode(code)!,
                  })),
                }
              : {}),
            ...(vouchers.freeShippingCode
              ? { freeShippingCode: normalizeVoucherCode(vouchers.freeShippingCode)! }
              : {}),
          },
        }
      : {}),
  };
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
      'shopVoucherDiscountMinor',
      'platformVoucherDiscountMinor',
      'merchandiseVoucherDiscountMinor',
      'payableMerchandiseMinor',
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
    !isMoney(value.merchandiseSubtotalMinor) ||
    !isMoney(value.shopVoucherDiscountMinor) ||
    !isMoney(value.platformVoucherDiscountMinor) ||
    !isMoney(value.merchandiseVoucherDiscountMinor) ||
    !isMoney(value.payableMerchandiseMinor)
  )
    return false;

  const shipmentWeight = safeMultiply(value.unitWeightGrams, value.quantity);
  const listSubtotal = safeMultiply(value.listUnitPriceMinor, value.quantity);
  const merchandiseSubtotal = safeMultiply(value.sellingUnitPriceMinor, value.quantity);
  const voucherDiscount = safeAdd([
    value.shopVoucherDiscountMinor,
    value.platformVoucherDiscountMinor,
  ]);
  return (
    shipmentWeight === value.shipmentWeightGrams &&
    listSubtotal === value.listSubtotalMinor &&
    merchandiseSubtotal === value.merchandiseSubtotalMinor &&
    listSubtotal !== null &&
    merchandiseSubtotal !== null &&
    listSubtotal - merchandiseSubtotal === value.productDiscountMinor &&
    voucherDiscount === value.merchandiseVoucherDiscountMinor &&
    value.merchandiseVoucherDiscountMinor <= value.merchandiseSubtotalMinor &&
    value.payableMerchandiseMinor ===
      value.merchandiseSubtotalMinor - value.merchandiseVoucherDiscountMinor
  );
}

const SERVICE_RULES: Record<
  ShippingServiceCode,
  { base: number; perBlock: number; etaMin: number; etaMax: number }
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
      'shopVoucherDiscountMinor',
      'platformVoucherDiscountMinor',
      'merchandiseVoucherDiscountMinor',
      'shippingVoucherDiscountMinor',
      'voucherDiscountMinor',
      'shippingPayableMinor',
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
    !isMoney(value.shopVoucherDiscountMinor) ||
    !isMoney(value.platformVoucherDiscountMinor) ||
    !isMoney(value.merchandiseVoucherDiscountMinor) ||
    !isMoney(value.shippingVoucherDiscountMinor) ||
    !isMoney(value.voucherDiscountMinor) ||
    !isMoney(value.shippingPayableMinor) ||
    !isMoney(value.payableTotalMinor)
  )
    return false;

  const lines = value.lines as PricingQuoteLine[];
  const list = safeAdd(lines.map((line) => line.listSubtotalMinor));
  const productDiscount = safeAdd(lines.map((line) => line.productDiscountMinor));
  const merchandise = safeAdd(lines.map((line) => line.merchandiseSubtotalMinor));
  const shopDiscount = safeAdd(lines.map((line) => line.shopVoucherDiscountMinor));
  const platformDiscount = safeAdd(lines.map((line) => line.platformVoucherDiscountMinor));
  const merchandiseDiscount = safeAdd(lines.map((line) => line.merchandiseVoucherDiscountMinor));
  const payableMerchandise = safeAdd(lines.map((line) => line.payableMerchandiseMinor));
  const weight = safeAdd(lines.map((line) => line.shipmentWeightGrams));
  const voucherDiscount = safeAdd([
    value.merchandiseVoucherDiscountMinor,
    value.shippingVoucherDiscountMinor,
  ]);
  const payable =
    payableMerchandise === null ? null : safeAdd([payableMerchandise, value.shippingPayableMinor]);
  return (
    new Set(lines.map((line) => line.lineId)).size === lines.length &&
    list === value.listSubtotalMinor &&
    productDiscount === value.productDiscountMinor &&
    merchandise === value.merchandiseSubtotalMinor &&
    shopDiscount === value.shopVoucherDiscountMinor &&
    platformDiscount === value.platformVoucherDiscountMinor &&
    merchandiseDiscount === value.merchandiseVoucherDiscountMinor &&
    weight === value.shipping.shipmentWeightGrams &&
    value.shippingVoucherDiscountMinor <= value.shipping.shippingFeeMinor &&
    value.shippingPayableMinor ===
      value.shipping.shippingFeeMinor - value.shippingVoucherDiscountMinor &&
    voucherDiscount === value.voucherDiscountMinor &&
    payable === value.payableTotalMinor &&
    list !== null &&
    merchandise !== null &&
    list - merchandise === productDiscount
  );
}

function isVoucherAllocation(value: unknown): value is VoucherDiscountAllocation {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['shopId', 'lineId', 'amountMinor']) &&
    isUuid(value.shopId) &&
    (value.lineId === null || isUuid(value.lineId)) &&
    isPositiveInteger(value.amountMinor)
  );
}

function isNullableIssuer(value: unknown): value is VoucherIssuer | null {
  return value === null || (typeof value === 'string' && voucherIssuers.has(value));
}

function isNullableBenefit(value: unknown): value is VoucherBenefitType | null {
  return value === null || (typeof value === 'string' && voucherBenefitTypes.has(value));
}

function isNullableReason(value: unknown): value is VoucherRejectionReason | null {
  return value === null || (typeof value === 'string' && voucherRejectionReasons.has(value));
}

function isVoucherResult(value: unknown): value is VoucherSelectionResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'code',
      'slot',
      'shopId',
      'status',
      'name',
      'issuer',
      'benefitType',
      'rejectionReason',
      'discountMinor',
      'merchandiseDiscountMinor',
      'shippingDiscountMinor',
      'allocations',
    ]) ||
    normalizeVoucherCode(value.code) !== value.code ||
    typeof value.slot !== 'string' ||
    !voucherSlots.has(value.slot) ||
    !(value.shopId === null || isUuid(value.shopId)) ||
    !(value.status === 'APPLIED' || value.status === 'REJECTED') ||
    !isNullableText(value.name) ||
    !isNullableIssuer(value.issuer) ||
    !isNullableBenefit(value.benefitType) ||
    !isNullableReason(value.rejectionReason) ||
    !isMoney(value.discountMinor) ||
    !isMoney(value.merchandiseDiscountMinor) ||
    !isMoney(value.shippingDiscountMinor) ||
    !Array.isArray(value.allocations) ||
    !value.allocations.every(isVoucherAllocation)
  ) {
    return false;
  }
  const slot = value.slot as VoucherSlot;
  const allocations = value.allocations as VoucherDiscountAllocation[];
  const discount = safeAdd([value.merchandiseDiscountMinor, value.shippingDiscountMinor]);
  const allocated = safeAdd(allocations.map(({ amountMinor }) => amountMinor));
  const uniqueAllocations = new Set(
    allocations.map(({ shopId, lineId }) => `${shopId}:${lineId ?? 'shipping'}`),
  ).size;
  const slotShape = slot === 'SHOP' ? value.shopId !== null : value.shopId === null;
  if (!slotShape || uniqueAllocations !== allocations.length || discount !== value.discountMinor)
    return false;

  if (value.status === 'REJECTED') {
    return (
      value.rejectionReason !== null &&
      value.discountMinor === 0 &&
      value.merchandiseDiscountMinor === 0 &&
      value.shippingDiscountMinor === 0 &&
      allocations.length === 0 &&
      (value.rejectionReason !== 'NOT_FOUND' ||
        (value.name === null && value.issuer === null && value.benefitType === null))
    );
  }

  if (
    value.rejectionReason !== null ||
    value.name === null ||
    value.issuer === null ||
    value.benefitType === null ||
    value.discountMinor <= 0 ||
    allocated !== value.discountMinor
  )
    return false;
  if (slot === 'FREE_SHIPPING') {
    return (
      value.issuer === 'PLATFORM' &&
      value.benefitType === 'FREE_SHIPPING' &&
      value.merchandiseDiscountMinor === 0 &&
      value.shippingDiscountMinor === value.discountMinor &&
      allocations.every(({ lineId }) => lineId === null)
    );
  }
  return (
    value.benefitType !== 'FREE_SHIPPING' &&
    value.shippingDiscountMinor === 0 &&
    value.merchandiseDiscountMinor === value.discountMinor &&
    allocations.every(({ lineId }) => lineId !== null) &&
    (slot === 'SHOP' ? value.issuer === 'SHOP' : value.issuer === 'PLATFORM')
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
      'shopVoucherDiscountMinor',
      'platformVoucherDiscountMinor',
      'merchandiseVoucherDiscountMinor',
      'shippingVoucherDiscountMinor',
      'voucherDiscountMinor',
      'shippingPayableMinor',
      'payableTotalMinor',
    ]) &&
    isNonNegativeInteger(value.selectedLineCount) &&
    isNonNegativeInteger(value.selectedQuantity) &&
    isMoney(value.listSubtotalMinor) &&
    isMoney(value.productDiscountMinor) &&
    isMoney(value.merchandiseSubtotalMinor) &&
    isMoney(value.shippingTotalMinor) &&
    isMoney(value.shopVoucherDiscountMinor) &&
    isMoney(value.platformVoucherDiscountMinor) &&
    isMoney(value.merchandiseVoucherDiscountMinor) &&
    isMoney(value.shippingVoucherDiscountMinor) &&
    isMoney(value.voucherDiscountMinor) &&
    isMoney(value.shippingPayableMinor) &&
    isMoney(value.payableTotalMinor)
  );
}

export function isPricingQuoteResponse(value: unknown): value is PricingQuoteResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'pricingVersion',
      'voucherVersion',
      'shippingVersion',
      'currency',
      'evaluatedAt',
      'cartVersion',
      'address',
      'shops',
      'vouchers',
      'exclusions',
      'summary',
    ]) ||
    value.pricingVersion !== PRICING_VERSION ||
    value.voucherVersion !== VOUCHER_VERSION ||
    value.shippingVersion !== MOCK_SHIPPING_VERSION ||
    value.currency !== PRICING_CURRENCY ||
    !isIsoInstant(value.evaluatedAt) ||
    !isNonNegativeInteger(value.cartVersion) ||
    !isAddress(value.address) ||
    !Array.isArray(value.shops) ||
    !value.shops.every(isShop) ||
    !Array.isArray(value.vouchers) ||
    !value.vouchers.every(isVoucherResult) ||
    !Array.isArray(value.exclusions) ||
    !value.exclusions.every(isExclusion) ||
    !isSummary(value.summary)
  )
    return false;

  const shops = value.shops as PricingQuoteShop[];
  const lines = shops.flatMap((shop) => shop.lines);
  const vouchers = value.vouchers as VoucherSelectionResult[];
  const exclusions = value.exclusions as PricingQuoteExclusion[];
  const slotKeys = vouchers.map(({ slot, shopId }) => `${slot}:${shopId ?? 'global'}`);
  if (
    new Set(shops.map((shop) => shop.shop.id)).size !== shops.length ||
    new Set(lines.map((line) => line.lineId)).size !== lines.length ||
    new Set(exclusions.map((item) => item.lineId)).size !== exclusions.length ||
    new Set(vouchers.map(({ code }) => code)).size !== vouchers.length ||
    new Set(slotKeys).size !== slotKeys.length ||
    exclusions.some((item) => lines.some((line) => line.lineId === item.lineId))
  )
    return false;

  const shopById = new Map(shops.map((shop) => [shop.shop.id, shop]));
  const lineById = new Map(lines.map((line) => [line.lineId, line]));
  const expectedLineShop = new Map<string, number>();
  const expectedLinePlatform = new Map<string, number>();
  const expectedShopShipping = new Map<string, number>();
  for (const result of vouchers) {
    for (const allocation of result.allocations) {
      const shop = shopById.get(allocation.shopId);
      if (!shop) return false;
      if (allocation.lineId === null) {
        if (result.slot !== 'FREE_SHIPPING') return false;
        expectedShopShipping.set(
          allocation.shopId,
          (expectedShopShipping.get(allocation.shopId) ?? 0) + allocation.amountMinor,
        );
      } else {
        const line = lineById.get(allocation.lineId);
        if (!line || !shop.lines.some(({ lineId }) => lineId === allocation.lineId)) return false;
        const target = result.slot === 'SHOP' ? expectedLineShop : expectedLinePlatform;
        target.set(
          allocation.lineId,
          (target.get(allocation.lineId) ?? 0) + allocation.amountMinor,
        );
      }
    }
  }
  if (
    lines.some(
      (line) =>
        line.shopVoucherDiscountMinor !== (expectedLineShop.get(line.lineId) ?? 0) ||
        line.platformVoucherDiscountMinor !== (expectedLinePlatform.get(line.lineId) ?? 0),
    ) ||
    shops.some(
      (shop) => shop.shippingVoucherDiscountMinor !== (expectedShopShipping.get(shop.shop.id) ?? 0),
    )
  )
    return false;

  const quantity = safeAdd(lines.map((line) => line.quantity));
  const list = safeAdd(shops.map((shop) => shop.listSubtotalMinor));
  const productDiscount = safeAdd(shops.map((shop) => shop.productDiscountMinor));
  const merchandise = safeAdd(shops.map((shop) => shop.merchandiseSubtotalMinor));
  const shipping = safeAdd(shops.map((shop) => shop.shipping.shippingFeeMinor));
  const shopVoucher = safeAdd(shops.map((shop) => shop.shopVoucherDiscountMinor));
  const platformVoucher = safeAdd(shops.map((shop) => shop.platformVoucherDiscountMinor));
  const merchandiseVoucher = safeAdd(shops.map((shop) => shop.merchandiseVoucherDiscountMinor));
  const shippingVoucher = safeAdd(shops.map((shop) => shop.shippingVoucherDiscountMinor));
  const voucherDiscount = safeAdd(shops.map((shop) => shop.voucherDiscountMinor));
  const shippingPayable = safeAdd(shops.map((shop) => shop.shippingPayableMinor));
  const payable = safeAdd(shops.map((shop) => shop.payableTotalMinor));
  const appliedMerchandise = safeAdd(vouchers.map((voucher) => voucher.merchandiseDiscountMinor));
  const appliedShipping = safeAdd(vouchers.map((voucher) => voucher.shippingDiscountMinor));
  return (
    value.summary.selectedLineCount === lines.length &&
    value.summary.selectedQuantity === quantity &&
    value.summary.listSubtotalMinor === list &&
    value.summary.productDiscountMinor === productDiscount &&
    value.summary.merchandiseSubtotalMinor === merchandise &&
    value.summary.shippingTotalMinor === shipping &&
    value.summary.shopVoucherDiscountMinor === shopVoucher &&
    value.summary.platformVoucherDiscountMinor === platformVoucher &&
    value.summary.merchandiseVoucherDiscountMinor === merchandiseVoucher &&
    value.summary.shippingVoucherDiscountMinor === shippingVoucher &&
    value.summary.voucherDiscountMinor === voucherDiscount &&
    value.summary.shippingPayableMinor === shippingPayable &&
    value.summary.payableTotalMinor === payable &&
    appliedMerchandise === merchandiseVoucher &&
    appliedShipping === shippingVoucher &&
    safeAdd([
      value.summary.shopVoucherDiscountMinor,
      value.summary.platformVoucherDiscountMinor,
    ]) === merchandiseVoucher &&
    safeAdd([
      value.summary.merchandiseVoucherDiscountMinor,
      value.summary.shippingVoucherDiscountMinor,
    ]) === voucherDiscount &&
    shipping !== null &&
    shippingPayable !== null &&
    shipping - shippingVoucher! === shippingPayable &&
    merchandise !== null &&
    merchandiseVoucher !== null &&
    payable !== null &&
    merchandise - merchandiseVoucher + shippingPayable === payable &&
    list !== null &&
    list - merchandise === productDiscount
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
