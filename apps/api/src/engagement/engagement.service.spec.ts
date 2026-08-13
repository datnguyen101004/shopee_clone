import type { EngagementRepository } from './engagement.repository';
import {
  EngagementOwnerUnavailableError,
  EngagementProductNotFoundError,
} from './engagement.errors';
import { EngagementService } from './engagement.service';

const userId = '00000000-0000-4000-8000-000000000001';
const firstId = '00000000-0000-4000-8000-000000000101';
const secondId = '00000000-0000-4000-8000-000000000102';
const timestamp = new Date('2026-08-13T03:00:00.000Z');
const product = (id: string, status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') => ({
  id,
  name: `Product ${id.slice(-3)}`,
  categoryId: '00000000-0000-4000-8000-000000000201',
  description: 'Description',
  createdAt: timestamp,
  ratingAverageBasisPoints: 450,
  ratingCount: 2,
  soldCount: 3,
  status,
  deletedAt: null,
  shop: { name: 'Shop', location: 'Hà Nội', status: 'ACTIVE', deletedAt: null },
  category: { slug: 'category', name: 'Category', isActive: true, deletedAt: null },
  images: [{ url: '/product.webp', altText: 'Product' }],
  variants: [
    {
      id: 'variant',
      priceMinor: 1000n,
      compareAtPriceMinor: null,
      inventory: { quantityOnHand: 2, quantityReserved: 0 },
    },
  ],
});

describe('EngagementService', () => {
  const repository = {
    countFavorites: jest.fn(),
    listFavoriteRows: jest.fn(),
    findDisplayableProduct: jest.fn(),
    upsertFavorite: jest.fn(),
    deleteFavorite: jest.fn(),
    favoriteProductIds: jest.fn(),
    listRecentRows: jest.fn(),
    transaction: jest.fn(),
    lockActiveOwner: jest.fn(),
    findDisplayableProductInTransaction: jest.fn(),
    upsertRecentAndTrim: jest.fn(),
  } as unknown as EngagementRepository;
  const service = new EngagementService(repository, { now: () => timestamp });

  beforeEach(() => {
    jest.clearAllMocks();
    (repository.transaction as jest.Mock).mockImplementation((work) => work({}));
  });

  it('lists available and unavailable favorites in repository order', async () => {
    (repository.countFavorites as jest.Mock).mockResolvedValue(2);
    (repository.listFavoriteRows as jest.Mock).mockResolvedValue([
      {
        userId,
        productId: secondId,
        favoritedAt: timestamp,
        product: product(secondId, 'ARCHIVED'),
      },
      {
        userId,
        productId: firstId,
        favoritedAt: new Date(timestamp.getTime() - 1),
        product: product(firstId),
      },
    ]);
    const page = await service.favorites(userId, { page: 1, pageSize: 20 });
    expect(page.items.map(({ availability }) => availability)).toEqual([
      'unavailable',
      'available',
    ]);
    expect(page.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
  });

  it('preserves favorite timestamps, makes delete repeatable, and preserves batch order', async () => {
    (repository.findDisplayableProduct as jest.Mock).mockResolvedValue(product(firstId));
    (repository.upsertFavorite as jest.Mock).mockResolvedValue({ favoritedAt: timestamp });
    await expect(service.addFavorite(userId, firstId)).resolves.toEqual({
      productId: firstId,
      isFavorite: true,
      favoritedAt: timestamp.toISOString(),
    });
    expect(repository.upsertFavorite).toHaveBeenCalledWith(userId, firstId, timestamp);
    (repository.deleteFavorite as jest.Mock).mockResolvedValue({ count: 0 });
    await expect(service.removeFavorite(userId, firstId)).resolves.toEqual({
      productId: firstId,
      isFavorite: false,
      favoritedAt: null,
    });
    (repository.favoriteProductIds as jest.Mock).mockResolvedValue(new Set([secondId]));
    await expect(service.status(userId, [firstId, secondId])).resolves.toEqual({
      items: [
        { productId: firstId, isFavorite: false },
        { productId: secondId, isFavorite: true },
      ],
    });
  });

  it('filters unavailable recent rows before totals and promotes views under the owner lock', async () => {
    (repository.listRecentRows as jest.Mock).mockResolvedValue([
      {
        productId: secondId,
        lastViewedAt: timestamp,
        product: { ...product(secondId), variants: [] },
      },
      {
        productId: firstId,
        lastViewedAt: new Date(timestamp.getTime() - 1),
        product: product(firstId),
      },
    ]);
    await expect(service.recentlyViewed(userId, { page: 1, pageSize: 20 })).resolves.toMatchObject({
      items: [{ productId: firstId }],
      pagination: { totalItems: 1, totalPages: 1 },
    });
    (repository.lockActiveOwner as jest.Mock).mockResolvedValue(true);
    (repository.findDisplayableProductInTransaction as jest.Mock).mockResolvedValue({
      id: firstId,
    });
    (repository.upsertRecentAndTrim as jest.Mock).mockResolvedValue({ lastViewedAt: timestamp });
    await expect(service.recordView(userId, firstId)).resolves.toEqual({
      productId: firstId,
      lastViewedAt: timestamp.toISOString(),
    });
    expect((repository.lockActiveOwner as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (repository.upsertRecentAndTrim as jest.Mock).mock.invocationCallOrder[0]!,
    );
  });

  it('uses privacy-safe domain errors for missing products and inactive owners', async () => {
    (repository.findDisplayableProduct as jest.Mock).mockResolvedValue(null);
    await expect(service.addFavorite(userId, firstId)).rejects.toBeInstanceOf(
      EngagementProductNotFoundError,
    );
    (repository.lockActiveOwner as jest.Mock).mockResolvedValue(false);
    await expect(service.recordView(userId, firstId)).rejects.toBeInstanceOf(
      EngagementOwnerUnavailableError,
    );
    expect(repository.findDisplayableProductInTransaction).not.toHaveBeenCalled();
  });
});
