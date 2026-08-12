import type { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';

type Candidate = Awaited<ReturnType<CatalogRepository['findCandidates']>>[number];

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: '00000000-0000-4000-8000-000000000301',
    shopId: 'shop-1',
    categoryId: 'leaf-1',
    slug: 'phone',
    name: 'Điện thoại',
    description: 'Test product',
    status: 'ACTIVE',
    ratingAverageBasisPoints: 490,
    ratingCount: 20,
    soldCount: 50,
    createdAt: new Date('2026-08-12T00:00:00.000Z'),
    updatedAt: new Date('2026-08-12T00:00:00.000Z'),
    deletedAt: null,
    shop: {
      id: 'shop-1',
      ownerId: 'owner-1',
      slug: 'shop',
      name: 'Cửa hàng',
      location: 'Hà Nội',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    category: {
      id: 'leaf-1',
      parentId: 'root-1',
      slug: 'phones',
      name: 'Điện thoại',
      sortOrder: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    images: [
      {
        id: 'image-1',
        productId: 'product-1',
        url: '/phone.svg',
        altText: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    variants: [
      {
        id: 'variant-1',
        productId: 'product-1',
        sku: 'PHONE',
        name: 'Default',
        priceMinor: 800n,
        compareAtPriceMinor: 1_000n,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        inventory: {
          variantId: 'variant-1',
          quantityOnHand: 2,
          quantityReserved: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ],
    ...overrides,
  } as Candidate;
}

describe('CatalogService', () => {
  const repository = {
    findActiveCategories: jest.fn(),
    findCandidates: jest.fn(),
  };
  const service = new CatalogService(repository as unknown as CatalogRepository);

  beforeEach(() => jest.clearAllMocks());

  it('resolves descendants, maps promotions, and paginates after eligibility', async () => {
    repository.findActiveCategories.mockResolvedValue([
      { id: 'root-1', parentId: null, slug: 'electronics' },
      { id: 'leaf-1', parentId: 'root-1', slug: 'phones' },
    ]);
    repository.findCandidates.mockResolvedValue([
      candidate(),
      candidate({ id: 'product-2', variants: [] }),
      candidate({ id: 'product-3', name: 'Tai nghe', soldCount: 99 }),
    ]);

    const response = await service.getProducts({ category: 'electronics', page: 2, pageSize: 1 });

    expect(repository.findCandidates).toHaveBeenCalledWith(['root-1', 'leaf-1']);
    expect(response.pagination).toEqual({ page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
    expect(response.items[0]).toMatchObject({
      id: 'product-3',
      priceMinor: 800,
      compareAtPriceMinor: 1000,
      discountPercent: 20,
      soldCount: 99,
      imageAlt: 'Tai nghe',
    });
  });

  it('returns a valid empty page for an unknown category and beyond-final page', async () => {
    repository.findActiveCategories.mockResolvedValue([]);
    expect(await service.getProducts({ category: 'unknown', page: 3, pageSize: 12 })).toMatchObject(
      { items: [], pagination: { page: 3, totalItems: 0, totalPages: 0 } },
    );
    expect(repository.findCandidates).not.toHaveBeenCalled();

    repository.findCandidates.mockResolvedValue([candidate()]);
    const beyond = await service.getProducts({ category: null, page: 2, pageSize: 12 });
    expect(beyond.items).toEqual([]);
    expect(beyond.pagination).toMatchObject({ totalItems: 1, totalPages: 1 });
  });

  it('omits invalid promotion metadata and chooses the lowest in-stock offer', async () => {
    repository.findCandidates.mockResolvedValue([
      candidate({
        variants: [
          {
            ...candidate().variants[0]!,
            id: 'out',
            priceMinor: 100n,
            inventory: {
              ...candidate().variants[0]!.inventory!,
              quantityOnHand: 1,
              quantityReserved: 1,
            },
          },
          {
            ...candidate().variants[0]!,
            id: 'eligible',
            priceMinor: 500n,
            compareAtPriceMinor: 400n,
          },
        ],
      }),
    ]);
    const response = await service.getProducts({ category: null, page: 1, pageSize: 12 });
    expect(response.items[0]).toMatchObject({ priceMinor: 500 });
    expect(response.items[0]).not.toHaveProperty('compareAtPriceMinor');
    expect(response.items[0]).not.toHaveProperty('discountPercent');
  });
});
