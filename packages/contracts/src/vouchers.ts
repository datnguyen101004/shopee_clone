export const VOUCHER_VERSION = 'voucher-v1' as const;
export const VOUCHER_CODE_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{2,30}[A-Z0-9])$/;
export const VOUCHER_ISSUERS = ['PLATFORM', 'SHOP'] as const;
export const VOUCHER_BENEFIT_TYPES = ['FIXED_AMOUNT', 'PERCENTAGE', 'FREE_SHIPPING'] as const;
export const VOUCHER_SLOTS = ['PLATFORM', 'SHOP', 'FREE_SHIPPING'] as const;
export const VOUCHER_REJECTION_REASONS = [
  'NOT_FOUND',
  'DISABLED',
  'NOT_STARTED',
  'EXPIRED',
  'GLOBAL_LIMIT_REACHED',
  'BUYER_LIMIT_REACHED',
  'TYPE_MISMATCH',
  'SCOPE_MISMATCH',
  'NO_ELIGIBLE_ITEMS',
  'MINIMUM_SPEND_NOT_MET',
] as const;

export type VoucherIssuer = (typeof VOUCHER_ISSUERS)[number];
export type VoucherBenefitType = (typeof VOUCHER_BENEFIT_TYPES)[number];
export type VoucherSlot = (typeof VOUCHER_SLOTS)[number];
export type VoucherRejectionReason = (typeof VOUCHER_REJECTION_REASONS)[number];

export interface ShopVoucherCodeSelection {
  shopId: string;
  code: string;
}

export interface VoucherCodeSelection {
  platformCode?: string;
  shopCodes?: ShopVoucherCodeSelection[];
  freeShippingCode?: string;
}

export interface VoucherDiscountAllocation {
  shopId: string;
  lineId: string | null;
  amountMinor: number;
}

export interface VoucherSelectionResult {
  code: string;
  slot: VoucherSlot;
  shopId: string | null;
  status: 'APPLIED' | 'REJECTED';
  name: string | null;
  issuer: VoucherIssuer | null;
  benefitType: VoucherBenefitType | null;
  rejectionReason: VoucherRejectionReason | null;
  discountMinor: number;
  merchandiseDiscountMinor: number;
  shippingDiscountMinor: number;
  allocations: VoucherDiscountAllocation[];
}

export function normalizeVoucherCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return VOUCHER_CODE_PATTERN.test(normalized) ? normalized : null;
}
