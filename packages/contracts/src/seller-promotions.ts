export const SELLER_PROMOTION_VERSION = 'seller-promotions-v1' as const;
export const SELLER_PROMOTION_PAGE_SIZE = 10;
export const SELLER_PROMOTION_ACTIONS = ['PAUSE', 'RESUME', 'ARCHIVE'] as const;
export const SELLER_PROMOTION_BENEFITS = ['FIXED_AMOUNT', 'PERCENTAGE'] as const;
export const SELLER_PROMOTION_STATES = ['SCHEDULED', 'ACTIVE', 'PAUSED', 'EXHAUSTED', 'EXPIRED', 'ARCHIVED'] as const;
export const SELLER_VOUCHER_STATES = ['SCHEDULED', 'ACTIVE', 'PAUSED', 'EXHAUSTED', 'EXPIRED'] as const;
export type SellerPromotionAction = (typeof SELLER_PROMOTION_ACTIONS)[number];
export type SellerPromotionBenefit = (typeof SELLER_PROMOTION_BENEFITS)[number];
export type SellerPromotionState = (typeof SELLER_PROMOTION_STATES)[number];
export type SellerVoucherState = (typeof SELLER_VOUCHER_STATES)[number];

export interface SellerVoucherCreateRequest {
  name: string;
  benefitType: SellerPromotionBenefit;
  fixedAmountMinor: number | null;
  percentageBasisPoints: number | null;
  maximumDiscountMinor: number | null;
  minimumSpendMinor: number;
  startsAt: string;
  endsAt: string;
  usageLimit: number;
  perBuyerLimit: number;
  productIds: string[];
}
export type SellerVoucherUpdateRequest = Partial<SellerVoucherCreateRequest>;
export interface SellerDiscountProductInput { productId: string; discountBasisPoints: number; }
export interface SellerDiscountCreateRequest { name: string; startsAt: string; endsAt: string; products: SellerDiscountProductInput[]; }
export type SellerDiscountUpdateRequest = Partial<SellerDiscountCreateRequest>;
export interface SellerPromotionActionRequest { action: SellerPromotionAction; }

export interface SellerVoucherSummary extends SellerVoucherCreateRequest {
  id: string;
  issuer: 'SHOP';
  code: string;
  state: SellerVoucherState;
  usedCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface SellerDiscountSummary extends SellerDiscountCreateRequest {
  id: string;
  state: SellerPromotionState;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface SellerEffectivePriceBreakdown {
  variantId: string;
  productId: string;
  basePriceMinor: number;
  effectivePriceMinor: number;
  compareAtPriceMinor: number | null;
  discountBasisPoints: number;
  campaignId: string | null;
  evaluatedAt: string;
}
export interface SellerVoucherPage { sellerPromotionVersion: typeof SELLER_PROMOTION_VERSION; items: SellerVoucherSummary[]; page: number; pageSize: number; totalItems: number; totalPages: number; }
export interface SellerDiscountPage { sellerPromotionVersion: typeof SELLER_PROMOTION_VERSION; items: SellerDiscountSummary[]; page: number; pageSize: number; totalItems: number; totalPages: number; }
export interface SellerVoucherDeleteResult { deleted: true; }
export interface SellerPromotionProblemDetails { type: string; title: string; status: number; detail: string; code?: string; invalidParameters?: string[]; currentVersion?: number; }

const promotionState = (value: unknown): value is SellerPromotionState => typeof value === 'string' && SELLER_PROMOTION_STATES.includes(value as SellerPromotionState);
const voucherState = (value: unknown): value is SellerVoucherState => typeof value === 'string' && SELLER_VOUCHER_STATES.includes(value as SellerVoucherState);
const voucherSummary = (value: unknown): value is SellerVoucherSummary => {
  if (!record(value) || typeof value.id !== 'string' || value.issuer !== 'SHOP' || typeof value.code !== 'string' || typeof value.name !== 'string' || !SELLER_PROMOTION_BENEFITS.includes(value.benefitType as SellerPromotionBenefit) || !voucherState(value.state) || !safe(value.version) || !safe(value.usedCount) || !Array.isArray(value.productIds) || value.productIds.some((id) => typeof id !== 'string') || typeof value.startsAt !== 'string' || typeof value.endsAt !== 'string') return false;
  return true;
};
const discountSummary = (value: unknown): value is SellerDiscountSummary => record(value) && typeof value.id === 'string' && typeof value.name === 'string' && promotionState(value.state) && safe(value.version) && Array.isArray(value.products) && value.products.every((item) => record(item) && typeof item.productId === 'string' && safe(item.discountBasisPoints));
export function isSellerVoucherSummary(value: unknown): value is SellerVoucherSummary { return voucherSummary(value); }
export function isSellerDiscountSummary(value: unknown): value is SellerDiscountSummary { return discountSummary(value); }
const pageMetadata = (value: Record<string, unknown>) => Number.isSafeInteger(value.page) && Number(value.page) >= 1 && value.pageSize === SELLER_PROMOTION_PAGE_SIZE && safe(value.totalItems) && safe(value.totalPages);
export function isSellerVoucherPage(value: unknown): value is SellerVoucherPage { return record(value) && value.sellerPromotionVersion === SELLER_PROMOTION_VERSION && Array.isArray(value.items) && value.items.every(voucherSummary) && pageMetadata(value); }
export function isSellerDiscountPage(value: unknown): value is SellerDiscountPage { return record(value) && value.sellerPromotionVersion === SELLER_PROMOTION_VERSION && Array.isArray(value.items) && value.items.every(discountSummary) && pageMetadata(value); }
export function isSellerVoucherDeleteResult(value: unknown): value is SellerVoucherDeleteResult { return record(value) && value.deleted === true; }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const voucherCreateKeys = ['name', 'benefitType', 'fixedAmountMinor', 'percentageBasisPoints', 'maximumDiscountMinor', 'minimumSpendMinor', 'startsAt', 'endsAt', 'usageLimit', 'perBuyerLimit', 'productIds'] as const;
const discountCreateKeys = ['name', 'startsAt', 'endsAt', 'products'] as const;
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && ![...value].some((char) => char.charCodeAt(0) < 32);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key));
const safe = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export type SellerPromotionRequestInspection<T> =
  | { ok: true; value: T }
  | { ok: false; invalidParameters: string[]; detail: string };

const fail = (invalidParameters: string[], detail: string): SellerPromotionRequestInspection<never> => ({
  ok: false,
  invalidParameters: [...new Set(invalidParameters)],
  detail,
});

const NAME_DETAIL = 'Promotion name is required (max 160 characters).';
const SCHEDULE_DETAIL = 'Start time must be before end time and use ISO-8601 instants.';
const BENEFIT_DETAIL = 'Benefit amount is invalid for the selected benefit type.';
const PRODUCT_IDS_DETAIL = 'Product IDs must be unique UUIDs owned by the shop scope request.';

export function inspectSellerVoucherCreateRequest(value: unknown): SellerPromotionRequestInspection<SellerVoucherCreateRequest> {
  if (!record(value) || !exact(value, voucherCreateKeys)) return fail(['request'], 'Request body shape is invalid.');
  const invalidParameters: string[] = [];
  const details: string[] = [];
  const push = (field: string, detail: string) => {
    if (!invalidParameters.includes(field)) invalidParameters.push(field);
    if (!details.includes(detail)) details.push(detail);
  };

  if (!text(value.name, 160)) push('name', NAME_DETAIL);
  if (!SELLER_PROMOTION_BENEFITS.includes(value.benefitType as SellerPromotionBenefit)) push('benefitType', 'Benefit type must be FIXED_AMOUNT or PERCENTAGE.');
  if (!instant(value.startsAt)) push('startsAt', SCHEDULE_DETAIL);
  if (!instant(value.endsAt)) push('endsAt', SCHEDULE_DETAIL);
  if (instant(value.startsAt) && instant(value.endsAt) && value.startsAt >= value.endsAt) {
    push('startsAt', SCHEDULE_DETAIL);
    push('endsAt', SCHEDULE_DETAIL);
  }
  if (!safe(value.minimumSpendMinor)) push('minimumSpendMinor', 'Minimum spend must be a non-negative integer.');
  if (!safe(value.usageLimit) || value.usageLimit < 1) push('usageLimit', 'Usage limit must be an integer of at least 1.');
  if (!safe(value.perBuyerLimit) || value.perBuyerLimit < 1) push('perBuyerLimit', 'Per-buyer limit must be an integer of at least 1.');
  if (!Array.isArray(value.productIds) || value.productIds.some((item) => typeof item !== 'string' || !uuid.test(item))) {
    push('productIds', PRODUCT_IDS_DETAIL);
  } else if (new Set(value.productIds as string[]).size !== value.productIds.length) {
    push('productIds', 'Product IDs must be unique.');
  }

  if (value.benefitType === 'FIXED_AMOUNT') {
    if (typeof value.fixedAmountMinor !== 'number' || !safe(value.fixedAmountMinor) || value.fixedAmountMinor < 1 || value.percentageBasisPoints !== null) {
      push('fixedAmountMinor', BENEFIT_DETAIL);
      if (value.percentageBasisPoints !== null) push('percentageBasisPoints', BENEFIT_DETAIL);
    }
  } else if (value.benefitType === 'PERCENTAGE') {
    if (
      typeof value.percentageBasisPoints !== 'number' ||
      !Number.isInteger(value.percentageBasisPoints) ||
      value.percentageBasisPoints < 100 ||
      value.percentageBasisPoints > 9000 ||
      value.fixedAmountMinor !== null
    ) {
      push('percentageBasisPoints', BENEFIT_DETAIL);
      if (value.fixedAmountMinor !== null) push('fixedAmountMinor', BENEFIT_DETAIL);
    }
  }
  if (value.maximumDiscountMinor !== null && (!safe(value.maximumDiscountMinor) || value.maximumDiscountMinor < 1)) {
    push('maximumDiscountMinor', 'Maximum discount must be a positive integer when provided.');
  }

  if (invalidParameters.length) return fail(invalidParameters, details.join(' '));
  const productIds = [...new Set(value.productIds as string[])];
  return {
    ok: true,
    value: {
      name: (value.name as string).trim(),
      benefitType: value.benefitType as SellerPromotionBenefit,
      fixedAmountMinor: value.fixedAmountMinor as number | null,
      percentageBasisPoints: value.percentageBasisPoints as number | null,
      maximumDiscountMinor: value.maximumDiscountMinor as number | null,
      minimumSpendMinor: value.minimumSpendMinor as number,
      startsAt: value.startsAt as string,
      endsAt: value.endsAt as string,
      usageLimit: value.usageLimit as number,
      perBuyerLimit: value.perBuyerLimit as number,
      productIds,
    },
  };
}

export function parseSellerVoucherCreateRequest(value: unknown): SellerVoucherCreateRequest | null {
  const inspected = inspectSellerVoucherCreateRequest(value);
  return inspected.ok ? inspected.value : null;
}

export function inspectSellerVoucherUpdateRequest(value: unknown): SellerPromotionRequestInspection<SellerVoucherUpdateRequest> {
  if (!record(value) || Object.keys(value).length === 0 || !exact(value, voucherCreateKeys)) {
    return fail(['request'], 'Request body shape is invalid.');
  }
  const invalidParameters: string[] = [];
  const details: string[] = [];
  const push = (field: string, detail: string) => {
    if (!invalidParameters.includes(field)) invalidParameters.push(field);
    if (!details.includes(detail)) details.push(detail);
  };
  if (value.name !== undefined && !text(value.name, 160)) push('name', NAME_DETAIL);
  if (value.benefitType !== undefined && !SELLER_PROMOTION_BENEFITS.includes(value.benefitType as SellerPromotionBenefit)) {
    push('benefitType', 'Benefit type must be FIXED_AMOUNT or PERCENTAGE.');
  }
  for (const key of ['startsAt', 'endsAt'] as const) if (value[key] !== undefined && !instant(value[key])) push(key, SCHEDULE_DETAIL);
  for (const key of ['fixedAmountMinor', 'maximumDiscountMinor', 'minimumSpendMinor', 'usageLimit', 'perBuyerLimit'] as const) {
    if (value[key] !== undefined && value[key] !== null && !safe(value[key])) push(key, `${key} must be a non-negative integer.`);
  }
  const percentage = value.percentageBasisPoints;
  if (percentage !== undefined && percentage !== null && (typeof percentage !== 'number' || !Number.isInteger(percentage) || percentage < 100 || percentage > 9000)) {
    push('percentageBasisPoints', BENEFIT_DETAIL);
  }
  if (value.productIds !== undefined && (!Array.isArray(value.productIds) || value.productIds.some((item) => typeof item !== 'string' || !uuid.test(item)))) {
    push('productIds', PRODUCT_IDS_DETAIL);
  }
  if (invalidParameters.length) return fail(invalidParameters, details.join(' '));
  return { ok: true, value: value as SellerVoucherUpdateRequest };
}

export function parseSellerVoucherUpdateRequest(value: unknown): SellerVoucherUpdateRequest | null {
  const inspected = inspectSellerVoucherUpdateRequest(value);
  return inspected.ok ? inspected.value : null;
}

export function inspectSellerDiscountCreateRequest(value: unknown): SellerPromotionRequestInspection<SellerDiscountCreateRequest> {
  if (!record(value) || !exact(value, discountCreateKeys)) return fail(['request'], 'Request body shape is invalid.');
  const invalidParameters: string[] = [];
  const details: string[] = [];
  const push = (field: string, detail: string) => {
    if (!invalidParameters.includes(field)) invalidParameters.push(field);
    if (!details.includes(detail)) details.push(detail);
  };
  if (!text(value.name, 160)) push('name', NAME_DETAIL);
  if (!instant(value.startsAt)) push('startsAt', SCHEDULE_DETAIL);
  if (!instant(value.endsAt)) push('endsAt', SCHEDULE_DETAIL);
  if (instant(value.startsAt) && instant(value.endsAt) && value.startsAt >= value.endsAt) {
    push('startsAt', SCHEDULE_DETAIL);
    push('endsAt', SCHEDULE_DETAIL);
  }

  let products: SellerDiscountProductInput[] | null = null;
  if (!Array.isArray(value.products) || value.products.length < 1 || value.products.length > 100) {
    push('products', 'Discount products must include 1-100 unique product rates.');
  } else {
    const mapped = value.products.map((item) =>
      record(item) &&
      exact(item, ['productId', 'discountBasisPoints']) &&
      typeof item.productId === 'string' &&
      uuid.test(item.productId) &&
      typeof item.discountBasisPoints === 'number' &&
      Number.isInteger(item.discountBasisPoints) &&
      item.discountBasisPoints >= 100 &&
      item.discountBasisPoints <= 9000
        ? { productId: item.productId, discountBasisPoints: item.discountBasisPoints }
        : null,
    );
    if (mapped.some((item) => item === null) || new Set(mapped.map((item) => item!.productId)).size !== mapped.length) {
      push('products', 'Discount products must include 1-100 unique product rates between 1% and 90%.');
    } else {
      products = mapped as SellerDiscountProductInput[];
    }
  }

  if (invalidParameters.length || !products) return fail(invalidParameters.length ? invalidParameters : ['products'], details.join(' ') || 'Request body shape is invalid.');
  return {
    ok: true,
    value: {
      name: (value.name as string).trim(),
      startsAt: value.startsAt as string,
      endsAt: value.endsAt as string,
      products,
    },
  };
}

export function parseSellerDiscountCreateRequest(value: unknown): SellerDiscountCreateRequest | null {
  const inspected = inspectSellerDiscountCreateRequest(value);
  return inspected.ok ? inspected.value : null;
}

export function inspectSellerDiscountUpdateRequest(value: unknown): SellerPromotionRequestInspection<SellerDiscountUpdateRequest> {
  if (!record(value) || Object.keys(value).length === 0 || !exact(value, discountCreateKeys)) {
    return fail(['request'], 'Request body shape is invalid.');
  }
  const invalidParameters: string[] = [];
  const details: string[] = [];
  const push = (field: string, detail: string) => {
    if (!invalidParameters.includes(field)) invalidParameters.push(field);
    if (!details.includes(detail)) details.push(detail);
  };
  if (value.name !== undefined && !text(value.name, 160)) push('name', NAME_DETAIL);
  if (value.startsAt !== undefined && !instant(value.startsAt)) push('startsAt', SCHEDULE_DETAIL);
  if (value.endsAt !== undefined && !instant(value.endsAt)) push('endsAt', SCHEDULE_DETAIL);
  if (value.products !== undefined) {
    if (!Array.isArray(value.products) || value.products.length < 1 || value.products.length > 100) {
      push('products', 'Discount products must include 1-100 unique product rates.');
    } else {
      const valid = value.products.every(
        (item) =>
          record(item) &&
          exact(item, ['productId', 'discountBasisPoints']) &&
          typeof item.productId === 'string' &&
          uuid.test(item.productId) &&
          typeof item.discountBasisPoints === 'number' &&
          Number.isInteger(item.discountBasisPoints) &&
          item.discountBasisPoints >= 100 &&
          item.discountBasisPoints <= 9000,
      );
      if (!valid || new Set((value.products as Array<{ productId: string }>).map((item) => item.productId)).size !== value.products.length) {
        push('products', 'Discount products must include 1-100 unique product rates between 1% and 90%.');
      }
    }
  }
  if (invalidParameters.length) return fail(invalidParameters, details.join(' '));
  return { ok: true, value: value as SellerDiscountUpdateRequest };
}

export function parseSellerDiscountUpdateRequest(value: unknown): SellerDiscountUpdateRequest | null {
  const inspected = inspectSellerDiscountUpdateRequest(value);
  return inspected.ok ? inspected.value : null;
}

export function parseSellerPromotionActionRequest(value: unknown): SellerPromotionActionRequest | null {
  return record(value) && exact(value, ['action']) && SELLER_PROMOTION_ACTIONS.includes(value.action as SellerPromotionAction) ? { action: value.action as SellerPromotionAction } : null;
}

export function parseSellerPromotionListQuery(value: unknown): { state: SellerPromotionState | 'ALL'; page: number } | null {
  if (!record(value) || !exact(value, ['state', 'page'])) return null;
  const state = value.state === undefined ? 'ALL' : value.state;
  const rawPage = value.page === undefined ? '1' : value.page;
  if ((state !== 'ALL' && !SELLER_PROMOTION_STATES.includes(state as SellerPromotionState)) || typeof rawPage !== 'string' || !/^[1-9][0-9]*$/.test(rawPage)) return null;
  const page = Number(rawPage);
  return Number.isSafeInteger(page) ? { state: state as SellerPromotionState | 'ALL', page } : null;
}

export function parseSellerPromotionIdempotencyKey(value: unknown): string | null { return typeof value === 'string' && uuid.test(value) ? value : null; }
export function parseSellerPromotionVersionEtag(value: unknown): number | null { if (typeof value !== 'string') return null; const match = /^"seller-promotion-([0-9]+)"$/.exec(value); const version = match ? Number(match[1]) : NaN; return Number.isSafeInteger(version) && version >= 0 ? version : null; }
export function formatSellerPromotionVersionEtag(version: number): string { if (!Number.isSafeInteger(version) || version < 0) throw new RangeError('Invalid promotion version'); return `"seller-promotion-${version}"`; }
