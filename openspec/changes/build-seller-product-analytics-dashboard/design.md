## Context

See `proposal.md` for motivation. The current code already sends discovery impression/click events through API Gateway, Lambda, Firehose and S3 Raw, queries S3 Raw through Athena for product CTR, records authoritative cart-add events, and stores seller order facts in PostgreSQL. It does not record a distinct product-detail view, and the current seller page exposes only CTR for one selected product.

This is an MVP with no real users. Happy-path delivery is the priority, browser E2E and new infrastructure are out of scope, and the existing training path and 04:00 schedule must remain unchanged.

## Goals / Non-Goals

**Goals:**

- Produce one server-authoritative seller analytics response combining engagement and commerce facts.
- Show a shop summary, a time trend, product-level rows, and equal-period comparisons.
- Keep Athena scans bounded by raw S3 partitions and a maximum 31-day selected range.
- Preserve pseudonymous analytics identities and seller ownership boundaries.

**Non-Goals:**

- Building a warehouse aggregate table, cache, streaming dashboard, attribution model, or exactly-once pipeline.
- Changing Glue training ETL, training snapshots, `training.csv`, or model training.
- Recovering historical product views that were never recorded.
- Implementing E2E, forced-failure, load, or production deployment tests in this change.

## Decisions

### 1. Use one unified seller analytics endpoint

**Decision and scope:** Replace the experimental product-only CTR route with `GET /api/v1/seller/analytics/overview`. The request accepts a preset or custom dates plus product page/page-size. The backend resolves current and previous UTC ranges from the shop time zone and returns summary metrics, trend points, and product rows in one contract.

**Why it fits:** The page always needs all sections together, the backend already owns shop resolution and business calculations, and one request is simpler for an MVP than coordinating multiple partially loaded cards.

**Benefits:** Consistent definitions, one authorization boundary, one generated timestamp, and no client-side joining or percentage calculation.

**Trade-offs accepted:** The response waits for both Athena and PostgreSQL, so its latency is the slower of the two paths and can take seconds. A failure in either source makes the whole happy-path endpoint unavailable; no partial response is added in this MVP.

**Alternatives:** Separate engagement and commerce endpoints would allow partial rendering and independent caching, but add frontend coordination and risk mismatched time windows. GraphQL is not selected because the repository uses REST and the response shape is fixed.

**Revisit criteria:** Split or cache endpoint sections when p95 latency exceeds 3 seconds, the response exceeds 1 MB, partial-source availability becomes a requirement, or more than one UI needs materially different projections.

### 2. Join Athena engagement with PostgreSQL commerce in the API

**Decision and scope:** Athena supplies Impressions, Clicks, Product Views, Add to Cart, and pseudonymous Unique Visitors. PostgreSQL remains authoritative for distinct eligible Orders, Units Sold, and Revenue. The API joins grouped results by product ID and computes CTR and Conversion Rate.

**Why it fits:** Behavioral data is already durable in S3 Raw while financial/order facts already have correct status, quantities and payable merchandise amounts in PostgreSQL. Copying either side solely for this MVP would duplicate authority.

**Benefits:** No database migration, no new AWS resource, no duplicated revenue logic, and historical clickstream remains queryable.

**Trade-offs accepted:** Athena is eventually visible after Firehose buffering and usually slower than PostgreSQL, so very recent orders may appear before the matching behavioral events. Cross-source reads are not an atomic snapshot. JSON/GZIP raw data costs more to scan than columnar aggregates.

**Alternatives:** A scheduled Parquet aggregate table would be cheaper/faster for repeated reads but adds ETL freshness and operations. Streaming aggregates in Redis/DynamoDB would reduce latency but add correctness, retention and recovery work that is not justified for the demo.

**Revisit criteria:** Add hourly/daily Parquet aggregates and response caching when a normal request scans over 1 GB, Athena monthly cost exceeds the agreed budget, p95 exceeds 3 seconds, concurrent query throttling appears, or dashboard traffic exceeds 1,000 requests/day.

### 3. Query current and previous periods together

**Decision and scope:** One partition-bounded Athena query scans the union of the current and previous ranges and uses conditional aggregation for both periods, overall totals, trend buckets, and product grouping. One PostgreSQL transaction similarly aggregates commerce facts for both periods.

**Why it fits:** Every card requires comparison data. Scanning once avoids doubling Athena bytes and keeps both sides on the same server-resolved boundaries.

**Benefits:** Lower query count and cost, consistent comparison, and simpler percentage mapping.

**Trade-offs accepted:** The SQL and row mapping become more complex, and product grouping can return many rows before API pagination. For the MVP, page results are sorted and paginated after merging.

**Alternatives:** Two queries per source are simpler to read but double Athena query overhead and can observe slightly different data. Precomputed comparison columns are not selected because ranges are user-defined.

**Revisit criteria:** Move product pagination into a persisted aggregate store when a shop exceeds 5,000 active/recent products, merged query results exceed 10 MB, or API memory/latency becomes measurable.

### 4. Define funnel events without double-counting views as clicks

**Decision and scope:** Add the backward-compatible event type `product_viewed`, emitted once when a valid product-detail screen is presented. Impressions count `product_impression` plus `recommendation_impression`; Clicks count `product_clicked` plus `recommendation_clicked`; Add to Cart counts only server-authored `cart_changed` with `properties.action = 'add'`. All discovery surfaces that render tracked product cards must emit a matching impression and click type.

**Why it fits:** A card click expresses acquisition intent while a successfully presented product page is a later funnel step. Existing authoritative cart capture avoids trusting the browser for add-to-cart.

**Benefits:** Product Views becomes meaningful, funnel steps remain independently measurable, and existing training click labels retain their meaning.

**Trade-offs accepted:** Client navigation or immediate unload can lose a product-view event; delivery can duplicate events under at-least-once behavior; no historical backfill exists. The MVP uses existing event IDs and capture behavior and does not add analytical deduplication.

**Alternatives:** Treating every click as a view is cheaper but produces false views when navigation fails and makes the two metrics identical. Server access logs miss client-side presentation semantics and do not carry the existing pseudonymous context.

**Revisit criteria:** Add event deduplication when observed duplicates change a metric by more than 1%; add server/client reconciliation if click-to-view drop-off is dominated by telemetry loss rather than user behavior.

### 5. Use product-detail visitors and equal-duration comparison

**Decision and scope:** Unique Visitors is `COUNT(DISTINCT COALESCE(buyerPseudonym, sessionPseudonym))` over `product_viewed`. Conversion is distinct eligible shop orders divided by those visitors. `Today` compares midnight-to-now with the same elapsed portion of yesterday; other selections use the immediately preceding equal-duration window. Relative change is `(current - previous) / previous * 100`; previous zero maps to `0` when both are zero and `new` when current is positive.

**Why it fits:** Product-detail visitors are a clear denominator for purchase conversion and equal elapsed durations avoid comparing a partial day to a full day.

**Benefits:** Rates have stable, explainable meaning and comparison cards do not display infinity.

**Trade-offs accepted:** One person on multiple anonymous sessions/devices can count more than once, and login transitions can split identity. Orders are not multi-touch attributed to a specific visitor event; shop-level conversion is a period ratio, not causal attribution.

**Alternatives:** Counting all impression viewers inflates the denominator; requiring login excludes anonymous traffic; identity stitching would improve accuracy but increases privacy and implementation scope.

**Revisit criteria:** Revisit identity and attribution when authenticated coverage is measured, cross-device reporting becomes required, or seller decisions depend on campaign/channel attribution.

### 6. Reuse the Seller workspace visual system

**Decision and scope:** `/seller/analytics` uses the existing Seller shell without a duplicate page H1. It provides preset chips/date controls, ten compact KPI cards with directional comparison, an accessible trend chart, and a number-paginated responsive product table. Rate cards show percent values; Revenue uses integer VND formatting; `new` is localized instead of rendered as infinity.

**Why it fits:** It follows the established seller UI and retains product drill-down context without keeping the misleading CTR-only screen.

**Benefits:** Familiar navigation, readable comparison, mobile-safe layout, and truthful empty states.

**Trade-offs accepted:** Ten KPIs are dense on small screens, so cards wrap and the product table uses horizontal overflow. No configurable dashboard or export is included.

**Alternatives:** Separate tabs reduce density but hide the funnel relationship. A third-party chart library is not required; the implementation should reuse current dependencies unless accessibility cannot be met.

**Revisit criteria:** Introduce configurable cards/tabs when usability testing shows excessive scrolling or sellers need channel/campaign breakdowns.

## Risks / Trade-offs

- **[Athena freshness differs from order data]** → Display the response generation time and describe analytics as recently updated, not real-time.
- **[Today crosses a local day boundary while a request runs]** → Resolve `now` once on the server and use it for all current/previous boundaries.
- **[Sparse historical product-view data]** → Show zeros truthfully; do not infer past Product Views from clicks.
- **[Raw scan cost grows with traffic]** → Enforce partition predicates and the 31-day selected range; use one scan for both periods.
- **[Old CTR consumers break]** → The only current consumer is the uncommitted seller CTR page; replace contract, API client and UI together before merge.

## Migration Plan

1. Extend the additive clickstream contract and raw pipeline acceptance for `product_viewed`; deploy capture before relying on the metric.
2. Cover tracked listing/homepage/recommendation surfaces with paired impression/click events and add the product-detail view capture.
3. Add unified analytics contracts, range resolver, bounded Athena aggregation, PostgreSQL comparison aggregation and seller endpoint.
4. Replace the experimental CTR-only page/client/route copy with the unified dashboard and rename Seller navigation.
5. Run contract, backend unit/integration, frontend component, typecheck and lint tests; do not run browser E2E.
6. Roll back application code together if needed. Existing raw objects remain readable because the schema change is additive; no PostgreSQL or AWS-resource rollback is required.
