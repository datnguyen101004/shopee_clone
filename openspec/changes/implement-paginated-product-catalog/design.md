## Context

See `proposal.md` for motivation and `specs/marketplace-catalog/spec.md` for observable behavior. T03 provides catalogue persistence, T05/T06 provide responsive UI and the storefront shell, and T07 establishes a server-side Next-to-Nest adapter pattern plus a stable product handoff route. The `/search` route currently normalizes `q` and `category` only for placeholder copy.

T08 crosses the Prisma, NestJS, shared-contract, Next.js, Playwright, and developer-tooling boundaries. It must paginate after eligibility filtering, keep money server-authoritative, avoid claiming real review/order analytics, and leave advanced search semantics to T09.

## Goals / Non-Goals

**Goals:**

- Provide deterministic, bounded server-side pagination over only displayable products.
- Reuse one product-card read model across catalogue API and UI without exposing Prisma records.
- Support category browsing and query-preserving page links that compose cleanly with T09.
- Make fast local iteration possible through a quick E2E command that uses already-running services.

**Non-Goals:**

- Full-text or fuzzy search, relevance ranking, filters, sorting controls, recommendation logic, review ingestion, or order-derived sales aggregates.
- Cursor pagination, infinite scrolling, seller catalogue management, or full product details.
- Replacing the isolated full-stack verification path for migration-sensitive or final-delivery checks.

## Decisions

### 1. Expose one bounded `GET /api/v1/catalog/products` endpoint

The endpoint accepts `category`, `page`, and `pageSize`. Defaults are page 1 and page size 12; maximum page size is 48. NestJS validates the raw query at the controller boundary and translates invalid input into sanitized Problem Details. The response contains normalized query context, `items`, and a metadata object with `page`, `pageSize`, `totalItems`, and `totalPages`.

Offset pagination is appropriate for the small public catalogue phase and makes numbered Shopee-style controls straightforward. A stable `createdAt DESC, id ASC` order prevents page drift for unchanged data. Cursor pagination would scale writes better but complicates numbered navigation and is premature for T08.

### 2. Compute eligibility and representative offers before pagination

The repository obtains active products from active shops and active categories, includes active variants with inventory, and supports category descendant IDs. The service maps each candidate through the same eligibility rules used by T07: positive available inventory and the lowest price with ID tie-break. Invalid candidates are removed before totals and slicing, ensuring metadata describes renderable products rather than raw rows.

For the current seed-backed scale, retrieving the bounded active candidate set and paginating the mapped results in the application keeps price/inventory eligibility correct. A future performance phase can materialize or express the representative-offer query in SQL without changing the contract.

### 3. Add additive presentation facts rather than pretending commerce aggregates exist

`Shop.location` stores a short buyer-facing location. `Product.ratingAverageBasisPoints`, `ratingCount`, and `soldCount` store deterministic display summaries with database constraints: rating average 0–500, rating/sold counts non-negative. Basis points here use hundredths of a star (`490` means `4.90`) to avoid floating-point persistence.

These are explicit seed/admin-owned presentation facts for T08. They do not represent a review or order ledger; later review/order features must become authoritative and can migrate these fields into projections. Deriving sales from T07 module entries would be context-specific and inconsistent across catalogue pages.

### 4. Keep a dedicated catalogue contract and adapter

`packages/contracts` will define `CatalogProductCard`, query context, pagination metadata, and `CatalogProductsResponse` plus conservative runtime parsing. It stays framework-neutral and uses safe integers for money and counts.

The Next.js adapter reads the same server-only API base URL as T07, applies a short timeout, requests with `cache: 'no-store'`, and classifies timeout, transport, HTTP status, and contract failures. Shared internal helpers for URL construction may be extracted only where they reduce duplication without coupling homepage and catalogue payloads.

### 5. Render `/search` dynamically with allowlisted query serialization

The route normalizes the first `category`, `q`, `page`, and `pageSize` values. Only `category` affects T08 backend filtering; `q` is preserved and displayed as pending T09 context rather than being silently treated as implemented search. Pagination links are generated with `URLSearchParams` from this allowlist, replace `page`, and preserve `pageSize` only when explicitly valid.

A reusable catalogue grid owns product cards and pagination. Loading, empty, and error compositions remain within the existing layout, and product cards continue linking to the T10 placeholder. Server rendering avoids CORS, hydration-only fetching, and layout shift.

### 6. Split quick iteration from isolated verification

`test:e2e:homepage:quick` invokes only the homepage Playwright spec against local services at the documented default ports, reusing the running Next.js server and assuming the API/database are already prepared. It does not migrate, seed, build, or clean Docker.

T08 will add an analogous focused catalogue spec that can be selected during development. The existing `test:e2e:homepage` remains the isolated real-boundary gate. Because GitHub Actions is manual-only, the workflow remains capable of isolated verification when explicitly dispatched.

## Risks / Trade-offs

- **[Application-side eligibility pagination loads more candidates than one page]** → Keep the initial dataset bounded, select only required columns/relations, cover totals rigorously, and defer SQL/materialized optimization until measured scale requires it.
- **[Persisted rating and sold summaries may appear order/review-authoritative]** → Document seed/admin ownership, constrain their ranges, and avoid exposing review or analytics provenance claims.
- **[Preserved `q` may imply T09 search is active]** → Label keyword context honestly and do not send `q` as a T08 backend filter; T09 can activate it without breaking pagination URLs.
- **[Offset pages can shift while catalogue data changes]** → Use deterministic order and accept normal public-listing freshness; cursor pagination is deferred.
- **[Quick E2E can pass against stale local state]** → Position it only as an iteration loop, check service health with clear errors, and retain isolated gates for persistence changes and delivery.

## Migration Plan

1. Add constrained nullable/defaulted catalogue presentation columns in one additive migration.
2. Extend deterministic seed and isolated persistence verification before deploying code that reads the fields.
3. Deploy the NestJS catalogue endpoint, then the dynamic `/search` route.
4. On application rollback, the additive columns remain harmless to T03–T07 code. Remove them only through a later forward migration if the projection design changes.
