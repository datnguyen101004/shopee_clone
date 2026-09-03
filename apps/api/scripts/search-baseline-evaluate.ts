import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';

import { CatalogModule } from '../src/catalog/catalog.module';
import { CatalogPublicFacade } from '../src/catalog/catalog-public.facade';
import type { NormalizedCatalogQuery } from '../src/catalog/catalog-query';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { ProductSearchCheckpointRepository } from '../src/search/product-search-checkpoint.repository';
import { ProductSearchProjectionBuilder } from '../src/search/product-search-projection.builder';
import { ProductSearchProjectionRepository } from '../src/search/product-search-projection.repository';
import { ProductSearchQueryService } from '../src/search/product-search-query.service';
import {
  ELASTICSEARCH_CLIENT,
  SearchElasticsearchAdapter,
  type ElasticsearchClientPort,
} from '../src/search/search-elasticsearch.adapter';
import { SEARCH_CONFIG, type SearchConfig } from '../src/search/search.config';
import {
  canonicalSnapshotProducts,
  compareGroupMetric,
  computeBaselineMetrics,
  computeMetricComparison,
  computeTargetGates,
  findNonSellableResults,
  snapshotSha256,
  validateExplicitSort,
  type EvaluationReport,
  type EvaluationRun,
  type LatencySnapshot,
  type RelevanceDataset,
  type RelevanceQueryDefinition,
  type RelevanceSnapshot,
  type RelevanceSnapshotProduct,
} from '../src/search/search-evaluation';

function repositoryRoot(startDirectory = process.cwd()): string {
  let current = path.resolve(startDirectory);
  while (true) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error('Could not locate repository root.');
    current = parent;
  }
}

const REPOSITORY_ROOT = repositoryRoot();
const DATASET_DIRECTORY = path.join(REPOSITORY_ROOT, 'data/search/relevance/v1');
const REPORT_DIRECTORY = path.join(REPOSITORY_ROOT, '.runtime/search-baseline-evaluation');
const SEARCH_PAGE_SIZE = 48;

type RuntimeMode = 'postgres' | 'elasticsearch' | 'fallback';

interface EvaluationRuntime {
  app: INestApplicationContext;
  facade: CatalogPublicFacade;
  repository: ProductSearchProjectionRepository;
  projectionBuilder: ProductSearchProjectionBuilder;
  queryService: ProductSearchQueryService | null;
  adapter: SearchElasticsearchAdapter | null;
  config: SearchConfig | null;
}

function recordBody(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.body === 'object' &&
    candidate.body !== null &&
    !Array.isArray(candidate.body)
  ) {
    return candidate.body as Record<string, unknown>;
  }
  return candidate;
}

function readPositiveInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function setEnvironment(overrides: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

async function createRuntime(mode: RuntimeMode): Promise<EvaluationRuntime> {
  const overrides: Record<string, string | undefined> = {};
  if (mode === 'postgres') {
    overrides.SEARCH_ELASTICSEARCH_ENABLED = 'false';
  } else {
    overrides.SEARCH_ELASTICSEARCH_ENABLED = 'true';
    if (!process.env.ELASTICSEARCH_URL) overrides.ELASTICSEARCH_URL = 'http://127.0.0.1:9200';
  }
  if (mode === 'fallback') {
    overrides.ELASTICSEARCH_URL = 'http://127.0.0.1:1';
    overrides.ELASTICSEARCH_REQUEST_TIMEOUT_MS = '50';
  }
  const restore = setEnvironment(overrides);
  try {
    const app = await NestFactory.createApplicationContext(CatalogModule, { logger: false });
    return {
      app,
      facade: app.get(CatalogPublicFacade, { strict: false }),
      repository: app.get(ProductSearchProjectionRepository, { strict: false }),
      projectionBuilder: app.get(ProductSearchProjectionBuilder, { strict: false }),
      queryService:
        mode === 'elasticsearch' ? app.get(ProductSearchQueryService, { strict: false }) : null,
      adapter:
        mode === 'elasticsearch' ? app.get(SearchElasticsearchAdapter, { strict: false }) : null,
      config: mode === 'elasticsearch' ? app.get(SEARCH_CONFIG, { strict: false }) : null,
    };
  } finally {
    restore();
  }
}

function toCatalogQuery(definition: RelevanceQueryDefinition): NormalizedCatalogQuery {
  const filters = definition.filters ?? {};
  return {
    q: definition.query?.trim() || null,
    category: filters.category ?? null,
    minPrice: filters.minPrice ?? null,
    maxPrice: filters.maxPrice ?? null,
    rating: filters.rating ?? null,
    location: filters.location ?? null,
    availability: filters.availability ?? null,
    promotion: filters.promotion ?? null,
    sort: definition.sort,
    page: 1,
    pageSize: SEARCH_PAGE_SIZE,
  };
}

function snapshotProduct(document: {
  product_id: string;
  name: string;
  description: string;
  category_slug: string;
  category_name: string;
  category_path_slugs: string[];
  category_path_names: string[];
  shop_slug: string;
  shop_name: string;
  shop_location: string;
  effective_price_minor: number;
  sold_count: number;
  rating_average_basis_points: number;
  rating_count: number;
  inventory_available: number;
  promotion_active: boolean;
  product_created_at: string;
  product_updated_at: string;
}): RelevanceSnapshotProduct {
  return {
    id: document.product_id,
    name: document.name,
    description: document.description,
    categorySlug: document.category_slug,
    categoryName: document.category_name,
    categoryPathSlugs: document.category_path_slugs,
    categoryPathNames: document.category_path_names,
    shopSlug: document.shop_slug,
    shopName: document.shop_name,
    location: document.shop_location,
    effectivePriceMinor: document.effective_price_minor,
    soldCount: document.sold_count,
    ratingAverageBasisPoints: document.rating_average_basis_points,
    ratingCount: document.rating_count,
    inventoryAvailable: document.inventory_available,
    promotionActive: document.promotion_active,
    productCreatedAt: document.product_created_at,
    productUpdatedAt: document.product_updated_at,
    displayable: true,
  };
}

async function currentSnapshot(runtime: EvaluationRuntime): Promise<RelevanceSnapshotProduct[]> {
  const projections = await runtime.projectionBuilder.buildMany(
    await runtime.repository.findSellableProducts(),
    new Date(),
  );
  return canonicalSnapshotProducts(
    projections.flatMap((projection) =>
      projection.kind === 'index' ? [snapshotProduct(projection.document)] : [],
    ),
  );
}

function parseDataset(value: unknown): RelevanceDataset {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Search relevance dataset must be a JSON object.');
  }
  const dataset = value as RelevanceDataset;
  if (
    !dataset.datasetVersion ||
    !dataset.source?.snapshotSha256 ||
    !Array.isArray(dataset.queries) ||
    !Array.isArray(dataset.judgments)
  ) {
    throw new Error('Search relevance dataset is missing version, source, queries, or judgments.');
  }
  return dataset;
}

function parseSnapshot(value: unknown): RelevanceSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Catalogue snapshot must be a JSON object.');
  }
  const snapshot = value as RelevanceSnapshot;
  if (!snapshot.snapshotId || !snapshot.sha256 || !Array.isArray(snapshot.products)) {
    throw new Error('Catalogue snapshot is missing identity, hash, or products.');
  }
  return snapshot;
}

async function loadFixtures(): Promise<{ dataset: RelevanceDataset; snapshot: RelevanceSnapshot }> {
  const [datasetText, snapshotText] = await Promise.all([
    readFile(path.join(DATASET_DIRECTORY, 'dataset.json'), 'utf8'),
    readFile(path.join(DATASET_DIRECTORY, 'catalogue-snapshot.json'), 'utf8'),
  ]);
  const dataset = parseDataset(JSON.parse(datasetText) as unknown);
  const snapshot = parseSnapshot(JSON.parse(snapshotText) as unknown);
  if (
    dataset.source.snapshotId !== snapshot.snapshotId ||
    dataset.source.snapshotSha256 !== snapshot.sha256
  ) {
    throw new Error('Dataset and catalogue snapshot metadata do not match.');
  }
  if (snapshot.sha256 !== snapshotSha256(snapshot.products)) {
    throw new Error('Catalogue snapshot SHA-256 does not match its contents.');
  }
  return { dataset, snapshot };
}

async function runQuery(
  runtime: EvaluationRuntime,
  definition: RelevanceQueryDefinition,
): Promise<EvaluationRun> {
  const startedAt = performance.now();
  try {
    const response = await runtime.facade.getProducts(toCatalogQuery(definition), null);
    return {
      queryId: definition.id,
      ids: response.items.map((item) => item.id),
      totalItems: response.pagination.totalItems,
      latencyMs: performance.now() - startedAt,
    };
  } catch (error) {
    throw new Error(
      `Catalogue ${definition.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

async function runQueries(
  runtime: EvaluationRuntime,
  queries: readonly RelevanceQueryDefinition[],
): Promise<EvaluationRun[]> {
  const runs: EvaluationRun[] = [];
  for (const query of queries) runs.push(await runQuery(runtime, query));
  return runs;
}

function percentile(values: readonly number[], percentileValue: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1),
  );
  return sorted[index] ?? null;
}

function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function latencySnapshot(values: readonly number[]): LatencySnapshot {
  return {
    sampleCount: values.length,
    p50Ms: rounded(percentile(values, 0.5)),
    p95Ms: rounded(percentile(values, 0.95)),
    maxMs: rounded(values.length ? Math.max(...values) : null),
  };
}

async function runLatencyBenchmark(
  postgres: EvaluationRuntime,
  elasticsearch: EvaluationRuntime,
  fallback: EvaluationRuntime,
  queries: readonly RelevanceQueryDefinition[],
): Promise<EvaluationReport['operational']> {
  const iterations = readPositiveInteger('SEARCH_EVALUATION_BENCHMARK_ITERATIONS', 5, 1, 100);
  const warmupIterations = readPositiveInteger('SEARCH_EVALUATION_BENCHMARK_WARMUP', 1, 0, 20);
  const elasticsearchQueryValues: number[] = [];
  const postgresApiValues: number[] = [];
  const elasticsearchApiValues: number[] = [];
  const fallbackApiValues: number[] = [];

  for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
    for (const definition of queries) {
      const query = toCatalogQuery(definition);
      await elasticsearch.queryService!.search(query, 0, SEARCH_PAGE_SIZE);
      await runQuery(elasticsearch, definition);
      await runQuery(postgres, definition);
      await runQuery(fallback, definition);
    }
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const definition of queries) {
      const query = toCatalogQuery(definition);
      const esQueryStartedAt = performance.now();
      await elasticsearch.queryService!.search(query, 0, SEARCH_PAGE_SIZE);
      elasticsearchQueryValues.push(performance.now() - esQueryStartedAt);
      const esRun = await runQuery(elasticsearch, definition);
      elasticsearchApiValues.push(esRun.latencyMs);
      const pgRun = await runQuery(postgres, definition);
      postgresApiValues.push(pgRun.latencyMs);
      const fallbackRun = await runQuery(fallback, definition);
      fallbackApiValues.push(fallbackRun.latencyMs);
    }
  }

  const freshness = await measureIndexFreshness(elasticsearch);
  const elasticsearchQuery = latencySnapshot(elasticsearchQueryValues);
  const postgresApi = latencySnapshot(postgresApiValues);
  const elasticsearchApi = latencySnapshot(elasticsearchApiValues);
  const fallbackApi = latencySnapshot(fallbackApiValues);
  const target = (actual: number | null, limit: number) => ({
    actual,
    target: limit,
    passed: actual !== null && actual <= limit,
  });
  return {
    profile: { iterations, warmupIterations, queryCount: queries.length },
    elasticsearchQuery,
    postgresApi,
    elasticsearchApi,
    fallbackApi,
    latencyTargets: {
      elasticsearchQueryP95Ms: target(elasticsearchQuery.p95Ms, 150),
      postgresApiP95Ms: target(postgresApi.p95Ms, 300),
      elasticsearchApiP95Ms: target(elasticsearchApi.p95Ms, 400),
      fallbackApiP95Ms: target(fallbackApi.p95Ms, 300),
    },
    indexFreshness: freshness,
  };
}

function parseDate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function measureIndexFreshness(
  runtime: EvaluationRuntime,
): Promise<NonNullable<EvaluationReport['operational']>['indexFreshness']> {
  if (!runtime.config || !runtime.adapter)
    throw new Error('Elasticsearch runtime is not available.');
  const client = runtime.app.get(ELASTICSEARCH_CLIENT, {
    strict: false,
  }) as ElasticsearchClientPort | null;
  if (!client?.search) throw new Error('Elasticsearch client does not support search.');
  const response = await client.search({
    index: runtime.config.elasticsearch.productIndexAlias,
    size: 10_000,
    track_total_hits: true,
    query: { term: { displayable: true } },
    _source: ['product_id', 'product_updated_at', 'indexed_at'],
  });
  const root = recordBody(response);
  const hitsRoot =
    root && typeof root.hits === 'object' && root.hits !== null && !Array.isArray(root.hits)
      ? (root.hits as Record<string, unknown>)
      : null;
  const hits = hitsRoot && Array.isArray(hitsRoot.hits) ? hitsRoot.hits : [];
  const now = Date.now();
  const ages: number[] = [];
  const propagation: number[] = [];
  let staleDocumentCount = 0;
  let index: string | null = null;
  const sampleWindowMs = runtime.config.elasticsearch.periodicReconciliationWindowSeconds * 1_000;
  for (const hit of hits) {
    if (typeof hit !== 'object' || hit === null || Array.isArray(hit)) continue;
    const item = hit as Record<string, unknown>;
    if (!index && typeof item._index === 'string') index = item._index;
    const source = item._source;
    if (typeof source !== 'object' || source === null || Array.isArray(source)) continue;
    const fields = source as Record<string, unknown>;
    const indexedAt = parseDate(fields.indexed_at);
    const updatedAt = parseDate(fields.product_updated_at);
    if (indexedAt !== null) {
      ages.push(Math.max(0, (now - indexedAt) / 1_000));
      if (updatedAt !== null) {
        if (indexedAt < updatedAt) staleDocumentCount += 1;
        if (updatedAt >= now - sampleWindowMs) {
          propagation.push(Math.max(0, (indexedAt - updatedAt) / 1_000));
        }
      }
    }
  }
  const checkpoint = await runtime.app
    .get(ProductSearchCheckpointRepository, { strict: false })
    .find();
  const checkpointAgeSeconds = checkpoint?.lastCompletedAt
    ? Math.max(0, (now - checkpoint.lastCompletedAt.getTime()) / 1_000)
    : null;
  const targetSeconds = runtime.config.elasticsearch.indexFreshnessTargetSeconds;
  const p95AgeSeconds = rounded(percentile(ages, 0.95));
  const maxAgeSeconds = rounded(ages.length ? Math.max(...ages) : null);
  const p95PropagationSeconds = rounded(percentile(propagation, 0.95));
  const maxPropagationSeconds = rounded(propagation.length ? Math.max(...propagation) : null);
  return {
    index: index ?? checkpoint?.activeIndex ?? null,
    documentCount: hits.length,
    recentChangedDocumentCount: propagation.length,
    p95PropagationSeconds,
    maxPropagationSeconds,
    p95AgeSeconds,
    maxAgeSeconds,
    staleDocumentCount,
    checkpointAgeSeconds: rounded(checkpointAgeSeconds),
    targetSeconds,
    passed:
      ages.length > 0 &&
      staleDocumentCount === 0 &&
      (propagation.length === 0 ||
        (p95PropagationSeconds !== null && p95PropagationSeconds <= targetSeconds)),
  };
}

function unexpectedZeroQueryIds(
  queries: readonly RelevanceQueryDefinition[],
  postgresRuns: readonly EvaluationRun[],
  elasticsearchRuns: readonly EvaluationRun[],
  judgments: RelevanceDataset['judgments'],
): string[] {
  const positiveQueryIds = new Set(
    judgments.filter((judgment) => judgment.relevance >= 2).map((judgment) => judgment.queryId),
  );
  const postgres = new Map(postgresRuns.map((run) => [run.queryId, run]));
  const elasticsearch = new Map(elasticsearchRuns.map((run) => [run.queryId, run]));
  return queries.flatMap((query) => {
    const pgRun = postgres.get(query.id);
    const esRun = elasticsearch.get(query.id);
    return !query.expectedZero &&
      query.group !== 'irrelevant' &&
      positiveQueryIds.has(query.id) &&
      pgRun &&
      esRun &&
      pgRun.totalItems > 0 &&
      esRun.totalItems === 0
      ? [query.id]
      : [];
  });
}

function gate(
  passed: boolean,
  reason: string,
  queryIds?: string[],
): EvaluationReport['gates']['snapshot'] {
  return { passed, reason, ...(queryIds?.length ? { queryIds } : {}) };
}

function reportFor(
  dataset: RelevanceDataset,
  snapshot: RelevanceSnapshot,
  currentProducts: readonly RelevanceSnapshotProduct[],
  postgresRuns: readonly EvaluationRun[],
  elasticsearchRuns: readonly EvaluationRun[],
  operational: NonNullable<EvaluationReport['operational']>,
): EvaluationReport {
  const postgres = computeBaselineMetrics(dataset.queries, postgresRuns, dataset.judgments);
  const elasticsearch = computeBaselineMetrics(
    dataset.queries,
    elasticsearchRuns,
    dataset.judgments,
  );
  const nonSellable = findNonSellableResults(elasticsearchRuns, snapshot.products);
  const sortViolations = validateExplicitSort(
    dataset.queries,
    elasticsearchRuns,
    snapshot.products,
  );
  const zeroQueries = unexpectedZeroQueryIds(
    dataset.queries,
    postgresRuns,
    elasticsearchRuns,
    dataset.judgments,
  );
  const groupRegressionFailures = (
    ['ndcgAt10', 'mrr', 'exactNameTopOne', 'irrelevantTopTenRate', 'unexpectedZeroRate'] as const
  ).flatMap((metric) => {
    const result = compareGroupMetric(postgres, elasticsearch, metric);
    return result.passed ? [] : [`${metric}:${result.group ?? 'unknown'}`];
  });
  const currentHash = snapshotSha256(currentProducts);
  const snapshotMatches =
    currentHash === snapshot.sha256 && currentProducts.length === snapshot.productCount;
  const unexpectedZeroPassed = zeroQueries.length === 0;
  const report: EvaluationReport = {
    datasetVersion: dataset.datasetVersion,
    snapshotId: snapshot.snapshotId,
    generatedAt: new Date().toISOString(),
    postgres,
    elasticsearch,
    comparisons: {
      ndcgAt10: computeMetricComparison(postgres.ndcgAt10, elasticsearch.ndcgAt10),
      mrr: computeMetricComparison(postgres.mrr, elasticsearch.mrr),
      exactNameTopOne: computeMetricComparison(
        postgres.exactNameTopOne,
        elasticsearch.exactNameTopOne,
      ),
      irrelevantTopTenRate: computeMetricComparison(
        postgres.irrelevantTopTenRate,
        elasticsearch.irrelevantTopTenRate,
      ),
      unexpectedZeroRate: computeMetricComparison(
        postgres.unexpectedZeroRate,
        elasticsearch.unexpectedZeroRate,
      ),
    },
    gates: {
      snapshot: gate(
        snapshotMatches,
        snapshotMatches
          ? 'Catalogue snapshot matches the fixture.'
          : `Catalogue snapshot drift detected. current=${currentHash} expected=${snapshot.sha256}`,
      ),
      sellability: gate(
        nonSellable.length === 0,
        nonSellable.length
          ? `${nonSellable.length} non-sellable Elasticsearch result(s).`
          : 'All Elasticsearch results are sellable.',
      ),
      explicitSort: gate(
        sortViolations.length === 0,
        sortViolations.length
          ? `${sortViolations.length} explicit-sort violation(s).`
          : 'All explicit-sort tuples are valid.',
      ),
      unexpectedZero: gate(
        unexpectedZeroPassed,
        unexpectedZeroPassed
          ? 'No Elasticsearch unexpected-zero increase over PostgreSQL.'
          : 'Elasticsearch returned zero where PostgreSQL returned eligible results.',
        zeroQueries,
      ),
      groupRegression: gate(
        groupRegressionFailures.length === 0,
        groupRegressionFailures.length
          ? `Query-group regression over 5%: ${groupRegressionFailures.join(', ')}.`
          : 'No important query-group regression over 5%.',
      ),
    },
    targetGates: computeTargetGates(elasticsearch, postgres),
    operational,
  };
  return report;
}

async function main(): Promise<void> {
  loadRepositoryEnvironment();
  const { dataset, snapshot } = await loadFixtures();
  const benchmarkQueries = dataset.queries.filter((query) => query.benchmark);
  if (!benchmarkQueries.length)
    throw new Error('Relevance dataset does not define benchmark queries.');
  const runtimes: EvaluationRuntime[] = [];
  try {
    const postgres = await createRuntime('postgres');
    runtimes.push(postgres);
    const currentProducts = await currentSnapshot(postgres);
    const postgresRuns = await runQueries(postgres, dataset.queries);

    const elasticsearch = await createRuntime('elasticsearch');
    runtimes.push(elasticsearch);
    const health = await elasticsearch.adapter!.getHealth();
    if (!health.available) {
      throw new Error(
        `Elasticsearch is unavailable: ${health.reason ?? health.status}. Start Elasticsearch and run search:reindex first.`,
      );
    }
    const elasticsearchRuns = await runQueries(elasticsearch, dataset.queries);

    const fallback = await createRuntime('fallback');
    runtimes.push(fallback);
    const operational = await runLatencyBenchmark(
      postgres,
      elasticsearch,
      fallback,
      benchmarkQueries,
    );
    const report = reportFor(
      dataset,
      snapshot,
      currentProducts,
      postgresRuns,
      elasticsearchRuns,
      operational,
    );

    await mkdir(REPORT_DIRECTORY, { recursive: true });
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14);
    const reportPath = path.join(REPORT_DIRECTORY, `baseline-${timestamp}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(
      path.join(REPORT_DIRECTORY, 'latest.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );

    const hardFailures = Object.entries(report.gates).filter(([, result]) => !result.passed);
    const enforceTargets = process.env.SEARCH_EVALUATION_ENFORCE_TARGETS === 'true';
    const targetFailures = Object.entries(report.targetGates).filter(
      ([, result]) => !result.passed,
    );
    console.log(
      JSON.stringify(
        {
          reportPath,
          datasetVersion: report.datasetVersion,
          snapshotId: report.snapshotId,
          queries: dataset.queries.length,
          hardGatesPassed: hardFailures.length === 0,
          hardGateFailures: hardFailures.map(([name, result]) => ({ name, reason: result.reason })),
          targetGatesPassed: targetFailures.length === 0,
          targetGateFailures: targetFailures.map(([name, result]) => ({
            name,
            actual: result.actual,
            required: result.required,
          })),
          metrics: {
            postgres: report.postgres,
            elasticsearch: report.elasticsearch,
            comparisons: report.comparisons,
          },
          operational: report.operational,
        },
        null,
        2,
      ),
    );
    if (hardFailures.length > 0 || (enforceTargets && targetFailures.length > 0))
      process.exitCode = 1;
  } finally {
    for (const runtime of runtimes.reverse()) await runtime.app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Search baseline evaluation failed.');
  process.exitCode = 1;
});
