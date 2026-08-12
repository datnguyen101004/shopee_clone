import type { CatalogRepository } from './catalog.repository';
import type { NormalizedCatalogQuery } from './catalog-query';
import { CatalogService } from './catalog.service';

type Candidate = Awaited<ReturnType<CatalogRepository['findCandidates']>>[number];

function query(overrides: Partial<NormalizedCatalogQuery> = {}): NormalizedCatalogQuery {
  return {
    q: null,
    category: null,
    minPrice: null,
    maxPrice: null,
    rating: null,
    location: null,
    availability: null,
    promotion: null,
    sort: 'newest',
    page: 1,
    pageSize: 12,
    ...overrides,
  };
}

const categories = [
  { id: 'root-1', parentId: null, slug: 'electronics', name: 'Điện tử', sortOrder: 0 },
  { id: 'leaf-1', parentId: 'root-1', slug: 'phones', name: 'Điện thoại', sortOrder: 1 },
];

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
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidates.mockResolvedValue([
      candidate(),
      candidate({ id: 'product-2', variants: [] }),
      candidate({ id: 'product-3', name: 'Tai nghe', soldCount: 99 }),
    ]);

    const response = await service.getProducts(
      query({ category: 'electronics', page: 2, pageSize: 1 }),
    );

    expect(repository.findCandidates).toHaveBeenCalledWith();
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
    repository.findCandidates.mockResolvedValue([candidate()]);
    repository.findActiveCategories.mockResolvedValue(categories);
    const unknown = await service.getProducts(query({ category: 'unknown', page: 3 }));
    expect(unknown).toMatchObject({
      items: [],
      pagination: { page: 3, totalItems: 0, totalPages: 0 },
      facets: { categories: expect.any(Array), locations: ['Hà Nội'] },
    });

    const beyond = await service.getProducts(query({ page: 2 }));
    expect(beyond.items).toEqual([]);
    expect(beyond.pagination).toMatchObject({ totalItems: 1, totalPages: 1 });
  });

  it('omits invalid promotion metadata and chooses the lowest in-stock offer', async () => {
    repository.findActiveCategories.mockResolvedValue(categories);
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
    const response = await service.getProducts(query());
    expect(response.items[0]).toMatchObject({ priceMinor: 500 });
    expect(response.items[0]).not.toHaveProperty('compareAtPriceMinor');
    expect(response.items[0]).not.toHaveProperty('discountPercent');
  });

  it('derives unfiltered facets and applies every criterion with AND semantics', async () => {
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidates.mockResolvedValue([
      candidate(),
      candidate({
        id: 'product-2',
        name: 'Ốp lưng',
        description: 'Phụ kiện điện thoại',
        ratingAverageBasisPoints: 399,
        shop: { ...candidate().shop, location: 'Đà Nẵng' },
        variants: [
          {
            ...candidate().variants[0]!,
            priceMinor: 300n,
            compareAtPriceMinor: null,
          },
        ],
      }),
    ]);

    const response = await service.getProducts(
      query({
        q: 'dien thoai',
        category: 'electronics',
        minPrice: 500,
        maxPrice: 900,
        rating: 4,
        location: 'ha noi',
        availability: 'in-stock',
        promotion: 'discounted',
        sort: 'relevance',
      }),
    );

    expect(response.items.map((item) => item.id)).toEqual(['00000000-0000-4000-8000-000000000301']);
    expect(response.query.location).toBe('Hà Nội');
    expect(response.facets).toEqual({
      categories: [
        { slug: 'electronics', name: 'Điện tử', parentSlug: null },
        { slug: 'phones', name: 'Điện thoại', parentSlug: 'electronics' },
      ],
      locations: ['Đà Nẵng', 'Hà Nội'],
      priceRange: { min: 300, max: 800 },
    });
  });

  it.each([
    ['best-selling', ['product-2', 'product-1']],
    ['price-asc', ['product-2', 'product-1']],
    ['price-desc', ['product-1', 'product-2']],
  ] as const)('sorts by %s with stable tie-breakers', async (sort, expected) => {
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidates.mockResolvedValue([
      candidate({ id: 'product-1', soldCount: 10, createdAt: new Date('2026-08-11') }),
      candidate({
        id: 'product-2',
        soldCount: 20,
        createdAt: new Date('2026-08-10'),
        variants: [{ ...candidate().variants[0]!, priceMinor: 400n }],
      }),
    ]);

    const response = await service.getProducts(query({ sort }));
    expect(response.items.map((item) => item.id)).toEqual(expected);
  });

  it('falls back to newest ordering when relevance has no keyword', async () => {
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidates.mockResolvedValue([
      candidate({ id: 'older', createdAt: new Date('2026-08-10') }),
      candidate({ id: 'newer', createdAt: new Date('2026-08-12') }),
    ]);
    const response = await service.getProducts(query({ sort: 'relevance' }));
    expect(response.items.map((item) => item.id)).toEqual(['newer', 'older']);
  });
});
