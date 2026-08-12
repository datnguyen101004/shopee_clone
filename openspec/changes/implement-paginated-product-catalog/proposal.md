## Why

The storefront can navigate to `/search` from homepage categories, but that route still renders only a placeholder and cannot expose the persisted marketplace catalogue. T08 turns it into the first scalable buyer product listing with server-authoritative pagination and consistent Shopee-style product metadata.

## What Changes

- Add a public, versioned catalogue API that lists displayable products by category with bounded server-side pagination and deterministic ordering.
- Define framework-neutral catalogue query, page metadata, and product-card contracts shared by NestJS and Next.js.
- Persist deterministic rating summary, sold-count, and shop-location display metadata needed by catalogue cards, while continuing to calculate the representative price and discount from eligible product variants.
- Replace the `/search` placeholder with a responsive API-driven catalogue grid that preserves active query parameters when changing pages.
- Add loading skeletons, a useful empty state, and recoverable API failure presentation inside the existing storefront shell.
- Add focused contract, API, component, and browser coverage for pagination, category filtering, card metadata, query preservation, accessibility, and responsive layouts.
- Add `test:e2e:homepage:quick` for fast iteration against already-running local services; keep the isolated full-stack gate for persistence or delivery-sensitive changes.

## Capabilities

### New Capabilities

- `marketplace-catalog`: Defines public category browsing, displayable product selection, deterministic pagination, product-card metadata, query-preserving navigation, and catalogue loading/empty/failure behavior.

### Modified Capabilities

None. T08 consumes the existing homepage links, persistence foundation, design system, and storefront shell without changing their published requirements.

## Impact

- **Backend:** Adds a capability-oriented catalogue module and `GET /api/v1/catalog/products` endpoint under `apps/api` with validated query bounds and sanitized Problem Details failures.
- **Persistence:** Adds additive shop/product presentation fields and deterministic Vietnamese seed values; no order, review, search-index, or recommendation tables are introduced.
- **Contracts:** Adds catalogue response, page metadata, query, and product-card types plus runtime parsing in `packages/contracts`.
- **Frontend:** Replaces the `/search` placeholder with dynamic server rendering, reusable catalogue cards/pagination, and explicit route states while preserving the T06 shell.
- **Testing and tooling:** Adds pagination API/UI tests, catalogue Playwright coverage, and a quick homepage E2E command. GitHub Actions remains manual-only as requested.
