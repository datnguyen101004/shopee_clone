## Why

Seller Center already supports shop profiles, products, inventory, and order fulfillment, but sellers still have to inspect individual records to understand shop performance and cannot create their own vouchers or scheduled product discounts. T26 adds an owner-scoped operating dashboard and bounded promotion tools while preserving the pricing, order-snapshot, authorization, and concurrency guarantees delivered by earlier tasks.

## What Changes

- Add an authenticated seller dashboard with deterministic local-date filters, revenue, eligible orders, units sold, explicit conversion-data availability, low-stock products, best-selling products, and bounded time-series data.
- Define metric eligibility from authoritative order states and immutable order-line snapshots; label merchandise revenue honestly and keep financial settlement outside scope.
- Add a cursor-paginated product-performance query shaped for a future streaming CSV exporter without introducing file export in T26.
- Add measurable live-query performance acceptance using a reproducible large-shop PostgreSQL profile, P95 latency budgets, bounded concurrency, constant query counts, index-plan checks, and fail-closed timeouts.
- Persist a validated IANA shop timezone, default existing and new shops to `Asia/Ho_Chi_Minh`, and translate inclusive local calendar dates into one half-open UTC interval for every analytics query.
- Add seller-owned shop voucher management by reusing the existing voucher evaluator, redemption counters, product scopes, and pricing order.
- Add scheduled product-discount campaigns without overwriting variant base prices; resolve the effective catalog price centrally at read, cart quote, and checkout boundaries.
- Prevent overlapping enabled product campaigns, discounts that produce invalid or misleading prices, mutation races, cross-shop access, and unsafe edits after a promotion has started or been redeemed.
- Add Seller Center dashboard and promotion screens with loading, empty, invalid-date, stale-write, large-result, and unavailable states.
- Add contracts, migrations, aggregate/query services, authorization, integration/concurrency tests, focused UI tests, documentation, and planned flow diagrams.

## Capabilities

### New Capabilities

- `seller-sales-analytics`: Owner-scoped dashboard KPIs, local-time date ranges, bounded time series, best sellers, low stock, product-performance pagination, and explicit unavailable conversion metrics.
- `seller-shop-promotions`: Seller-managed shop vouchers and scheduled product discounts with lifecycle rules, price safety, ownership, versioning, idempotency, and centralized storefront pricing.

### Modified Capabilities

None. The repository has no synchronized main seller-analytics or seller-promotion capability. This change composes the existing order, inventory, product-catalog, and marketplace-voucher delta artifacts without claiming to modify a missing baseline specification.

## Impact

- **Database:** Add shop timezone, scheduled discount campaign/product records, lifecycle/version constraints, overlap/query indexes, and deterministic timezone backfill; extend shop voucher lifecycle metadata only where required for safe seller management.
- **Backend:** Add `/api/v1/seller/dashboard`, `/api/v1/seller/analytics/products`, and `/api/v1/seller/promotions/*`; add SQL aggregates, promotion commands, centralized effective-price resolution, Problem Details, private cache rules, ETags, and idempotency.
- **Contracts:** Add exact analytics, date-range, cursor, voucher, campaign, action, price-breakdown, and error contracts without framework dependencies.
- **Frontend:** Make `/seller` the operating dashboard, add `Khuyến mãi` navigation and voucher/discount list-editor screens, and surface scheduled prices consistently on public shopping screens.
- **Quality:** Add aggregation reconciliation, ownership, local-date boundary, daylight-saving-capable timezone, overlap, price validation, redemption, concurrency, no-data, pagination, repeatable live-query benchmarks, query-plan assertions, component tests, and focused Playwright tests.
- **Tracking:** Implements GitHub issue #27 (T26). Dependencies T18, T23, and T25 are complete. Advertising auctions and financial settlement remain out of scope.
