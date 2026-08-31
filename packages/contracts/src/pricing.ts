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
export const DEMO_CARRIER_SHIPPING_VERSION = 'demo-distance-v1' as const;
export const PRICING_CURRENCY = 'VND' as const;
export const BUYER_BEST_PRICE_VERSION = 'buyer-best-price-v1' as const;
export const SHIPPING_SERVICES = ['ECONOMY', 'STANDARD', 'EXPRESS'] as const;

/** Server-authoritative scheduled product price details exposed to storefronts. */
export interface PublicScheduledPriceBreakdown {
  basePriceMinor: number;
  effectivePriceMinor: number;
  compareAtPriceMinor: number | null;
  discountBasisPoints: number;
  campaignId: string;
  evaluatedAt: string;
}

export type BuyerBestPriceVoucherSlot = 'SHOP' | 'PLATFORM' | 'FREE_SHIPPING';

export interface AppliedPreviewVoucher {
  code: string;
  name: string;
  slot: BuyerBestPriceVoucherSlot;
  discountMinor: number;
}

export interface BuyerBestPriceShippingPreview {
  service: 'STANDARD';
  shippingFeeMinor: number;
  voucher: AppliedPreviewVoucher | null;
  shippingVoucherDiscountMinor: number;
  shippingPayableMinor: number;
  estimatedPayableMinor: number;
}

export interface BuyerBestPricePreview {
  version: typeof BUYER_BEST_PRICE_VERSION;
  quantity: 1;
  currency: typeof PRICING_CURRENCY;
  evaluatedAt: string;
  effectivePriceMinor: number;
  shopVoucher: AppliedPreviewVoucher | null;
  platformVoucher: AppliedPreviewVoucher | null;
  shopVoucherDiscountMinor: number;
  platformVoucherDiscountMinor: number;
  merchandiseDiscountMinor: number;
  merchandisePayableMinor: number;
  shipping: BuyerBestPriceShippingPreview | null;
}

/** Minimal public price shape shared by storefront product surfaces. */
export interface EffectiveProductPrice {
  priceMinor: number;
  scheduledPrice?: PublicScheduledPriceBreakdown;
  buyerBestPrice?: BuyerBestPricePreview;
}

/** Selects a server-provided display price without recalculating campaign discounts. */
export function effectiveProductPriceMinor(value: EffectiveProductPrice): number {
  return value.scheduledPrice?.effectivePriceMinor ?? value.priceMinor;
}

/** Selects a validated personalized merchandise price, with safe effective-price fallback. */
export function buyerDisplayProductPriceMinor(value: EffectiveProductPrice): number {
  const effectivePriceMinor = effectiveProductPriceMinor(value);
  return isBuyerBestPricePreview(value.buyerBestPrice) &&
    value.buyerBestPrice.effectivePriceMinor === effectivePriceMinor
    ? value.buyerBestPrice.merchandisePayableMinor
    : effectivePriceMinor;
}

export function isPublicScheduledPriceBreakdown(
  value: unknown,
): value is PublicScheduledPriceBreakdown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(item.basePriceMinor) &&
    (item.basePriceMinor as number) > 0 &&
    Number.isSafeInteger(item.effectivePriceMinor) &&
    (item.effectivePriceMinor as number) > 0 &&
    (item.compareAtPriceMinor === null ||
      (Number.isSafeInteger(item.compareAtPriceMinor) &&
        (item.compareAtPriceMinor as number) >= (item.effectivePriceMinor as number))) &&
    Number.isInteger(item.discountBasisPoints) &&
    (item.discountBasisPoints as number) >= 1 &&
    (item.discountBasisPoints as number) <= 9000 &&
    typeof item.campaignId === 'string' &&
    item.campaignId.length > 0 &&
    typeof item.evaluatedAt === 'string' &&
    Number.isFinite(Date.parse(item.evaluatedAt)) &&
    (item.effectivePriceMinor as number) < (item.basePriceMinor as number)
  );
}

function isAppliedPreviewVoucher(
  value: unknown,
  slot: BuyerBestPriceVoucherSlot,
  discountMinor: number,
): value is AppliedPreviewVoucher {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['code', 'name', 'slot', 'discountMinor']) &&
    normalizeVoucherCode(value.code) === value.code &&
    isText(value.name) &&
    value.slot === slot &&
    isPositiveInteger(value.discountMinor) &&
    value.discountMinor === discountMinor
  );
}

export function isBuyerBestPricePreview(value: unknown): value is BuyerBestPricePreview {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'version',
      'quantity',
      'currency',
      'evaluatedAt',
      'effectivePriceMinor',
      'shopVoucher',
      'platformVoucher',
      'shopVoucherDiscountMinor',
      'platformVoucherDiscountMinor',
      'merchandiseDiscountMinor',
      'merchandisePayableMinor',
      'shipping',
    ]) ||
    value.version !== BUYER_BEST_PRICE_VERSION ||
    value.quantity !== 1 ||
    value.currency !== PRICING_CURRENCY ||
    !isIsoInstant(value.evaluatedAt) ||
    !isMoney(value.effectivePriceMinor) ||
    !isMoney(value.shopVoucherDiscountMinor) ||
    !isMoney(value.platformVoucherDiscountMinor) ||
    !isMoney(value.merchandiseDiscountMinor) ||
    !isMoney(value.merchandisePayableMinor)
  ) {
    return false;
  }

  const merchandiseDiscount = safeAdd([
    value.shopVoucherDiscountMinor,
    value.platformVoucherDiscountMinor,
  ]);
  if (
    merchandiseDiscount !== value.merchandiseDiscountMinor ||
    value.merchandiseDiscountMinor > value.effectivePriceMinor ||
    value.merchandisePayableMinor !== value.effectivePriceMinor - value.merchandiseDiscountMinor ||
    (value.shopVoucherDiscountMinor === 0
      ? value.shopVoucher !== null
      : !isAppliedPreviewVoucher(value.shopVoucher, 'SHOP', value.shopVoucherDiscountMinor)) ||
    (value.platformVoucherDiscountMinor === 0
      ? value.platformVoucher !== null
      : !isAppliedPreviewVoucher(
          value.platformVoucher,
          'PLATFORM',
          value.platformVoucherDiscountMinor,
        ))
  ) {
    return false;
  }

  if (value.shipping === null) return true;
  if (
    !isRecord(value.shipping) ||
    !hasExactKeys(value.shipping, [
      'service',
      'shippingFeeMinor',
      'voucher',
      'shippingVoucherDiscountMinor',
      'shippingPayableMinor',
      'estimatedPayableMinor',
    ]) ||
    value.shipping.service !== 'STANDARD' ||
    !isMoney(value.shipping.shippingFeeMinor) ||
    !isMoney(value.shipping.shippingVoucherDiscountMinor) ||
    value.shipping.shippingVoucherDiscountMinor > value.shipping.shippingFeeMinor ||
    !isMoney(value.shipping.shippingPayableMinor) ||
    value.shipping.shippingPayableMinor !==
      value.shipping.shippingFeeMinor - value.shipping.shippingVoucherDiscountMinor ||
    !isMoney(value.shipping.estimatedPayableMinor) ||
    safeAdd([value.merchandisePayableMinor, value.shipping.shippingPayableMinor]) !==
      value.shipping.estimatedPayableMinor ||
    (value.shipping.shippingVoucherDiscountMinor === 0
      ? value.shipping.voucher !== null
      : !isAppliedPreviewVoucher(
          value.shipping.voucher,
          'FREE_SHIPPING',
          value.shipping.shippingVoucherDiscountMinor,
        ))
  ) {
    return false;
  }
  return true;
}

export type ShippingServiceCode = (typeof SHIPPING_SERVICES)[number];
export type ShippingZone = 'SAME_PROVINCE' | 'SAME_REGION' | 'CROSS_REGION' | 'UNKNOWN';
export type PricingExclusionCode = 'unavailable' | 'insufficient-stock';

export interface ShopShippingServiceSelection {
  shopId: string;
  service: ShippingServiceCode;
}

export interface PricingQuoteRequest {
  shippingAddressId?: string;
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

/** New distance-based quote. Kept separate from MockShippingBreakdown so old
 * order snapshots can continue to be parsed without optional-field guessing. */
export interface DemoCarrierShippingBreakdown {
  provider: 'DEMO_CARRIER';
  version: typeof DEMO_CARRIER_SHIPPING_VERSION;
  shopId: string;
  originProvinceCode: string;
  originDistrictCode: string;
  originProvince: string;
  originDistrict: string;
  destinationProvinceCode: string;
  destinationDistrictCode: string;
  destinationProvince: string;
  destinationDistrict: string;
  shipmentWeightGrams: number;
  service: ShippingServiceCode;
  simulation: true;
  straightLineDistanceKm: number;
  estimatedDistanceKm: number;
  billableDistanceKm: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  baseFeeMinor: number;
  nearDistanceFeeMinor: number;
  longDistanceFeeMinor: number;
  weightFeeMinor: number;
  shippingFeeMinor: number;
  calculationVersion: typeof DEMO_CARRIER_SHIPPING_VERSION;
  locationSnapshotVersion: string;
}

export type ShippingBreakdown = MockShippingBreakdown | DemoCarrierShippingBreakdown;

export interface PricingQuoteShop {
  shop: { id: string; ownerUserId: string; slug: string; name: string };
  lines: PricingQuoteLine[];
  shipping: ShippingBreakdown | null;
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

export interface AvailableShopVoucher {
  shopId: string;
  code: string;
  name: string;
  benefitType: Extract<VoucherBenefitType, 'FIXED_AMOUNT' | 'PERCENTAGE'>;
  minimumSpendMinor: number;
  estimatedDiscountMinor: number;
  remainingCount: number;
}

export interface AvailablePlatformVoucher {
  code: string;
  name: string;
  benefitType: Extract<VoucherBenefitType, 'FIXED_AMOUNT' | 'PERCENTAGE'>;
  minimumSpendMinor: number;
  estimatedDiscountMinor: number;
  remainingCount: number;
}

export interface AvailableShippingVoucher {
  code: string;
  name: string;
  benefitType: Extract<VoucherBenefitType, 'FREE_SHIPPING'>;
  minimumSpendMinor: number;
  estimatedDiscountMinor: number;
  remainingCount: number;
}

export interface PricingQuoteResponse {
  pricingVersion: typeof PRICING_VERSION;
  voucherVersion: typeof VOUCHER_VERSION;
  shippingVersion: typeof MOCK_SHIPPING_VERSION | typeof DEMO_CARRIER_SHIPPING_VERSION | null;
  currency: typeof PRICING_CURRENCY;
  evaluatedAt: string;
  cartVersion: number;
  address: PricingQuoteAddress | null;
  shops: PricingQuoteShop[];
  vouchers: VoucherSelectionResult[];
  availableShopVouchers?: AvailableShopVoucher[];
  availablePlatformVouchers?: AvailablePlatformVoucher[];
  availableShippingVouchers?: AvailableShippingVoucher[];
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
    !hasExactKeys(value, [], ['shippingAddressId', 'services', 'vouchers']) ||
    !(value.shippingAddressId === undefined || isUuid(value.shippingAddressId)) ||
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
  if (
    value.shippingAddressId === undefined &&
    ((Array.isArray(value.services) && value.services.length > 0) ||
      (isRecord(value.vouchers) && value.vouchers.freeShippingCode !== undefined))
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
    ...(value.shippingAddressId ? { shippingAddressId: value.shippingAddressId } : {}),
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

const DEMO_SERVICE_RULES: Record<
  ShippingServiceCode,
  { base: number; near: number; long: number; weight: number; etaMin: number; etaMax: number }
> = {
  ECONOMY: { base: 15_000, near: 2_000, long: 4_000, weight: 2_000, etaMin: 4, etaMax: 6 },
  STANDARD: { base: 22_000, near: 3_000, long: 6_000, weight: 3_000, etaMin: 2, etaMax: 4 },
  EXPRESS: { base: 35_000, near: 4_000, long: 8_000, weight: 4_000, etaMin: 1, etaMax: 2 },
};

export function isShippingBreakdown(value: unknown): value is ShippingBreakdown {
  if (!isRecord(value)) return false;
  if (value.provider === 'MOCK') {
    if (
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
  if (
    value.provider !== 'DEMO_CARRIER' ||
    !hasExactKeys(value, [
      'provider',
      'version',
      'shopId',
      'originProvinceCode',
      'originDistrictCode',
      'originProvince',
      'originDistrict',
      'destinationProvinceCode',
      'destinationDistrictCode',
      'destinationProvince',
      'destinationDistrict',
      'shipmentWeightGrams',
      'service',
      'simulation',
      'straightLineDistanceKm',
      'estimatedDistanceKm',
      'billableDistanceKm',
      'estimatedDaysMin',
      'estimatedDaysMax',
      'baseFeeMinor',
      'nearDistanceFeeMinor',
      'longDistanceFeeMinor',
      'weightFeeMinor',
      'shippingFeeMinor',
      'calculationVersion',
      'locationSnapshotVersion',
    ]) ||
    value.version !== DEMO_CARRIER_SHIPPING_VERSION ||
    !isUuid(value.shopId) ||
    !isText(value.originProvinceCode) ||
    !isText(value.originDistrictCode) ||
    !isText(value.originProvince) ||
    !isText(value.originDistrict) ||
    !isText(value.destinationProvinceCode) ||
    !isText(value.destinationDistrictCode) ||
    !isText(value.destinationProvince) ||
    !isText(value.destinationDistrict) ||
    !isPositiveInteger(value.shipmentWeightGrams) ||
    !isService(value.service) ||
    value.simulation !== true ||
    typeof value.straightLineDistanceKm !== 'number' ||
    !Number.isFinite(value.straightLineDistanceKm) ||
    !isPositiveInteger(value.estimatedDistanceKm) ||
    !isPositiveInteger(value.billableDistanceKm) ||
    value.billableDistanceKm < 3 ||
    value.billableDistanceKm > 2_000 ||
    !isPositiveInteger(value.estimatedDaysMin) ||
    !isPositiveInteger(value.estimatedDaysMax) ||
    value.estimatedDaysMin > value.estimatedDaysMax ||
    !isMoney(value.baseFeeMinor) ||
    !isMoney(value.nearDistanceFeeMinor) ||
    !isMoney(value.longDistanceFeeMinor) ||
    !isMoney(value.weightFeeMinor) ||
    !isMoney(value.shippingFeeMinor) ||
    !isText(value.locationSnapshotVersion)
  )
    return false;
  const rule = DEMO_SERVICE_RULES[value.service];
  const nearBlocks = Math.ceil(Math.min(Math.max(value.billableDistanceKm - 5, 0), 45) / 5);
  const longBlocks = Math.ceil(Math.max(value.billableDistanceKm - 50, 0) / 100);
  const weightBlocks = Math.ceil(Math.max(value.shipmentWeightGrams - 500, 0) / 500);
  const near = safeMultiply(nearBlocks, rule.near);
  const long = safeMultiply(longBlocks, rule.long);
  const weight = safeMultiply(weightBlocks, rule.weight);
  const total =
    near === null || long === null || weight === null
      ? null
      : safeAdd([rule.base, near, long, weight]);
  return (
    value.baseFeeMinor === rule.base &&
    value.nearDistanceFeeMinor === near &&
    value.longDistanceFeeMinor === long &&
    value.weightFeeMinor === weight &&
    value.shippingFeeMinor === total &&
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
    !hasExactKeys(value.shop, ['id', 'ownerUserId', 'slug', 'name']) ||
    !isUuid(value.shop.id) ||
    !isUuid(value.shop.ownerUserId) ||
    typeof value.shop.slug !== 'string' ||
    !canonicalSlug.test(value.shop.slug) ||
    !isText(value.shop.name) ||
    !Array.isArray(value.lines) ||
    value.lines.length === 0 ||
    !value.lines.every(isLine) ||
    !(value.shipping === null || isShippingBreakdown(value.shipping)) ||
    (value.shipping !== null && value.shipping.shopId !== value.shop.id) ||
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
    (value.shipping === null
      ? value.shippingVoucherDiscountMinor === 0 && value.shippingPayableMinor === 0
      : weight === value.shipping.shipmentWeightGrams &&
        value.shippingVoucherDiscountMinor <= value.shipping.shippingFeeMinor &&
        value.shippingPayableMinor ===
          value.shipping.shippingFeeMinor - value.shippingVoucherDiscountMinor) &&
    voucherDiscount === value.voucherDiscountMinor &&
    payable === value.payableTotalMinor &&
    list !== null &&
    merchandise !== null &&
    list - merchandise === productDiscount
  );
}

function isAvailableShopVoucher(value: unknown): value is AvailableShopVoucher {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'shopId',
      'code',
      'name',
      'benefitType',
      'minimumSpendMinor',
      'estimatedDiscountMinor',
      'remainingCount',
    ]) &&
    isUuid(value.shopId) &&
    normalizeVoucherCode(value.code) === value.code &&
    isText(value.name) &&
    (value.benefitType === 'FIXED_AMOUNT' || value.benefitType === 'PERCENTAGE') &&
    isMoney(value.minimumSpendMinor) &&
    isPositiveInteger(value.estimatedDiscountMinor) &&
    isPositiveInteger(value.remainingCount)
  );
}

function isAvailableShopVoucherList(value: unknown): value is AvailableShopVoucher[] {
  if (!Array.isArray(value) || value.length > 100 || !value.every(isAvailableShopVoucher))
    return false;
  return new Set(value.map((item) => `${item.shopId}:${item.code}`)).size === value.length;
}

function isAvailablePlatformVoucher(value: unknown): value is AvailablePlatformVoucher {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'code',
      'name',
      'benefitType',
      'minimumSpendMinor',
      'estimatedDiscountMinor',
      'remainingCount',
    ]) &&
    normalizeVoucherCode(value.code) === value.code &&
    isText(value.name) &&
    (value.benefitType === 'FIXED_AMOUNT' || value.benefitType === 'PERCENTAGE') &&
    isMoney(value.minimumSpendMinor) &&
    isPositiveInteger(value.estimatedDiscountMinor) &&
    isPositiveInteger(value.remainingCount)
  );
}

function isAvailablePlatformVoucherList(value: unknown): value is AvailablePlatformVoucher[] {
  if (!Array.isArray(value) || value.length > 100 || !value.every(isAvailablePlatformVoucher))
    return false;
  return new Set(value.map((item) => item.code)).size === value.length;
}

function isAvailableShippingVoucher(value: unknown): value is AvailableShippingVoucher {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'code',
      'name',
      'benefitType',
      'minimumSpendMinor',
      'estimatedDiscountMinor',
      'remainingCount',
    ]) &&
    normalizeVoucherCode(value.code) === value.code &&
    isText(value.name) &&
    value.benefitType === 'FREE_SHIPPING' &&
    isMoney(value.minimumSpendMinor) &&
    isPositiveInteger(value.estimatedDiscountMinor) &&
    isPositiveInteger(value.remainingCount)
  );
}

function isAvailableShippingVoucherList(value: unknown): value is AvailableShippingVoucher[] {
  if (!Array.isArray(value) || value.length > 100 || !value.every(isAvailableShippingVoucher))
    return false;
  return new Set(value.map((item) => item.code)).size === value.length;
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
    !hasExactKeys(
      value,
      [
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
      ],
      ['availableShopVouchers', 'availablePlatformVouchers', 'availableShippingVouchers'],
    ) ||
    value.pricingVersion !== PRICING_VERSION ||
    value.voucherVersion !== VOUCHER_VERSION ||
    (value.shippingVersion !== null &&
      value.shippingVersion !== MOCK_SHIPPING_VERSION &&
      value.shippingVersion !== DEMO_CARRIER_SHIPPING_VERSION) ||
    value.currency !== PRICING_CURRENCY ||
    !isIsoInstant(value.evaluatedAt) ||
    !isNonNegativeInteger(value.cartVersion) ||
    !(value.address === null || isAddress(value.address)) ||
    !Array.isArray(value.shops) ||
    !value.shops.every(isShop) ||
    !Array.isArray(value.vouchers) ||
    !value.vouchers.every(isVoucherResult) ||
    (value.availableShopVouchers !== undefined &&
      !isAvailableShopVoucherList(value.availableShopVouchers)) ||
    (value.availablePlatformVouchers !== undefined &&
      !isAvailablePlatformVoucherList(value.availablePlatformVouchers)) ||
    (value.availableShippingVouchers !== undefined &&
      !isAvailableShippingVoucherList(value.availableShippingVouchers)) ||
    !Array.isArray(value.exclusions) ||
    !value.exclusions.every(isExclusion) ||
    !isSummary(value.summary)
  )
    return false;

  const shops = value.shops as PricingQuoteShop[];
  const lines = shops.flatMap((shop) => shop.lines);
  const vouchers = value.vouchers as VoucherSelectionResult[];
  const availableShopVouchers = (value.availableShopVouchers ?? []) as AvailableShopVoucher[];
  const hasShipping = value.address !== null;
  if (
    (hasShipping && value.shippingVersion === null) ||
    (!hasShipping && value.shippingVersion !== null) ||
    shops.some((shop) => (hasShipping ? shop.shipping === null : shop.shipping !== null)) ||
    (!hasShipping &&
      ((value.availableShippingVouchers ?? []).length > 0 ||
        vouchers.some((voucher) => voucher.slot === 'FREE_SHIPPING')))
  )
    return false;
  const shopIds = new Set(shops.map((shop) => shop.shop.id));
  if (availableShopVouchers.some((item) => !shopIds.has(item.shopId))) return false;
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
  const shipping = safeAdd(shops.map((shop) => shop.shipping?.shippingFeeMinor ?? 0));
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
