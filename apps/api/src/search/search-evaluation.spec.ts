import {
  compareGroupMetric,
  computeBaselineMetrics,
  computeTargetGates,
  findNonSellableResults,
  validateExplicitSort,
  type EvaluationRun,
  type RelevanceJudgment,
  type RelevanceQueryDefinition,
  type RelevanceSnapshotProduct,
} from './search-evaluation';

const product = (
  id: string,
  overrides: Partial<RelevanceSnapshotProduct> = {},
): RelevanceSnapshotProduct => ({
  id,
  name: id,
  description: '',
  categorySlug: 'electronics',
  categoryName: 'Thiết bị điện tử',
  categoryPathSlugs: ['electronics'],
  categoryPathNames: ['Thiết bị điện tử'],
  shopSlug: 'shop',
  shopName: 'Shop',
  location: 'Hà Nội',
  effectivePriceMinor: 100,
  soldCount: 1,
  ratingAverageBasisPoints: 400,
  ratingCount: 1,
  inventoryAvailable: 1,
  promotionActive: false,
  productCreatedAt: '2026-01-01T00:00:00.000Z',
  productUpdatedAt: '2026-01-01T00:00:00.000Z',
  displayable: true,
  ...overrides,
});

const query = (overrides: Partial<RelevanceQueryDefinition> = {}): RelevanceQueryDefinition => ({
  id: 'q1',
  group: 'exact-name',
  query: 'phone',
  sort: 'relevance',
  filters: {},
  expectedZero: false,
  targetProductIds: ['p1'],
  ...overrides,
});

describe('search baseline evaluation', () => {
  it('computes graded ranking metrics and exact-name top-one', () => {
    const queries = [query()];
    const judgments: RelevanceJudgment[] = [
      { queryId: 'q1', productId: 'p1', relevance: 3, reason: 'exact' },
      { queryId: 'q1', productId: 'p2', relevance: 1, reason: 'weak' },
    ];
    const metrics = computeBaselineMetrics(
      queries,
      [{ queryId: 'q1', ids: ['p1', 'p2'], totalItems: 2, latencyMs: 4 }],
      judgments,
    );
    expect(metrics.ndcgAt10).toBe(1);
    expect(metrics.mrr).toBe(1);
    expect(metrics.exactNameTopOne).toBe(1);
  });

  it('marks an unexpected zero only when PostgreSQL has results', () => {
    const queries = [query()];
    const judgments: RelevanceJudgment[] = [
      { queryId: 'q1', productId: 'p1', relevance: 3, reason: 'exact' },
    ];
    const postgres = computeBaselineMetrics(
      queries,
      [{ queryId: 'q1', ids: ['p1'], totalItems: 1, latencyMs: 1 }],
      judgments,
    );
    const elasticsearch = computeBaselineMetrics(
      queries,
      [{ queryId: 'q1', ids: [], totalItems: 0, latencyMs: 1 }],
      judgments,
    );
    expect(postgres.unexpectedZeroRate).toBe(0);
    expect(elasticsearch.unexpectedZeroRate).toBe(1);
  });

  it('detects non-sellable hits and explicit-sort violations', () => {
    const products = [
      product('p1', { effectivePriceMinor: 200 }),
      product('p2', { effectivePriceMinor: 100 }),
    ];
    const runs: EvaluationRun[] = [
      { queryId: 'sort', ids: ['p1', 'p2', 'missing'], totalItems: 3, latencyMs: 1 },
    ];
    expect(findNonSellableResults(runs, products)).toEqual([
      { queryId: 'sort', productId: 'missing' },
    ]);
    expect(
      validateExplicitSort(
        [query({ id: 'sort', query: null, sort: 'price-asc', evaluateRelevance: false })],
        runs,
        products,
      ),
    ).toHaveLength(1);
  });

  it('detects query-group regression and reports baseline target gates', () => {
    const queries = [query({ id: 'q1' }), query({ id: 'q2', targetProductIds: ['p2'] })];
    const judgments: RelevanceJudgment[] = [
      { queryId: 'q1', productId: 'p1', relevance: 3, reason: 'exact' },
      { queryId: 'q2', productId: 'p2', relevance: 3, reason: 'exact' },
    ];
    const postgres = computeBaselineMetrics(
      queries,
      [
        { queryId: 'q1', ids: ['p1'], totalItems: 1, latencyMs: 1 },
        { queryId: 'q2', ids: ['p2'], totalItems: 1, latencyMs: 1 },
      ],
      judgments,
    );
    const elasticsearch = computeBaselineMetrics(
      queries,
      [
        { queryId: 'q1', ids: [], totalItems: 0, latencyMs: 1 },
        { queryId: 'q2', ids: ['p2'], totalItems: 1, latencyMs: 1 },
      ],
      judgments,
    );
    expect(compareGroupMetric(postgres, elasticsearch, 'mrr').passed).toBe(false);
    const targets = computeTargetGates(elasticsearch, postgres);
    expect(targets.exactNameTopOne.actual).toBe(0.5);
    expect(targets.mrr.actual).toBe(0.5);
  });
});
