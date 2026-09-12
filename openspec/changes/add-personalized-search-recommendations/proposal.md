## Why

Product discovery currently loads displayable catalogue candidates from PostgreSQL and applies deterministic application-side token scoring, which cannot scale to richer Vietnamese relevance, asynchronous indexing, or buyer-specific ranking. T34 introduces a rebuildable Elasticsearch search projection and a bounded local personalization pipeline so search and daily recommendations can improve without making Elasticsearch or an ML model authoritative for commerce rules.

## What Changes

- Add local Elasticsearch infrastructure, health/readiness handling, configuration, index aliases, and a rebuildable denormalized product search projection sourced from PostgreSQL.
- Add full reindexing plus idempotent incremental synchronization for product, shop, category, inventory, rating, sales, and promotion changes, with measurable index freshness.
- Route `GET /api/v1/catalog/products` through Elasticsearch for Vietnamese-friendly keyword relevance, existing filters, stable pagination, static quality boosts, and the existing explicit sort modes.
- Preserve explicit sorts as the primary ordering rule; personalization may only rerank `sort=relevance` results or break ties between equal primary sort values.
- Generate bounded versioned buyer profiles from authenticated views, favorites, followed shops, and valid orders, while guests and cold-start buyers continue to receive baseline results.
- Add a deterministic local training/evaluation flow for logistic-regression weights and execute personalized scoring inside Elasticsearch through a versioned stored Painless script; local seeded labels demonstrate the pipeline but do not claim production model quality.
- Export one source-day product snapshot plus privacy-safe buyer-profile changes from PostgreSQL to S3 Processed. The 04:00 Glue run reads only that source day and the previous compacted buyer state, carries inactive buyers forward, and writes one immutable daily training dataset with the same sixteen feature inputs used by online ranking.
- Maintain one fixed training manifest containing at most the latest thirty immutable daily dataset URIs. Daily training warm-starts from the latest compatible model using only the new day; an explicit full mode retrains from the thirty-day window when requested.
- Personalize only the homepage `DAILY_RECOMMENDATIONS` module, returning 24 initial products with shop/category diversity; keep Flash Sale, Top Selling, Mall, and product-detail related products on their existing behavior.
- Add layered fallback from personalized Elasticsearch to baseline Elasticsearch and then to the existing PostgreSQL catalogue path, plus relevance, ranking-invariant, freshness, and latency verification.
- Keep UI/UX redesign, anonymous profiles, semantic/vector search, geospatial service areas, production A/B experimentation, and automated production retraining outside this change.

## Capabilities

### New Capabilities

- `product-search-relevance`: Defines the Elasticsearch product projection, indexing consistency, Vietnamese keyword selection, existing catalogue filters and sorts, deterministic ordering, metrics, and PostgreSQL fallback behavior.
- `personalized-product-recommendations`: Defines authenticated buyer profiles, logistic-regression ranking inside Elasticsearch, guest/cold-start behavior, personalized search eligibility, daily recommendation diversity, model safety, and layered fallback.

### Modified Capabilities

None. Product discovery and homepage behavior were implemented by earlier unsynced changes and do not currently exist as main-spec capabilities.

## Impact

- **Infrastructure:** Adds Elasticsearch to local Docker Compose and new search configuration/readiness requirements.
- **Backend:** Adds capability-oriented indexing, search, profile, training/evaluation, and ranking components while preserving the NestJS modular-monolith boundary.
- **Persistence:** PostgreSQL remains authoritative and gains only the state required for incremental indexing, versioned buyer profiles, and local model metadata where the design requires it.
- **API/contracts:** Preserves the public catalogue response shape where practical; authenticated requests may receive personalized ordering without exposing profile features or model internals.
- **Homepage:** Replaces only the `DAILY_RECOMMENDATIONS` product resolution path; other curated modules and product-detail related products remain unchanged.
- **Operations/testing:** Adds reindex and local training commands, index/model version checks, fallback observability, relevance fixtures, integration tests, invariant tests, and latency checks.
- **Training data:** Adds an explicit source-day snapshot export, buyer delta plus compacted-state prefixes, immutable daily exports, a fixed thirty-entry manifest, and thirty-five-day S3 retention. The next day's 04:00 Glue job processes the source day once; automatic model activation remains outside this change.
