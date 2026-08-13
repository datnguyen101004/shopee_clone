import {
  isCanonicalMarketplaceRoles,
  isCanonicalRoleTargetId,
  isValidAuthEmail,
  type AuthUserStatus,
  type MarketplaceRole,
} from './auth';

export const ACCOUNT_NAME_MIN_LENGTH = 2;
export const ACCOUNT_NAME_MAX_LENGTH = 120;
export const ACCOUNT_AREA_MIN_LENGTH = 2;
export const ACCOUNT_AREA_MAX_LENGTH = 100;
export const ACCOUNT_ADDRESS_LINE_MIN_LENGTH = 5;
export const ACCOUNT_ADDRESS_LINE_MAX_LENGTH = 255;
export const ACCOUNT_ADDRESS_LABEL_MIN_LENGTH = 1;
export const ACCOUNT_ADDRESS_LABEL_MAX_LENGTH = 50;
export const ACCOUNT_PHONE_LENGTH = 10;

export interface BuyerProfile {
  id: string;
  email: string;
  displayName: string;
  phoneNumber: string | null;
  status: AuthUserStatus;
  roles: MarketplaceRole[];
}

export interface UpdateBuyerProfileRequest {
  displayName?: string;
  phoneNumber?: string | null;
}

export interface ShippingAddressFields {
  recipientName: string;
  phoneNumber: string;
  province: string;
  district: string;
  ward: string;
  addressLine: string;
  label: string | null;
}

export interface CreateShippingAddressRequest extends ShippingAddressFields {
  isDefault?: boolean;
}

export type UpdateShippingAddressRequest = Partial<ShippingAddressFields>;

export interface ShippingAddress extends ShippingAddressFields {
  id: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingAddressList {
  items: ShippingAddress[];
}

export interface AccountProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
}

const problemTypePattern = /^https:\/\/shopee-clone\.local\/problems\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const accountProblemStatuses = new Set([400, 401, 403, 404, 409, 503]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isCanonicalDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
  });
}

export function normalizeAccountText(
  value: string,
  minimum: number,
  maximum: number,
): string | null {
  const normalized = value.trim();
  return normalized.length >= minimum &&
    normalized.length <= maximum &&
    !hasControlCharacter(normalized)
    ? normalized
    : null;
}

export function normalizeVietnamesePhone(value: string): string | null {
  const presented = value.trim();
  if (!/^(?:\+84|0)[0-9 .-]+$/.test(presented)) return null;
  const compact = presented.replace(/[ .-]/g, '');
  const local = compact.startsWith('+84') ? `0${compact.slice(3)}` : compact;
  return /^0[0-9]{9}$/.test(local) ? local : null;
}

function isTextInput(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string' && normalizeAccountText(value, minimum, maximum) !== null;
}

function isCanonicalText(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string' && normalizeAccountText(value, minimum, maximum) === value;
}

function isPhoneInput(value: unknown): value is string {
  return typeof value === 'string' && normalizeVietnamesePhone(value) !== null;
}

function isCanonicalPhone(value: unknown): value is string {
  return typeof value === 'string' && normalizeVietnamesePhone(value) === value;
}

function isAddressInputFields(value: Record<string, unknown>, partial: boolean): boolean {
  const validations: Record<string, (candidate: unknown) => boolean> = {
    recipientName: (candidate) =>
      isTextInput(candidate, ACCOUNT_NAME_MIN_LENGTH, ACCOUNT_NAME_MAX_LENGTH),
    phoneNumber: isPhoneInput,
    province: (candidate) =>
      isTextInput(candidate, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH),
    district: (candidate) =>
      isTextInput(candidate, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH),
    ward: (candidate) => isTextInput(candidate, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH),
    addressLine: (candidate) =>
      isTextInput(candidate, ACCOUNT_ADDRESS_LINE_MIN_LENGTH, ACCOUNT_ADDRESS_LINE_MAX_LENGTH),
    label: (candidate) =>
      candidate === null ||
      isTextInput(candidate, ACCOUNT_ADDRESS_LABEL_MIN_LENGTH, ACCOUNT_ADDRESS_LABEL_MAX_LENGTH),
  };
  const keys = Object.keys(validations);
  if (partial && !keys.some((key) => Object.hasOwn(value, key))) return false;
  return keys.every((key) => {
    if (!Object.hasOwn(value, key)) return partial;
    return validations[key]!(value[key]);
  });
}

export function isUpdateBuyerProfileRequest(value: unknown): value is UpdateBuyerProfileRequest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [], ['displayName', 'phoneNumber']) ||
    Object.keys(value).length === 0
  ) {
    return false;
  }
  return (
    (!Object.hasOwn(value, 'displayName') ||
      isTextInput(value.displayName, ACCOUNT_NAME_MIN_LENGTH, ACCOUNT_NAME_MAX_LENGTH)) &&
    (!Object.hasOwn(value, 'phoneNumber') ||
      value.phoneNumber === null ||
      isPhoneInput(value.phoneNumber))
  );
}

export function isCreateShippingAddressRequest(
  value: unknown,
): value is CreateShippingAddressRequest {
  return (
    isRecord(value) &&
    hasExactKeys(
      value,
      ['recipientName', 'phoneNumber', 'province', 'district', 'ward', 'addressLine', 'label'],
      ['isDefault'],
    ) &&
    isAddressInputFields(value, false) &&
    (!Object.hasOwn(value, 'isDefault') || typeof value.isDefault === 'boolean')
  );
}

export function isUpdateShippingAddressRequest(
  value: unknown,
): value is UpdateShippingAddressRequest {
  return (
    isRecord(value) &&
    hasExactKeys(
      value,
      [],
      ['recipientName', 'phoneNumber', 'province', 'district', 'ward', 'addressLine', 'label'],
    ) &&
    isAddressInputFields(value, true)
  );
}

export function isBuyerProfile(value: unknown): value is BuyerProfile {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'email', 'displayName', 'phoneNumber', 'status', 'roles']) &&
    isCanonicalRoleTargetId(value.id) &&
    isValidAuthEmail(value.email) &&
    isCanonicalText(value.displayName, ACCOUNT_NAME_MIN_LENGTH, ACCOUNT_NAME_MAX_LENGTH) &&
    (value.phoneNumber === null || isCanonicalPhone(value.phoneNumber)) &&
    ['active', 'suspended'].includes(String(value.status)) &&
    isCanonicalMarketplaceRoles(value.roles)
  );
}

export function isShippingAddress(value: unknown): value is ShippingAddress {
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
      'isDefault',
      'createdAt',
      'updatedAt',
    ]) &&
    isCanonicalRoleTargetId(value.id) &&
    isCanonicalText(value.recipientName, ACCOUNT_NAME_MIN_LENGTH, ACCOUNT_NAME_MAX_LENGTH) &&
    isCanonicalPhone(value.phoneNumber) &&
    isCanonicalText(value.province, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH) &&
    isCanonicalText(value.district, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH) &&
    isCanonicalText(value.ward, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH) &&
    isCanonicalText(
      value.addressLine,
      ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
      ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
    ) &&
    (value.label === null ||
      isCanonicalText(
        value.label,
        ACCOUNT_ADDRESS_LABEL_MIN_LENGTH,
        ACCOUNT_ADDRESS_LABEL_MAX_LENGTH,
      )) &&
    typeof value.isDefault === 'boolean' &&
    isCanonicalDateTime(value.createdAt) &&
    isCanonicalDateTime(value.updatedAt)
  );
}

export function isShippingAddressList(value: unknown): value is ShippingAddressList {
  if (!isRecord(value) || !hasExactKeys(value, ['items']) || !Array.isArray(value.items)) {
    return false;
  }
  if (value.items.length > 100 || !value.items.every(isShippingAddress)) return false;
  const ids = new Set(value.items.map(({ id }) => id));
  if (ids.size !== value.items.length) return false;
  const defaultCount = value.items.filter(({ isDefault }) => isDefault).length;
  return (
    defaultCount === (value.items.length > 0 ? 1 : 0) &&
    (value.items.length === 0 || value.items[0]!.isDefault)
  );
}

export function isAccountProblemDetails(value: unknown): value is AccountProblemDetails {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['type', 'title', 'status', 'detail'], ['invalidParameters']) ||
    typeof value.type !== 'string' ||
    !problemTypePattern.test(value.type) ||
    typeof value.title !== 'string' ||
    value.title.length < 1 ||
    value.title.length > 120 ||
    typeof value.status !== 'number' ||
    !accountProblemStatuses.has(value.status) ||
    typeof value.detail !== 'string' ||
    value.detail.length < 1 ||
    value.detail.length > 500
  ) {
    return false;
  }
  if (value.invalidParameters === undefined) return true;
  if (
    !Array.isArray(value.invalidParameters) ||
    value.invalidParameters.length < 1 ||
    value.invalidParameters.length > 20 ||
    !value.invalidParameters.every(
      (parameter) => typeof parameter === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(parameter),
    )
  ) {
    return false;
  }
  return new Set(value.invalidParameters).size === value.invalidParameters.length;
}

export function parseBuyerProfile(value: unknown): BuyerProfile | null {
  return isBuyerProfile(value) ? value : null;
}

export function parseShippingAddress(value: unknown): ShippingAddress | null {
  return isShippingAddress(value) ? value : null;
}

export function parseShippingAddressList(value: unknown): ShippingAddressList | null {
  return isShippingAddressList(value) ? value : null;
}

export function parseAccountProblemDetails(value: unknown): AccountProblemDetails | null {
  return isAccountProblemDetails(value) ? value : null;
}
