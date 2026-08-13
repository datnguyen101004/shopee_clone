import { describe, expect, it } from 'vitest';

import {
  isAccountProblemDetails,
  isBuyerProfile,
  isCreateShippingAddressRequest,
  isShippingAddress,
  isShippingAddressList,
  isUpdateBuyerProfileRequest,
  isUpdateShippingAddressRequest,
  normalizeAccountText,
  normalizeVietnamesePhone,
  parseAccountProblemDetails,
  parseBuyerProfile,
  parseShippingAddress,
  parseShippingAddressList,
} from '../src';

const profile = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.com',
  displayName: 'Nguyễn Văn Mua',
  phoneNumber: '0912345678',
  status: 'active',
  roles: ['buyer'],
};

const address = {
  id: '00000000-0000-4000-8000-000000000101',
  recipientName: 'Nguyễn Văn Mua',
  phoneNumber: '0912345678',
  province: 'TP. Hồ Chí Minh',
  district: 'Quận 1',
  ward: 'Phường Bến Nghé',
  addressLine: '12 Nguyễn Huệ',
  label: 'Nhà riêng',
  isDefault: true,
  createdAt: '2026-08-14T01:00:00.000Z',
  updatedAt: '2026-08-14T01:00:00.000Z',
};

describe('account contracts', () => {
  it('normalizes supported Vietnamese phone presentation without retaining input', () => {
    expect(normalizeVietnamesePhone(' 0912 345 678 ')).toBe('0912345678');
    expect(normalizeVietnamesePhone('+84 912-345-678')).toBe('0912345678');
    expect(normalizeVietnamesePhone('84912345678')).toBeNull();
    expect(normalizeVietnamesePhone('+1 202 555 0100')).toBeNull();
    expect(normalizeVietnamesePhone('091234567')).toBeNull();
  });

  it('normalizes bounded text and rejects controls, blanks, and out-of-range values', () => {
    expect(normalizeAccountText('  Quận 1  ', 2, 100)).toBe('Quận 1');
    expect(normalizeAccountText(' \n ', 1, 100)).toBeNull();
    expect(normalizeAccountText('A\u0000B', 1, 100)).toBeNull();
    expect(normalizeAccountText('x'.repeat(101), 1, 100)).toBeNull();
  });

  it('accepts strict profile mutations and safe canonical profiles', () => {
    expect(
      isUpdateBuyerProfileRequest({
        displayName: '  Nguyễn Văn Mua ',
        phoneNumber: '+84 912 345 678',
      }),
    ).toBe(true);
    expect(isUpdateBuyerProfileRequest({ phoneNumber: null })).toBe(true);
    expect(isUpdateBuyerProfileRequest({})).toBe(false);
    expect(isUpdateBuyerProfileRequest({ email: 'changed@example.com' })).toBe(false);
    expect(parseBuyerProfile(profile)).toEqual(profile);
    expect(isBuyerProfile({ ...profile, phoneNumber: '+84 912 345 678' })).toBe(false);
    expect(isBuyerProfile({ ...profile, passwordHash: 'secret' })).toBe(false);
  });

  it('accepts complete create input and bounded partial update input only', () => {
    const create = {
      recipientName: ' Nguyễn Văn Mua ',
      phoneNumber: '+84 912 345 678',
      province: ' TP. Hồ Chí Minh ',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
      addressLine: '12 Nguyễn Huệ',
      label: null,
      isDefault: true,
    };
    expect(isCreateShippingAddressRequest(create)).toBe(true);
    expect(isCreateShippingAddressRequest({ ...create, userId: profile.id })).toBe(false);
    expect(isCreateShippingAddressRequest({ ...create, ward: '' })).toBe(false);
    expect(isUpdateShippingAddressRequest({ district: 'Quận 3', label: null })).toBe(true);
    expect(isUpdateShippingAddressRequest({})).toBe(false);
    expect(isUpdateShippingAddressRequest({ isDefault: true })).toBe(false);
  });

  it('parses canonical addresses and enforces one default in default-first lists', () => {
    expect(parseShippingAddress(address)).toEqual(address);
    expect(isShippingAddress({ ...address, phoneNumber: '+84 912 345 678' })).toBe(false);
    expect(isShippingAddress({ ...address, userId: profile.id })).toBe(false);
    expect(parseShippingAddressList({ items: [address] })).toEqual({ items: [address] });
    expect(isShippingAddressList({ items: [] })).toBe(true);
    expect(
      isShippingAddressList({
        items: [
          { ...address, isDefault: false },
          { ...address, id: '00000000-0000-4000-8000-000000000102' },
        ],
      }),
    ).toBe(false);
    expect(
      isShippingAddressList({
        items: [
          address,
          { ...address, id: '00000000-0000-4000-8000-000000000102', isDefault: true },
        ],
      }),
    ).toBe(false);
  });

  it('accepts sanitized account problems and rejects payload or contact extensions', () => {
    const problem = {
      type: 'https://shopee-clone.local/problems/invalid-account-request',
      title: 'Invalid request',
      status: 400,
      detail: 'One or more account fields are invalid.',
      invalidParameters: ['phoneNumber'],
    };
    expect(parseAccountProblemDetails(problem)).toEqual(problem);
    expect(isAccountProblemDetails({ ...problem, phoneNumber: '0912345678' })).toBe(false);
    expect(
      isAccountProblemDetails({ ...problem, invalidParameters: ['phoneNumber', 'phoneNumber'] }),
    ).toBe(false);
    expect(parseShippingAddress({ ...address, updatedAt: 'tomorrow' })).toBeNull();
  });
});
