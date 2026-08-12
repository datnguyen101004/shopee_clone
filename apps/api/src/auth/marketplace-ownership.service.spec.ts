import { ShopStatus } from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthorizationDeniedError } from './auth.errors';
import { MarketplaceOwnershipService } from './marketplace-ownership.service';

describe('MarketplaceOwnershipService', () => {
  const shop = {
    id: '00000000-0000-4000-8000-000000000101',
    slug: 'seller-shop',
    name: 'Seller Shop',
    status: ShopStatus.ACTIVE,
  };
  const findFirst = jest.fn();
  const count = jest.fn();
  const prisma = {
    shop: { findFirst, count },
  } as unknown as PrismaService;
  const service = new MarketplaceOwnershipService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('returns only the safe projection of a persisted owned shop', async () => {
    findFirst.mockResolvedValue(shop);
    await expect(service.ownedShop('owner-id')).resolves.toEqual({
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      status: 'active',
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ownerId: 'owner-id' }) }),
    );
  });

  it('uses the same denial when an owned shop is unknown or unavailable', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.ownedShop('owner-id')).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('checks user and shop IDs only against persistence', async () => {
    count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(service.ownsShop('owner-id', shop.id)).resolves.toBe(true);
    await expect(service.ownsShop('other-owner-id', shop.id)).resolves.toBe(false);
    expect(count).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: shop.id, ownerId: 'other-owner-id' }),
      }),
    );
  });
});
