import type { SearchConfig } from './search.config';
import {
  SearchElasticsearchAdapter,
  type ElasticsearchClientPort,
} from './search-elasticsearch.adapter';

function config(overrides: Partial<SearchConfig['features']> = {}): SearchConfig {
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
    features: {
      baselineSearch: true,
      personalization: false,
      dailyRecommendations: false,
      ...overrides,
    },
  };
}

describe('SearchElasticsearchAdapter health', () => {
  it('reports missing optional configuration without throwing', async () => {
    const missing = config();
    missing.elasticsearch.url = null;
    const adapter = new SearchElasticsearchAdapter(missing, null);

    await expect(adapter.getHealth()).resolves.toEqual(
      expect.objectContaining({
        required: false,
        enabled: true,
        configured: false,
        available: false,
        status: 'unavailable',
        reason: 'not-configured',
      }),
    );
  });

  it('does not contact a configured dependency while every feature is disabled', async () => {
    const health = jest.fn();
    const adapter = new SearchElasticsearchAdapter(config({ baselineSearch: false }), {
      cluster: { health },
    });

    await expect(adapter.getHealth()).resolves.toEqual(
      expect.objectContaining({
        required: false,
        enabled: false,
        configured: true,
        status: 'disabled',
        reason: 'disabled',
      }),
    );
    expect(health).not.toHaveBeenCalled();
  });

  it('reports a green or yellow cluster as available', async () => {
    const client: ElasticsearchClientPort = {
      cluster: { health: jest.fn().mockResolvedValue({ status: 'yellow' }) },
    };
    const adapter = new SearchElasticsearchAdapter(config(), client);

    await expect(adapter.getHealth()).resolves.toEqual(
      expect.objectContaining({
        available: true,
        status: 'available',
        clusterStatus: 'yellow',
        reason: null,
      }),
    );
  });

  it('converts connection failures into a privacy-safe unavailable result', async () => {
    const client: ElasticsearchClientPort = {
      cluster: { health: jest.fn().mockRejectedValue(new Error('secret upstream details')) },
    };
    const adapter = new SearchElasticsearchAdapter(config(), client);

    const health = await adapter.getHealth();
    expect(health).toEqual(
      expect.objectContaining({
        required: false,
        available: false,
        status: 'unavailable',
        clusterStatus: null,
        reason: 'request-failed',
      }),
    );
    expect(JSON.stringify(health)).not.toContain('secret upstream details');
  });

  it('closes a created client during NestJS shutdown', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const adapter = new SearchElasticsearchAdapter(config(), {
      cluster: { health: jest.fn() },
      close,
    });

    await adapter.onModuleDestroy();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
