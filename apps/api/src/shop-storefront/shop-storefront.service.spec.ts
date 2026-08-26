import type { CatalogPublicFacade } from '../catalog/catalog-public.facade';
import type { ShopStorefrontRepository } from './shop-storefront.repository';
import {
  PublicShopNotFoundError,
  ShopFollowOwnerUnavailableError,
  ShopSelfFollowConflictError,
  ShopStorefrontAggregateError,
} from './shop-storefront.errors';
import { ShopStorefrontService } from './shop-storefront.service';

const userId = '00000000-0000-4000-8000-000000000001';
const shopId = '00000000-0000-4000-8000-000000000101';
const otherShopId = '00000000-0000-4000-8000-000000000102';
const timestamp = new Date('2026-08-14T03:00:00.000Z');

describe('ShopStorefrontService', () => {
  const repository = {
    findPublicShopBySlug: jest.fn(),
    countFollowers: jest.fn(),
    countFollowedShops: jest.fn(),
    followedShopPage: jest.fn(),
    followerCounts: jest.fn(),
    followingShopIds: jest.fn(),
    transaction: jest.fn(),
    lockActiveOwner: jest.fn(),
    lockShop: jest.fn(),
    createFollow: jest.fn(),
    deleteFollow: jest.fn(),
    countFollowersInTransaction: jest.fn(),
  } as unknown as ShopStorefrontRepository;
  const catalog = {
    getShopSummary: jest.fn(),
    getShopProducts: jest.fn(),
  } as unknown as CatalogPublicFacade;
  const service = new ShopStorefrontService(repository, catalog, { now: () => timestamp });

  beforeEach(() => {
    jest.clearAllMocks();
    (repository.transaction as jest.Mock).mockImplementation((work) => work({}));
    (repository.findPublicShopBySlug as jest.Mock).mockResolvedValue({
      id: shopId,
      ownerId: otherShopId,
      slug: 'demo-shop',
      name: 'Demo Shop',
      location: 'Hà Nội',
      createdAt: timestamp,
      ratingAverageBasisPoints: 425,
      ratingCount: 4,
    });
    (repository.countFollowers as jest.Mock).mockResolvedValue(7);
  });

  it('uses persisted review aggregates and explicit response placeholders', async () => {
    (catalog.getShopSummary as jest.Mock).mockResolvedValue({
      products: [{ soldCount: 4 }, { soldCount: 6 }],
      categories: [{ slug: 'phones', name: 'Điện thoại', parentSlug: null, productCount: 2 }],
    });
    await expect(service.profile('demo-shop')).resolves.toMatchObject({
      id: shopId,
      ownerUserId: otherShopId,
      activeProductCount: 2,
      ratingAverageBasisPoints: 425,
      ratingCount: 4,
      soldCount: 10,
      followerCount: 7,
      responseMetadata: { responseRateBasisPoints: null, responseTimeLabel: null },
    });
  });

  it('fails closed when a persisted review aggregate is corrupted', async () => {
    (repository.findPublicShopBySlug as jest.Mock).mockResolvedValue({
      id: shopId,
      ownerId: otherShopId,
      slug: 'demo-shop',
      name: 'Demo Shop',
      location: 'Hà Nội',
      createdAt: timestamp,
      ratingAverageBasisPoints: 501,
      ratingCount: Number.MAX_SAFE_INTEGER + 1,
    });
    (catalog.getShopSummary as jest.Mock).mockResolvedValue({
      products: [],
      categories: [],
    });
    await expect(service.profile('demo-shop')).rejects.toBeInstanceOf(ShopStorefrontAggregateError);
  });

  it('resolves shop before catalog and uses uniform not-found', async () => {
    (repository.findPublicShopBySlug as jest.Mock).mockResolvedValue(null);
    await expect(
      service.products('missing', {
        q: null,
        category: null,
        sort: 'newest',
        page: 1,
        pageSize: 12,
      }),
    ).rejects.toBeInstanceOf(PublicShopNotFoundError);
    expect(catalog.getShopProducts).not.toHaveBeenCalled();
  });

  it('preserves requested batch order and isolates membership', async () => {
    (repository.followingShopIds as jest.Mock).mockResolvedValue([{ shopId: otherShopId }]);
    await expect(service.status(userId, [shopId, otherShopId])).resolves.toEqual({
      items: [
        { shopId, isFollowing: false },
        { shopId: otherShopId, isFollowing: true },
      ],
    });
    expect(repository.followingShopIds).toHaveBeenCalledWith(userId, [shopId, otherShopId]);
  });

  it('returns an ordered page with available and minimal unavailable projections', async () => {
    (repository.countFollowedShops as jest.Mock).mockResolvedValue(2);
    (repository.followedShopPage as jest.Mock).mockResolvedValue([
      {
        shopId,
        followedAt: timestamp,
        shop: {
          id: shopId,
          slug: 'demo-shop',
          name: 'Demo Shop',
          location: 'HÃ  Ná»™i',
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
      {
        shopId: otherShopId,
        followedAt: new Date('2026-08-13T03:00:00.000Z'),
        shop: {
          id: otherShopId,
          slug: 'hidden-shop',
          name: 'Hidden Shop',
          location: 'Private',
          status: 'INACTIVE',
          deletedAt: null,
        },
      },
    ]);
    (repository.followerCounts as jest.Mock).mockResolvedValue([{ shopId, _count: { _all: 3 } }]);
    await expect(service.followedShops(userId, { page: 1, pageSize: 20 })).resolves.toEqual({
      items: [
        {
          availability: 'available',
          shopId,
          followedAt: timestamp.toISOString(),
          shop: {
            id: shopId,
            slug: 'demo-shop',
            name: 'Demo Shop',
            href: '/shops/demo-shop',
            location: 'HÃ  Ná»™i',
            followerCount: 3,
          },
        },
        {
          availability: 'unavailable',
          shopId: otherShopId,
          followedAt: '2026-08-13T03:00:00.000Z',
          shop: { id: otherShopId, name: 'Hidden Shop', href: null },
        },
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
    });
    expect(repository.followedShopPage).toHaveBeenCalledWith(userId, 0, 20);
    expect(repository.followerCounts).toHaveBeenCalledWith([shopId]);
  });

  it('returns canonical empty out-of-range pages and rejects corrupted counts', async () => {
    (repository.countFollowedShops as jest.Mock).mockResolvedValue(2);
    (repository.followedShopPage as jest.Mock).mockResolvedValue([]);
    (repository.followerCounts as jest.Mock).mockResolvedValue([]);
    await expect(service.followedShops(userId, { page: 3, pageSize: 1 })).resolves.toEqual({
      items: [],
      pagination: { page: 3, pageSize: 1, totalItems: 2, totalPages: 2 },
    });
    (repository.countFollowedShops as jest.Mock).mockResolvedValue(Number.MAX_SAFE_INTEGER + 1);
    await expect(service.followedShops(userId, { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(
      ShopStorefrontAggregateError,
    );
  });

  it('follows idempotently under locks while preserving first timestamp and count', async () => {
    (repository.lockActiveOwner as jest.Mock).mockResolvedValue(true);
    (repository.lockShop as jest.Mock).mockResolvedValue({
      id: shopId,
      ownerId: otherShopId,
      status: 'active',
      deletedAt: null,
    });
    (repository.createFollow as jest.Mock).mockResolvedValue({ followedAt: new Date(0) });
    (repository.countFollowersInTransaction as jest.Mock).mockResolvedValue(3);
    await expect(service.follow(userId, shopId)).resolves.toEqual({
      shopId,
      isFollowing: true,
      followedAt: new Date(0).toISOString(),
      followerCount: 3,
    });
    expect(repository.createFollow).toHaveBeenCalledWith(
      expect.anything(),
      userId,
      shopId,
      timestamp,
    );
  });

  it('rejects unavailable owners, unavailable shops, and self-follow before mutation', async () => {
    (repository.lockActiveOwner as jest.Mock).mockResolvedValue(false);
    await expect(service.follow(userId, shopId)).rejects.toBeInstanceOf(
      ShopFollowOwnerUnavailableError,
    );
    (repository.lockActiveOwner as jest.Mock).mockResolvedValue(true);
    (repository.lockShop as jest.Mock).mockResolvedValue(null);
    await expect(service.follow(userId, shopId)).rejects.toBeInstanceOf(PublicShopNotFoundError);
    (repository.lockShop as jest.Mock).mockResolvedValue({
      id: shopId,
      ownerId: userId,
      status: 'active',
      deletedAt: null,
    });
    await expect(service.follow(userId, shopId)).rejects.toBeInstanceOf(
      ShopSelfFollowConflictError,
    );
    expect(repository.createFollow).not.toHaveBeenCalled();
  });

  it('deletes the owned relation and returns nullable count for unknown targets', async () => {
    (repository.lockActiveOwner as jest.Mock).mockResolvedValue(true);
    (repository.deleteFollow as jest.Mock).mockResolvedValue({ count: 0 });
    (repository.lockShop as jest.Mock).mockResolvedValue(null);
    await expect(service.unfollow(userId, shopId)).resolves.toEqual({
      shopId,
      isFollowing: false,
      followedAt: null,
      followerCount: null,
    });
    expect(repository.deleteFollow).toHaveBeenCalledWith(expect.anything(), userId, shopId);
  });
});
