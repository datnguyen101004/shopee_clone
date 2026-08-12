## Context

See `proposal.md` for motivation and `specs/product-discovery/spec.md` for observable behavior. T08 already owns catalogue eligibility, representative offer selection, deterministic pagination, the framework-neutral card contract, a server-only Next adapter, and the responsive `/search` grid. Its service intentionally maps the small active candidate set before slicing so inventory-aware prices and totals stay correct.

T09 crosses the shared contract, NestJS query/service pipeline, server-rendered Next route, accessible controls, and real-boundary tests. It must activate the previously preserved `q` parameter without introducing a separate search service, review/order authority, client-only state, or inconsistent price logic.

## Goals / Non-Goals

**Goals:**

- Express one canonical discovery query identically in URLs, the NestJS boundary, the response contract, and pagination links.
- Make every keyword, filter, and sort combination operate on the same displayable card candidates before totals and pagination.
- Provide predictable Vietnamese-friendly matching and stable ordering suitable for the current seed-backed catalogue.
- Render controls from safe API facets and keep the page usable without client-side JavaScript state.

**Non-Goals:**

- PostgreSQL full-text/trigram infrastructure, Elasticsearch, typo correction, synonym dictionaries, semantic search, personalization, merchandising boosts, or search analytics.
- Multi-select facets, facet-result counts, cursor pagination, autocomplete, recent searches, or persisted buyer preferences.
- Making sold/rating summaries authoritative commerce ledgers or showing products excluded by T08 eligibility.

## Decisions

### 1. Extend the existing catalogue endpoint and shared contract

`GET /api/v1/catalog/products` remains the only buyer listing endpoint. `CatalogQueryContext` gains nullable canonical values for `q`, `category`, `minPrice`, `maxPrice`, `rating`, `location`, `availability`, `promotion`, and a required normalized `sort`. `CatalogProductsResponse` gains `facets` containing active categories, canonical locations, and representative-price bounds.

One response keeps items, totals, current state, and control options coherent and avoids a second failure-prone facets request. A separate `/search` endpoint would duplicate T08 eligibility and card mapping; a separate facets endpoint would create coordination and loading-state complexity without value at this scale.

### 2. Validate raw query values at the NestJS boundary

The existing parser will accept only one string value per supported parameter. It collapses keyword whitespace, treats a whitespace-only keyword as absent, bounds keyword/location length to 120 characters, accepts non-negative safe integer minor units for prices, whole-star `rating` values 1–5, and explicit enums for availability, promotion, and sort. `minPrice > maxPrice`, arrays/repeated values, and malformed explicit values produce the existing sanitized Problem Details shape with field-level issues.

Defaults are `sort=relevance` when `q` is present and `sort=newest` otherwise. Explicit `sort=relevance` without `q` remains canonical in the URL/response but uses newest ordering. Unknown syntactically valid category/location values yield an empty result, not validation failure. Unsupported query keys are ignored by the API and omitted by storefront-generated URLs.

### 3. Use a staged application-side discovery pipeline

The repository continues retrieving only active products from active shops/categories with ordered active variants, inventory, media, and category/shop data. The service pipeline is:

1. map eligible candidates and representative offers using T08 rules;
2. derive safe facets from that complete displayable set;
3. resolve category descendants and canonical location;
4. normalize searchable text and compute relevance;
5. apply every active criterion with AND semantics;
6. sort with deterministic tie-breakers;
7. calculate totals and slice the requested page.

Keeping representative-offer selection ahead of price/promotion filtering guarantees the filter describes the card the buyer sees. Keeping all filters ahead of pagination guarantees accurate totals. Moving only some predicates into Prisma was considered, but it risks filtering on a non-representative variant and splitting business rules across layers. A future measured scale change can replace the candidate stage with SQL while keeping this contract and pipeline semantics.

### 4. Define deterministic normalization and relevance scoring

Search normalization uses Unicode NFD, removes combining marks, lowercases with a stable locale-independent transform, converts `đ` to `d`, collapses non-alphanumeric separators, and tokenizes on spaces. Candidate fields are normalized once per request.

A product is eligible when at least one query token occurs in product name, description, shop name, or category name. Relevance is an integer score with descending weight: exact normalized product name, name prefix, complete name token, partial name token, then category, shop, and description occurrences. Repeated query tokens do not multiply the score. Ties always use `createdAt DESC, id ASC`.

This is inspectable and deterministic for Vietnamese seed data. PostgreSQL FTS/unaccent was considered but would require extension/migration ownership, raw query ranking, and language configuration disproportionate to T09. Typo correction and linguistic stemming remain explicitly out of scope.

### 5. Make every sort mode stable

- `relevance`: score descending when `q` exists, otherwise newest fallback.
- `newest`: `createdAt DESC`.
- `best-selling`: `soldCount DESC`.
- `price-asc` / `price-desc`: representative `priceMinor` in the requested direction.

Every non-newest primary comparison falls through to `createdAt DESC, id ASC`. Sorting occurs on safe integers only; no client calculation can alter order.

### 6. Publish facets before active discovery filters

Facets are derived from all displayable candidates, not the currently filtered subset. Categories include canonical `slug`, display `name`, and `parentSlug` where available; locations are trimmed canonical shop display strings sorted with Vietnamese collation where supported and a deterministic code-point fallback; price bounds use representative prices.

This keeps recovery controls available on a zero-result page and avoids hardcoded database records in Next.js. Facet counts and dynamic narrowing were considered but would add ambiguous self-filter semantics and are deferred.

### 7. Render discovery as a server-side GET form

`/search` normalizes the first allowlisted URL value for rendering, sends all accepted values through the server-only adapter, and uses the normalized API response as the selected control state. A semantic GET form owns keyword, category, integer price bounds, minimum rating, location, `availability=in-stock`, `promotion=discounted`, and sort. Applying controls naturally omits `page`, resetting to page 1; the clear action links to `/search`.

One allowlisted serializer builds pagination and retry destinations from the complete normalized context. Controls remain server components because URL navigation already provides refresh/share/back-forward behavior; a client state store would duplicate the URL and introduce hydration synchronization bugs. Responsive CSS uses a collapsible-by-layout filter panel without hiding controls from assistive technology.

### 8. Extend quick and isolated verification without a migration

Focused contract, parser, service, adapter, and component tests cover each criterion and cross-product combinations. A real PostgreSQL Supertest case verifies seeded combined queries and stable pages. The catalogue Playwright spec adds form interaction, copied-URL reload, sort order, filter clearing, keyboard behavior, axe, and responsive snapshots.

Development uses existing `test:e2e:homepage:quick` plus `test:e2e:catalog:quick` against running services. The final isolated catalogue gate still proves real database behavior and clean setup even though T09 adds no schema migration.

## Risks / Trade-offs

- **[Application-side search loads every active displayable candidate]** → Keep T09 scoped to the bounded catalogue, retain a single mapping pipeline, and document SQL/search-engine migration as a measured future optimization.
- **[Simple token scoring can differ from buyer expectations]** → Keep weights deterministic and tested, avoid marketing it as semantic relevance, and preserve explicit alternative sort modes.
- **[The `in-stock` availability option is redundant with T08 display eligibility]** → Present it as an explicit canonical policy/filter without allowing unavailable products to leak into the catalogue; broader stock browsing requires a future catalogue requirement change.
- **[Canonical Vietnamese location labels contain URL-encoded Unicode]** → Bound and normalize input, serialize with `URLSearchParams`, return the canonical facet label, and test copied URLs.
- **[Required response fields coordinate backend and frontend deployment]** → Build and deploy from the monorepo contract together; rollback both consumers while leaving persistence unchanged.

## Migration Plan

1. Extend and test the shared contract without changing database schema.
2. Deploy the backend query/parser/service response changes together with the server-rendered storefront controls.
3. Verify seeded combinations through the isolated PostgreSQL and browser runner.
4. On rollback, restore the T08 contract/API/UI together; no database rollback or data cleanup is required.
