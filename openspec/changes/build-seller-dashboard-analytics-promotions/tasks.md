## 1. Shared analytics and promotion contracts

- [x] 1.1 Define framework-neutral analytics ranges, local granularities, eligible order states, KPI names, conversion availability, shared low-stock threshold exposure, promotion states/actions, and bounded limits.
- [x] 1.2 Define exact contracts for dashboard KPIs/time series/best sellers/low stock, paginated product performance, voucher summaries/details, discount campaign summaries/details, editor inputs, action results, and effective-price breakdowns.
- [x] 1.3 Add strict parsers for local dates, granularity, promotion filters, product scopes/rates, voucher rules, cursors, UUID idempotency keys, and ETags; reject unknown keys.
- [x] 1.4 Add canonical filter digests/cursors, timezone-range helpers, safe-integer money aggregation, percentage discount helpers, request digests, and exact response guards.
- [x] 1.5 Export contracts without NestJS, Prisma, or browser dependencies and add exhaustive contract tests for boundary dates, cursors, prices, limits, scopes, actions, and malformed payloads.

## 2. Analytics and promotion persistence

- [x] 2.1 Add validated `Shop.timeZone`, backfill existing shops to `Asia/Ho_Chi_Minh`, and ensure new shops use the same default.
- [x] 2.2 Extend shop voucher persistence with version/archive/idempotency metadata required for safe seller management without changing existing voucher eligibility.
- [x] 2.3 Add scheduled discount campaign/product models with shop ownership, time window, enabled/archive state, per-product basis points, version, and immutable timestamps.
- [x] 2.4 Add database constraints for canonical bounds, safe rates, non-negative versions/counters, valid windows, and restrictive ownership relations.
- [x] 2.5 Add indexes for shop order status/date aggregates, order-line grouping, current published inventory, voucher lists, campaign lists, product overlap checks, and deterministic keyset pagination.
- [x] 2.6 Write additive migrations and verification covering timezone backfill, existing voucher equivalence, empty campaign initialization, constraints, indexes, and rollback-safe diagnostics.
- [x] 2.7 Regenerate Prisma artifacts and update factories/seeds without inventing analytics orders, traffic, or active seller promotions.

## 3. Timezone normalization and sales aggregates

- [x] 3.1 Implement validated IANA timezone lookup and inclusive local-date to half-open UTC conversion with day/week/month local bucket generation.
- [x] 3.2 Implement owner/shop resolution shared by seller analytics and promotion services without accepting client shop IDs.
- [x] 3.3 Implement SQL KPI/time-series aggregates using only eligible current order states and immutable order-line quantities/payable merchandise amounts.
- [x] 3.4 Implement best-seller grouping/ranking with most-recent qualifying line snapshots and safe current-product navigation.
- [x] 3.5 Implement current low-stock projection from published inventory using the shared threshold and capped stable ordering.
- [x] 3.6 Implement explicit `NOT_AVAILABLE` conversion projection with null traffic/rate values.
- [x] 3.7 Implement cursor-paginated export-shaped product performance queries with filter-bound cursors and maximum page size 100.
- [x] 3.8 Add unit and PostgreSQL tests for every eligible/excluded state, multi-line totals, renamed/deleted products, ownership, zero data, safe integers, stable ties, pagination, date caps, DST boundaries, and query plans on large fixtures.
- [x] 3.9 Add the reproducible analytics benchmark dataset/profile with 100,000 orders, up to 500,000 lines, 10,000 variants, foreign-shop controls, five warm-ups, at least 100 measured requests, and configurable concurrency up to 20.

## 4. Seller analytics API

- [x] 4.1 Add the seller analytics NestJS module/controller/service wiring, OpenAPI descriptions, sanitized exception mapping, and strict output validation.
- [x] 4.2 Implement `GET /api/v1/seller/dashboard?from&to&granularity` with AuthGuard, seller role/approved-shop enforcement, normalized range metadata, database generation time, and private no-store caching.
- [x] 4.3 Implement `GET /api/v1/seller/analytics/products?from&to&limit&cursor` with the same ownership/metric rules and export-ready pagination.
- [x] 4.4 Add HTTP integration tests for auth, eligibility, no client shop selection, malformed/oversized ranges, timezone boundaries, exact contracts, no-data, large-result caps, cursor binding, and cache headers.
- [x] 4.5 Enforce a two-second analytics statement timeout and fail-closed unavailable Problem Details with no partial payload or internal query leakage.

## 5. Seller shop voucher management

- [x] 5.1 Implement seller-owned voucher list/detail queries with derived lifecycle, product scopes, usage summaries, ETags, keyset pagination, and non-enumerating foreign/absent handling.
- [x] 5.2 Implement idempotent voucher creation restricted to owned `SHOP` fixed/percentage merchandise benefits and existing voucher invariants.
- [x] 5.3 Implement versioned voucher update with owned product validation and redeemed-economic-field immutability.
- [x] 5.4 Implement idempotent `PAUSE` and `RESUME` actions from database time with terminal/exhausted rules; delete only paused, unused vouchers with optimistic concurrency and history protection.
- [x] 5.5 Protect concurrent usage and seller edits so limits cannot fall below consumed counts and no partial scope/rule update commits.
- [x] 5.6 Add service/PostgreSQL tests for canonical code collisions, fixed/percentage bounds, caps, dates, scopes, ownership, first redemption, immutable used rules, state derivation, replay, stale updates, and quote/checkout regression.

## 6. Scheduled product discounts and central pricing

- [x] 6.1 Implement campaign list/detail projections, database-time derived states, ETags, stable pagination, and non-enumerating ownership.
- [x] 6.2 Implement idempotent campaign create and versioned update with owned published product validation, 1%–90% rates, valid windows, and safe effective prices for every active variant.
- [x] 6.3 Lock affected product IDs in stable order and enforce non-overlapping enabled windows for create, update, and resume races.
- [x] 6.4 Implement started-campaign immutability plus idempotent `PAUSE`, `RESUME`, and `ARCHIVE` actions.
- [x] 6.5 Implement one central effective-price resolver preserving base variant values and returning base/effective/comparison/rate/campaign/evaluated-at fields.
- [x] 6.6 Integrate the resolver into catalog/homepage, product detail, cart quote, and checkout so scheduled discounts activate/expire without a job and stale pricing is authoritatively refreshed.
- [x] 6.7 Preserve the pricing sequence of scheduled product discount, shop voucher, platform voucher, then shipping benefit using integer minor units and immutable committed order snapshots.
- [x] 6.8 Add unit and PostgreSQL concurrency tests for boundary instants, adjacent/overlapping windows, same-product races, base-price changes, invalid results, started edits, action replay, no-campaign regression, voucher stacking order, and quote-to-checkout expiry.

## 7. Seller promotion API

- [x] 7.1 Add the seller promotion NestJS module/controller/DTO wiring, OpenAPI descriptions, strict response validation, and sanitized Problem Details.
- [x] 7.2 Implement voucher list/create/detail/update/action/delete endpoints under `/api/v1/seller/promotions/vouchers` with auth, role/shop eligibility, Origin, ETag, idempotency, no-store, and ownership guards.
- [x] 7.3 Implement campaign list/create/detail/update/action endpoints under `/api/v1/seller/promotions/discounts` with the same transport guarantees.
- [x] 7.4 Map validation, ownership, stale version, idempotency misuse, immutable-used/started state, overlap, invalid price, and unavailable failures to stable private errors.
- [x] 7.5 Add HTTP integration tests covering every route, action, header, lifecycle filter, cursor, foreign identifier, exact response, replay/stale conflict, and Origin rejection.

## 8. Seller Center dashboard

- [x] 8.1 Add strict analytics API clients, local-date query helpers, contract parsing, and localized safe money/number formatting.
- [x] 8.2 Make `/seller` the overview dashboard and preserve approved-seller route/session behavior.
- [x] 8.3 Build date presets/custom range and responsive KPI cards for merchandise revenue, eligible orders, units sold, and explicit conversion-unavailable state.
- [x] 8.4 Build accessible day/week/month time-series visualization with zero buckets, clear labels, and non-color-only information.
- [x] 8.5 Build best-seller and low-stock panels with snapshot/current images, deleted-product handling, inventory links, capped rows, and useful no-data states.
- [x] 8.6 Implement loading, invalid-date, unauthorized, expired-session, unavailable, retry, and high-value/large-result layouts at 360px, 768px, and 1440px.
- [x] 8.7 Add component tests for range changes, URL synchronization, zero data, timezone labels, conversion placeholder, deleted products, list caps, formatting, accessibility, and error recovery.

## 9. Seller Center promotion management

- [x] 9.1 Add `Khuyến mãi` navigation, route guards, strict promotion clients, cursor/filter builders, ETag handling, and browser idempotency-key generation.
- [x] 9.2 Build `/seller/promotions` voucher/discount tabs with derived badges, filters, pagination, responsive cards/tables, empty/loading/error states, and create actions.
- [x] 9.3 Build preloaded voucher create/edit forms with code, type/value, cap, minimum spend, limits, dates, owned product scope, inline validation, and authoritative post-save navigation.
- [x] 9.4 Build preloaded discount campaign create/edit forms with name, dates, owned products, per-product rates, effective-price preview, overlap/started-field guidance, and authoritative post-save navigation.
- [x] 9.5 Add accessible custom voucher pause/resume/delete and campaign pause/resume/archive dialogs, duplicate-click prevention, stable idempotency keys for retries, ETags, and server-error preservation of safe form input.
- [x] 9.6 Update public price components to render the central scheduled-price breakdown consistently without trusting client calculations.
- [x] 9.7 Add component tests for lists, preloaded editing, validation, lifecycle restrictions, dialogs/focus, replay prevention, stale state, navigation, and public price display.

## 10. End-to-end verification and documentation

- [x] 10.1 Add deterministic seller fixtures for zero analytics, eligible/excluded order states, best sellers, low stock, future/active/expired vouchers, and adjacent product campaigns without polluting normal seed data.
- [x] 10.2 Add Playwright coverage for dashboard range changes, KPI reconciliation, zero state, best-seller navigation, low-stock shortcut, and responsive layouts.
- [x] 10.3 Add Playwright/API coverage for creating/editing/pausing/resuming/deleting a paused unused voucher and verifying quote/checkout pricing.
- [x] 10.4 Add Playwright/API coverage for scheduling adjacent product discounts, storefront activation, cart quote, checkout re-evaluation, stale edit, overlap rejection, and responsive promotion screens.
- [x] 10.5 Add `test:e2e:seller-analytics-promotions:quick`, keep it independent from the full suite/disabled CI flow, and retain `test:e2e:homepage:quick` regression coverage.
- [x] 10.6 Update README/API documentation with metric/state/timezone definitions, all analytics/promotion endpoints and required headers, pricing order, lifecycle rules, and local test commands.
- [x] 10.7 During apply, update `flow.md` with the implemented dashboard query, voucher lifecycle, campaign overlap, central pricing, quote/checkout, idempotency, and Seller Center screen flows.
- [x] 10.8 Run contracts, API unit/integration, migration/PostgreSQL, web component, typecheck, lint, production build, focused seller analytics/promotions E2E, seller regressions, and `test:e2e:homepage:quick`.
- [x] 10.9 Run the explicit live-analytics benchmark on the documented reference profile; record P50/P95 and verify dashboard P95 ≤ 750 ms for 90 days, ≤ 1,500 ms for 366 days, product-page P95 ≤ 750 ms at `limit=100`, constant statement counts, owner-scoped index plans, response caps, and reconciliation correctness.
- [x] 10.10 Run strict OpenSpec validation when the CLI is executable and reconcile proposal, design, specs, tasks, diagrams, documentation, and implementation before completion.
