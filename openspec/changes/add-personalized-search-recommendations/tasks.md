## 1. Day 1 — Local Elasticsearch foundation

- [x] 1.1 Add a pinned single-node Elasticsearch service, persistent development volume, bounded JVM memory, and a health check to local Docker Compose.
- [x] 1.2 Add API environment variables and validation for Elasticsearch URL, stable product alias, request timeout, index freshness target, and the three independent feature flags for baseline search, personalization, and daily recommendations.
- [x] 1.3 Add the compatible Elasticsearch client to the NestJS API and expose an adapter-owned connectivity health result without making Elasticsearch a hard application-start dependency.
- [x] 1.4 Define version constants for the product projection, analyzer/mapping, buyer-profile feature schema, model, and stored scoring script.
- [x] 1.5 Add unit tests proving missing, disabled, unhealthy, and healthy Elasticsearch configurations produce the expected readiness and fallback state.

## 2. Day 1 — Product projection and indexing

- [x] 2.1 Define the denormalized product search document from existing product, category, shop, representative offer, promotion, rating, sales, inventory, lifecycle, and timestamp fields while retaining integer minor units and basis points.
- [x] 2.2 Implement the Elasticsearch mapping and Vietnamese analysis chain, including lowercase, diacritic normalization, explicit `đ`/`Đ` normalization, exact-name fields, numeric filter/sort fields, and script-readable document values.
- [x] 2.3 Implement a canonical projection builder that reuses current catalogue sellability and effective-price rules and emits either a complete document or a delete decision.
- [x] 2.4 Implement a full-reindex command that creates a versioned physical index, bulk indexes a consistent catalogue snapshot, verifies counts and invariants, and atomically moves the stable read alias only after success.
- [x] 2.5 Ensure a failed rebuild leaves the active alias unchanged and add a local rollback command or documented alias operation for returning to the previous compatible physical index.
- [x] 2.6 Add persistent versioned indexing checkpoints and an idempotent incremental reconciler for product, inventory, promotion, rating, sales, shop, and category changes.
- [x] 2.7 Handle indirect fan-out and time-based changes by refreshing affected shop/category products, promotion boundaries, and a bounded periodic reconciliation window without advancing checkpoints after failure.
- [x] 2.8 Add projection, mapping, bulk retry, alias-swap, delete, fan-out, and checkpoint tests, including the transition of a sellable product to non-displayable.

## 3. Day 2 — Elasticsearch baseline relevance and catalogue integration

- [x] 3.1 Translate the existing validated catalogue query into Elasticsearch text queries, filters, facets, and normalized pagination without changing the public request or response contract.
- [x] 3.2 Implement relevance ordering with strongest exact/name matching followed by category, shop/attributes, and description, plus bounded popularity, rating-confidence, promotion, and freshness boosts.
- [x] 3.3 Implement deterministic `price-asc`, `price-desc`, `best-selling`, and `newest` sort tuples so personalization and relevance can only break equal primary values and product ID is the final tie-breaker.
- [x] 3.4 Return ordered product IDs and aggregations from Elasticsearch, then hydrate cards in one bounded PostgreSQL query while preserving order and rechecking canonical sellability and displayed commerce values.
- [x] 3.5 Add bounded over-fetch/refill behavior for stale or invalid indexed hits and prevent per-hit PostgreSQL queries.
- [x] 3.6 Route the catalogue endpoint through the Elasticsearch adapter only when the baseline feature flag is enabled, preserving the existing PostgreSQL implementation as the fallback path.
- [x] 3.7 Enforce the Elasticsearch timeout and record privacy-safe outcome, latency, index version, and fallback reason codes without logging raw queries with buyer features or model parameters.
- [x] 3.8 Add integration tests for Vietnamese text with and without diacritics, exact-name priority, every existing filter, every explicit sort, equal-price tie-breaking, facets, stable pagination, and repeated-request determinism.
- [x] 3.9 Add failure tests proving timeout, connection failure, malformed response, and stale invalid hits still return the existing catalogue contract through PostgreSQL fallback.

## 4. Day 2 — Baseline evaluation and operational gates

- [x] 4.1 Create a versioned local relevance dataset with graded labels for exact-name, category, shop, accented/unaccented, filter, expected-zero, and intentionally irrelevant queries against a documented catalogue snapshot.
- [x] 4.2 Implement a repeatable evaluator that runs the current PostgreSQL path and Elasticsearch baseline on the same snapshot and reports NDCG@10, MRR, exact-name top-one rate, irrelevant top-ten rate, unexpected-zero rate, and per-group regressions.
- [x] 4.3 Make the evaluator fail on any sellability violation, explicit-sort violation, unexpected zero-result increase, or important query-group regression over 5%.
- [x] 4.4 Report the baseline target gates: NDCG@10 at least `max(0.80, current × 1.10)`, MRR at least `0.75`, exact-name top-one at least `95%`, and irrelevant top-ten at most `10%`.
- [x] 4.5 Add a documented local benchmark profile and measure Elasticsearch query p95, catalogue API p95, fallback latency, and incremental-index freshness against the design targets.

## 5. Day 3 — Offline buyer profiles and demonstration model

- [x] 5.1 Add additive Prisma persistence for bounded buyer profiles, active/candidate model metadata, ordered feature weights, version compatibility, training source, metrics, and activation status.
- [x] 5.2 Implement the offline profile builder from authenticated recent views, favorites, followed shops, and valid non-cancelled order lines using the configured weights `1`, `3`, `3`, and `5`.
- [x] 5.3 Bound stored category/shop affinities, preferred price features, recent product IDs, and aggregate values; do not copy raw unbounded history or create anonymous profiles.
- [x] 5.4 Enforce profile eligibility score `>= 5`, maximum age `24h`, buyer ownership, and exact feature-schema compatibility, with guests and ineligible buyers resolving to cold-start.
- [x] 5.5 Create versioned seeded impression-like buyer/product examples with labels, ordered pair features, a fixed random seed, and a deterministic train/held-out partition.
- [x] 5.6 Implement a TypeScript logistic-regression training command that emits an intercept, ordered weights, AUC, log-loss, ranking metrics, and reproducible model metadata.
- [x] 5.7 Permit model activation only when its feature schema and stored-script versions match, and label seeded-fixture metrics as demonstration-only until the held-out set contains at least 200 valid positives.
- [x] 5.8 Add tests for deterministic profiles/training, bounded feature storage, cancelled-order exclusion, cold start, stale profiles, cross-buyer isolation, and incompatible model versions.
- [x] 5.9 Add an exact-object S3 clickstream `training.csv` loader with strict handoff validation, pseudonymous example mapping, deterministic dataset metadata, and zero-filled online feature vectors for the MVP baseline.
- [x] 5.10 Wire `recommendations:train` to select `RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI` through ambient AWS credentials while preserving the seeded fixture fallback and candidate-only lifecycle; document the variable and accepted intercept-only trade-off.
- [x] 5.11 Add focused happy-path tests for clickstream CSV parsing, exact S3 object retrieval, deterministic partition suitability, and training-source metadata.
- [x] 5.12 Add privacy-safe product and buyer-profile snapshot contracts, manifest-last S3 writing, and an explicit backend export command that reuses canonical projection/profile semantics and the clickstream pseudonym identity.
- [x] 5.13 Extend the daily Glue transform with committed snapshot discovery, backward as-of joins, compatibility checks, and deterministic generation of the sixteen online ranking features.
- [x] 5.14 Extend the S3 training loader and model metadata to accept the enriched CSV as a snapshot-backed clickstream source that learns feature weights while remaining candidate-only.
- [x] 5.15 Add focused unit tests for snapshot privacy/serialization, feature formulas, as-of selection, enriched CSV parsing/training, and document the required export-before-04:00 happy path and trade-offs.
- [x] 5.16 Replace per-buyer activity rebuilds with bounded pagination over materialized buyer profiles changed in `(since, cutoff]`, carry their original generation time, extend profile usability to thirty days, and keep one complete source-day product snapshot plus pseudonymous buyer delta manifests.
- [x] 5.17 Change Glue to resolve only the source-day product snapshot, source-day buyer delta, and immediately previous compacted buyer state; merge unchanged buyers forward and join by keyed lookup/Spark operations without scanning all snapshot history per impression.
- [x] 5.18 Make each daily training CSV create-once, update a fixed manifest with at most thirty exact daily URIs, prune compacted buyer profiles older than thirty days, and expire processed interactions, daily training, and snapshot objects after thirty-five days.
- [x] 5.19 Add daily warm-start training from only the newest unconsumed dataset plus an explicit full thirty-day mode, preserving exact input/base-model metadata and candidate-only activation.
- [x] 5.20 Add focused tests and documentation for bounded daily reads, inactive-buyer carry-forward, one-time daily output, fixed manifest size, incremental model initialization, and the Glue cost formula/trade-offs.

## 6. Day 3 — Personalized search scoring

- [x] 6.1 Implement and bootstrap one versioned stored Painless script that derives bounded consumer-product pair features, applies the active logistic weights, computes `sigmoid(z)`, and always returns a finite non-negative score.
- [x] 6.2 Pass only the compatible active model and bounded authenticated buyer profile as runtime parameters; read product profile values from Elasticsearch documents and score only already filtered candidates.
- [x] 6.3 Add optional authenticated context to catalogue search while keeping guest requests public and preserving existing invalid-credential behavior.
- [x] 6.4 Apply personalized scoring only to `sort=relevance`; for explicit sorts, use it only after equal primary sort values and never move a higher-priced product ahead of a lower-priced product under `price-asc`.
- [x] 6.5 Implement the fallback chain `personalized Elasticsearch → baseline Elasticsearch → existing PostgreSQL search` for profile timeout/miss, version mismatch, missing model, script failure, Elasticsearch timeout, and disabled flags.
- [x] 6.6 If required by the current session-loading flow, add a bounded authenticated storefront refresh that reuses the existing catalogue contract and components without introducing a UI/UX redesign.
- [x] 6.7 Add tests using at least two distinct eligible buyers plus guest and cold-start cases to prove buyer-dependent relevance, deterministic ordering, identity isolation, explicit-sort invariants, and every fallback layer.

## 7. Day 3 — Homepage daily recommendations

- [x] 7.1 Reuse the search candidate and scoring boundary only for `DAILY_RECOMMENDATIONS`, with an eligible candidate pool and separate enablement from search personalization.
- [x] 7.2 Implement the guest/cold-start baseline from best-selling, rating confidence, and freshness, and apply personalized scoring only when profile, model, script, and index versions are compatible.
- [x] 7.3 Return at most 24 unique sellable products while deterministically enforcing at most three products per shop and at most six products per category; return the available subset rather than relaxing sellability.
- [x] 7.4 Preserve the current Flash Sale, Top Selling, Mall, other curated homepage modules, and product-detail related-products path without changing their ordering or contracts.
- [x] 7.5 Implement the homepage fallback chain from personalized recommendations to baseline recommendations to the existing curated/PostgreSQL resolution without hiding unrelated modules.
- [x] 7.6 Add tests for eligible buyer, guest, cold start, diversity caps, insufficient candidates, stale indexed products, profile/script/Elasticsearch failure, and unchanged non-daily modules and related products.

## 8. Final verification and local handoff

- [ ] 8.1 Run the relevant formatting, lint, type-check, unit, integration, migration, and production-build checks for API, web, shared contracts, and Docker configuration.
- [ ] 8.2 From a clean local dependency state, start PostgreSQL and Elasticsearch, apply migrations, bootstrap mappings/scripts, run full reindex, run incremental reconciliation, generate profiles, train/activate the demo model, and exercise search plus homepage flows.
- [ ] 8.3 Run the baseline and personalized evaluation reports, record all gate results, and block local activation on any sellability or explicit-sort violation.
- [ ] 8.4 Run failure drills for disabled Elasticsearch, unavailable Elasticsearch, profile timeout, incompatible model, and stored-script failure, confirming a non-empty eligible fallback whenever the existing PostgreSQL path can serve one.
- [ ] 8.5 Add a high-level architecture diagram and local runbook covering offline indexing/profile/training flows, the online Elasticsearch selection-and-ranking path, feature flags, observability, fallback order, rebuild, and rollback.
- [ ] 8.6 Record any deferred work explicitly, including related-product personalization, anonymous profiles, real impression capture, production retraining/promotion, semantic search, and production A/B experimentation.
