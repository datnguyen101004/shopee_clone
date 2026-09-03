import { Inject, Injectable, Optional, type OnModuleDestroy } from '@nestjs/common';

import { isElasticsearchRequested, SEARCH_CONFIG, type SearchConfig } from './search.config';

export const ELASTICSEARCH_CLIENT = Symbol('ELASTICSEARCH_CLIENT');
export const ELASTICSEARCH_INDEXING_CLIENT = Symbol('ELASTICSEARCH_INDEXING_CLIENT');

export interface ElasticsearchBulkResponse {
  errors: boolean;
  items?: Array<Record<string, { status?: number; error?: unknown }>>;
}

export interface ElasticsearchIndicesPort {
  create(request: { index: string; settings?: unknown; mappings?: unknown }): Promise<unknown>;
  delete(request: { index: string }): Promise<unknown>;
  exists(request: { index: string }): Promise<boolean>;
  getAlias(request: { name: string }): Promise<Record<string, unknown>>;
  updateAliases(request: { actions: Array<Record<string, unknown>> }): Promise<unknown>;
}

export interface ElasticsearchClientPort {
  cluster: {
    health(): Promise<{ status?: string }>;
  };
  indices?: ElasticsearchIndicesPort;
  search?(request: {
    index: string;
    from?: number;
    size?: number;
    track_total_hits?: boolean;
    query?: unknown;
    sort?: unknown[];
    aggs?: unknown;
    suggest?: unknown;
    _source?: boolean | string[];
  }): Promise<unknown>;
  bulk?(request: {
    refresh?: boolean | 'wait_for';
    operations: unknown[];
  }): Promise<ElasticsearchBulkResponse>;
  count?(request: { index: string }): Promise<{ count: number }>;
  putScript?(request: {
    id: string;
    script: { lang: 'painless'; source: string };
  }): Promise<unknown>;
  close?(): Promise<void>;
}

export type ElasticsearchHealthReason =
  'disabled' | 'not-configured' | 'cluster-red' | 'unexpected-response' | 'request-failed' | null;

export interface ElasticsearchHealthResponse {
  required: false;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  status: 'disabled' | 'available' | 'unavailable';
  clusterStatus: 'green' | 'yellow' | 'red' | null;
  checkedAt: string;
  latencyMs: number | null;
  reason: ElasticsearchHealthReason;
}

@Injectable()
export class SearchElasticsearchAdapter implements OnModuleDestroy {
  constructor(
    @Inject(SEARCH_CONFIG) private readonly config: SearchConfig,
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: ElasticsearchClientPort | null,
    @Optional()
    @Inject(ELASTICSEARCH_INDEXING_CLIENT)
    private readonly indexingClient: ElasticsearchClientPort | null = null,
  ) {}

  async getHealth(): Promise<ElasticsearchHealthResponse> {
    const enabled = isElasticsearchRequested(this.config);
    const configured = this.config.elasticsearch.url !== null;
    const checkedAt = new Date().toISOString();

    if (!enabled) {
      return {
        required: false,
        enabled,
        configured,
        available: false,
        status: 'disabled',
        clusterStatus: null,
        checkedAt,
        latencyMs: null,
        reason: configured ? 'disabled' : 'not-configured',
      };
    }

    if (!configured || this.client === null) {
      return {
        required: false,
        enabled,
        configured,
        available: false,
        status: 'unavailable',
        clusterStatus: null,
        checkedAt,
        latencyMs: null,
        reason: 'not-configured',
      };
    }

    const startedAt = Date.now();
    try {
      const response = await this.client.cluster.health();
      const latencyMs = Date.now() - startedAt;
      const clusterStatus = response.status;
      if (!['green', 'yellow', 'red'].includes(clusterStatus ?? '')) {
        return {
          required: false,
          enabled,
          configured,
          available: false,
          status: 'unavailable',
          clusterStatus: null,
          checkedAt,
          latencyMs,
          reason: 'unexpected-response',
        };
      }

      const normalizedStatus = clusterStatus as 'green' | 'yellow' | 'red';
      const available = normalizedStatus !== 'red';
      return {
        required: false,
        enabled,
        configured,
        available,
        status: available ? 'available' : 'unavailable',
        clusterStatus: normalizedStatus,
        checkedAt,
        latencyMs,
        reason: available ? null : 'cluster-red',
      };
    } catch {
      return {
        required: false,
        enabled,
        configured,
        available: false,
        status: 'unavailable',
        clusterStatus: null,
        checkedAt,
        latencyMs: Date.now() - startedAt,
        reason: 'request-failed',
      };
    }
  }

  async search(
    request: Omit<Parameters<NonNullable<ElasticsearchClientPort['search']>>[0], 'index'>,
  ): Promise<unknown> {
    if (!this.client?.search || !this.config.features.baselineSearch) {
      throw new Error('Elasticsearch search is unavailable.');
    }
    return this.client.search({
      ...request,
      index: this.config.elasticsearch.productIndexAlias,
    });
  }

  async bootstrapStoredScript(script: {
    id: string;
    lang: 'painless';
    source: string;
  }): Promise<void> {
    const target = this.indexingClient ?? this.client;
    if (!this.config.elasticsearch.url || !target?.putScript) {
      throw new Error('Elasticsearch stored-script bootstrap is unavailable.');
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const timeout = new Error('Elasticsearch stored-script bootstrap timed out.');
        timeout.name = 'TimeoutError';
        reject(timeout);
      }, this.config.elasticsearch.indexingRequestTimeoutMs);
      target.putScript!({
        id: script.id,
        script: { lang: script.lang, source: script.source },
      }).then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.indexingClient && this.indexingClient !== this.client) {
      await this.indexingClient.close?.();
    }
    await this.client?.close?.();
  }
}
