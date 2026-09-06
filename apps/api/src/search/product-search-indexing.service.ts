import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  ELASTICSEARCH_INDEXING_CLIENT,
  type ElasticsearchBulkResponse,
  type ElasticsearchClientPort,
  type ElasticsearchIndicesPort,
} from './search-elasticsearch.adapter';
import { SEARCH_CONFIG, type SearchConfig } from './search.config';
import {
  PRODUCT_SEARCH_INDEX_METADATA,
  productSearchIndexSettings,
  productSearchMapping,
  type ProductSearchProjection,
} from './product-search-document';
import { ProductSearchProjectionBuilder } from './product-search-projection.builder';
import { ProductSearchProjectionRepository } from './product-search-projection.repository';
import { ProductSearchCheckpointRepository } from './product-search-checkpoint.repository';

const DEFAULT_BULK_RETRY_COUNT = 3;
const RETRY_BACKOFF_MS = 25;
// Keep the physical index name compatible with the existing alias during the
// additive campaign rollout. Projection metadata remains versioned in the
// document and the alias swap is the compatibility boundary.
const PHYSICAL_INDEX_NAME_VERSION = 1;

export interface FullReindexResult {
  alias: string;
  index: string;
  previousIndexes: string[];
  indexedDocuments: number;
  skippedDeletes: number;
  projectionVersion: number;
  analyzerVersion: number;
}

export interface IncrementalReconcileResult {
  alias: string;
  index: string;
  examinedProducts: number;
  indexedDocuments: number;
  deletedDocuments: number;
  completedAt: string;
}

export class ProductSearchIndexingUnavailableError extends Error {
  constructor() {
    super('Elasticsearch indexing is not configured or unavailable.');
  }
}

export class ProductSearchIndexRebuildError extends Error {
  constructor() {
    super('Elasticsearch product index rebuild failed.');
  }
}

class ProductSearchIndexReconciliationIncompleteError extends Error {
  constructor() {
    super('Elasticsearch product reconciliation batch is incomplete.');
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : null;
}

function isNotFound(error: unknown): boolean {
  return errorStatus(error) === 404;
}

function responseCount(response: { count: number } | { body: { count: number } }): number {
  if ('count' in response) return response.count;
  return response.body.count;
}

function responseHasErrors(response: ElasticsearchBulkResponse): boolean {
  return response.errors === true;
}

function responseHasOnlyMissingDeletes(response: ElasticsearchBulkResponse): boolean {
  const failures = (response.items ?? []).flatMap((item) =>
    Object.entries(item)
      .filter(([, result]) => Boolean(result.error))
      .map(([operation, result]) => ({ operation, status: result.status })),
  );
  return (
    failures.length > 0 &&
    failures.every((failure) => failure.operation === 'delete' && failure.status === 404)
  );
}

@Injectable()
export class ProductSearchIndexingService {
  private readonly logger = new Logger(ProductSearchIndexingService.name);

  constructor(
    @Inject(SEARCH_CONFIG) private readonly config: SearchConfig,
    @Inject(ELASTICSEARCH_INDEXING_CLIENT)
    private readonly client: ElasticsearchClientPort | null,
    @Inject(ProductSearchProjectionRepository)
    private readonly repository: ProductSearchProjectionRepository,
    @Inject(ProductSearchProjectionBuilder)
    private readonly projectionBuilder: ProductSearchProjectionBuilder,
    @Inject(ProductSearchCheckpointRepository)
    private readonly checkpoints: ProductSearchCheckpointRepository,
  ) {}

  private indexingClient(): {
    indices: ElasticsearchIndicesPort;
    bulk: NonNullable<ElasticsearchClientPort['bulk']>;
    count: NonNullable<ElasticsearchClientPort['count']>;
  } {
    if (!this.client?.indices || !this.client.bulk || !this.client.count) {
      throw new ProductSearchIndexingUnavailableError();
    }
    return {
      indices: this.client.indices,
      bulk: this.client.bulk.bind(this.client),
      count: this.client.count.bind(this.client),
    };
  }

  private indexName(alias: string, timestamp: number): string {
    return `${alias}-v${PHYSICAL_INDEX_NAME_VERSION}-${timestamp}`;
  }

  private async aliasIndexes(alias: string): Promise<string[]> {
    const { indices } = this.indexingClient();
    try {
      const response = await indices.getAlias({ name: alias });
      return Object.keys(response).sort();
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  private async bulkWrite(
    operations: unknown[],
    refresh: boolean | 'wait_for' = false,
  ): Promise<void> {
    if (operations.length === 0) return;
    const { bulk } = this.indexingClient();
    for (let attempt = 0; attempt < DEFAULT_BULK_RETRY_COUNT; attempt += 1) {
      const response = await bulk({ operations, refresh });
      if (!responseHasErrors(response)) return;
      if (responseHasOnlyMissingDeletes(response)) return;
      if (attempt + 1 < DEFAULT_BULK_RETRY_COUNT) await sleep(RETRY_BACKOFF_MS * (attempt + 1));
    }
    throw new ProductSearchIndexRebuildError();
  }

  private async writeProjections(
    index: string,
    projections: readonly ProductSearchProjection[],
    refresh: boolean | 'wait_for' = false,
  ): Promise<{
    indexedDocuments: number;
    deletedDocuments: number;
    skippedDeletes: number;
  }> {
    const counts = { indexedDocuments: 0, deletedDocuments: 0, skippedDeletes: 0 };
    const operations: unknown[] = [];
    for (const projection of projections) {
      if (projection.kind === 'index') {
        operations.push({ index: { _index: index, _id: projection.document.product_id } });
        operations.push(projection.document);
        counts.indexedDocuments += 1;
      } else {
        operations.push({ delete: { _index: index, _id: projection.decision.product_id } });
        counts.deletedDocuments += 1;
      }
      if (operations.length >= 500) {
        await this.bulkWrite(operations.splice(0, operations.length), refresh);
      }
    }
    await this.bulkWrite(operations, refresh);
    return { ...counts, skippedDeletes: counts.deletedDocuments };
  }

  private async swapAlias(
    alias: string,
    targetIndex: string,
    previousIndexes: readonly string[],
  ): Promise<void> {
    const { indices } = this.indexingClient();
    const actions: Array<Record<string, unknown>> = previousIndexes.map((index) => ({
      remove: { index, alias },
    }));
    actions.push({ add: { index: targetIndex, alias } });
    await indices.updateAliases({ actions });
  }

  private async deleteIndex(index: string): Promise<void> {
    try {
      await this.indexingClient().indices.delete({ index });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async fullReindex(evaluatedAt = new Date()): Promise<FullReindexResult> {
    const alias = this.config.elasticsearch.productIndexAlias;
    const { indices, count } = this.indexingClient();
    const previousIndexes = await this.aliasIndexes(alias);
    const source = await this.repository.findSellableProducts();
    const projections = await this.projectionBuilder.buildMany(source, evaluatedAt);
    const targetIndex = this.indexName(alias, evaluatedAt.getTime());
    let created = false;

    try {
      await indices.create({
        index: targetIndex,
        settings: productSearchIndexSettings(),
        mappings: productSearchMapping(),
      });
      created = true;
      const writeResult = await this.writeProjections(
        targetIndex,
        projections.filter((projection) => projection.kind === 'index'),
        'wait_for',
      );
      const actualCount = responseCount(await count({ index: targetIndex }));
      if (actualCount !== writeResult.indexedDocuments) throw new ProductSearchIndexRebuildError();
      await this.swapAlias(alias, targetIndex, previousIndexes);
      await this.checkpoints.save({
        lastCompletedAt: evaluatedAt,
        lastRunAt: evaluatedAt,
        activeIndex: targetIndex,
        lastError: null,
      });
      for (const oldIndex of previousIndexes) {
        if (oldIndex !== targetIndex) {
          try {
            await this.deleteIndex(oldIndex);
          } catch {
            this.logger.warn('Previous product search index could not be retired.');
          }
        }
      }
      return {
        alias,
        index: targetIndex,
        previousIndexes,
        indexedDocuments: writeResult.indexedDocuments,
        skippedDeletes: projections.filter((projection) => projection.kind === 'delete').length,
        projectionVersion: PRODUCT_SEARCH_INDEX_METADATA.projectionVersion,
        analyzerVersion: PRODUCT_SEARCH_INDEX_METADATA.analyzerVersion,
      };
    } catch (error) {
      if (created) {
        try {
          await this.deleteIndex(targetIndex);
        } catch {
          this.logger.warn('Failed product search rebuild cleanup.');
        }
      }
      throw error instanceof ProductSearchIndexRebuildError
        ? error
        : new ProductSearchIndexRebuildError();
    }
  }

  async rollbackTo(targetIndex: string): Promise<void> {
    const alias = this.config.elasticsearch.productIndexAlias;
    const { indices } = this.indexingClient();
    if (!(await indices.exists({ index: targetIndex }))) {
      throw new ProductSearchIndexingUnavailableError();
    }
    const previousIndexes = await this.aliasIndexes(alias);
    await this.swapAlias(
      alias,
      targetIndex,
      previousIndexes.filter((index) => index !== targetIndex),
    );
    await this.checkpoints.save({ activeIndex: targetIndex, lastError: null });
  }

  async reconcileIncremental(evaluatedAt = new Date()): Promise<IncrementalReconcileResult> {
    const alias = this.config.elasticsearch.productIndexAlias;
    const currentIndexes = await this.aliasIndexes(alias);
    const targetIndex = currentIndexes[0];
    if (!targetIndex) throw new ProductSearchIndexingUnavailableError();

    const previous = await this.checkpoints.find();
    const fallbackSince = new Date(
      evaluatedAt.getTime() - this.config.elasticsearch.periodicReconciliationWindowSeconds * 1000,
    );
    const since = previous?.lastCompletedAt ?? fallbackSince;
    await this.checkpoints.save({
      lastRunAt: evaluatedAt,
      lastError: null,
      activeIndex: targetIndex,
    });

    try {
      const limit = this.config.elasticsearch.incrementalBatchSize;
      const changedRows = await this.repository.findChangedProductIds(since, evaluatedAt, limit);
      const promotionRows = await this.repository.findProductsInPromotionWindow(
        new Date(
          evaluatedAt.getTime() -
            this.config.elasticsearch.periodicReconciliationWindowSeconds * 1000,
        ),
        new Date(
          evaluatedAt.getTime() +
            this.config.elasticsearch.periodicReconciliationWindowSeconds * 1000,
        ),
        limit,
      );
      if (changedRows.length > limit || promotionRows.length > limit) {
        throw new ProductSearchIndexReconciliationIncompleteError();
      }
      const ids = [...new Set([...changedRows, ...promotionRows].map((row) => row.id))];
      const records = await this.repository.findProductsByIds(ids);
      const foundIds = new Set(records.map((record) => record.id));
      const projections = await this.projectionBuilder.buildMany(records, evaluatedAt);
      for (const id of ids) {
        if (!foundIds.has(id)) {
          projections.push({ kind: 'delete', decision: { product_id: id, reason: 'missing' } });
        }
      }
      const writeResult = await this.writeProjections(targetIndex, projections);
      await this.checkpoints.save({
        lastCompletedAt: evaluatedAt,
        lastRunAt: evaluatedAt,
        activeIndex: targetIndex,
        lastError: null,
      });
      return {
        alias,
        index: targetIndex,
        examinedProducts: ids.length,
        indexedDocuments: writeResult.indexedDocuments,
        deletedDocuments: writeResult.deletedDocuments,
        completedAt: evaluatedAt.toISOString(),
      };
    } catch (error) {
      await this.checkpoints.save({
        lastRunAt: evaluatedAt,
        activeIndex: targetIndex,
        lastError:
          error instanceof ProductSearchIndexReconciliationIncompleteError
            ? 'batch-incomplete'
            : 'reconcile-failed',
      });
      throw error;
    }
  }
}
