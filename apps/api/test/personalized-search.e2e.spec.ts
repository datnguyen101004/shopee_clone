import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { OptionalAuthGuard } from '../src/auth/optional-auth.guard';
import { CatalogRepository } from '../src/catalog/catalog.repository';
import { BuyerBestPriceService } from '../src/pricing/buyer-best-price.service';
import { ScheduledDiscountService } from '../src/pricing/scheduled-discount.service';
import { BuyerProfileService } from '../src/recommendations/buyer-profile.service';
import { RecommendationModelRepository } from '../src/recommendations/recommendation-model.repository';
import { SEARCH_CONFIG, type SearchConfig } from '../src/search/search.config';
import { SearchElasticsearchAdapter } from '../src/search/search-elasticsearch.adapter';
import { PrismaService } from '../src/prisma/prisma.service';

const categories = [
  {
    id: 'category-phones',
    parentId: null,
    slug: 'phones',
    name: 'Điện thoại',
    sortOrder: 1,
  },
];

function product(id: string, name: string, priceMinor: bigint) {
  const now = new Date('2026-09-03T00:00:00.000Z');
  return {
    id,
    shopId: 'shop-1',
    categoryId: 'category-phones',
    slug: id,
    name,
    description: 'Android demo product',
    status: 'ACTIVE',
    ratingAverageBasisPoints: 480,
    ratingCount: 25,
    soldCount: 20,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    shop: {
      id: 'shop-1',
      ownerId: 'owner-1',
      slug: 'demo-shop',
      name: 'Demo Shop',
      location: 'Hà Nội',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    category: {
      id: 'category-phones',
      parentId: null,
      slug: 'phones',
      name: 'Điện thoại',
      sortOrder: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    images: [],
    variants: [
      {
        id: `${id}-variant`,
        productId: id,
        sku: `${id}-sku`,
        name: 'Mặc định',
        priceMinor,
        compareAtPriceMinor: null,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        inventory: {
          variantId: `${id}-variant`,
          quantityOnHand: 10,
          quantityReserved: 0,
          createdAt: now,
          updatedAt: now,
        },
      },
    ],
  };
}

function searchConfig(): SearchConfig {
  return {
    elasticsearch: {
      url: 'http://127.0.0.1:9200',
      productIndexAlias: 'products-search',
      requestTimeoutMs: 150,
      indexingRequestTimeoutMs: 30_000,
      indexFreshnessTargetSeconds: 30,
      incrementalBatchSize: 250,
      periodicReconciliationWindowSeconds: 3_600,
      personalizationProfileTimeoutMs: 100,
    },
    features: { baselineSearch: true, personalization: true, dailyRecommendations: false },
  };
}

function eligibleProfile(userId: string) {
  return {
    userId,
    profileVersion: 1,
    featureSchemaVersion: 1,
    generatedAt: new Date(),
    eligibilityScore: 10,
    eligible: true,
    viewCount30d: 1,
    favoriteCount90d: 2,
    followedShopCount: 1,
    orderCount90d: 1,
    categoryAffinities: [{ id: 'category-phones', weight: 5 }],
    shopAffinities: [{ id: 'shop-1', weight: 5 }],
    preferredPriceMinMinor: 100,
    preferredPriceMaxMinor: 2_000,
    preferredPriceMeanMinor: 1_000,
    recentProductIds: [],
    source: 'test',
  };
}

describe('Personalized catalogue search (E2E)', () => {
  let app: INestApplication;
  const repository = {
    findActiveCategories: jest.fn(),
    findCandidatesByIds: jest.fn(),
    findCandidates: jest.fn(),
  };
  const search = jest.fn();
  const resolveProfile = jest.fn();
  const findActiveModel = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(CatalogRepository)
      .useValue(repository)
      .overrideProvider(ScheduledDiscountService)
      .useValue({ resolveVariants: jest.fn().mockResolvedValue(new Map()) })
      .overrideProvider(BuyerBestPriceService)
      .useValue({ previews: jest.fn().mockResolvedValue(new Map()) })
      .overrideProvider(SearchElasticsearchAdapter)
      .useValue({ search })
      .overrideProvider(BuyerProfileService)
      .useValue({ resolveEligibleProfile: resolveProfile })
      .overrideProvider(RecommendationModelRepository)
      .useValue({ findActiveCompatible: findActiveModel })
      .overrideProvider(SEARCH_CONFIG)
      .useValue(searchConfig())
      .overrideGuard(OptionalAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => { headers: Record<string, string>; authUser?: { id: string } };
          };
        }) => {
          const requestObject = context.switchToHttp().getRequest();
          const token = requestObject.headers.authorization?.replace(/^Bearer /, '');
          requestObject.authUser =
            token === 'buyer-a' || token === 'buyer-b' ? { id: token } : undefined;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findActiveCategories.mockResolvedValue(categories);
    repository.findCandidatesByIds.mockResolvedValue([
      product('product-a', 'Điện thoại A', 1_000n),
      product('product-b', 'Điện thoại B', 1_500n),
    ]);
    repository.findCandidates.mockResolvedValue([
      product('product-a', 'Điện thoại A', 1_000n),
      product('product-b', 'Điện thoại B', 1_500n),
    ]);
    resolveProfile.mockImplementation(async (userId: string | null) =>
      userId ? eligibleProfile(userId) : null,
    );
    findActiveModel.mockResolvedValue({
      modelVersion: 1,
      productProjectionVersion: 1,
      featureSchemaVersion: 1,
      storedScriptVersion: 1,
      intercept: 0,
      featureWeights: [{ name: 'profile_score', weight: 1 }],
    });
    search.mockImplementation(async (requestBody: { query?: unknown; sort?: unknown[] }) => {
      const queryBody = JSON.stringify(requestBody.query ?? {});
      const personalized = queryBody.includes('script_score');
      const profileId = queryBody.match(/"userId":"([^"]+)"/)?.[1];
      const ids =
        personalized && profileId === 'buyer-b'
          ? ['product-b', 'product-a']
          : ['product-a', 'product-b'];
      return {
        body: {
          timed_out: false,
          hits: {
            total: { value: ids.length, relation: 'eq' },
            hits: ids.map((id) => ({ _id: id, _index: 'products-search-v1' })),
          },
          aggregations: {
            global_catalogue: {
              displayable: {
                categories: { buckets: [{ key: 'phones' }] },
                locations: { buckets: [{ key: 'Hà Nội' }] },
                price_range: { min: 1_000, max: 1_500 },
              },
            },
          },
        },
      };
    });
  });

  afterAll(async () => app.close());

  it('ranks the same query differently for two eligible buyers and keeps identities isolated', async () => {
    const buyerA = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=android&sort=relevance&pageSize=2')
      .set('Authorization', 'Bearer buyer-a')
      .expect(200);
    const buyerB = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=android&sort=relevance&pageSize=2')
      .set('Authorization', 'Bearer buyer-b')
      .expect(200);
    const buyerARepeat = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=android&sort=relevance&pageSize=2')
      .set('Authorization', 'Bearer buyer-a')
      .expect(200);

    expect(buyerA.body.items.map((item: { id: string }) => item.id)).toEqual([
      'product-a',
      'product-b',
    ]);
    expect(buyerB.body.items.map((item: { id: string }) => item.id)).toEqual([
      'product-b',
      'product-a',
    ]);
    expect(buyerARepeat.body.items.map((item: { id: string }) => item.id)).toEqual(
      buyerA.body.items.map((item: { id: string }) => item.id),
    );
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ script_score: expect.anything() }),
      }),
    );
    expect(resolveProfile).toHaveBeenCalledWith('buyer-a', expect.any(Date));
    expect(resolveProfile).toHaveBeenCalledWith('buyer-b', expect.any(Date));
  });

  it('keeps guest and cold-start requests public and uses baseline Elasticsearch', async () => {
    resolveProfile.mockResolvedValue(null);
    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=android&sort=relevance&pageSize=2')
      .expect(200);

    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      'product-a',
      'product-b',
    ]);
    expect(JSON.stringify(search.mock.calls[0]?.[0]?.query)).not.toContain('script_score');
    expect(findActiveModel).not.toHaveBeenCalled();
  });

  it('preserves explicit price ordering even when personalization is enabled', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=android&sort=price-asc&pageSize=2')
      .set('Authorization', 'Bearer buyer-b')
      .expect(200);

    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      'product-a',
      'product-b',
    ]);
    expect(JSON.stringify(search.mock.calls[0]?.[0]?.query)).not.toContain('script_score');
    expect(search.mock.calls[0]?.[0]?.sort?.[0]).toEqual({
      effective_price_minor: { order: 'asc' },
    });
  });

  it('falls back personalized Elasticsearch to baseline Elasticsearch to PostgreSQL', async () => {
    search
      .mockRejectedValueOnce(new Error('stored script missing'))
      .mockRejectedValueOnce(new Error('Elasticsearch unavailable'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=android&sort=relevance&pageSize=2')
      .set('Authorization', 'Bearer buyer-a')
      .expect(200);

    expect(search).toHaveBeenCalledTimes(2);
    expect(repository.findCandidates).toHaveBeenCalledTimes(1);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      'product-a',
      'product-b',
    ]);
  });

  it('falls back to baseline when the profile times out or the model is incompatible', async () => {
    resolveProfile.mockReturnValueOnce(new Promise(() => undefined));
    const timedOut = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=android&sort=relevance&pageSize=2')
      .set('Authorization', 'Bearer buyer-a')
      .expect(200);
    expect(timedOut.body.items).toHaveLength(2);
    expect(search).toHaveBeenCalledTimes(1);
    expect(findActiveModel).not.toHaveBeenCalled();

    findActiveModel.mockResolvedValueOnce({
      modelVersion: 1,
      productProjectionVersion: 1,
      featureSchemaVersion: 999,
      storedScriptVersion: 1,
      intercept: 0,
      featureWeights: [{ name: 'profile_score', weight: 1 }],
    });
    const incompatible = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=android&sort=relevance&pageSize=2')
      .set('Authorization', 'Bearer buyer-a')
      .expect(200);
    expect(incompatible.body.items).toHaveLength(2);
    expect(JSON.stringify(search.mock.calls[1]?.[0]?.query)).not.toContain('script_score');
  });

  it('uses the existing PostgreSQL route when the Elasticsearch baseline flag is disabled', async () => {
    const config = app.get<SearchConfig>(SEARCH_CONFIG);
    const previous = config.features.baselineSearch;
    config.features.baselineSearch = false;
    try {
      const response = await request(app.getHttpServer())
        .get('/api/v1/catalog/products?q=android&sort=relevance&pageSize=2')
        .set('Authorization', 'Bearer buyer-a')
        .expect(200);
      expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
        'product-a',
        'product-b',
      ]);
      expect(search).not.toHaveBeenCalled();
    } finally {
      config.features.baselineSearch = previous;
    }
  });

  it('keeps invalid optional credentials on the guest baseline path', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=android&sort=relevance&pageSize=2')
      .set('Authorization', 'Bearer expired-credential')
      .expect(200);

    expect(response.body.items).toHaveLength(2);
    expect(findActiveModel).not.toHaveBeenCalled();
  });
});
