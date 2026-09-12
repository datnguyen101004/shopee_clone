## Context

See `proposal.md` for motivation and the two delta specs for observable behavior. The current NestJS catalogue service reads all displayable products from PostgreSQL, maps representative offers in application memory, computes a fixed token score, filters, sorts, and slices the page. The public Next.js search route calls this endpoint without buyer identity; authenticated engagement already records bounded favorites and recently viewed products, followed shops are persisted, and valid orders are available, but search impressions and durable model artifacts do not exist.

The change crosses Docker Compose, PostgreSQL/Prisma, catalogue/homepage/auth boundaries, background processing, Elasticsearch, shared contracts, server/client data loading, and verification. It must remain a modular-monolith change: no separate online inference service, PostgreSQL remains authoritative, and failure of the new dependency cannot remove search results.

## Goals / Non-Goals

**Goals:**

- Establish an optional local Elasticsearch dependency with repeatable bootstrap, readiness, and bounded failure behavior.
- Build one versioned product projection that supports keyword candidate selection, current filters/sorts, baseline quality signals, and personalized script scoring.
- Preserve canonical product eligibility and displayed commerce values by hydrating ranked identifiers through the existing catalogue boundary before returning cards.
- Demonstrate a deterministic offline buyer-profile and logistic-regression lifecycle using local versioned fixtures, without representing fixture metrics as production evidence.
- Keep baseline and personalized ranking independently disableable and measurable.

**Non-Goals:**

- UI/UX redesign or separate UI/UX specification.
- Product-detail related-product migration, vector/semantic search, typo correction, autocomplete, or geospatial service areas.
- Anonymous profiles, cross-device guest identity, real-time feature streaming, production experimentation, or automatic production model promotion.
- Making Elasticsearch authoritative for price, stock, promotion, moderation, shop state, or product lifecycle.

## Decisions

### 1. Keep search, profiles, training, and ranking inside the NestJS modular monolith

Add a capability-oriented search boundary with adapters for Elasticsearch, product projection/indexing, buyer profiles, model metadata, and evaluation. Catalogue and homepage consume its public interfaces; they do not build query DSL or access model tables directly. Offline commands and scheduled work reuse the API application runtime and PostgreSQL connection.

A separate search or ML service was rejected because the local three-day target, deployment model, and current ownership do not justify an additional runtime. Executing the logistic formula in a stored Elasticsearch script satisfies online ranking without another network hop.

### 2. Treat Elasticsearch as optional, version-pinned local infrastructure

Docker Compose adds a single-node Elasticsearch service with a pinned compatible image, persistent local volume, health check, bounded memory, and development-safe security configuration. API configuration exposes endpoint, index alias, request timeout, enablement flags, and freshness settings; missing or unhealthy Elasticsearch degrades readiness detail but does not prevent the API from starting because PostgreSQL fallback is required.

Allowing an unpinned latest image was rejected because mapping, client, and Painless behavior must be reproducible. Making Elasticsearch a hard application-start dependency was rejected because it would violate search continuity.

### 3. Use versioned physical indexes behind a stable read alias

The read path targets a stable alias such as `products-search`. Full reindex creates a new physical index containing mapping and projection versions, bulk indexes a consistent product snapshot, verifies counts/invariants, atomically swaps the alias, and only then retires the prior local index. A failed rebuild leaves the existing alias untouched.

In-place destructive mapping changes were rejected because partial failure can leave an unusable index. A stable alias also makes rollback a metadata operation rather than a full rebuild.

### 4. Store a denormalized product projection optimized for filtering and scoring

Each document is keyed by canonical product ID and includes searchable product name/description, category identity/path, selected product attributes, shop identity/name/location, representative effective price, compare-at price, discount signal, rating average/count, sold count, available quantity, lifecycle flags, and timestamps. Numeric values use the same integer-minor-unit and basis-point conventions as PostgreSQL.

The text analysis chain lowercases, removes Vietnamese diacritics, explicitly normalizes `đ`/`Đ`, and retains exact keyword subfields. Relevance uses strongest boosts for exact/name matches, then category, shop/attributes, and finally description. Popularity uses a logarithmic transform; rating uses confidence/count rather than raw average; freshness and promotion boosts remain bounded.

Indexing only IDs was rejected because selection, filters, aggregations, and script scoring need document values. Returning Elasticsearch documents as authoritative cards was also rejected because indexed price and stock are eventually consistent.

### 5. Hydrate ranked IDs through PostgreSQL before returning catalogue cards

Elasticsearch selects, scores, sorts, and returns an over-fetched ordered list of IDs plus aggregations. The catalogue repository loads those products in one bounded query, applies the established sellability and representative-offer mapping, preserves Elasticsearch order, and drops stale invalid hits. The search adapter requests additional candidates within a bounded window when hydration removes hits, rather than exposing invalid cards.

This two-stage read adds a database query but protects current business invariants and enables PostgreSQL fallback. Duplicating complete commerce authority in Elasticsearch was rejected as unsafe; rechecking every candidate individually was rejected as an N+1 pattern.

### 6. Preserve query semantics and use deterministic explicit-sort tuples

The existing catalogue parser and response contract remain the boundary. For relevance, Elasticsearch uses keyword score plus bounded static signals and, when eligible, personalized score. Explicit sort tuples are:

- `price-asc`: effective price ascending, text relevance descending when a query exists, personalized score descending when eligible, quality descending, created time descending, product ID ascending.
- `price-desc`: the same tuple with effective price descending.
- `best-selling`: sold count descending, then text/personalized/quality/freshness/ID tie-breaks.
- `newest`: created time descending, then text/personalized/quality/ID tie-breaks.

Personalization therefore never moves a product across unequal explicit primary values. Deterministic ID is always the final tie-breaker. Deep recommendation pagination uses `search_after`; the existing page-number catalogue API may use bounded `from/size` within its current maximum until its public contract changes.

### 7. Use idempotent incremental reconciliation plus full rebuild for the local MVP

Full reindex is the recovery and schema-migration mechanism. A scheduled incremental reconciler uses versioned checkpoints and changed product/entity timestamps to find affected product IDs, recompute complete documents, and bulk upsert/delete them. Shop/category changes fan out to their products; inventory, promotion boundaries, ratings, and sales changes cause product refresh. Failures retain the prior checkpoint and are retried; a periodic bounded reconciliation repairs missed change notifications.

A fully transactional cross-capability outbox is the preferred later hardening, but it is not required for the three-day local MVP. Direct indexing inside business transactions was rejected because Elasticsearch cannot participate in PostgreSQL atomicity and would increase mutation latency.

### 8. Store bounded versioned buyer profiles in PostgreSQL

A profile row contains buyer ID, feature-schema version, profile version, updated time, qualifying behavior score, bounded top category/shop affinities, preferred price range, recent product IDs, and aggregate preference features. The offline profile job reads authenticated views, favorites, followed shops, and non-cancelled valid order lines. It stores aggregates rather than duplicating raw histories.

The initial eligibility score is: view `1`, favorite `3`, followed shop `3`, and valid order `5`; personalization requires score `>= 5`, a profile no older than thirty days, and matching feature versions. Thirty days preserves personalization across short absences without keeping a profile indefinitely; the accepted trade-off is that features may be stale until the buyer next changes or the profile expires. These are configuration constants covered by tests, not token/session claims. Guests, expired profiles, and sparse profiles use baseline ranking.

Computing the full profile during each search was rejected for latency and query fan-out. Storing profile contents in access tokens or browser storage was rejected for privacy, staleness, and token-size reasons.

### 9. Train a deterministic demonstration logistic model offline

A versioned local fixture represents impression-like buyer/product pairs with labels and feature values. A TypeScript training command uses a fixed seed and time/fixture partition, emits intercept and ordered feature weights, evaluates log-loss/AUC/ranking metrics, and stores model metadata and weights in PostgreSQL. Activation requires matching feature-schema and scoring-script versions. Real impression capture and production-quality retraining remain future work.

Generating negative labels from the bounded recently-viewed table was rejected because it does not prove exposure and loses history. Presenting fixture AUC/log-loss as a production gate was rejected; the report labels them demonstration metrics until sufficient real held-out positives exist.

The command accepts one fixed `s3://.../exports/training/latest.json` through `RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI`. The manifest contains at most thirty exact immutable daily CSV URIs. Daily mode loads only the newest unconsumed URI and warm-starts from the latest compatible model; explicit full mode loads the complete manifest window and starts from zero weights. The loader validates each handoff, keeps `labelClicked` as the binary label, records the exact input URIs and base model, and never automatically activates the candidate. Absence of the variable preserves the seeded-fixture path.

The backend exposes an explicit source-day export command with required `sourceDate`, `since`, and `cutoff`. `sourceDate` is the business date in `Asia/Ho_Chi_Minh`; `since` and `cutoff` are UTC timestamps, so the S3 partition must use the explicit business date rather than `cutoff.slice(0, 10)`. Products remain one complete source-day projection. Buyers are exported as a delta: the command pages through already-materialized `BuyerSearchProfile` rows whose `updatedAt` is inside `(since, cutoff]`, maps each page in memory, and never rebuilds activities one buyer at a time. It writes deterministic gzip NDJSON parts and manifest-last markers. Buyer identifiers use the clickstream HMAC and key ID; raw identifiers and other account PII never cross the backend boundary.

For source day D, Glue reads only raw D, the product snapshot for D, the buyer delta for D, and the compacted buyer state from D-1. It merges the delta over the previous state by buyer pseudonym, writes the compacted state for D, and uses hash/Spark joins rather than scanning all historical rows for every impression. Anonymous or unmatched impressions are excluded. The daily training object is created once, then Glue appends its exact URI to `latest.json`, removes entries older than the newest thirty, and never rebuilds old daily outputs.

This bounds daily Glue work instead of making it grow with snapshot history and preserves inactive buyers through the prior compacted state. Profiles older than thirty days are pruned from that state. The accepted trade-offs are one extra compacted buyer-state write per day, a required one-time bootstrap state, and daily training that can drift because it sees only new data. An explicit full thirty-day refresh corrects accumulated drift and remains separate from the daily path. Processed interactions, immutable daily exports, and snapshots expire after thirty-five days, so storage stays bounded; this gives up exact retraining after retention. Revisit a dedicated feature store or streaming profile updates when the compacted buyer state exceeds 5 GiB, daily Glue exceeds 30 minutes, or a weekly full refresh exceeds the accepted training budget.

### 10. Execute personalized scoring through one stored Painless script

At startup or explicit bootstrap, the system installs a versioned stored script. The search backend passes the active model weights and bounded buyer profile as runtime parameters; product features are read from document values. The script computes consumer-product features and a logistic probability `1 / (1 + exp(-z))`, combines it with bounded lexical/static contributions, and always returns a non-negative finite score.

Dynamic per-request script source was rejected because it harms cacheability and version control. Embedding an unbounded history map in parameters was rejected for request size and script cost. Script scoring always wraps a selective query/filter so it is not applied to the entire catalogue unnecessarily.

### 11. Add optional authenticated personalization without breaking public search

The catalogue API continues to support anonymous requests. When a valid bearer context is available, it may fetch a compatible profile and personalize; absence of credentials remains a normal guest request, while invalid credentials follow existing authentication semantics rather than silently impersonating a guest. The storefront retains its baseline server-rendered response and may perform a bounded authenticated refresh after session restoration, reusing the same response contract and without a UI redesign.

Making the public endpoint authentication-required was rejected. Passing raw activity or profile features from the browser was rejected because the server owns identity and feature generation.

### 12. Reuse the ranker only for `DAILY_RECOMMENDATIONS`

Homepage daily recommendations select a bounded eligible candidate pool, rank it with the personalized or baseline score, and apply deterministic post-ranking diversity: no duplicate products, at most three per shop, and at most six per category in the initial 24. If filtering cannot fill 24 items, the module returns the available subset rather than relaxing sellability. Flash Sale, Top Selling, Mall, and related products remain on existing paths.

Migrating all homepage modules was rejected because curated campaign ordering has different ownership. Returning an unbounded feed in the initial response was rejected for payload, rendering, and image latency.

### 13. Implement layered timeouts, feature flags, and fallbacks

Independent flags control Elasticsearch baseline search, personalization, and personalized daily recommendations. Profile timeout/miss, model mismatch, or script failure falls back to baseline Elasticsearch. Elasticsearch timeout/unavailability falls back to the existing PostgreSQL catalogue search; daily recommendations fall back to the current curated/PostgreSQL product resolution. Logs and metrics record only version IDs, timing, outcome, and reason codes.

Retrying personalized scoring indefinitely was rejected because it would worsen tail latency. Returning empty search or removing the homepage module was rejected because the existing system can still serve useful baseline content.

### 14. Separate baseline relevance, model, invariant, and latency gates

A versioned manual relevance dataset groups exact-name, category, shop, diacritic/no-diacritic, filter, and expected-zero queries with graded labels `0..3`. The evaluator compares current PostgreSQL search and Elasticsearch on the same snapshot. The target baseline is NDCG@10 `>= max(0.80, current × 1.10)`, MRR `>= 0.75`, exact-name top-one `>= 95%`, irrelevant top-ten `<= 10%`, no unexpected-zero increase, and no important group regression over 5%.

Fixture-model reporting targets personalized NDCG improvement, AUC, and log-loss but remains informational until a held-out set has at least 200 valid positives. Sellability and explicit-sort violations are always zero-tolerance. Local performance targets are Elasticsearch query p95 `<= 150 ms`, baseline API p95 `<= 300 ms`, personalized API/homepage p95 `<= 400 ms`, and index freshness p95 `<= 30 seconds` under the documented local load profile.

## Risks / Trade-offs

- **[Eventually consistent index can contain stale commerce fields]** → Hydrate ranked IDs through canonical PostgreSQL mapping, over-fetch bounded candidates, prioritize eligibility refreshes, and expose freshness metrics.
- **[Incremental timestamp reconciliation can miss indirect or time-bound changes]** → Recompute complete product documents, retain checkpoints on failure, refresh promotion boundaries, run periodic reconciliation, and keep full reindex as repair.
- **[Script scoring can increase p95 latency]** → Filter first, bound candidate pools/profile maps, use a stored script, set timeouts, and fall back to baseline.
- **[Authenticated client refresh can visibly reorder server-rendered results]** → Limit it to relevance ordering, preserve the response contract and stable keys, and allow personalization to be disabled independently; UI redesign remains outside scope.
- **[Seeded training data can produce misleadingly strong metrics]** → Label reports as demonstration-only, version fixtures, separate baseline relevance metrics, and require real held-out positives before production claims.
- **[Two-stage Elasticsearch plus PostgreSQL reads add complexity]** → Keep one search adapter and one canonical catalogue hydrator, batch reads, and verify exact fallback parity.
- **[Three-day implementation target encourages over-scoping]** → Treat search infrastructure/baseline/fallback as mandatory, personalized search as the next priority, and homepage personalization as the first removable stretch item.

## Migration Plan

1. Add optional configuration and local Elasticsearch without routing production catalogue traffic to it.
2. Add projection/version metadata, profile/model persistence, bootstrap scripts, and a full reindex command; build and validate the first physical index behind an inactive alias.
3. Run baseline evaluation and enable Elasticsearch search locally behind its feature flag while retaining PostgreSQL fallback.
4. Add incremental reconciliation and verify create/update/eligibility/promotion paths plus index freshness.
5. Generate local profiles, train/activate the versioned demonstration model, install the stored script, and enable personalized relevance only for eligible local buyers.
6. Enable `DAILY_RECOMMENDATIONS` personalization after search/fallback invariants pass.
7. Roll back by disabling homepage personalization, then search personalization, then Elasticsearch baseline; the existing PostgreSQL paths remain available. Preserve additive profile/model data for diagnosis, and move the alias back to the previous physical index when only an index-version rollback is needed.
