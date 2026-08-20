import { AuthorizationDeniedError } from '../auth/auth.errors';
import type { RoleAuthorizationService } from '../auth/role-authorization.service';
import { ShopOnboardingStatus, ShopStatus } from '../generated/prisma/enums';
import { SellerShopConflictError } from './seller-onboarding.errors';
import { SellerOnboardingService } from './seller-onboarding.service';
import type { SellerOnboardingRepository } from './seller-onboarding.repository';

const address = {
  recipientName: 'An Nguyen',
  phoneNumber: '0912345678',
  province: 'TP. Hồ Chí Minh',
  district: 'Quận 1',
  ward: 'Phường Bến Nghé',
  addressLine: '12 Nguyễn Huệ',
};

const createInput = {
  slug: 'an-tech-shop',
  name: 'An Tech Shop',
  description: 'Linh kiện',
  logoUrl: null,
  bannerUrl: null,
  location: 'TP. Hồ Chí Minh',
  contactPhone: '0912345678',
  contactEmail: 'shop@example.test',
  pickupAddress: address,
  returnAddress: address,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000101',
    ownerId: 'owner-id',
    slug: 'an-tech-shop',
    name: 'An Tech Shop',
    description: 'Linh kiện',
    logoUrl: null,
    bannerUrl: null,
    location: 'TP. Hồ Chí Minh',
    contactPhone: '0912345678',
    contactEmail: 'shop@example.test',
    pickupRecipientName: address.recipientName,
    pickupPhoneNumber: address.phoneNumber,
    pickupProvince: address.province,
    pickupDistrict: address.district,
    pickupWard: address.ward,
    pickupAddressLine: address.addressLine,
    returnRecipientName: address.recipientName,
    returnPhoneNumber: address.phoneNumber,
    returnProvince: address.province,
    returnDistrict: address.district,
    returnWard: address.ward,
    returnAddressLine: address.addressLine,
    status: ShopStatus.INACTIVE,
    onboardingStatus: ShopOnboardingStatus.PENDING_APPROVAL,
    onboardingReason: null,
    createdAt: new Date('2026-08-15T01:00:00.000Z'),
    updatedAt: new Date('2026-08-15T01:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('SellerOnboardingService', () => {
  const findOwnedLiveShop = jest.fn();
  const findDefaultShippingAddress = jest.fn();
  const findShopById = jest.fn();
  const lockOwner = jest.fn();
  const createShop = jest.fn();
  const updateShop = jest.fn();
  const repository = {
    findOwnedLiveShop,
    findDefaultShippingAddress,
    findShopById,
    lockOwner,
    createShop,
    updateShop,
    transaction: (work: (tx: unknown) => Promise<unknown>) => work({}),
  } as unknown as SellerOnboardingRepository;


  const roles = {
    grantSellerForShopApproval: jest.fn().mockResolvedValue(undefined),
  } as unknown as RoleAuthorizationService;
  const service = new SellerOnboardingService(repository, roles);

  beforeEach(() => {
    jest.clearAllMocks();
    lockOwner.mockResolvedValue(true);
  });

  it('returns the account default address with a null workspace without creating a shop', async () => {
    findOwnedLiveShop.mockResolvedValue(null);
    findDefaultShippingAddress.mockResolvedValue(address);
    await expect(service.workspace('owner-id')).resolves.toEqual({ shop: null, defaultAddress: address });
    expect(createShop).not.toHaveBeenCalled();
  });

  it('returns a null address candidate when the account has no default address', async () => {
    findOwnedLiveShop.mockResolvedValue(null);
    findDefaultShippingAddress.mockResolvedValue(null);

    await expect(service.workspace('owner-id')).resolves.toEqual({
      shop: null,
      defaultAddress: null,
    });
  });

  it('keeps a complete shop address while still exposing the account default candidate', async () => {
    findOwnedLiveShop.mockResolvedValue(row());
    findDefaultShippingAddress.mockResolvedValue({ ...address, addressLine: '88 Lê Lợi' });

    await expect(service.workspace('owner-id')).resolves.toMatchObject({
      shop: { pickupAddress: address, returnAddress: address },
      defaultAddress: { ...address, addressLine: '88 Lê Lợi' },
    });
  });

  it('creates a pending inactive shop for a seller without a live shop', async () => {
    findOwnedLiveShop.mockResolvedValue(null);
    createShop.mockResolvedValue(row());
    const created = await service.create('owner-id', createInput);
    expect(created.onboardingStatus).toBe('pending_approval');
    expect(created.status).toBe('inactive');
    expect(created.canSell).toBe(false);
    expect(createShop).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        ownerId: 'owner-id',
        status: ShopStatus.INACTIVE,
        onboardingStatus: ShopOnboardingStatus.PENDING_APPROVAL,
      }),
    );
  });

  it('rejects a second live shop and seller activation before approval', async () => {
    findOwnedLiveShop.mockResolvedValue(row());
    await expect(service.create('owner-id', createInput)).rejects.toBeInstanceOf(
      SellerShopConflictError,
    );
    await expect(service.update('owner-id', { status: 'active' })).rejects.toBeInstanceOf(
      SellerShopConflictError,
    );
  });

  it('denies updates when the caller has no owned shop', async () => {
    findOwnedLiveShop.mockResolvedValue(null);
    await expect(service.update('owner-id', { name: 'New Name Shop' })).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
  });

  it('ignores undefined optional fields added by a transformed PATCH DTO', async () => {
    findOwnedLiveShop.mockResolvedValue(
      row({ status: ShopStatus.ACTIVE, onboardingStatus: ShopOnboardingStatus.APPROVED }),
    );
    updateShop.mockResolvedValue(
      row({ name: 'Updated Shop', status: ShopStatus.ACTIVE, onboardingStatus: ShopOnboardingStatus.APPROVED }),
    );

    await expect(
      service.update('owner-id', { name: 'Updated Shop', status: undefined }),
    ).resolves.toMatchObject({ name: 'Updated Shop' });
    expect(updateShop).toHaveBeenCalledWith({}, row().id, { name: 'Updated Shop' });
  });

  it('approves a pending shop and is idempotent', async () => {
    findShopById.mockResolvedValue(row());
    updateShop.mockResolvedValue(
      row({ status: ShopStatus.ACTIVE, onboardingStatus: ShopOnboardingStatus.APPROVED }),
    );
    const approved = await service.approve(row().id, {
      decision: 'approve',
      reason: 'Shop identity looks complete',
    }, 'admin-id');
    expect(approved.canSell).toBe(true);
    findShopById.mockResolvedValue(
      row({
        status: ShopStatus.ACTIVE,
        onboardingStatus: ShopOnboardingStatus.APPROVED,
        onboardingReason: 'Shop identity looks complete',
      }),
    );
    await service.approve(row().id, {
      decision: 'approve',
      reason: 'Shop identity looks complete',
    }, 'admin-id');
    expect(updateShop).toHaveBeenCalledTimes(1);
  });

  it('does not let a later approval rewrite a finalized reason', async () => {
    findShopById.mockResolvedValue(
      row({
        status: ShopStatus.ACTIVE,
        onboardingStatus: ShopOnboardingStatus.APPROVED,
        onboardingReason: 'Original approval reason',
      }),
    );
    await expect(
      service.approve(row().id, {
        decision: 'approve',
        reason: 'Corrected approval reason',
      }, 'admin-id'),
    ).rejects.toBeInstanceOf(SellerShopConflictError);
    expect(updateShop).not.toHaveBeenCalled();
  });
});
