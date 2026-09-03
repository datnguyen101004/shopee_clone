# Elasticsearch baseline evaluation

The local baseline evaluator compares the existing PostgreSQL catalogue path with the Elasticsearch baseline on the same versioned product snapshot. It does not load buyer profiles, train a model, or enable personalized ranking.

## Runbook

1. Start PostgreSQL and Elasticsearch:

   ```bash
   docker compose --profile search up -d --wait
   ```

2. Apply the checkpoint migration and generate the Prisma client:

   ```bash
   pnpm db:migrate:deploy
   pnpm db:generate
   ```

3. Make sure the Elasticsearch alias is ready. For a new or changed mapping, rebuild it:

   ```bash
   pnpm search:reindex
   ```

4. Generate a new, versioned relevance fixture from the current displayable PostgreSQL catalogue when the catalogue snapshot intentionally changes:

   ```bash
   pnpm search:relevance:dataset
   ```

5. Run the evaluator:

   ```bash
   pnpm search:baseline:evaluate
   ```

The JSON report is written to `.runtime/search-baseline-evaluation/latest.json`, which is intentionally ignored as a local runtime artifact. Set `SEARCH_EVALUATION_BENCHMARK_ITERATIONS` and `SEARCH_EVALUATION_BENCHMARK_WARMUP` to override the default five measured iterations and one warm-up iteration. Set `SEARCH_EVALUATION_ENFORCE_TARGETS=true` when the aggregate target metrics should also fail the command; hard invariant gates always fail the command.

## Dataset and labels

`data/search/relevance/v1` contains a catalogue snapshot and a reviewable query/judgment fixture. The snapshot is a copy of real displayable PostgreSQL product metadata, not synthetic products. Queries cover exact names, categories, shops, accented/unaccented Vietnamese text, filters, expected-zero cases, intentionally irrelevant terms, and explicit sorts. Missing judgments mean relevance `0`; labels are `0` irrelevant, `1` weak, `2` relevant, and `3` strong/target.

## Metrics and release gates

The report includes NDCG@10, MRR, exact-name top-one rate, irrelevant top-ten rate, unexpected-zero rate, and the same metrics grouped by query family. Elasticsearch is compared with PostgreSQL on the same query set. A hard failure is raised for snapshot drift, a non-sellable hit, an explicit-sort violation, an Elasticsearch zero-result increase where PostgreSQL has results, or a query-group regression greater than five percentage points.

The baseline target report is NDCG@10 `>= max(0.80, PostgreSQL × 1.10)`, MRR `>= 0.75`, exact-name top-one `>= 95%`, and irrelevant top-ten `<= 10%`. These aggregate targets are reported separately from zero-tolerance invariants so local data quality can be reviewed before enforcing them.

The benchmark measures Elasticsearch query p95, full PostgreSQL and Elasticsearch catalogue API p95, an intentionally unavailable-Elasticsearch fallback API p95, and index freshness. The design targets are Elasticsearch query p95 `<= 150 ms`, PostgreSQL API p95 `<= 300 ms`, personalized API/homepage p95 `<= 400 ms` (not exercised by this baseline), and propagation p95 `<= 30 seconds` for products changed inside the configured reconciliation window. If there are no recent changes, the report records that the propagation sample is empty instead of treating the age of the full rebuild as a violation.
