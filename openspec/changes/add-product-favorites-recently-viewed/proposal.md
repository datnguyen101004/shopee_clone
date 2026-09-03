## Why

Buyers can discover and inspect products, but they cannot save promising items or return to products they recently considered. T14 adds lightweight, private engagement history now so the storefront feels persistent across sessions and later recommendation work has an explicit, trustworthy behavioral boundary.

## What Changes

- Add authenticated, idempotent favorite and unfavorite operations for active or previously saved products.
- Add a private, paginated favorites page ordered by the latest save time, with a clear unavailable state for products that later leave the public catalog.
- Record authenticated product-detail views through an explicit idempotent operation that deduplicates by buyer and product while moving repeat views to the newest position.
- Add a private, paginated recently viewed page ordered by the latest view and omit products that are no longer publicly displayable.
- Add Shopee-like favorite controls to product detail and reusable product-card surfaces, including guest sign-in handoff, pending, success, and recoverable failure states.
- Add framework-neutral contracts, OpenAPI documentation, PostgreSQL persistence/migration verification, privacy-safe telemetry, and focused unit, API, database, UI, and quick browser coverage.
- Keep automatic GitHub Actions triggers paused and do not add anonymous browser history, history merging, recommendations, or analytics pipelines.

## Capabilities

### New Capabilities

- `buyer-product-engagement`: Private authenticated favorites and deduplicated recently viewed product history, including pagination, unavailable-product policy, API behavior, and buyer-facing screens.

### Modified Capabilities

None.

## Impact

- **Database:** Add buyer-product favorite and recently viewed join models with composite ownership uniqueness and deterministic pagination indexes.
- **Backend:** Add an authenticated buyer engagement module under `/api/v1/account`, strict DTO/query validation, idempotent mutations, catalog-safe projections, and Problem Details errors.
- **Shared contracts:** Add favorite/history item, page, mutation, availability, pagination, and problem parsers without framework dependencies.
- **Frontend:** Add `/account/favorites` and `/account/recently-viewed`, account navigation, reusable favorite controls, authenticated product-view recording, and responsive list states.
- **Existing catalog:** Reuse the canonical catalog card presentation and product identifiers without changing public catalog or product-detail response contracts.
- **Verification:** Extend seed/database verification and add ownership, idempotency, deduplication, ordering, pagination, unavailable-product, UI, accessibility, and privacy coverage.
- **Dependencies:** Builds on completed T10 product detail and T11 authentication; prepares bounded signals for later T34 recommendations without implementing ranking.
