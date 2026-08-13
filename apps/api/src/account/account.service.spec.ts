import type { AccountRepository } from './account.repository';
import { AccountAddressNotFoundError, AccountInvariantConflictError } from './account.errors';
import { AccountService } from './account.service';

const userId = '00000000-0000-4000-8000-000000000001';
const addressId = '00000000-0000-4000-8000-000000000801';
const secondAddressId = '00000000-0000-4000-8000-000000000802';

const profile = {
  id: userId,
  email: 'buyer@example.test',
  displayName: 'Buyer Example',
  phoneNumber: null,
  status: 'ACTIVE',
  roleAssignments: [{ role: 'BUYER' }],
};

const address = {
  id: addressId,
  recipientName: 'Nguyen Van A',
  phoneNumber: '0912345678',
  province: 'TP. Ho Chi Minh',
  district: 'Quan 1',
  ward: 'Phuong Ben Nghe',
  addressLine: '12 Nguyen Hue',
  label: 'Nha rieng',
  isDefault: true,
  createdAt: new Date('2026-08-12T01:00:00.000Z'),
  updatedAt: new Date('2026-08-12T01:00:00.000Z'),
};

describe('AccountService', () => {
  const findProfile = jest.fn();
  const updateProfile = jest.fn();
  const listAddresses = jest.fn();
  const lockOwner = jest.fn();
  const findOwnedAddress = jest.fn();
  const transaction = jest.fn();
  const shippingAddress = {
    count: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  };
  const repository = {
    findProfile,
    updateProfile,
    listAddresses,
    lockOwner,
    findOwnedAddress,
    transaction,
  } as unknown as AccountRepository;
  const service = new AccountService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation((work: (tx: unknown) => unknown) => work({ shippingAddress }));
    lockOwner.mockResolvedValue(true);
  });

  it('returns only the safe profile and normalizes mutable profile fields', async () => {
    findProfile.mockResolvedValue(profile);
    updateProfile.mockResolvedValue({
      ...profile,
      displayName: 'Nguyen Van A',
      phoneNumber: '0912345678',
    });
    await expect(service.profile(userId)).resolves.toEqual({
      id: userId,
      email: profile.email,
      displayName: profile.displayName,
      phoneNumber: null,
      status: 'active',
      roles: ['buyer'],
    });
    await service.updateProfile(userId, {
      displayName: '  Nguyen Van A  ',
      phoneNumber: '+84 912-345-678',
    });
    expect(updateProfile).toHaveBeenCalledWith(userId, {
      displayName: 'Nguyen Van A',
      phoneNumber: '0912345678',
    });
    expect(updateProfile.mock.calls[0]![1]).not.toHaveProperty('email');
    expect(updateProfile.mock.calls[0]![1]).not.toHaveProperty('roles');
  });

  it('lists active owned addresses in repository order and creates the first as default', async () => {
    listAddresses.mockResolvedValue([address]);
    await expect(service.addresses(userId)).resolves.toEqual({
      items: [expect.objectContaining({ id: addressId, isDefault: true })],
    });
    shippingAddress.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    shippingAddress.create.mockResolvedValue(address);
    await service.createAddress(userId, {
      recipientName: '  Nguyen Van A ',
      phoneNumber: '+84 912-345-678',
      province: ' TP. Ho Chi Minh ',
      district: ' Quan 1 ',
      ward: ' Phuong Ben Nghe ',
      addressLine: ' 12 Nguyen Hue ',
      label: ' Nha rieng ',
    });
    expect(lockOwner).toHaveBeenCalledWith(expect.anything(), userId);
    expect(shippingAddress.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          phoneNumber: '0912345678',
          isDefault: true,
        }),
      }),
    );
  });

  it('makes explicit default selection idempotent and hides all unavailable identifiers', async () => {
    findOwnedAddress.mockResolvedValue(address);
    shippingAddress.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await service.selectDefault(userId, addressId);
    expect(shippingAddress.updateMany).not.toHaveBeenCalled();
    expect(shippingAddress.update).not.toHaveBeenCalled();

    findOwnedAddress.mockResolvedValueOnce(null);
    await expect(
      service.updateAddress(userId, secondAddressId, { ward: 'Phuong 1' }),
    ).rejects.toBeInstanceOf(AccountAddressNotFoundError);
    expect(() => service.deleteAddress(userId, 'not-a-uuid')).toThrow(AccountAddressNotFoundError);
  });

  it('soft-deletes a default and deterministically promotes the oldest remaining address', async () => {
    findOwnedAddress.mockResolvedValue(address);
    shippingAddress.findFirst.mockResolvedValue({ id: secondAddressId });
    shippingAddress.update.mockResolvedValue(address);
    shippingAddress.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await service.deleteAddress(userId, addressId);
    expect(shippingAddress.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    );
    expect(shippingAddress.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ isDefault: false, deletedAt: expect.any(Date) }),
      }),
    );
    expect(shippingAddress.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: secondAddressId }, data: { isDefault: true } }),
    );
  });

  it('rejects a transaction whose end state violates the default invariant without leaking input', async () => {
    shippingAddress.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    shippingAddress.create.mockResolvedValue(address);
    const secretLine = '99 Private Address';
    await expect(
      service.createAddress(userId, {
        recipientName: 'Private Recipient',
        phoneNumber: '0912345678',
        province: 'Ha Noi',
        district: 'Ba Dinh',
        ward: 'Phuc Xa',
        addressLine: secretLine,
        label: null,
      }),
    ).rejects.toBeInstanceOf(AccountInvariantConflictError);
    try {
      service.createAddress(userId, {
        recipientName: 'Private Recipient',
        phoneNumber: 'invalid',
        province: 'Ha Noi',
        district: 'Ba Dinh',
        ward: 'Phuc Xa',
        addressLine: secretLine,
        label: null,
      });
      throw new Error('Expected invalid phone rejection');
    } catch (error) {
      expect(String(error)).not.toContain(secretLine);
    }
  });
});
