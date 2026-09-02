import {
  ProductSearchIndexRebuildError,
  ProductSearchIndexingService,
} from './product-search-indexing.service';
import type { SearchConfig } from './search.config';
import type { ElasticsearchClientPort } from './search-elasticsearch.adapter';
import type { ProductSearchProjection } from './product-search-document';

function config(): SearchConfig {
  return {
    elasticsearch: {
      url: 'http://127.0.0.1:9200',
      productIndexAlias: 'products-search',
      requestTimeoutMs: 150,
      indexingRequestTimeoutMs: 30_000,
      indexFreshnessTargetSeconds: 30,
      incrementalBatchSize: 250,
      periodicReconciliationWindowSeconds: 3_600,
    },
    features: { baselineSearch: false, personalization: false, dailyRecommendations: false },
  };
}

function document(productId = 'product-1'): ProductSearchProjection {
  return {
    kind: 'index',
    document: {
      projection_version: 1,
      analyzer_version: 1,
      product_id: productId,
      slug: productId,
      name: 'Tai nghe',
      name_normalized: 'tai nghe',
      description: 'Tai nghe không dây',
      category_id: 'category-1',
      category_slug: 'dien-tu',
      category_name: 'Điện tử',
      category_name_normalized: 'dien tu',
      category_path_ids: ['category-1'],
      category_path_slugs: ['dien-tu'],
      category_path_names: ['Điện tử'],
      shop_id: 'shop-1',
      shop_slug: 'shop',
      shop_name: 'Shop',
      shop_name_normalized: 'shop',
      shop_location: 'Hà Nội',
      shop_location_exact: 'Hà Nội',
      shop_location_normalized: 'ha noi',
      attribute_codes: [],
      attributes: [],
      primary_image_url: null,
      primary_image_alt: null,
      effective_price_minor: 100_000,
      compare_at_price_minor: null,
      discount_basis_points: 0,
      promotion_active: false,
      rating_average_basis_points: 450,
      rating_count: 10,
      sold_count: 20,
      inventory_available: 3,
      variant_count: 1,
      displayable: true,
      product_created_at: '2026-01-01T00:00:00.000Z',
      product_updated_at: '2026-01-02T00:00:00.000Z',
      indexed_at: '2026-01-03T00:00:00.000Z',
      buyer_profile_feature_schema_version: 1,
    },
  };
}

function fakeClient(overrides: Partial<ElasticsearchClientPort> = {}): ElasticsearchClientPort {
  return {
    cluster: { health: jest.fn() },
    indices: {
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      exists: jest.fn().mockResolvedValue(true),
      getAlias: jest.fn().mockResolvedValue({ 'products-search-v1-old': { aliases: {} } }),
      updateAliases: jest.fn().mockResolvedValue({}),
    },
    bulk: jest.fn().mockResolvedValue({ errors: false, items: [] }),
    count: jest.fn().mockResolvedValue({ count: 1 }),
    ...overrides,
  };
}

function service(
  client: ElasticsearchClientPort,
  overrides: {
    products?: unknown[];
    changed?: Array<{ id: string }>;
    promotions?: Array<{ id: string }>;
    records?: unknown[];
    projections?: ProductSearchProjection[];
    checkpoint?: unknown;
  } = {},
) {
  const repository = {
    findSellableProducts: jest.fn().mockResolvedValue(overrides.products ?? [{}]),
    findProductsByIds: jest.fn().mockResolvedValue(overrides.records ?? [{}]),
    findChangedProductIds: jest.fn().mockResolvedValue(overrides.changed ?? []),
    findProductsInPromotionWindow: jest.fn().mockResolvedValue(overrides.promotions ?? []),
  };
  const projectionBuilder = {
    buildMany: jest.fn().mockResolvedValue(overrides.projections ?? [document()]),
  };
  const checkpoints = {
    find: jest.fn().mockResolvedValue(overrides.checkpoint ?? null),
    save: jest.fn().mockResolvedValue({}),
  };
  return {
    indexing: new ProductSearchIndexingService(
      config(),
      client,
      repository as never,
      projectionBuilder as never,
      checkpoints as never,
    ),
    repository,
    projectionBuilder,
    checkpoints,
  };
}

describe('product search indexing', () => {
  it('builds, verifies, and atomically swaps a versioned index', async () => {
    const client = fakeClient();
    const { indexing } = service(client);
    const result = await indexing.fullReindex(new Date('2026-01-03T00:00:00.000Z'));

    expect(result.index).toMatch(/^products-search-v1-\d+$/);
    expect(client.indices?.create).toHaveBeenCalledWith(
      expect.objectContaining({
        index: result.index,
        settings: expect.any(Object),
        mappings: expect.any(Object),
      }),
    );
    expect(client.indices?.updateAliases).toHaveBeenCalledWith({
      actions: [
        { remove: { index: 'products-search-v1-old', alias: 'products-search' } },
        { add: { index: result.index, alias: 'products-search' } },
      ],
    });
  });

  it('retries a failed bulk response and leaves the alias untouched when rebuild still fails', async () => {
    const bulk = jest.fn().mockResolvedValue({
      errors: true,
      items: [{ index: { status: 429, error: { type: 'busy' } } }],
    });
    const client = fakeClient({ bulk });
    const { indexing } = service(client);

    await expect(indexing.fullReindex()).rejects.toBeInstanceOf(ProductSearchIndexRebuildError);
    expect(bulk).toHaveBeenCalledTimes(3);
    expect(client.indices?.updateAliases).not.toHaveBeenCalled();
    expect(client.indices?.delete).toHaveBeenCalledTimes(1);
  });

  it('reconciles product, promotion fan-out, and missing-product deletes before advancing checkpoint', async () => {
    const client = fakeClient();
    const { indexing, repository, checkpoints } = service(client, {
      changed: [{ id: 'product-1' }, { id: 'product-2' }],
      promotions: [{ id: 'product-3' }],
      records: [{ id: 'product-1' }],
      projections: [document('product-1')],
    });

    const result = await indexing.reconcileIncremental(new Date('2026-01-03T00:00:00.000Z'));

    expect(repository.findChangedProductIds).toHaveBeenCalledTimes(1);
    expect(repository.findProductsInPromotionWindow).toHaveBeenCalledTimes(1);
    expect(result.examinedProducts).toBe(3);
    expect(result.indexedDocuments).toBe(1);
    expect(result.deletedDocuments).toBe(2);
    expect(checkpoints.save).toHaveBeenCalledWith(
      expect.objectContaining({ lastCompletedAt: new Date('2026-01-03T00:00:00.000Z') }),
    );
  });

  it('treats an idempotent delete of an already-missing document as success', async () => {
    const client = fakeClient({
      bulk: jest.fn().mockResolvedValue({
        errors: true,
        items: [{ delete: { status: 404, error: { type: 'document_missing_exception' } } }],
      }),
    });
    const { indexing } = service(client, {
      changed: [{ id: 'product-1' }],
      records: [],
      projections: [],
    });

    await expect(indexing.reconcileIncremental()).resolves.toEqual(
      expect.objectContaining({ deletedDocuments: 1 }),
    );
  });
});
