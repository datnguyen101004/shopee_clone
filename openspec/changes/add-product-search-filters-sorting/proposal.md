## Why

T08 exposes a stable paginated catalogue, but buyers still cannot narrow it beyond one category and the storefront explicitly treats `q` as deferred context. T09 turns `/search` into a shareable Shopee-like discovery experience with combinable search, filters, and deterministic sorting while preserving the catalogue eligibility rules already in production.

## What Changes

- Extend the public catalogue query and response contracts with normalized keyword, price, rating, shop-location, availability, promotion, and sort state plus filter-facet metadata.
- Extend `GET /api/v1/catalog/products` to combine discovery criteria before pagination and to apply stable relevance, newest, best-selling, and price ordering.
- Define deterministic Vietnamese-friendly keyword normalization and relevance scoring without claiming typo correction, personalization, or a dedicated search engine.
- Add URL-backed search/filter/sort controls to `/search`, including clear/apply actions, active-filter context, result counts, and pagination links that preserve every supported discovery parameter.
- Add contract, query parser, service/repository, real-PostgreSQL, component, accessibility, and browser tests for combined criteria, invalid inputs, stable pages, refresh, and shareable URLs.

## Capabilities

### New Capabilities

- `product-discovery`: Defines anonymous keyword search, combinable catalogue filters, deterministic sort modes, discovery facets, URL-backed storefront controls, validation, and stable pagination behavior.

### Modified Capabilities

None. The T08 catalogue change has not been synced into `openspec/specs`; T09 builds on its implemented contract without declaring a nonexistent main-spec modification.

## Impact

- **Contracts:** Expands catalogue query context and response parsing in `packages/contracts` with filter/sort/facet types.
- **Backend:** Extends the NestJS catalogue query boundary and service pipeline while retaining display eligibility and server-authoritative representative prices.
- **Persistence:** Reuses current product, variant, inventory, category, shop-location, rating, and sold-summary fields; no new business tables or authoritative review/order claims.
- **Frontend:** Replaces deferred-keyword copy with responsive, accessible GET-backed discovery controls and active state on `/search`.
- **Testing:** Adds combination and validation coverage plus focused quick and isolated PostgreSQL/browser verification. GitHub Actions remains manual-only.
