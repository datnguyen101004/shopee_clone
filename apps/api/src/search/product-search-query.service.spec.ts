import type { NormalizedCatalogQuery } from '../catalog/catalog-query';
import {
  ProductSearchQueryService,
  ProductSearchQueryUnavailableError,
  filtersFor,
  lexicalQuery,
  parseSearchResponse,
  parseSuggestionResponse,
  sortFor,
} from './product-search-query.service';
import type { SearchElasticsearchAdapter } from './search-elasticsearch.adapter';
import type { SearchConfig } from './search.config';

function query(overrides: Partial<NormalizedCatalogQuery> = {}): NormalizedCatalogQuery {
  return {
    q: 'Điện thoại',
    category: 'phones',
    minPrice: 100,
    maxPrice: 900,
    rating: 4,
    location: 'Hà Nội',
    availability: 'in-stock',
    promotion: 'discounted',
    sort: 'relevance',
    page: 1,
    pageSize: 12,
    ...overrides,
  };
}

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
      personalizationProfileTimeoutMs: 100,
    },
    features: { baselineSearch: true, personalization: false, dailyRecommendations: false },
  };
}

describe('product-search-query', () => {
  it('translates every catalogue filter into an Elasticsearch filter', () => {
    expect(filtersFor(query())).toEqual(
      expect.arrayContaining([
        { term: { displayable: true } },
        { terms: { category_path_slugs: ['phones'] } },
        { range: { effective_price_minor: { gte: 100, lte: 900 } } },
        { range: { rating_average_basis_points: { gte: 400 } } },
        { term: { shop_location_normalized: 'ha noi' } },
        { range: { inventory_available: { gt: 0 } } },
        { term: { promotion_active: true } },
      ]),
    );
  });

  it('puts normalized exact name matching ahead of weaker text fields', () => {
    const body = lexicalQuery(query()) as {
      function_score: { query: { bool: { should: Array<Record<string, unknown>> } } };
    };
    expect(body.function_score.query.bool.should[0]).toEqual({
      term: { 'name.normalized': { value: 'dien thoai', boost: 5 } },
    });
    expect(body.function_score.query.bool.should).toContainEqual({
      constant_score: {
        filter: { term: { shop_name_normalized: 'dien thoai' } },
        boost: 5,
      },
    });
    expect(body.function_score.query.bool.should).toContainEqual({
      constant_score: {
        filter: { term: { 'shop_name.exact': 'Điện thoại' } },
        boost: 5,
      },
    });
    expect(body.function_score.query.bool.should).toContainEqual({
      match_phrase: { shop_name: { query: 'Điện thoại', boost: 10 } },
    });
    expect(body.function_score.query.bool.should).toContainEqual({
      match: { shop_name: { query: 'Điện thoại', operator: 'and', boost: 5 } },
    });
    expect(body.function_score.query.bool.should).toContainEqual({
      multi_match: {
        query: 'Điện thoại',
        type: 'cross_fields',
        fields: [
          'name',
          'category_path_names',
          'shop_name',
          'attributes',
          'description',
        ],
        operator: 'and',
        boost: 5,
      },
    });
    expect(body.function_score.query.bool.should).toContainEqual({
      match: { description: { query: 'Điện thoại', operator: 'and', boost: 5 } },
    });
    expect(body.function_score.query.bool.should).toContainEqual({
      multi_match: {
        query: 'Điện thoại',
        type: 'best_fields',
        fields: [
          'name',
          'category_path_names',
          'shop_name',
          'attributes',
          'description',
        ],
        operator: 'and',
        fuzziness: 'AUTO',
        prefix_length: 1,
        max_expansions: 50,
        boost: 1,
      },
    });
  });

  it.each([
    ['price-asc', 'effective_price_minor', 'asc'],
    ['price-desc', 'effective_price_minor', 'desc'],
    ['best-selling', 'sold_count', 'desc'],
    ['newest', 'product_created_at', 'desc'],
  ] as const)('keeps %s as the primary deterministic sort', (sort, field, order) => {
    const first = sortFor(query({ sort }))[0] as Record<string, Record<string, unknown>>;
    expect(first[field]).toMatchObject({ order });
    expect(sortFor(query({ sort })).at(-1)).toEqual({ product_id: { order: 'asc' } });
  });

  it('parses the official and body-wrapped Elasticsearch response shapes', () => {
    const response = parseSearchResponse({
      body: {
        timed_out: false,
        hits: {
          total: { value: 2, relation: 'eq' },
          hits: [{ _id: 'p-2', _index: 'products-search-v1-1' }, { _id: 'p-1' }],
        },
        aggregations: {
          global_catalogue: {
            displayable: {
              categories: { buckets: [{ key: 'phones', doc_count: 2 }] },
              locations: { buckets: [{ key: 'Hà Nội', doc_count: 2 }] },
              price_range: { min: 100, max: 900 },
            },
          },
        },
      },
    });
    expect(response).toEqual({
      ids: ['p-2', 'p-1'],
      totalItems: 2,
      facets: {
        categorySlugs: ['phones'],
        locations: ['Hà Nội'],
        priceRange: { min: 100, max: 900 },
      },
      indexVersion: 'products-search-v1-1',
      timedOut: false,
    });
  });

  it('returns a corrected query before deduplicated product-name suggestions', () => {
    expect(
      parseSuggestionResponse(
        {
          hits: { hits: [] },
          suggest: {
            product_name_completion: [
              {
                options: [{ text: 'Quần Jean Nam' }, { text: 'Quần Jean Nam' }],
              },
            ],
            corrected_query: [
              { text: 'quần', options: [] },
              { text: 'jea', options: [{ text: 'jean', score: 0.8, freq: 3 }] },
            ],
          },
        },
        'quần jea',
        6,
      ),
    ).toEqual([{ text: 'quần jean' }, { text: 'Quần Jean Nam' }]);
  });

  it('normalizes timeout and malformed responses into privacy-safe fallback reasons', async () => {
    const search = jest.fn().mockRejectedValueOnce({ name: 'TimeoutError' });
    const service = new ProductSearchQueryService(config(), {
      search,
    } as unknown as SearchElasticsearchAdapter);
    await expect(service.search(query(), 0, 24)).rejects.toEqual(
      new ProductSearchQueryUnavailableError('timeout'),
    );

    search.mockResolvedValueOnce({ body: { hits: {} } });
    await expect(service.search(query(), 0, 24)).rejects.toEqual(
      new ProductSearchQueryUnavailableError('malformed-response'),
    );
  });

  it('queries exact product-name completion suggestions without fuzzy matching', async () => {
    const search = jest.fn().mockResolvedValue({
      hits: { hits: [] },
      suggest: {
        product_name_completion: [{ options: [{ text: 'Quần Jean Nam' }] }],
      },
    });
    const service = new ProductSearchQueryService(config(), {
      search,
    } as unknown as SearchElasticsearchAdapter);

    await expect(service.suggest('quần jea', 6)).resolves.toEqual([{ text: 'Quần Jean Nam' }]);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        size: 0,
        track_total_hits: false,
        _source: false,
        suggest: expect.objectContaining({
          product_name_completion: expect.objectContaining({
            prefix: 'quần jea',
            completion: expect.objectContaining({
              field: 'name_suggest',
              size: 6,
              skip_duplicates: true,
            }),
          }),
        }),
      }),
    );
    const request = search.mock.calls[0]?.[0] as {
      suggest: { product_name_completion: { completion: Record<string, unknown> } };
    };
    expect(request.suggest.product_name_completion.completion).not.toHaveProperty('fuzzy');
  });

  it('uses term and phrase correction only after exact suggestions are insufficient', async () => {
    const search = jest
      .fn()
      .mockResolvedValueOnce({
        hits: { hits: [] },
        suggest: { product_name_completion: [{ options: [] }] },
      })
      .mockResolvedValueOnce({
        hits: { hits: [] },
        suggest: {
          product_name_term: [
            { text: 'iphonee', options: [{ text: 'iphone', score: 0.8, freq: 3 }] },
          ],
          product_name_phrase: [{ text: 'iphonee', options: [{ text: 'iphone' }] }],
        },
      })
      .mockResolvedValueOnce({
        hits: { hits: [] },
        suggest: {
          product_name_completion: [
            {
              options: [{ text: 'iPhone 13 Pro Max' }, { text: 'iPhone 6S Plus quốc tế cũ' }],
            },
          ],
        },
      });
    const service = new ProductSearchQueryService(config(), {
      search,
    } as unknown as SearchElasticsearchAdapter);

    await expect(service.suggest('iphonee', 5)).resolves.toEqual([
      { text: 'iphone' },
      { text: 'iPhone 13 Pro Max' },
      { text: 'iPhone 6S Plus quốc tế cũ' },
    ]);
    expect(search).toHaveBeenCalledTimes(3);

    const exactRequest = search.mock.calls[0]?.[0] as {
      suggest: { product_name_completion: { prefix: string; completion: Record<string, unknown> } };
    };
    expect(exactRequest.suggest.product_name_completion.prefix).toBe('iphonee');
    expect(exactRequest.suggest.product_name_completion.completion).not.toHaveProperty('fuzzy');

    const correctionRequest = search.mock.calls[1]?.[0] as {
      suggest: Record<string, unknown>;
    };
    expect(correctionRequest.suggest).toHaveProperty('product_name_term');
    expect(correctionRequest.suggest).toHaveProperty('product_name_phrase');

    const correctedRequest = search.mock.calls[2]?.[0] as {
      suggest: { product_name_completion: { prefix: string; completion: Record<string, unknown> } };
    };
    expect(correctedRequest.suggest.product_name_completion.prefix).toBe('iphone');
    expect(correctedRequest.suggest.product_name_completion.completion).not.toHaveProperty('fuzzy');
  });

  it('does not call correction suggesters when exact completion fills the limit', async () => {
    const search = jest.fn().mockResolvedValue({
      hits: { hits: [] },
      suggest: {
        product_name_completion: [
          {
            options: [
              { text: 'iPhone 6S Plus quốc tế cũ' },
              { text: 'iPhone 6 Plus quốc tế cũ' },
            ],
          },
        ],
      },
    });
    const service = new ProductSearchQueryService(config(), {
      search,
    } as unknown as SearchElasticsearchAdapter);

    await expect(service.suggest('iphone 6', 2)).resolves.toEqual([
      { text: 'iPhone 6S Plus quốc tế cũ' },
      { text: 'iPhone 6 Plus quốc tế cũ' },
    ]);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('enforces the configured timeout even when the adapter does not settle', async () => {
    const search = jest.fn().mockReturnValue(new Promise(() => undefined));
    const timeoutConfig = config();
    timeoutConfig.elasticsearch.requestTimeoutMs = 5;
    const service = new ProductSearchQueryService(timeoutConfig, {
      search,
    } as unknown as SearchElasticsearchAdapter);
    await expect(service.search(query(), 0, 24)).rejects.toEqual(
      new ProductSearchQueryUnavailableError('timeout'),
    );
  });
});
