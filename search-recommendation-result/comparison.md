# Search ranking improvement result

Comparison of the same `v1` relevance fixture before and after the exact-shop-match ranking change.

- Dataset snapshot: `catalogue-v1-20260902162225`
- Products: `1,366`
- Queries: `45`
- Judgments: `2,773`
- Benchmark profile: `5` measured iterations, `1` warm-up, `13` benchmark queries
- PostgreSQL is the unchanged baseline in both runs.

## Ranking change

The previous `shop_name^45` match was supplemented with exact normalized and exact literal shop clauses. They use `constant_score` so the exact-shop signal is not diluted by BM25 field scoring:

- `shop_name_normalized` exact match: boost `10,000`
- `shop_name.exact` exact match: boost `10,000`
- `shop_name` phrase match: boost `180`
- `shop_name` token match: boost `90`

The clauses are only relevant to `sort=relevance`; explicit primary sorts remain unchanged.

## Run 1 — before improvement

Report: `.runtime/search-baseline-evaluation/baseline-20260902165202.json`

| Metric | PostgreSQL | Elasticsearch | Delta (ES - PG) |
| --- | ---: | ---: | ---: |
| NDCG@10 | 0.9696945725 | 0.9934992417 | +0.0238046692 |
| MRR | 0.9722222222 | 1.0000000000 | +0.0277777778 |
| Exact-name top-one | 0.9090909091 (90.91%) | 1.0000000000 (100%) | +0.0909090909 |
| Irrelevant top-ten rate | 0 | 0 | 0 |
| Unexpected-zero rate | 0 | 0 | 0 |

Group NDCG@10 for Elasticsearch:

- exact-name: `1.0000000000`
- accented-unaccented: `1.0000000000`
- category: `1.0000000000`
- shop: `0.9707465876`
- filter: `1.0000000000`
- explicit-sort, expected-zero, irrelevant: not included in NDCG aggregate

Latency (`p50 / p95 / max`, milliseconds):

| Path | Run 1 |
| --- | ---: |
| Elasticsearch query | `18.10 / 34.66 / 42.04` |
| PostgreSQL catalogue API | `307.17 / 374.64 / 427.61` |
| Elasticsearch catalogue API | `35.42 / 46.95 / 60.57` |
| Elasticsearch-unavailable fallback API | `297.56 / 375.58 / 430.47` |

Gates:

- Hard gates: **pass**
- NDCG target: `0.9934992417 / 1.0000000000` — not met
- MRR, exact-name and irrelevant-rate targets: **pass**
- Index documents: `1,366`; stale documents: `0`

## Run 2 — after improvement

Report: `.runtime/search-baseline-evaluation/baseline-20260902170510.json`

| Metric | PostgreSQL | Elasticsearch | Delta (ES - PG) |
| --- | ---: | ---: | ---: |
| NDCG@10 | 0.9696945725 | 0.9962557397 | +0.0265611672 |
| MRR | 0.9722222222 | 1.0000000000 | +0.0277777778 |
| Exact-name top-one | 0.9090909091 (90.91%) | 1.0000000000 (100%) | +0.0909090909 |
| Irrelevant top-ten rate | 0 | 0 | 0 |
| Unexpected-zero rate | 0 | 0 | 0 |

Group NDCG@10 for Elasticsearch:

- exact-name: `1.0000000000`
- accented-unaccented: `1.0000000000`
- category: `1.0000000000`
- shop: `0.9831508287`
- filter: `1.0000000000`
- explicit-sort, expected-zero, irrelevant: not included in NDCG aggregate

Latency (`p50 / p95 / max`, milliseconds):

| Path | Run 2 |
| --- | ---: |
| Elasticsearch query | `16.04 / 31.52 / 41.29` |
| PostgreSQL catalogue API | `168.13 / 283.07 / 406.06` |
| Elasticsearch catalogue API | `31.01 / 47.61 / 62.92` |
| Elasticsearch-unavailable fallback API | `173.85 / 293.84 / 411.81` |

Gates:

- Hard gates: **pass**
- NDCG target: `0.9962557397 / 1.0000000000` — not met
- MRR, exact-name and irrelevant-rate targets: **pass**
- Index documents: `1,366`; stale documents: `0`

## Run 3 — after phrase/token shop tuning

Report: `.runtime/search-baseline-evaluation/baseline-20260902171353.json`

| Metric | PostgreSQL | Elasticsearch | Delta (ES - PG) |
| --- | ---: | ---: | ---: |
| NDCG@10 | 0.9696945725 | 0.9962557397 | +0.0265611672 |
| MRR | 0.9722222222 | 1.0000000000 | +0.0277777778 |
| Exact-name top-one | 0.9090909091 (90.91%) | 1.0000000000 (100%) | +0.0909090909 |
| Irrelevant top-ten rate | 0 | 0 | 0 |
| Unexpected-zero rate | 0 | 0 | 0 |

Group NDCG@10 for Elasticsearch:

- exact-name: `1.0000000000`
- accented-unaccented: `1.0000000000`
- category: `1.0000000000`
- shop: `0.9831508287`
- filter: `1.0000000000`
- explicit-sort, expected-zero, irrelevant: not included in NDCG aggregate

Latency (`p50 / p95 / max`, milliseconds):

| Path | Run 3 |
| --- | ---: |
| Elasticsearch query | `15.06 / 34.10 / 45.05` |
| PostgreSQL catalogue API | `275.10 / 350.42 / 376.97` |
| Elasticsearch catalogue API | `31.84 / 46.73 / 49.83` |
| Elasticsearch-unavailable fallback API | `292.36 / 365.83 / 384.16` |

Gates:

- Hard gates: **pass**
- NDCG target: `0.9962557397 / 1.0000000000` — not met
- MRR, exact-name and irrelevant-rate targets: **pass**
- Index documents: `1,366`; stale documents: `0`

## Change summary

- Overall Elasticsearch NDCG@10: `0.9934992417` → `0.9962557397` (`+0.0027564980`)
- Shop-group NDCG@10: `0.9707465876` → `0.9831508287` (`+0.0124042411`)
- Run 3 phrase/token tuning preserved all Run 2 quality values; no additional aggregate gain was measured.
- Exact-name top-one, MRR, irrelevant rate, zero-result gate and hard gates did not regress.
- The remaining NDCG loss is isolated to `shop-02` (`dat`): per-query NDCG@10 is `0.8652066300`, with top-ten relevance `[3, 3, 2, 2, 2, 2, 2, 0, 0, 0]`. The fixture labels 12 additional products as relevance `2` because `dat` occurs inside unrelated words such as `foundation`; this is a dataset/query-intent limitation rather than an exact-shop matching failure.
