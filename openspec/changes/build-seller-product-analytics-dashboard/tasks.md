## 1. Clickstream funnel events

- [x] 1.1 Extend the shared browser/export/raw clickstream contracts and contract tests with the backward-compatible `product_viewed` event.
- [x] 1.2 Capture one `product_viewed` event from the successfully rendered product-detail experience and add focused component tests for rerender deduplication.
- [x] 1.3 Audit tracked search, homepage, recommendation, and related-product cards so each supported discovery surface emits paired impression/click semantics; add focused regression tests without browser E2E.
- [x] 1.4 Verify the authoritative cart path continues emitting `cart_changed(action=add)` with trusted product/shop enrichment and does not count update/remove/select as Add to Cart.

## 2. Seller analytics contract and period resolution

- [x] 2.1 Replace the experimental product CTR contract with framework-neutral overview request/response types for all ten metrics, previous values, relative change/new state, trend buckets, and numbered product pagination.
- [x] 2.2 Implement and unit-test shop-time-zone resolution for Today, Yesterday, Last 7 days, Last 30 days, and custom ranges up to 31 days, including equal-duration previous periods and a single captured server `now`.
- [x] 2.3 Define shared server-authoritative helpers for zero-denominator rates and relative changes, including the `new` state when the previous value is zero.

## 3. Athena engagement analytics

- [x] 3.1 Replace the CTR-only SQL builder with one partition-bounded engagement query covering current and previous periods, shop totals, hourly/daily trends, and product grouping.
- [x] 3.2 Count impression/click event pairs, `product_viewed`, distinct pseudonymous viewers, and authoritative cart-add events using the definitions in the spec.
- [x] 3.3 Update the Athena adapter to map the unified result deterministically and retain the existing IAM role/workgroup/output configuration.
- [x] 3.4 Add unit tests proving shop scoping, time/partition bounds, one-scan current/previous aggregation, event definitions, row mapping, and UTC timestamp normalization.

## 4. PostgreSQL commerce analytics and API composition

- [x] 4.1 Add one bounded PostgreSQL aggregation for current/previous distinct eligible orders, units sold, and merchandise revenue at shop, trend, and product levels.
- [x] 4.2 Implement the seller analytics composition service that merges Athena and PostgreSQL results, calculates CTR/conversion/change server-side, fills truthful zero values, sorts products, and applies numbered pagination.
- [x] 4.3 Expose and document `GET /api/v1/seller/analytics/overview` with seller authentication, server-owned shop scoping, DTO validation, cache headers, and exact shared response validation.
- [x] 4.4 Remove the experimental product CTR route/service contract after the overview endpoint owns its replacement behavior.
- [x] 4.5 Add happy-path backend tests for ownership, period resolution, source composition, metric formulas, product rows, zero values, and endpoint response mapping; do not add forced-failure or browser E2E tests.

## 5. Seller analytics UI

- [x] 5.1 Replace the CTR-only web API client with the exact seller analytics overview contract and stale-request protection.
- [x] 5.2 Rename Seller navigation and dashboard links from CTR to Analytics while preserving the existing Seller workspace shell and page-owned heading rules.
- [x] 5.3 Build preset/custom date controls, ten responsive KPI cards with localized comparison states, generated-at/freshness copy, and truthful loading/empty states.
- [x] 5.4 Build an accessible hourly/daily trend visualization for funnel and commerce metrics without introducing an unnecessary chart dependency.
- [x] 5.5 Build the responsive per-product management table with the ten metrics, comparison indicators, accessible icon actions, and number pagination.
- [x] 5.6 Add focused Vitest/Testing Library coverage for presets, custom range requests, comparison rendering, zero/new states, chart/table data, pagination, stale requests, and responsive-safe semantics; do not add browser E2E.

## 6. Documentation and verification

- [x] 6.1 Update clickstream and seller analytics documentation with event definitions, formulas, period comparison rules, near-real-time freshness, 31-day limit, privacy limits, and accepted MVP trade-offs.
- [x] 6.2 Run scoped contracts, API Jest, web Vitest, TypeScript, ESLint, and `git diff --check`; leave deployment, AWS mutation, database migration, load testing, and browser E2E out of this change.
- [x] 6.3 Review the final diff against both delta specs, confirm the training path is unchanged, and record any implementation-discovered deviation before marking the change complete.
