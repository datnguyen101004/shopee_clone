import type { BuyerProfile, ShippingAddress } from '@shopee-clone/contracts';

import {
  AccountApiError,
  createShippingAddress,
  deleteShippingAddress,
  getBuyerProfile,
  getShippingAddresses,
  updateBuyerProfile,
} from './account-api';

const profile: BuyerProfile = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer Example',
  phoneNumber: null,
  status: 'active',
  roles: ['buyer'],
};
const address: ShippingAddress = {
  id: '00000000-0000-4000-8000-000000000801',
  recipientName: 'Nguyen Van A',
  phoneNumber: '0912345678',
  province: 'Ha Noi',
  district: 'Ba Dinh',
  ward: 'Phuc Xa',
  addressLine: '12 Hang Than',
  label: null,
  isDefault: true,
  createdAt: '2026-08-12T01:00:00.000Z',
  updatedAt: '2026-08-12T01:00:00.000Z',
};

describe('account API boundary', () => {
  it('uses only authenticatedFetch with no-store and parses strict profile/list contracts', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json({ items: [address] }));
    await expect(getBuyerProfile(authenticatedFetch)).resolves.toEqual(profile);
    await expect(getShippingAddresses(authenticatedFetch)).resolves.toEqual({ items: [address] });
    const [url, init] = authenticatedFetch.mock.calls[0]!;
    expect(String(url)).toBe('http://localhost:3001/api/v1/account/profile');
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store' });
    expect((init.headers as Headers).get('Accept')).toContain('application/problem+json');
  });

  it('validates mutation input before transport and never writes browser storage', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const authenticatedFetch = vi.fn().mockResolvedValue(Response.json(profile));
    await expect(
      updateBuyerProfile({ displayName: 'x' }, authenticatedFetch),
    ).rejects.toMatchObject({ kind: 'input' });
    expect(authenticatedFetch).not.toHaveBeenCalled();
    await updateBuyerProfile({ displayName: 'Buyer Updated' }, authenticatedFetch);
    expect(JSON.parse(String(authenticatedFetch.mock.calls[0]![1].body))).toEqual({
      displayName: 'Buyer Updated',
    });
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });

  it('maps safe Problem Details and rejects malformed successful bodies', async () => {
    const statusFetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          type: 'https://shopee-clone.local/problems/address-not-found',
          title: 'Address unavailable',
          status: 404,
          detail: 'The requested address is unavailable.',
        },
        { status: 404 },
      ),
    );
    await expect(getBuyerProfile(statusFetch)).rejects.toMatchObject({
      kind: 'status',
      status: 404,
      problem: expect.objectContaining({ title: 'Address unavailable' }),
    });
    const malformedFetch = vi
      .fn()
      .mockResolvedValue(Response.json({ ...profile, phoneNumber: 'secret' }));
    await expect(getBuyerProfile(malformedFetch)).rejects.toBeInstanceOf(AccountApiError);
  });

  it('creates canonical addresses and accepts no-content deletion', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(address, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      createShippingAddress(
        {
          recipientName: address.recipientName,
          phoneNumber: address.phoneNumber,
          province: address.province,
          district: address.district,
          ward: address.ward,
          addressLine: address.addressLine,
          label: address.label,
          isDefault: true,
        },
        authenticatedFetch,
      ),
    ).resolves.toEqual(address);
    await expect(deleteShippingAddress(address.id, authenticatedFetch)).resolves.toBeUndefined();
  });
});
