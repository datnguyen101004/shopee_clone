import {
  ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
  ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
  ACCOUNT_AREA_MAX_LENGTH,
  ACCOUNT_AREA_MIN_LENGTH,
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NAME_MIN_LENGTH,
  normalizeAccountText,
  normalizeVietnamesePhone,
} from './account';
import {
  isAcceptedRoleReason,
  isCanonicalRoleTargetId,
  isValidAuthEmail,
  normalizeAuthEmail,
  ROLE_REASON_MAX_LENGTH,
  ROLE_REASON_MIN_LENGTH,
} from './auth';

export const SHOP_NAME_MIN_LENGTH = 2;
export const SHOP_NAME_MAX_LENGTH = 160;
export const SHOP_SLUG_MIN_LENGTH = 3;
export const SELLER_SHOP_SLUG_MAX_LENGTH = 120;
export const SHOP_DESCRIPTION_MAX_LENGTH = 2000;
export const SHOP_LOCATION_MIN_LENGTH = 2;
export const SHOP_LOCATION_MAX_LENGTH = 120;
export const SHOP_MEDIA_URL_MAX_LENGTH = 500;

export const shopOnboardingStatusValues = ['pending_approval', 'approved', 'rejected'] as const;
export const shopApprovalDecisionValues = ['approve', 'reject'] as const;
export const sellerShopStatusValues = ['active', 'inactive', 'suspended'] as const;

export type ShopOnboardingStatus = (typeof shopOnboardingStatusValues)[number];
export type ShopApprovalDecision = (typeof shopApprovalDecisionValues)[number];
export type SellerShopOperationalStatus = (typeof sellerShopStatusValues)[number];

export interface ShopServiceAddress {
  recipientName: string;
  phoneNumber: string;
  province: string;
  district: string;
  ward: string;
  addressLine: string;
}

export interface SellerShopProfile {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  location: string;
  contactPhone: string | null;
  contactEmail: string | null;
  pickupAddress: ShopServiceAddress | null;
  returnAddress: ShopServiceAddress | null;
  status: SellerShopOperationalStatus;
  onboardingStatus: ShopOnboardingStatus;
  onboardingReason: string | null;
  canSell: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SellerShopWorkspace {
  shop: SellerShopProfile | null;
  defaultAddress: ShopServiceAddress | null;
}

export interface CreateSellerShopRequest {
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  location: string;
  contactPhone: string;
  contactEmail: string;
  pickupAddress: ShopServiceAddress;
  returnAddress: ShopServiceAddress;
}

export type UpdateSellerShopRequest = Partial<
  Omit<CreateSellerShopRequest, 'slug'> & {
    slug: string;
    status: Extract<SellerShopOperationalStatus, 'active' | 'inactive'>;
  }
>;

export interface ShopApprovalRequest {
  decision: ShopApprovalDecision;
  reason: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
  });
}

function isCanonicalDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function normalizeShopSlug(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) &&
    normalized.length >= SHOP_SLUG_MIN_LENGTH &&
    normalized.length <= SELLER_SHOP_SLUG_MAX_LENGTH
    ? normalized
    : null;
}

export function normalizeShopMediaUrl(value: string): string | null {
  const normalized = value.trim();
  if (
    normalized.length < 8 ||
    normalized.length > SHOP_MEDIA_URL_MAX_LENGTH ||
    hasControlCharacter(normalized)
  ) {
    return null;
  }
  if (!/^https:\/\/[^@\s/]+(?:\/\S*)?$/.test(normalized)) return null;
  return normalized;
}

export function shopCanSell(input: {
  status: SellerShopOperationalStatus;
  onboardingStatus: ShopOnboardingStatus;
}): boolean {
  return input.status === 'active' && input.onboardingStatus === 'approved';
}

export function isShopServiceAddress(value: unknown): value is ShopServiceAddress {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'recipientName',
      'phoneNumber',
      'province',
      'district',
      'ward',
      'addressLine',
    ]) &&
    typeof value.recipientName === 'string' &&
    normalizeAccountText(value.recipientName, ACCOUNT_NAME_MIN_LENGTH, ACCOUNT_NAME_MAX_LENGTH) ===
      value.recipientName &&
    typeof value.phoneNumber === 'string' &&
    normalizeVietnamesePhone(value.phoneNumber) === value.phoneNumber &&
    typeof value.province === 'string' &&
    normalizeAccountText(value.province, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH) ===
      value.province &&
    typeof value.district === 'string' &&
    normalizeAccountText(value.district, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH) ===
      value.district &&
    typeof value.ward === 'string' &&
    normalizeAccountText(value.ward, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH) ===
      value.ward &&
    typeof value.addressLine === 'string' &&
    normalizeAccountText(
      value.addressLine,
      ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
      ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
    ) === value.addressLine
  );
}

function isShopServiceAddressInput(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      'recipientName',
      'phoneNumber',
      'province',
      'district',
      'ward',
      'addressLine',
    ])
  ) {
    return false;
  }
  return (
    typeof value.recipientName === 'string' &&
    normalizeAccountText(value.recipientName, ACCOUNT_NAME_MIN_LENGTH, ACCOUNT_NAME_MAX_LENGTH) !==
      null &&
    typeof value.phoneNumber === 'string' &&
    normalizeVietnamesePhone(value.phoneNumber) !== null &&
    typeof value.province === 'string' &&
    normalizeAccountText(value.province, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH) !==
      null &&
    typeof value.district === 'string' &&
    normalizeAccountText(value.district, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH) !==
      null &&
    typeof value.ward === 'string' &&
    normalizeAccountText(value.ward, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH) !== null &&
    typeof value.addressLine === 'string' &&
    normalizeAccountText(
      value.addressLine,
      ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
      ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
    ) !== null
  );
}

export function isSellerShopProfile(value: unknown): value is SellerShopProfile {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'id',
      'slug',
      'name',
      'description',
      'logoUrl',
      'bannerUrl',
      'location',
      'contactPhone',
      'contactEmail',
      'pickupAddress',
      'returnAddress',
      'status',
      'onboardingStatus',
      'onboardingReason',
      'canSell',
      'createdAt',
      'updatedAt',
    ]) &&
    isCanonicalRoleTargetId(value.id) &&
    typeof value.slug === 'string' &&
    normalizeShopSlug(value.slug) === value.slug &&
    typeof value.name === 'string' &&
    normalizeAccountText(value.name, SHOP_NAME_MIN_LENGTH, SHOP_NAME_MAX_LENGTH) === value.name &&
    typeof value.description === 'string' &&
    value.description.length <= SHOP_DESCRIPTION_MAX_LENGTH &&
    !hasControlCharacter(value.description) &&
    (value.logoUrl === null ||
      (typeof value.logoUrl === 'string' &&
        normalizeShopMediaUrl(value.logoUrl) === value.logoUrl)) &&
    (value.bannerUrl === null ||
      (typeof value.bannerUrl === 'string' &&
        normalizeShopMediaUrl(value.bannerUrl) === value.bannerUrl)) &&
    typeof value.location === 'string' &&
    normalizeAccountText(value.location, SHOP_LOCATION_MIN_LENGTH, SHOP_LOCATION_MAX_LENGTH) ===
      value.location &&
    (value.contactPhone === null ||
      (typeof value.contactPhone === 'string' &&
        normalizeVietnamesePhone(value.contactPhone) === value.contactPhone)) &&
    (value.contactEmail === null ||
      (typeof value.contactEmail === 'string' && isValidAuthEmail(value.contactEmail))) &&
    (value.pickupAddress === null || isShopServiceAddress(value.pickupAddress)) &&
    (value.returnAddress === null || isShopServiceAddress(value.returnAddress)) &&
    sellerShopStatusValues.includes(value.status as SellerShopOperationalStatus) &&
    shopOnboardingStatusValues.includes(value.onboardingStatus as ShopOnboardingStatus) &&
    (value.onboardingReason === null ||
      (typeof value.onboardingReason === 'string' &&
        isAcceptedRoleReason(value.onboardingReason))) &&
    typeof value.canSell === 'boolean' &&
    isCanonicalDateTime(value.createdAt) &&
    isCanonicalDateTime(value.updatedAt)
  );
}

export function isSellerShopWorkspace(value: unknown): value is SellerShopWorkspace {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['shop', 'defaultAddress']) &&
    (value.shop === null || isSellerShopProfile(value.shop)) &&
    (value.defaultAddress === null || isShopServiceAddress(value.defaultAddress))
  );
}

export function isCreateSellerShopRequest(value: unknown): value is CreateSellerShopRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'slug',
      'name',
      'description',
      'logoUrl',
      'bannerUrl',
      'location',
      'contactPhone',
      'contactEmail',
      'pickupAddress',
      'returnAddress',
    ]) &&
    typeof value.slug === 'string' &&
    normalizeShopSlug(value.slug) !== null &&
    typeof value.name === 'string' &&
    normalizeAccountText(value.name, SHOP_NAME_MIN_LENGTH, SHOP_NAME_MAX_LENGTH) !== null &&
    typeof value.description === 'string' &&
    value.description.trim().length <= SHOP_DESCRIPTION_MAX_LENGTH &&
    !hasControlCharacter(value.description) &&
    (value.logoUrl === null ||
      (typeof value.logoUrl === 'string' && normalizeShopMediaUrl(value.logoUrl) !== null)) &&
    (value.bannerUrl === null ||
      (typeof value.bannerUrl === 'string' && normalizeShopMediaUrl(value.bannerUrl) !== null)) &&
    typeof value.location === 'string' &&
    normalizeAccountText(value.location, SHOP_LOCATION_MIN_LENGTH, SHOP_LOCATION_MAX_LENGTH) !==
      null &&
    typeof value.contactPhone === 'string' &&
    normalizeVietnamesePhone(value.contactPhone) !== null &&
    typeof value.contactEmail === 'string' &&
    isValidAuthEmail(normalizeAuthEmail(value.contactEmail)) &&
    isShopServiceAddressInput(value.pickupAddress) &&
    isShopServiceAddressInput(value.returnAddress)
  );
}

export function isUpdateSellerShopRequest(value: unknown): value is UpdateSellerShopRequest {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      [],
      [
        'slug',
        'name',
        'description',
        'logoUrl',
        'bannerUrl',
        'location',
        'contactPhone',
        'contactEmail',
        'pickupAddress',
        'returnAddress',
        'status',
      ],
    ) ||
    Object.keys(value).length === 0
  ) {
    return false;
  }
  return (
    (!Object.hasOwn(value, 'slug') ||
      (typeof value.slug === 'string' && normalizeShopSlug(value.slug) !== null)) &&
    (!Object.hasOwn(value, 'name') ||
      (typeof value.name === 'string' &&
        normalizeAccountText(value.name, SHOP_NAME_MIN_LENGTH, SHOP_NAME_MAX_LENGTH) !== null)) &&
    (!Object.hasOwn(value, 'description') ||
      (typeof value.description === 'string' &&
        value.description.trim().length <= SHOP_DESCRIPTION_MAX_LENGTH &&
        !hasControlCharacter(value.description))) &&
    (!Object.hasOwn(value, 'logoUrl') ||
      value.logoUrl === null ||
      (typeof value.logoUrl === 'string' && normalizeShopMediaUrl(value.logoUrl) !== null)) &&
    (!Object.hasOwn(value, 'bannerUrl') ||
      value.bannerUrl === null ||
      (typeof value.bannerUrl === 'string' && normalizeShopMediaUrl(value.bannerUrl) !== null)) &&
    (!Object.hasOwn(value, 'location') ||
      (typeof value.location === 'string' &&
        normalizeAccountText(value.location, SHOP_LOCATION_MIN_LENGTH, SHOP_LOCATION_MAX_LENGTH) !==
          null)) &&
    (!Object.hasOwn(value, 'contactPhone') ||
      (typeof value.contactPhone === 'string' &&
        normalizeVietnamesePhone(value.contactPhone) !== null)) &&
    (!Object.hasOwn(value, 'contactEmail') ||
      (typeof value.contactEmail === 'string' &&
        isValidAuthEmail(normalizeAuthEmail(value.contactEmail)))) &&
    (!Object.hasOwn(value, 'pickupAddress') || isShopServiceAddressInput(value.pickupAddress)) &&
    (!Object.hasOwn(value, 'returnAddress') || isShopServiceAddressInput(value.returnAddress)) &&
    (!Object.hasOwn(value, 'status') || value.status === 'active' || value.status === 'inactive')
  );
}

export function isShopApprovalRequest(value: unknown): value is ShopApprovalRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['decision', 'reason']) &&
    shopApprovalDecisionValues.includes(value.decision as ShopApprovalDecision) &&
    typeof value.reason === 'string' &&
    value.reason.length >= ROLE_REASON_MIN_LENGTH &&
    value.reason.length <= ROLE_REASON_MAX_LENGTH
  );
}
