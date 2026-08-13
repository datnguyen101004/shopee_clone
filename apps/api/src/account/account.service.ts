import {
  ACCOUNT_ADDRESS_LABEL_MAX_LENGTH,
  ACCOUNT_ADDRESS_LABEL_MIN_LENGTH,
  ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
  ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
  ACCOUNT_AREA_MAX_LENGTH,
  ACCOUNT_AREA_MIN_LENGTH,
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NAME_MIN_LENGTH,
  isCanonicalRoleTargetId,
  marketplaceRoleValues,
  normalizeAccountText,
  normalizeVietnamesePhone,
  type BuyerProfile,
  type CreateShippingAddressRequest,
  type MarketplaceRole as ContractMarketplaceRole,
  type ShippingAddress,
  type ShippingAddressFields,
  type ShippingAddressList,
  type UpdateBuyerProfileRequest,
  type UpdateShippingAddressRequest,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { MarketplaceRole, UserStatus } from '../generated/prisma/enums';
import {
  AccountAddressNotFoundError,
  AccountInputError,
  AccountInvariantConflictError,
  AccountUnavailableError,
} from './account.errors';
import {
  AccountRepository,
  type AccountTransaction,
  type PersistedAddress,
  type PersistedProfile,
} from './account.repository';

function contractRole(role: MarketplaceRole): ContractMarketplaceRole {
  switch (role) {
    case MarketplaceRole.BUYER:
      return 'buyer';
    case MarketplaceRole.SELLER:
      return 'seller';
    case MarketplaceRole.ADMIN:
      return 'admin';
  }
}

function profileResult(profile: PersistedProfile): BuyerProfile {
  const current = new Set(profile.roleAssignments.map(({ role }) => contractRole(role)));
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    phoneNumber: profile.phoneNumber,
    status: profile.status === UserStatus.ACTIVE ? 'active' : 'suspended',
    roles: marketplaceRoleValues.filter((role) => current.has(role)),
  };
}

function addressResult(address: PersistedAddress): ShippingAddress {
  return {
    id: address.id,
    recipientName: address.recipientName,
    phoneNumber: address.phoneNumber,
    province: address.province,
    district: address.district,
    ward: address.ward,
    addressLine: address.addressLine,
    label: address.label,
    isDefault: address.isDefault,
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
}

function text(value: string, minimum: number, maximum: number, parameter: string): string {
  const normalized = normalizeAccountText(value, minimum, maximum);
  if (normalized === null) throw new AccountInputError([parameter]);
  return normalized;
}

function phone(value: string, parameter = 'phoneNumber'): string {
  const normalized = normalizeVietnamesePhone(value);
  if (normalized === null) throw new AccountInputError([parameter]);
  return normalized;
}

function normalizedAddress(input: ShippingAddressFields): ShippingAddressFields {
  return {
    recipientName: text(
      input.recipientName,
      ACCOUNT_NAME_MIN_LENGTH,
      ACCOUNT_NAME_MAX_LENGTH,
      'recipientName',
    ),
    phoneNumber: phone(input.phoneNumber),
    province: text(input.province, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH, 'province'),
    district: text(input.district, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH, 'district'),
    ward: text(input.ward, ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH, 'ward'),
    addressLine: text(
      input.addressLine,
      ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
      ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
      'addressLine',
    ),
    label:
      input.label === null
        ? null
        : text(
            input.label,
            ACCOUNT_ADDRESS_LABEL_MIN_LENGTH,
            ACCOUNT_ADDRESS_LABEL_MAX_LENGTH,
            'label',
          ),
  };
}

@Injectable()
export class AccountService {
  constructor(@Inject(AccountRepository) private readonly repository: AccountRepository) {}

  async profile(userId: string): Promise<BuyerProfile> {
    const profile = await this.repository.findProfile(userId);
    if (!profile) throw new AccountUnavailableError();
    return profileResult(profile);
  }

  async updateProfile(userId: string, input: UpdateBuyerProfileRequest): Promise<BuyerProfile> {
    if (Object.keys(input).length === 0) throw new AccountInputError(['request']);
    const data: { displayName?: string; phoneNumber?: string | null } = {};
    if (input.displayName !== undefined) {
      data.displayName = text(
        input.displayName,
        ACCOUNT_NAME_MIN_LENGTH,
        ACCOUNT_NAME_MAX_LENGTH,
        'displayName',
      );
    }
    if (input.phoneNumber !== undefined) {
      data.phoneNumber = input.phoneNumber === null ? null : phone(input.phoneNumber);
    }
    return profileResult(await this.repository.updateProfile(userId, data));
  }

  async addresses(userId: string): Promise<ShippingAddressList> {
    return { items: (await this.repository.listAddresses(userId)).map(addressResult) };
  }

  createAddress(userId: string, input: CreateShippingAddressRequest): Promise<ShippingAddress> {
    const normalized = normalizedAddress(input);
    return this.repository.transaction(async (transaction) => {
      await this.requireOwnerLock(transaction, userId);
      const count = await transaction.shippingAddress.count({ where: { userId, deletedAt: null } });
      const makeDefault = count === 0 || input.isDefault === true;
      if (makeDefault && count > 0) {
        await transaction.shippingAddress.updateMany({
          where: { userId, deletedAt: null, isDefault: true },
          data: { isDefault: false },
        });
      }
      const created = await transaction.shippingAddress.create({
        data: { userId, ...normalized, isDefault: makeDefault },
        select: {
          id: true,
          recipientName: true,
          phoneNumber: true,
          province: true,
          district: true,
          ward: true,
          addressLine: true,
          label: true,
          isDefault: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await this.assertDefaultInvariant(transaction, userId);
      return addressResult(created);
    });
  }

  updateAddress(
    userId: string,
    addressId: string,
    input: UpdateShippingAddressRequest,
  ): Promise<ShippingAddress> {
    this.requireAddressId(addressId);
    if (Object.keys(input).length === 0) throw new AccountInputError(['request']);
    return this.repository.transaction(async (transaction) => {
      await this.requireOwnerLock(transaction, userId);
      const current = await this.repository.findOwnedAddress(transaction, userId, addressId);
      if (!current) throw new AccountAddressNotFoundError();
      const merged = normalizedAddress({
        recipientName: input.recipientName ?? current.recipientName,
        phoneNumber: input.phoneNumber ?? current.phoneNumber,
        province: input.province ?? current.province,
        district: input.district ?? current.district,
        ward: input.ward ?? current.ward,
        addressLine: input.addressLine ?? current.addressLine,
        label: input.label === undefined ? current.label : input.label,
      });
      const updated = await transaction.shippingAddress.update({
        where: { id: current.id },
        data: merged,
      });
      await this.assertDefaultInvariant(transaction, userId);
      return addressResult(updated);
    });
  }

  selectDefault(userId: string, addressId: string): Promise<ShippingAddress> {
    this.requireAddressId(addressId);
    return this.repository.transaction(async (transaction) => {
      await this.requireOwnerLock(transaction, userId);
      const target = await this.repository.findOwnedAddress(transaction, userId, addressId);
      if (!target) throw new AccountAddressNotFoundError();
      if (!target.isDefault) {
        await transaction.shippingAddress.updateMany({
          where: { userId, deletedAt: null, isDefault: true },
          data: { isDefault: false },
        });
        await transaction.shippingAddress.update({
          where: { id: target.id },
          data: { isDefault: true },
        });
      }
      await this.assertDefaultInvariant(transaction, userId);
      return addressResult(
        (await this.repository.findOwnedAddress(transaction, userId, target.id))!,
      );
    });
  }

  deleteAddress(userId: string, addressId: string): Promise<void> {
    this.requireAddressId(addressId);
    return this.repository.transaction(async (transaction) => {
      await this.requireOwnerLock(transaction, userId);
      const target = await this.repository.findOwnedAddress(transaction, userId, addressId);
      if (!target) throw new AccountAddressNotFoundError();
      await transaction.shippingAddress.update({
        where: { id: target.id },
        data: { isDefault: false, deletedAt: new Date() },
      });
      if (target.isDefault) {
        const replacement = await transaction.shippingAddress.findFirst({
          where: { userId, deletedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        if (replacement) {
          await transaction.shippingAddress.update({
            where: { id: replacement.id },
            data: { isDefault: true },
          });
        }
      }
      await this.assertDefaultInvariant(transaction, userId);
    });
  }

  private requireAddressId(addressId: string): void {
    if (!isCanonicalRoleTargetId(addressId)) throw new AccountAddressNotFoundError();
  }

  private async requireOwnerLock(transaction: AccountTransaction, userId: string): Promise<void> {
    if (!(await this.repository.lockOwner(transaction, userId)))
      throw new AccountUnavailableError();
  }

  private async assertDefaultInvariant(
    transaction: AccountTransaction,
    userId: string,
  ): Promise<void> {
    const [addressCount, defaultCount] = await Promise.all([
      transaction.shippingAddress.count({ where: { userId, deletedAt: null } }),
      transaction.shippingAddress.count({ where: { userId, deletedAt: null, isDefault: true } }),
    ]);
    if (defaultCount !== (addressCount === 0 ? 0 : 1)) throw new AccountInvariantConflictError();
  }
}
