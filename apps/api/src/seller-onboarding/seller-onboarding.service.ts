import {
  isCreateSellerShopRequest,
  isShopApprovalRequest,
  isUpdateSellerShopRequest,
  normalizeAccountText,
  normalizeAuthEmail,
  normalizeShopMediaUrl,
  normalizeShopSlug,
  normalizeVietnamesePhone,
  shopCanSell,
  SHOP_DESCRIPTION_MAX_LENGTH,
  SHOP_LOCATION_MAX_LENGTH,
  SHOP_LOCATION_MIN_LENGTH,
  SHOP_NAME_MAX_LENGTH,
  SHOP_NAME_MIN_LENGTH,
  type CreateSellerShopRequest,
  type SellerShopProfile,
  type SellerShopWorkspace,
  type ShopApprovalRequest,
  type ShopServiceAddress,
  type UpdateSellerShopRequest,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { AuthorizationDeniedError } from '../auth/auth.errors';
import { RoleAuthorizationService } from '../auth/role-authorization.service';
import { Prisma } from '../generated/prisma/client';
import { ShopOnboardingStatus, ShopStatus } from '../generated/prisma/enums';
import {
  SellerOnboardingInputError,
  SellerOnboardingUnavailableError,
  SellerShopConflictError,
  SellerShopNotFoundError,
} from './seller-onboarding.errors';
import {
  SellerOnboardingRepository,
  type PersistedDefaultAddress,
  type PersistedSellerShop,
} from './seller-onboarding.repository';

function operationalStatus(status: ShopStatus): SellerShopProfile['status'] {
  if (status === ShopStatus.ACTIVE) return 'active';
  if (status === ShopStatus.SUSPENDED) return 'suspended';
  return 'inactive';
}

function onboardingStatus(status: ShopOnboardingStatus): SellerShopProfile['onboardingStatus'] {
  if (status === ShopOnboardingStatus.APPROVED) return 'approved';
  if (status === ShopOnboardingStatus.REJECTED) return 'rejected';
  return 'pending_approval';
}

function addressFromColumns(
  recipientName: string | null,
  phoneNumber: string | null,
  province: string | null,
  district: string | null,
  ward: string | null,
  addressLine: string | null,
): ShopServiceAddress | null {
  if (!recipientName || !phoneNumber || !province || !district || !ward || !addressLine) {
    return null;
  }
  return { recipientName, phoneNumber, province, district, ward, addressLine };
}

function defaultAddress(address: PersistedDefaultAddress): ShopServiceAddress {
  return {
    recipientName: address.recipientName,
    phoneNumber: address.phoneNumber,
    province: address.province,
    district: address.district,
    ward: address.ward,
    addressLine: address.addressLine,
  };
}

function addressColumns(prefix: 'pickup' | 'return', address: ShopServiceAddress) {
  if (prefix === 'pickup') {
    return {
      pickupRecipientName: address.recipientName,
      pickupPhoneNumber: address.phoneNumber,
      pickupProvince: address.province,
      pickupDistrict: address.district,
      pickupWard: address.ward,
      pickupAddressLine: address.addressLine,
    };
  }
  return {
    returnRecipientName: address.recipientName,
    returnPhoneNumber: address.phoneNumber,
    returnProvince: address.province,
    returnDistrict: address.district,
    returnWard: address.ward,
    returnAddressLine: address.addressLine,
  };
}

function requiredText(value: string, minimum: number, maximum: number, parameter: string): string {
  const normalized = normalizeAccountText(value, minimum, maximum);
  if (normalized === null) throw new SellerOnboardingInputError([parameter]);
  return normalized;
}

function requiredPhone(value: string, parameter: string): string {
  const normalized = normalizeVietnamesePhone(value);
  if (normalized === null) throw new SellerOnboardingInputError([parameter]);
  return normalized;
}

function requiredAddress(value: ShopServiceAddress, prefix: string): ShopServiceAddress {
  return {
    recipientName: requiredText(value.recipientName, 2, 120, `${prefix}.recipientName`),
    phoneNumber: requiredPhone(value.phoneNumber, `${prefix}.phoneNumber`),
    province: requiredText(value.province, 2, 100, `${prefix}.province`),
    district: requiredText(value.district, 2, 100, `${prefix}.district`),
    ward: requiredText(value.ward, 2, 100, `${prefix}.ward`),
    addressLine: requiredText(value.addressLine, 5, 255, `${prefix}.addressLine`),
  };
}

function withoutUndefinedFields(input: UpdateSellerShopRequest): UpdateSellerShopRequest {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as UpdateSellerShopRequest;
}

function optionalMedia(value: string | null, parameter: string): string | null {
  if (value === null) return null;
  const normalized = normalizeShopMediaUrl(value);
  if (normalized === null) throw new SellerOnboardingInputError([parameter]);
  return normalized;
}

function profile(shop: PersistedSellerShop): SellerShopProfile {
  const status = operationalStatus(shop.status);
  const onboarding = onboardingStatus(shop.onboardingStatus);
  return {
    id: shop.id,
    slug: shop.slug,
    name: shop.name,
    description: shop.description,
    logoUrl: shop.logoUrl,
    bannerUrl: shop.bannerUrl,
    location: shop.location,
    contactPhone: shop.contactPhone,
    contactEmail: shop.contactEmail,
    pickupAddress: addressFromColumns(
      shop.pickupRecipientName,
      shop.pickupPhoneNumber,
      shop.pickupProvince,
      shop.pickupDistrict,
      shop.pickupWard,
      shop.pickupAddressLine,
    ),
    returnAddress: addressFromColumns(
      shop.returnRecipientName,
      shop.returnPhoneNumber,
      shop.returnProvince,
      shop.returnDistrict,
      shop.returnWard,
      shop.returnAddressLine,
    ),
    status,
    onboardingStatus: onboarding,
    onboardingReason: shop.onboardingReason,
    canSell: shop.deletedAt === null && shopCanSell({ status, onboardingStatus: onboarding }),
    createdAt: shop.createdAt.toISOString(),
    updatedAt: shop.updatedAt.toISOString(),
  };
}

function uniqueConflict(error: unknown): SellerShopConflictError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null;
  }
  const target = Array.isArray(error.meta?.target)
    ? error.meta.target.map(String).join(',')
    : String(error.meta?.target ?? error.meta?.modelName ?? '');
  if (target.includes('slug')) return new SellerShopConflictError(['slug']);
  if (target.includes('name')) return new SellerShopConflictError(['name']);
  if (target.includes('owner')) return new SellerShopConflictError(['shop']);
  return new SellerShopConflictError(['shop']);
}

@Injectable()
export class SellerOnboardingService {
  constructor(
    @Inject(SellerOnboardingRepository)
    private readonly repository: SellerOnboardingRepository,
    @Inject(RoleAuthorizationService)
    private readonly roles: RoleAuthorizationService,
  ) {}

  async workspace(userId: string): Promise<SellerShopWorkspace> {
    try {
      const [shop, address] = await Promise.all([
        this.repository.findOwnedLiveShop(userId),
        this.repository.findDefaultShippingAddress(userId),
      ]);
      return {
        shop: shop ? profile(shop) : null,
        defaultAddress: address ? defaultAddress(address) : null,
      };
    } catch {
      throw new SellerOnboardingUnavailableError();
    }
  }

  create(userId: string, input: CreateSellerShopRequest): Promise<SellerShopProfile> {
    if (!isCreateSellerShopRequest(input)) {
      throw new SellerOnboardingInputError(['request']);
    }
    const slug = normalizeShopSlug(input.slug);
    if (slug === null) throw new SellerOnboardingInputError(['slug']);
    const name = requiredText(input.name, SHOP_NAME_MIN_LENGTH, SHOP_NAME_MAX_LENGTH, 'name');
    const description = input.description.trim();
    if (description.length > SHOP_DESCRIPTION_MAX_LENGTH) {
      throw new SellerOnboardingInputError(['description']);
    }
    const location = requiredText(
      input.location,
      SHOP_LOCATION_MIN_LENGTH,
      SHOP_LOCATION_MAX_LENGTH,
      'location',
    );
    const payload = {
      ownerId: userId,
      slug,
      name,
      description,
      logoUrl: optionalMedia(input.logoUrl, 'logoUrl'),
      bannerUrl: optionalMedia(input.bannerUrl, 'bannerUrl'),
      location,
      contactPhone: requiredPhone(input.contactPhone, 'contactPhone'),
      contactEmail: normalizeAuthEmail(input.contactEmail),
      ...addressColumns('pickup', requiredAddress(input.pickupAddress, 'pickupAddress')),
      ...addressColumns('return', requiredAddress(input.returnAddress, 'returnAddress')),
      status: ShopStatus.INACTIVE,
      onboardingStatus: ShopOnboardingStatus.PENDING_APPROVAL,
    };
    return this.repository.transaction(async (transaction) => {
      if (!(await this.repository.lockOwner(transaction, userId))) {
        throw new AuthorizationDeniedError();
      }
      const existing = await this.repository.findOwnedLiveShop(userId, transaction);
      if (existing) throw new SellerShopConflictError(['shop']);
      try {
        return profile(await this.repository.createShop(transaction, payload));
      } catch (error) {
        throw uniqueConflict(error) ?? new SellerOnboardingUnavailableError();
      }
    });
  }

  update(userId: string, rawInput: UpdateSellerShopRequest): Promise<SellerShopProfile> {
    const input = withoutUndefinedFields(rawInput);
    if (!isUpdateSellerShopRequest(input)) {
      throw new SellerOnboardingInputError(['request']);
    }
    return this.repository.transaction(async (transaction) => {
      if (!(await this.repository.lockOwner(transaction, userId))) {
        throw new AuthorizationDeniedError();
      }
      const existing = await this.repository.findOwnedLiveShop(userId, transaction);
      if (!existing) throw new AuthorizationDeniedError();
      if (existing.onboardingStatus !== ShopOnboardingStatus.APPROVED) {
        if (input.status !== undefined) throw new SellerShopConflictError(['status']);
        throw new AuthorizationDeniedError();
      }
      const data: Prisma.ShopUncheckedUpdateInput = {};
      if (input.slug !== undefined) {
        const slug = normalizeShopSlug(input.slug);
        if (slug === null) throw new SellerOnboardingInputError(['slug']);
        data.slug = slug;
      }
      if (input.name !== undefined) {
        data.name = requiredText(input.name, SHOP_NAME_MIN_LENGTH, SHOP_NAME_MAX_LENGTH, 'name');
      }
      if (input.description !== undefined) {
        const description = input.description.trim();
        if (description.length > SHOP_DESCRIPTION_MAX_LENGTH) {
          throw new SellerOnboardingInputError(['description']);
        }
        data.description = description;
      }
      if (input.logoUrl !== undefined) data.logoUrl = optionalMedia(input.logoUrl, 'logoUrl');
      if (input.bannerUrl !== undefined)
        data.bannerUrl = optionalMedia(input.bannerUrl, 'bannerUrl');
      if (input.location !== undefined) {
        data.location = requiredText(
          input.location,
          SHOP_LOCATION_MIN_LENGTH,
          SHOP_LOCATION_MAX_LENGTH,
          'location',
        );
      }
      if (input.contactPhone !== undefined) {
        data.contactPhone = requiredPhone(input.contactPhone, 'contactPhone');
      }
      if (input.contactEmail !== undefined)
        data.contactEmail = normalizeAuthEmail(input.contactEmail);
      if (input.pickupAddress !== undefined) {
        Object.assign(
          data,
          addressColumns('pickup', requiredAddress(input.pickupAddress, 'pickupAddress')),
        );
      }
      if (input.returnAddress !== undefined) {
        Object.assign(
          data,
          addressColumns('return', requiredAddress(input.returnAddress, 'returnAddress')),
        );
      }
      if (input.status !== undefined) {
        if (existing.onboardingStatus !== ShopOnboardingStatus.APPROVED) {
          throw new SellerShopConflictError(['status']);
        }
        data.status = input.status === 'active' ? ShopStatus.ACTIVE : ShopStatus.INACTIVE;
      }
      try {
        return profile(await this.repository.updateShop(transaction, existing.id, data));
      } catch (error) {
        throw uniqueConflict(error) ?? new SellerOnboardingUnavailableError();
      }
    });
  }

  updateRegistration(userId: string, rawInput: UpdateSellerShopRequest): Promise<SellerShopProfile> {
    const input = withoutUndefinedFields(rawInput);
    if (!isUpdateSellerShopRequest(input)) {
      throw new SellerOnboardingInputError(['request']);
    }
    if (input.status !== undefined) throw new SellerOnboardingInputError(['status']);
    return this.repository.transaction(async (transaction) => {
      if (!(await this.repository.lockOwner(transaction, userId))) {
        throw new AuthorizationDeniedError();
      }
      const existing = await this.repository.findOwnedLiveShop(userId, transaction);
      if (!existing) throw new AuthorizationDeniedError();
      if (
        existing.onboardingStatus !== ShopOnboardingStatus.PENDING_APPROVAL &&
        existing.onboardingStatus !== ShopOnboardingStatus.REJECTED
      ) {
        throw new AuthorizationDeniedError();
      }
      const data: Prisma.ShopUncheckedUpdateInput = {};
      if (input.slug !== undefined) {
        const slug = normalizeShopSlug(input.slug);
        if (slug === null) throw new SellerOnboardingInputError(['slug']);
        data.slug = slug;
      }
      if (input.name !== undefined) {
        data.name = requiredText(input.name, SHOP_NAME_MIN_LENGTH, SHOP_NAME_MAX_LENGTH, 'name');
      }
      if (input.description !== undefined) {
        const description = input.description.trim();
        if (description.length > SHOP_DESCRIPTION_MAX_LENGTH) {
          throw new SellerOnboardingInputError(['description']);
        }
        data.description = description;
      }
      if (input.logoUrl !== undefined) data.logoUrl = optionalMedia(input.logoUrl, 'logoUrl');
      if (input.bannerUrl !== undefined) data.bannerUrl = optionalMedia(input.bannerUrl, 'bannerUrl');
      if (input.location !== undefined) {
        data.location = requiredText(
          input.location,
          SHOP_LOCATION_MIN_LENGTH,
          SHOP_LOCATION_MAX_LENGTH,
          'location',
        );
      }
      if (input.contactPhone !== undefined) data.contactPhone = requiredPhone(input.contactPhone, 'contactPhone');
      if (input.contactEmail !== undefined) data.contactEmail = normalizeAuthEmail(input.contactEmail);
      if (input.pickupAddress !== undefined) {
        Object.assign(data, addressColumns('pickup', requiredAddress(input.pickupAddress, 'pickupAddress')));
      }
      if (input.returnAddress !== undefined) {
        Object.assign(data, addressColumns('return', requiredAddress(input.returnAddress, 'returnAddress')));
      }
      if (existing.onboardingStatus === ShopOnboardingStatus.REJECTED) {
        data.onboardingStatus = ShopOnboardingStatus.PENDING_APPROVAL;
        data.status = ShopStatus.INACTIVE;
        data.onboardingReason = null;
      }
      try {
        return profile(await this.repository.updateShop(transaction, existing.id, data));
      } catch (error) {
        throw uniqueConflict(error) ?? new SellerOnboardingUnavailableError();
      }
    });
  }

  approve(
    shopId: string,
    input: ShopApprovalRequest,
    actorUserId: string,
  ): Promise<SellerShopProfile> {
    if (!isShopApprovalRequest(input)) throw new SellerOnboardingInputError(['request']);
    return this.repository.transaction(async (transaction) => {
      const shop = await this.repository.findShopById(shopId, transaction);
      if (!shop) throw new SellerShopNotFoundError();
      if (!(await this.repository.lockOwner(transaction, shop.ownerId))) {
        throw new SellerShopNotFoundError();
      }
      const alreadyApproved =
        input.decision === 'approve' &&
        shop.onboardingStatus === ShopOnboardingStatus.APPROVED &&
        shop.status === ShopStatus.ACTIVE &&
        shop.onboardingReason === input.reason;
      const alreadyRejected =
        input.decision === 'reject' &&
        shop.onboardingStatus === ShopOnboardingStatus.REJECTED &&
        shop.status === ShopStatus.INACTIVE &&
        shop.onboardingReason === input.reason;
      if (alreadyApproved || alreadyRejected) return profile(shop);
      if (
        shop.onboardingStatus === ShopOnboardingStatus.APPROVED ||
        shop.onboardingStatus === ShopOnboardingStatus.REJECTED
      ) {
        throw new SellerShopConflictError(['decision']);
      }
      const next =
        input.decision === 'approve'
          ? {
              onboardingStatus: ShopOnboardingStatus.APPROVED,
              status: ShopStatus.ACTIVE,
              onboardingReason: input.reason,
            }
          : {
              onboardingStatus: ShopOnboardingStatus.REJECTED,
              status: ShopStatus.INACTIVE,
              onboardingReason: input.reason,
            };
      if (input.decision === 'approve') {
        await this.roles.grantSellerForShopApproval(
          transaction,
          actorUserId,
          shop.ownerId,
          input.reason,
        );
      }
      return profile(await this.repository.updateShop(transaction, shop.id, next));
    });
  }
}
