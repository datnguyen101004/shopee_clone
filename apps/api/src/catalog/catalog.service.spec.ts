import type { CatalogRepository } from './catalog.repository';
import type { ScheduledDiscountService } from '../pricing/scheduled-discount.service';
import type { NormalizedCatalogQuery } from './catalog-query';
import { CatalogService } from './catalog.service';
import type { BuyerBestPriceService } from '../pricing/buyer-best-price.service';

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
    findCandidatesForShop: jest.fn(),
    findCandidatesByIds: jest.fn(),
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

  it('uses the buyer merchandise payable for facets, filters, and explicit price sorting', async () => {
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidates.mockResolvedValue([
      candidate(),
      candidate({
        id: 'product-2',
        slug: 'phone-2',
        variants: [
          {
            ...candidate().variants[0]!,
            id: 'variant-2',
            priceMinor: 700n,
            compareAtPriceMinor: null,
          },
        ],
      }),
    ]);
    const preview = (effectivePriceMinor: number, merchandisePayableMinor: number) => ({
      version: 'buyer-best-price-v1' as const,
      quantity: 1 as const,
      currency: 'VND' as const,
      evaluatedAt: '2026-08-31T04:00:00.000Z',
      effectivePriceMinor,
      shopVoucher: null,
      platformVoucher: {
        code: 'BUYERPRICE',
        name: 'Buyer price',
        slot: 'PLATFORM' as const,
        discountMinor: effectivePriceMinor - merchandisePayableMinor,
      },
      shopVoucherDiscountMinor: 0,
      platformVoucherDiscountMinor: effectivePriceMinor - merchandisePayableMinor,
      merchandiseDiscountMinor: effectivePriceMinor - merchandisePayableMinor,
      merchandisePayableMinor,
      shipping: null,
    });
    const buyerPrices = {
      previews: jest.fn().mockResolvedValue(
        new Map([
          ['variant-1', preview(800, 500)],
          ['variant-2', preview(700, 600)],
        ]),
      ),
    };
    const personalized = new CatalogService(
      repository as unknown as CatalogRepository,
      undefined,
      buyerPrices as unknown as BuyerBestPriceService,
    );

    const sorted = await personalized.getProducts(query({ sort: 'price-asc' }), 'buyer-1');
    expect(sorted.items.map(({ id }) => id)).toEqual([
      '00000000-0000-4000-8000-000000000301',
      'product-2',
    ]);
    expect(sorted.facets.priceRange).toEqual({ min: 500, max: 600 });

    const filtered = await personalized.getProducts(query({ minPrice: 550 }), 'buyer-1');
    expect(filtered.items.map(({ id }) => id)).toEqual(['product-2']);

    repository.findCandidatesForShop.mockResolvedValue(
      await repository.findCandidates.mock.results.at(-1)?.value,
    );
    const shopPage = await personalized.getShopProducts(
      'shop-1',
      { q: null, category: null, sort: 'price-desc', page: 1, pageSize: 12 },
      'buyer-1',
    );
    expect(shopPage.items.map(({ id }) => id)).toEqual([
      'product-2',
      '00000000-0000-4000-8000-000000000301',
    ]);
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

  it('uses best-selling, rating confidence, and freshness for daily cold-start fallback', async () => {
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidates.mockResolvedValue([
      candidate({
        id: 'low-confidence',
        soldCount: 10,
        ratingCount: 1,
        createdAt: new Date('2026-08-12'),
      }),
      candidate({
        id: 'high-confidence',
        soldCount: 10,
        ratingCount: 10,
        createdAt: new Date('2026-08-10'),
      }),
    ]);
    const response = await service.getProducts(
      query({ q: null, sort: 'relevance', recommendationSurface: 'daily-recommendations' }),
    );
    expect(response.items.map((item) => item.id)).toEqual(['high-confidence', 'low-confidence']);
  });

  it('reuses the canonical card projection and counts shop category ancestors', async () => {
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidatesForShop.mockResolvedValue([
      candidate({ id: 'product-1' }),
      candidate({ id: 'hidden', variants: [] }),
    ]);

    const response = await service.getShopSummary('shop-1');

    expect(repository.findCandidatesForShop).toHaveBeenCalledWith('shop-1');
    expect(response.products.map((item) => item.id)).toEqual(['product-1']);
    expect(response.categories).toEqual([
      { slug: 'electronics', name: categories[0]!.name, parentSlug: null, productCount: 1 },
      {
        slug: 'phones',
        name: categories[1]!.name,
        parentSlug: 'electronics',
        productCount: 1,
      },
    ]);
  });

  it('filters, sorts, and paginates only candidates belonging to the resolved shop', async () => {
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidatesForShop.mockResolvedValue([
      candidate({ id: 'older', name: 'Điện thoại cũ', createdAt: new Date('2026-08-10') }),
      candidate({ id: 'newer', name: 'Điện thoại mới', createdAt: new Date('2026-08-12') }),
    ]);

    const response = await service.getShopProducts('shop-1', {
      q: 'dien thoai',
      category: 'electronics',
      sort: 'relevance',
      page: 2,
      pageSize: 1,
    });

    expect(response.shopId).toBe('shop-1');
    expect(response.pagination).toEqual({ page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
    expect(response.items.map((item) => item.id)).toEqual(['older']);
    expect(response.categories).toHaveLength(2);
  });

  it('batches scheduled pricing before facets, filters, sorts, and public-shop projection', async () => {
    const discounted = candidate({
      id: 'product-discounted',
      variants: [
        {
          ...candidate().variants[0]!,
          id: 'variant-base-low',
          priceMinor: 600n,
          compareAtPriceMinor: null,
        },
        { ...candidate().variants[0]!, id: 'variant-discounted', priceMinor: 1_000n },
      ],
    });
    const regular = candidate({
      id: 'product-regular',
      variants: [
        {
          ...candidate().variants[0]!,
          id: 'variant-regular',
          priceMinor: 500n,
          compareAtPriceMinor: null,
        },
      ],
    });
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidates.mockResolvedValue([regular, discounted]);
    repository.findCandidatesForShop.mockResolvedValue([discounted]);
    const scheduledDiscounts = {
      resolveVariants: jest.fn().mockImplementation(
        async (_transaction, variants, evaluatedAt) =>
          new Map(
            variants.map(
              (variant: {
                id: string;
                productId: string;
                priceMinor: bigint;
                compareAtPriceMinor: bigint | null;
              }) => [
                variant.id,
                {
                  variantId: variant.id,
                  productId: variant.productId,
                  basePriceMinor: variant.priceMinor,
                  effectivePriceMinor:
                    variant.id === 'variant-discounted' ? 400n : variant.priceMinor,
                  compareAtPriceMinor: variant.compareAtPriceMinor,
                  discountBasisPoints: variant.id === 'variant-discounted' ? 6_000 : 0,
                  campaignId: variant.id === 'variant-discounted' ? 'campaign-1' : null,
                  evaluatedAt,
                },
              ],
            ),
          ),
      ),
    };
    const campaignService = new CatalogService(
      repository as unknown as CatalogRepository,
      scheduledDiscounts as unknown as ScheduledDiscountService,
    );

    const response = await campaignService.getProducts(query({ sort: 'price-asc', maxPrice: 450 }));
    expect(response.items.map((item) => item.id)).toEqual(['product-discounted']);
    expect(response.items[0]).toMatchObject({
      priceMinor: 400,
      compareAtPriceMinor: 1_000,
      scheduledPrice: { effectivePriceMinor: 400, campaignId: 'campaign-1' },
    });
    expect(response.facets.priceRange).toEqual({ min: 400, max: 500 });
    expect(scheduledDiscounts.resolveVariants).toHaveBeenCalledTimes(1);
    expect(scheduledDiscounts.resolveVariants.mock.calls[0]?.[1]).toHaveLength(3);

    const descending = await campaignService.getProducts(query({ sort: 'price-desc' }));
    expect(descending.items.map((item) => item.id)).toEqual([
      'product-regular',
      'product-discounted',
    ]);

    const shop = await campaignService.getShopSummary('shop-1');
    expect(shop.products[0]).toMatchObject({
      priceMinor: 400,
      scheduledPrice: { campaignId: 'campaign-1' },
    });
  });

  it('propagates scheduled-price database failures instead of guessing a base price', async () => {
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidates.mockResolvedValue([candidate()]);
    const failure = new Error('database unavailable');
    const campaignService = new CatalogService(
      repository as unknown as CatalogRepository,
      {
        resolveVariants: jest.fn().mockRejectedValue(failure),
      } as unknown as ScheduledDiscountService,
    );

    await expect(campaignService.getProducts(query())).rejects.toBe(failure);
  });

  it('hydrates Elasticsearch IDs in order while preserving the catalogue response contract', async () => {
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidatesByIds.mockResolvedValue([
      candidate({ id: 'product-2', name: 'Điện thoại B' }),
      candidate({ id: 'product-1', name: 'Điện thoại A' }),
    ]);
    const search = {
      isEnabled: jest.fn().mockReturnValue(true),
      search: jest.fn().mockResolvedValue({
        ids: ['product-1', 'product-2'],
        totalItems: 2,
        indexVersion: 'products-search-v1-1',
        tookMs: 4,
        facets: {
          categorySlugs: ['electronics', 'phones'],
          locations: ['Hà Nội'],
          priceRange: { min: 800, max: 800 },
        },
      }),
    };
    const elastic = new CatalogService(
      repository as unknown as CatalogRepository,
      undefined,
      undefined,
      search as never,
    );

    const response = await elastic.getProducts(query({ pageSize: 2, sort: 'relevance' }));
    expect(search.search).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'relevance' }),
      0,
      24,
      null,
    );
    expect(repository.findCandidatesByIds).toHaveBeenCalledWith(['product-1', 'product-2']);
    expect(response.items.map((item) => item.id)).toEqual(['product-1', 'product-2']);
    expect(response.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 2, totalPages: 1 });
    expect(response.facets.locations).toEqual(['Hà Nội']);
  });

  it('refills stale Elasticsearch hits and falls back to PostgreSQL on search failure', async () => {
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidatesByIds.mockResolvedValue([candidate({ id: 'product-2' })]);
    const search = {
      isEnabled: jest.fn().mockReturnValue(true),
      search: jest
        .fn()
        .mockResolvedValueOnce({
          ids: ['deleted-product', 'product-2'],
          totalItems: 2,
          facets: {
            categorySlugs: ['phones'],
            locations: ['Hà Nội'],
            priceRange: { min: 800, max: 800 },
          },
        })
        .mockRejectedValueOnce(new Error('connection failed')),
    };
    const elastic = new CatalogService(
      repository as unknown as CatalogRepository,
      undefined,
      undefined,
      search as never,
    );

    const stale = await elastic.getProducts(query({ q: null, pageSize: 2 }));
    expect(stale.items.map((item) => item.id)).toEqual(['product-2']);
    expect(stale.pagination.totalItems).toBe(1);

    repository.findCandidates.mockResolvedValue([candidate({ id: 'postgres-product' })]);
    const fallback = await elastic.getProducts(query({ q: null }));
    expect(repository.findCandidates).toHaveBeenCalled();
    expect(fallback.items.map((item) => item.id)).toEqual(['postgres-product']);
  });

  it('falls back to PostgreSQL when every over-fetched Elasticsearch hit is stale', async () => {
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidatesByIds.mockResolvedValue([]);
    repository.findCandidates.mockResolvedValue([candidate({ id: 'postgres-product' })]);
    const search = {
      isEnabled: jest.fn().mockReturnValue(true),
      search: jest.fn().mockResolvedValue({
        ids: ['deleted-product'],
        totalItems: 1,
        facets: { categorySlugs: [], locations: [], priceRange: { min: null, max: null } },
      }),
    };
    const elastic = new CatalogService(
      repository as unknown as CatalogRepository,
      undefined,
      undefined,
      search as never,
    );

    const response = await elastic.getProducts(query({ q: null }));
    expect(response.items.map((item) => item.id)).toEqual(['postgres-product']);
    expect(repository.findCandidates).toHaveBeenCalledTimes(1);
  });
});
