import {
  approveSellerShop,
  createSellerShop,
  fetchSellerShopWorkspace,
  updateSellerRegistration,
} from './seller-shop-api';

const fetcher = vi.fn();

const address = {
  recipientName: 'An Nguyen',
  phoneNumber: '0912345678',
  province: 'TP. Hồ Chí Minh',
  district: 'Quận 1',
  ward: 'Phường Bến Nghé',
  addressLine: '12 Nguyễn Huệ',
};

const profile = {
  id: '00000000-0000-4000-8000-000000000101',
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
  status: 'inactive',
  onboardingStatus: 'pending_approval',
  onboardingReason: null,
  canSell: false,
  createdAt: '2026-08-15T01:00:00.000Z',
  updatedAt: '2026-08-15T01:00:00.000Z',
};

describe('seller shop API client', () => {
  beforeEach(() => fetcher.mockReset());

  it('loads a workspace and rejects owner fields', async () => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ shop: null, defaultAddress: null }), { status: 200 }));
    await expect(fetchSellerShopWorkspace(fetcher)).resolves.toEqual({ shop: null, defaultAddress: null });
    expect(String(fetcher.mock.calls[0]![0])).toContain('/api/v1/seller/shop/workspace');
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ shop: { ...profile, ownerId: profile.id } }), { status: 200 }),
    );
    await expect(fetchSellerShopWorkspace(fetcher)).rejects.toMatchObject({ kind: 'contract' });
  });

  it('creates a shop and posts admin approval', async () => {
    fetcher.mockImplementation(() => new Response(JSON.stringify(profile), { status: 200 }));
    await expect(
      createSellerShop(fetcher, {
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
      }),
    ).resolves.toEqual(profile);
    await approveSellerShop(fetcher, profile.id, {
      decision: 'approve',
      reason: 'Shop identity looks complete',
    });
    expect(String(fetcher.mock.calls[1]![0])).toContain(
      `/api/v1/admin/shops/${profile.id}/approval`,
    );
    await updateSellerRegistration(fetcher, { name: 'Corrected shop' });
    expect(String(fetcher.mock.calls[2]![0])).toContain('/api/v1/seller/shop/registration');
  });
});
