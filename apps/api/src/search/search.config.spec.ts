import { loadSearchConfig } from './search.config';

describe('search runtime configuration', () => {
  it('keeps every search feature disabled when optional configuration is missing', () => {
    expect(loadSearchConfig({})).toEqual({
      elasticsearch: {
        url: null,
        productIndexAlias: 'products-search',
        requestTimeoutMs: 150,
        indexingRequestTimeoutMs: 30_000,
        indexFreshnessTargetSeconds: 30,
        incrementalBatchSize: 250,
        periodicReconciliationWindowSeconds: 3_600,
        personalizationProfileTimeoutMs: 100,
      },
      features: {
        baselineSearch: false,
        personalization: false,
        dailyRecommendations: false,
      },
    });
  });

  it('loads an explicitly enabled local Elasticsearch configuration', () => {
    expect(
      loadSearchConfig({
        ELASTICSEARCH_URL: 'http://127.0.0.1:9200/',
        ELASTICSEARCH_PRODUCT_INDEX_ALIAS: 'products-search-v1',
        ELASTICSEARCH_REQUEST_TIMEOUT_MS: '250',
        ELASTICSEARCH_INDEXING_REQUEST_TIMEOUT_MS: '60000',
        ELASTICSEARCH_INDEX_FRESHNESS_TARGET_SECONDS: '45',
        ELASTICSEARCH_INCREMENTAL_BATCH_SIZE: '500',
        ELASTICSEARCH_PERIODIC_RECONCILIATION_WINDOW_SECONDS: '7200',
        SEARCH_ELASTICSEARCH_ENABLED: 'true',
        SEARCH_PERSONALIZATION_ENABLED: 'true',
        SEARCH_DAILY_RECOMMENDATIONS_ENABLED: 'true',
      }),
    ).toEqual({
      elasticsearch: {
        url: 'http://127.0.0.1:9200',
        productIndexAlias: 'products-search-v1',
        requestTimeoutMs: 250,
        indexingRequestTimeoutMs: 60000,
        indexFreshnessTargetSeconds: 45,
        incrementalBatchSize: 500,
        periodicReconciliationWindowSeconds: 7200,
        personalizationProfileTimeoutMs: 100,
      },
      features: {
        baselineSearch: true,
        personalization: true,
        dailyRecommendations: true,
      },
    });
  });

  it.each([
    ['ELASTICSEARCH_URL', 'ftp://localhost:9200'],
    ['ELASTICSEARCH_PRODUCT_INDEX_ALIAS', 'Products Search'],
    ['ELASTICSEARCH_REQUEST_TIMEOUT_MS', '49'],
    ['ELASTICSEARCH_INDEXING_REQUEST_TIMEOUT_MS', '499'],
    ['ELASTICSEARCH_INDEX_FRESHNESS_TARGET_SECONDS', '0'],
    ['ELASTICSEARCH_INCREMENTAL_BATCH_SIZE', '9'],
    ['ELASTICSEARCH_PERIODIC_RECONCILIATION_WINDOW_SECONDS', '59'],
    ['SEARCH_PERSONALIZATION_PROFILE_TIMEOUT_MS', '19'],
    ['SEARCH_ELASTICSEARCH_ENABLED', '1'],
    ['SEARCH_PERSONALIZATION_ENABLED', 'yes'],
    ['SEARCH_DAILY_RECOMMENDATIONS_ENABLED', 'TRUE'],
  ])('rejects invalid %s', (key, value) => {
    expect(() => loadSearchConfig({ [key]: value })).toThrow(key);
  });
});
