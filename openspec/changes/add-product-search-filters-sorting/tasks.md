## 1. Shared Discovery Contract

- [x] 1.1 Extend catalogue query context with nullable keyword, category, price bounds, rating, location, availability, promotion, and required normalized sort types.
- [x] 1.2 Add discovery facet types for active category hierarchy, canonical shop locations, and representative-price bounds to the catalogue response.
- [x] 1.3 Extend conservative runtime parsing for every query/facet field, supported enum, safe integer bound, canonical nullable value, and internally consistent response.
- [x] 1.4 Add contract tests for valid populated/empty discovery responses plus malformed query, facet, money, rating, sort, and pagination payloads.

## 2. NestJS Query Boundary

- [x] 2.1 Extend `NormalizedCatalogQuery`, invalid-parameter names, and raw query parsing for every T09 discovery parameter without accepting repeated values.
- [x] 2.2 Normalize keyword whitespace, bound keyword/location length, treat whitespace-only `q` as absent, and preserve a safe human-readable query value.
- [x] 2.3 Validate non-negative safe integer `minPrice`/`maxPrice`, reject inverted bounds, and validate whole-star rating values from 1 through 5.
- [x] 2.4 Validate `availability=in-stock`, `promotion=discounted`, and the five documented sort enums with keyword-sensitive defaults.
- [x] 2.5 Keep unknown syntactically valid category/location values available to the service for empty-result semantics while rejecting malformed values as sanitized Problem Details.
- [x] 2.6 Add parser unit tests for defaults, normalization, every valid criterion, repeated/invalid/oversized values, inverted prices, unsupported keys, and aggregated field issues.
- [x] 2.7 Extend Supertest coverage for normalized anonymous discovery queries, default sorts, validation errors, ignored unsupported parameters, and sanitized data-source failures.

## 3. Discovery Pipeline, Facets, and Sorting

- [x] 3.1 Extract a typed internal displayable-candidate model containing card data, source timestamps/text, representative price, promotion state, and category ancestry inputs.
- [x] 3.2 Implement deterministic Unicode/`đ` normalization, unique query tokenization, field matching, and weighted integer relevance scoring with focused unit tests.
- [x] 3.3 Derive safe unfiltered category, canonical location, and representative-price facets from displayable candidates in deterministic order.
- [x] 3.4 Apply keyword, descendant category, representative price, minimum rating, canonical location, in-stock policy, and discounted promotion criteria with AND semantics before totals.
- [x] 3.5 Implement relevance/newest/best-selling/price-ascending/price-descending comparisons with `createdAt DESC, id ASC` tie-breakers and relevance-without-keyword fallback.
- [x] 3.6 Return complete normalized query/facet context and paginate only after filtering/sorting, including accurate first, middle, final, beyond-final, and no-match metadata.
- [x] 3.7 Add service/repository tests for Vietnamese accented/unaccented matching, score precedence, every filter, full combinations, unknown facets, representative offers, facet safety, stable ties, and page boundaries.

## 4. Real PostgreSQL API Verification

- [x] 4.1 Ensure deterministic seed records cover accented names, multiple categories/locations, price/rating/sold ranges, discounted/non-discounted products, and multi-page combinations without adding a schema migration.
- [x] 4.2 Extend persistence verification for discovery coverage and idempotent seed facts while retaining every T08 count and constraint assertion.
- [x] 4.3 Extend the guarded PostgreSQL Supertest suite for keyword normalization, parent category plus filters, price/rating/location/promotion combinations, every sort order, and stable repeated pages.
- [x] 4.4 Verify facets remain available on no-match results and exclude inactive/deleted/unavailable candidates through real database state fixtures.
- [x] 4.5 Run the real PostgreSQL suite only in the isolated catalogue runner and confirm the quick commands never migrate, seed, build, or mutate local data.

## 5. Next.js Discovery Route and Controls

- [x] 5.1 Extend the server-only catalogue adapter query encoding and typed response handling for all discovery criteria without sending unsupported URL state.
- [x] 5.2 Build one allowlisted normalization/serialization utility used by API calls, pagination, retry, sort, and active-filter destinations.
- [x] 5.3 Update `/search` to activate keyword search and use API-normalized query/facets as the selected server-rendered state instead of T09 deferred copy.
- [x] 5.4 Build a semantic GET discovery form with keyword, API-backed category/location, integer price range, rating, availability, promotion, sort, apply, and clear controls that omit `page` on submit.
- [x] 5.5 Add a result summary and active-filter presentation that remains honest for relevance fallback, filtered counts, no-match results, invalid URLs, and API failure/retry.
- [x] 5.6 Extend pagination context to preserve every supported normalized criterion and explicit page size while replacing only `page` and dropping unsupported parameters.
- [x] 5.7 Add responsive styling for dense desktop filters and operable mobile/tablet controls with semantic grouping, visible focus, 44 px targets, and no horizontal page overflow.

## 6. Frontend and Browser Tests

- [x] 6.1 Extend adapter tests for complete query encoding, Unicode locations, omissions, timeout/transport/status/contract errors, facets, and successful empty/populated responses.
- [x] 6.2 Add Testing Library coverage for API-backed controls, normalized selected values, result summary, active filters, apply/reset behavior, no-match recovery, retry, and shared-shell continuity.
- [x] 6.3 Add URL serializer and pagination tests proving full supported-state preservation, page reset, deterministic order, correct encoding, and unsupported-key removal.
- [x] 6.4 Extend catalogue Playwright coverage for combined form interaction, accented/unaccented keyword results, every sort, parent category, price/rating/location/promotion filters, copied-URL reload, pagination, clear-all, and zero broken product links.
- [x] 6.5 Verify keyboard order, selected-state announcements, 44 px controls, sticky shell, no horizontal overflow, and zero serious/critical axe violations at 360×800, 768×1024, and 1440×900.
- [x] 6.6 Regenerate and manually review discovery screenshot baselines at all reference widths for Shopee-like density, control clarity, active context, and card consistency.

## 7. Documentation, Gates, and Delivery

- [x] 7.1 Document discovery parameters, validation/defaults, relevance weights, filter semantics, facet ownership, URL behavior, local quick commands, and T09 non-goals.
- [x] 7.2 During development run focused tests plus `test:e2e:homepage:quick` and `test:e2e:catalog:quick`; retain manual-only GitHub Actions.
- [x] 7.3 Run frozen install, Prisma verification, format, lint, typecheck, all tests, production builds, isolated catalogue PostgreSQL/browser E2E, and strict OpenSpec validation before delivery.
- [ ] 7.4 Record verification evidence, commit and push T09 directly to `development` without a pull request, confirm no automatic Actions run, close issue `#10`, and confirm no issue branch remains.
