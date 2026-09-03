import { createHash } from 'node:crypto';

import type { CatalogSort } from '@shopee-clone/contracts';

export const RELEVANCE_LABELS = [0, 1, 2, 3] as const;
export type RelevanceLabel = (typeof RELEVANCE_LABELS)[number];

export const RELEVANCE_QUERY_GROUPS = [
  'exact-name',
  'category',
  'shop',
  'accented-unaccented',
  'filter',
  'expected-zero',
  'irrelevant',
  'explicit-sort',
] as const;
export type RelevanceQueryGroup = (typeof RELEVANCE_QUERY_GROUPS)[number];

export interface RelevanceQueryFilters {
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  rating?: number | null;
  location?: string | null;
  availability?: 'in-stock' | null;
  promotion?: 'discounted' | null;
}

export interface RelevanceQueryDefinition {
  id: string;
  group: RelevanceQueryGroup;
  query: string | null;
  sort: CatalogSort;
  filters: RelevanceQueryFilters;
  expectedZero: boolean;
  targetProductIds?: string[];
  benchmark?: boolean;
  evaluateRelevance?: boolean;
}

export interface RelevanceJudgment {
  queryId: string;
  productId: string;
  relevance: RelevanceLabel;
  reason: string;
}

export interface RelevanceSnapshotProduct {
  id: string;
  name: string;
  description: string;
  categorySlug: string;
  categoryName: string;
  categoryPathSlugs: string[];
  categoryPathNames: string[];
  shopSlug: string;
  shopName: string;
  location: string;
  effectivePriceMinor: number;
  soldCount: number;
  ratingAverageBasisPoints: number;
  ratingCount: number;
  inventoryAvailable: number;
  promotionActive: boolean;
  productCreatedAt: string;
  productUpdatedAt: string;
  displayable: true;
}

export interface RelevanceSnapshot {
  version: string;
  snapshotId: string;
  capturedAt: string;
  productCount: number;
  sha256: string;
  products: RelevanceSnapshotProduct[];
}

export interface RelevanceDataset {
  datasetVersion: string;
  generatedAt: string;
  source: {
    kind: 'postgresql-catalogue';
    snapshotId: string;
    snapshotSha256: string;
  };
  queries: RelevanceQueryDefinition[];
  judgments: RelevanceJudgment[];
}

export function canonicalSnapshotProducts(
  products: readonly RelevanceSnapshotProduct[],
): RelevanceSnapshotProduct[] {
  return [...products]
    .map((product) => ({ ...product }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function snapshotSha256(products: readonly RelevanceSnapshotProduct[]): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalSnapshotProducts(products)))
    .digest('hex');
}

export interface EvaluationRun {
  queryId: string;
  ids: string[];
  totalItems: number;
  latencyMs: number;
}

export interface QueryMetricSnapshot {
  ndcgAt10: number | null;
  mrr: number | null;
  exactNameTopOne: number | null;
  irrelevantTopTenRate: number | null;
}

export interface GroupMetricSnapshot {
  queryCount: number;
  ndcgAt10: number | null;
  mrr: number | null;
  exactNameTopOne: number | null;
  irrelevantTopTenRate: number | null;
  unexpectedZeroRate: number;
}

export interface BaselineMetricSnapshot {
  queryCount: number;
  ndcgAt10: number | null;
  mrr: number | null;
  exactNameTopOne: number | null;
  irrelevantTopTenRate: number | null;
  unexpectedZeroRate: number;
  groups: Record<string, GroupMetricSnapshot>;
}

export interface MetricComparison {
  postgres: number | null;
  elasticsearch: number | null;
  delta: number | null;
}

export interface SortViolation {
  queryId: string;
  productId: string;
  previousProductId: string;
  sort: CatalogSort;
  previousValue: number | string;
  value: number | string;
}

export interface EvaluationGateSnapshot {
  passed: boolean;
  reason: string;
  queryIds?: string[];
}

export interface EvaluationReport {
  datasetVersion: string;
  snapshotId: string;
  generatedAt: string;
  postgres: BaselineMetricSnapshot;
  elasticsearch: BaselineMetricSnapshot;
  comparisons: {
    ndcgAt10: MetricComparison;
    mrr: MetricComparison;
    exactNameTopOne: MetricComparison;
    irrelevantTopTenRate: MetricComparison;
    unexpectedZeroRate: MetricComparison;
  };
  gates: {
    snapshot: EvaluationGateSnapshot;
    sellability: EvaluationGateSnapshot;
    explicitSort: EvaluationGateSnapshot;
    unexpectedZero: EvaluationGateSnapshot;
    groupRegression: EvaluationGateSnapshot;
  };
  targetGates: {
    ndcgAt10: { actual: number | null; required: number; passed: boolean };
    mrr: { actual: number | null; required: number; passed: boolean };
    exactNameTopOne: { actual: number | null; required: number; passed: boolean };
    irrelevantTopTenRate: { actual: number | null; required: number; passed: boolean };
  };
  operational?: {
    profile: {
      iterations: number;
      warmupIterations: number;
      queryCount: number;
    };
    elasticsearchQuery: LatencySnapshot;
    postgresApi: LatencySnapshot;
    elasticsearchApi: LatencySnapshot;
    fallbackApi: LatencySnapshot;
    latencyTargets: {
      elasticsearchQueryP95Ms: { actual: number | null; target: number; passed: boolean };
      postgresApiP95Ms: { actual: number | null; target: number; passed: boolean };
      elasticsearchApiP95Ms: { actual: number | null; target: number; passed: boolean };
      fallbackApiP95Ms: { actual: number | null; target: number; passed: boolean };
    };
    indexFreshness: {
      index: string | null;
      documentCount: number;
      recentChangedDocumentCount: number;
      p95PropagationSeconds: number | null;
      maxPropagationSeconds: number | null;
      p95AgeSeconds: number | null;
      maxAgeSeconds: number | null;
      staleDocumentCount: number;
      checkpointAgeSeconds: number | null;
      targetSeconds: number;
      passed: boolean;
    };
  };
}

export interface LatencySnapshot {
  sampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}

function average(values: readonly (number | null)[]): number | null {
  const present = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function gain(relevance: number): number {
  return 2 ** relevance - 1;
}

function discountedCumulativeGain(relevances: readonly number[]): number {
  return relevances.reduce((total, relevance, index) => {
    return total + gain(relevance) / Math.log2(index + 2);
  }, 0);
}

function judgmentsForQuery(
  judgments: readonly RelevanceJudgment[],
  queryId: string,
): Map<string, RelevanceLabel> {
  return new Map(
    judgments
      .filter((judgment) => judgment.queryId === queryId)
      .map((judgment) => [judgment.productId, judgment.relevance]),
  );
}

function metricForQuery(
  query: RelevanceQueryDefinition,
  run: EvaluationRun,
  judgments: readonly RelevanceJudgment[],
): QueryMetricSnapshot {
  if (query.evaluateRelevance === false || query.group === 'explicit-sort') {
    return { ndcgAt10: null, mrr: null, exactNameTopOne: null, irrelevantTopTenRate: null };
  }

  const byProduct = judgmentsForQuery(judgments, query.id);
  const topTen = run.ids.slice(0, 10);
  const returnedRelevances = topTen.map((id) => byProduct.get(id) ?? 0);
  const idealRelevances = [...byProduct.values()].sort((left, right) => right - left).slice(0, 10);
  const idealDcg = discountedCumulativeGain(idealRelevances);
  const ndcgAt10 = idealDcg > 0 ? discountedCumulativeGain(returnedRelevances) / idealDcg : null;
  const firstRelevantIndex = run.ids.findIndex((id) => (byProduct.get(id) ?? 0) >= 2);
  const hasPositiveJudgment = [...byProduct.values()].some((value) => value >= 2);
  const mrr = hasPositiveJudgment
    ? firstRelevantIndex >= 0
      ? 1 / (firstRelevantIndex + 1)
      : 0
    : null;
  const exactNameTopOne = query.targetProductIds?.length
    ? query.targetProductIds.includes(run.ids[0] ?? '')
      ? 1
      : 0
    : null;
  const irrelevantTopTenRate =
    query.group === 'irrelevant'
      ? topTen.length
        ? returnedRelevances.filter((value) => value === 0).length / topTen.length
        : 0
      : null;

  return { ndcgAt10, mrr, exactNameTopOne, irrelevantTopTenRate };
}

export function computeBaselineMetrics(
  queries: readonly RelevanceQueryDefinition[],
  runs: readonly EvaluationRun[],
  judgments: readonly RelevanceJudgment[],
): BaselineMetricSnapshot {
  const runByQuery = new Map(runs.map((run) => [run.queryId, run]));
  const positiveQueryIds = new Set(
    judgments.filter((judgment) => judgment.relevance >= 2).map((judgment) => judgment.queryId),
  );
  const groupValues = new Map<string, QueryMetricSnapshot[]>();
  const queryMetrics = queries.flatMap((query) => {
    const run = runByQuery.get(query.id);
    if (!run) return [];
    const metrics = metricForQuery(query, run, judgments);
    const values = groupValues.get(query.group) ?? [];
    values.push(metrics);
    groupValues.set(query.group, values);
    return [{ query, run, metrics }];
  });

  const groups = Object.fromEntries(
    [...groupValues.entries()].map(([group, values]) => {
      const queryIds = queryMetrics
        .filter((entry) => entry.query.group === group)
        .map((entry) => entry.query.id);
      const unexpectedZero = queryMetrics.filter(
        (entry) =>
          entry.query.group === group &&
          !entry.query.expectedZero &&
          entry.query.group !== 'irrelevant' &&
          positiveQueryIds.has(entry.query.id) &&
          entry.run.totalItems === 0,
      ).length;
      return [
        group,
        {
          queryCount: queryIds.length,
          ndcgAt10: average(values.map((value) => value.ndcgAt10)),
          mrr: average(values.map((value) => value.mrr)),
          exactNameTopOne: average(values.map((value) => value.exactNameTopOne)),
          irrelevantTopTenRate: average(values.map((value) => value.irrelevantTopTenRate)),
          unexpectedZeroRate: queryIds.length ? unexpectedZero / queryIds.length : 0,
        } satisfies GroupMetricSnapshot,
      ];
    }),
  );

  const unexpectedZeroQueries = queryMetrics.filter(
    (entry) =>
      !entry.query.expectedZero &&
      entry.query.group !== 'irrelevant' &&
      positiveQueryIds.has(entry.query.id) &&
      entry.run.totalItems === 0,
  ).length;
  return {
    queryCount: queryMetrics.length,
    ndcgAt10: average(queryMetrics.map((entry) => entry.metrics.ndcgAt10)),
    mrr: average(queryMetrics.map((entry) => entry.metrics.mrr)),
    exactNameTopOne: average(queryMetrics.map((entry) => entry.metrics.exactNameTopOne)),
    irrelevantTopTenRate: average(queryMetrics.map((entry) => entry.metrics.irrelevantTopTenRate)),
    unexpectedZeroRate: queryMetrics.length ? unexpectedZeroQueries / queryMetrics.length : 0,
    groups,
  };
}

export function computeMetricComparison(
  postgres: number | null,
  elasticsearch: number | null,
): MetricComparison {
  return {
    postgres,
    elasticsearch,
    delta: postgres !== null && elasticsearch !== null ? elasticsearch - postgres : null,
  };
}

export function compareGroupMetric(
  postgres: BaselineMetricSnapshot,
  elasticsearch: BaselineMetricSnapshot,
  metric: keyof Pick<
    GroupMetricSnapshot,
    'ndcgAt10' | 'mrr' | 'exactNameTopOne' | 'irrelevantTopTenRate' | 'unexpectedZeroRate'
  >,
  tolerance = 0.05,
): { passed: boolean; group?: string; postgres: number | null; elasticsearch: number | null } {
  for (const group of new Set([
    ...Object.keys(postgres.groups),
    ...Object.keys(elasticsearch.groups),
  ])) {
    const left = postgres.groups[group]?.[metric] ?? null;
    const right = elasticsearch.groups[group]?.[metric] ?? null;
    if (left === null || right === null) continue;
    const lowerIsBetter = metric === 'irrelevantTopTenRate' || metric === 'unexpectedZeroRate';
    const regressed = lowerIsBetter ? right > left + tolerance : right < left - tolerance;
    if (regressed) return { passed: false, group, postgres: left, elasticsearch: right };
  }
  return { passed: true, postgres: null, elasticsearch: null };
}

export function validateExplicitSort(
  queries: readonly RelevanceQueryDefinition[],
  runs: readonly EvaluationRun[],
  products: readonly RelevanceSnapshotProduct[],
): SortViolation[] {
  const productById = new Map(products.map((product) => [product.id, product]));
  const runByQuery = new Map(runs.map((run) => [run.queryId, run]));
  const violations: SortViolation[] = [];
  for (const query of queries) {
    if (query.sort === 'relevance') continue;
    const run = runByQuery.get(query.id);
    if (!run) continue;
    const values = run.ids.flatMap((id) => {
      const product = productById.get(id);
      if (!product) return [];
      const value: number | string =
        query.sort === 'price-asc' || query.sort === 'price-desc'
          ? product.effectivePriceMinor
          : query.sort === 'best-selling'
            ? product.soldCount
            : product.productCreatedAt;
      return [{ id, value }];
    });
    for (let index = 1; index < values.length; index += 1) {
      const previous = values[index - 1]!;
      const current = values[index]!;
      const previousValue = previous.value;
      const currentValue = current.value;
      const comparison =
        typeof previousValue === 'number' && typeof currentValue === 'number'
          ? currentValue - previousValue
          : String(currentValue).localeCompare(String(previousValue));
      const violation =
        query.sort === 'price-asc'
          ? comparison < 0
          : query.sort === 'price-desc' || query.sort === 'best-selling' || query.sort === 'newest'
            ? comparison > 0
            : false;
      if (violation) {
        violations.push({
          queryId: query.id,
          productId: current.id,
          previousProductId: previous.id,
          sort: query.sort,
          previousValue,
          value: currentValue,
        });
      }
    }
  }
  return violations;
}

export function findNonSellableResults(
  runs: readonly EvaluationRun[],
  products: readonly RelevanceSnapshotProduct[],
): Array<{ queryId: string; productId: string }> {
  const sellable = new Set(
    products.filter((product) => product.displayable).map((product) => product.id),
  );
  return runs.flatMap((run) =>
    run.ids.flatMap((id) => (sellable.has(id) ? [] : [{ queryId: run.queryId, productId: id }])),
  );
}

export function computeTargetGates(
  elasticsearch: BaselineMetricSnapshot,
  postgres: BaselineMetricSnapshot,
): EvaluationReport['targetGates'] {
  const requiredNdcg = Math.min(1, Math.max(0.8, (postgres.ndcgAt10 ?? 0) * 1.1));
  return {
    ndcgAt10: {
      actual: elasticsearch.ndcgAt10,
      required: requiredNdcg,
      passed: elasticsearch.ndcgAt10 !== null && elasticsearch.ndcgAt10 >= requiredNdcg,
    },
    mrr: {
      actual: elasticsearch.mrr,
      required: 0.75,
      passed: elasticsearch.mrr !== null && elasticsearch.mrr >= 0.75,
    },
    exactNameTopOne: {
      actual: elasticsearch.exactNameTopOne,
      required: 0.95,
      passed: elasticsearch.exactNameTopOne !== null && elasticsearch.exactNameTopOne >= 0.95,
    },
    irrelevantTopTenRate: {
      actual: elasticsearch.irrelevantTopTenRate,
      required: 0.1,
      passed:
        elasticsearch.irrelevantTopTenRate !== null && elasticsearch.irrelevantTopTenRate <= 0.1,
    },
  };
}
