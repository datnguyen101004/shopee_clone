export const SEARCH_CONFIG = Symbol('SEARCH_CONFIG');

export interface SearchConfig {
  elasticsearch: {
    url: string | null;
    productIndexAlias: string;
    requestTimeoutMs: number;
    indexingRequestTimeoutMs: number;
    indexFreshnessTargetSeconds: number;
    incrementalBatchSize: number;
    periodicReconciliationWindowSeconds: number;
  };
  features: {
    baselineSearch: boolean;
    personalization: boolean;
    dailyRecommendations: boolean;
  };
}

function readBoolean(environment: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = environment[key]?.trim();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid search configuration: ${key}.`);
}

function readInteger(
  environment: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid search configuration: ${key}.`);
  }
  return value;
}

function readElasticsearchUrl(environment: NodeJS.ProcessEnv): string | null {
  const raw = environment.ELASTICSEARCH_URL?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid search configuration: ELASTICSEARCH_URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.search !== '' || url.hash !== '') {
    throw new Error('Invalid search configuration: ELASTICSEARCH_URL.');
  }

  return url.toString().replace(/\/$/, '');
}

function readProductIndexAlias(environment: NodeJS.ProcessEnv): string {
  const alias = environment.ELASTICSEARCH_PRODUCT_INDEX_ALIAS?.trim() || 'products-search';
  if (!/^[a-z0-9][a-z0-9._-]{0,254}$/.test(alias) || alias === '.' || alias === '..') {
    throw new Error('Invalid search configuration: ELASTICSEARCH_PRODUCT_INDEX_ALIAS.');
  }
  return alias;
}

export function loadSearchConfig(environment: NodeJS.ProcessEnv = process.env): SearchConfig {
  return {
    elasticsearch: {
      url: readElasticsearchUrl(environment),
      productIndexAlias: readProductIndexAlias(environment),
      requestTimeoutMs: readInteger(
        environment,
        'ELASTICSEARCH_REQUEST_TIMEOUT_MS',
        150,
        50,
        30_000,
      ),
      indexingRequestTimeoutMs: readInteger(
        environment,
        'ELASTICSEARCH_INDEXING_REQUEST_TIMEOUT_MS',
        30_000,
        500,
        120_000,
      ),
      indexFreshnessTargetSeconds: readInteger(
        environment,
        'ELASTICSEARCH_INDEX_FRESHNESS_TARGET_SECONDS',
        30,
        1,
        3_600,
      ),
      incrementalBatchSize: readInteger(
        environment,
        'ELASTICSEARCH_INCREMENTAL_BATCH_SIZE',
        250,
        10,
        5_000,
      ),
      periodicReconciliationWindowSeconds: readInteger(
        environment,
        'ELASTICSEARCH_PERIODIC_RECONCILIATION_WINDOW_SECONDS',
        3_600,
        60,
        86_400,
      ),
    },
    features: {
      baselineSearch: readBoolean(environment, 'SEARCH_ELASTICSEARCH_ENABLED', false),
      personalization: readBoolean(environment, 'SEARCH_PERSONALIZATION_ENABLED', false),
      dailyRecommendations: readBoolean(environment, 'SEARCH_DAILY_RECOMMENDATIONS_ENABLED', false),
    },
  };
}

export function isElasticsearchRequested(config: SearchConfig): boolean {
  return (
    config.features.baselineSearch ||
    config.features.personalization ||
    config.features.dailyRecommendations
  );
}
