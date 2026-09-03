## 1. Shared public shop contracts

- [x] 1.1 Add framework-neutral shop slug, pagination, follow-batch, and keyword constants by reusing the existing catalog page and sort vocabulary.
- [x] 1.2 Define strict public shop profile, weighted aggregate, response placeholder, counted category facet, and shop-catalog page types using canonical `CatalogProductCard` items.
- [x] 1.3 Define follow-state batch and mutation response types, including nullable unavailable-unfollow count/timestamp behavior and safe storefront Problem Details.
- [x] 1.4 Implement strict runtime parsers for canonical slugs/UUIDs/timestamps, exact profiles/pages, pagination math, distinct ordered state batches, and follow mutation cross-field invariants.
- [x] 1.5 Export the shop contract surface and add contract tests for exact valid shapes, unknown keys, empty aggregates, bounds, batch ordering, duplicates, invalid identifiers/timestamps, and nullable unavailable results.

## 2. PostgreSQL shop-follow persistence

- [x] 2.1 Add `ShopFollower` plus `User` and `Shop` relations with composite `(userId, shopId)` identity and server UTC `followedAt`.
- [x] 2.2 Create an additive migration with cascading foreign keys and deterministic shop-first and user-first timestamp indexes without modifying existing shop/product rows.
- [x] 2.3 Generate, format, and validate Prisma artifacts and prove migration deployment succeeds from empty and remains safe on repeat deploy.
- [x] 2.4 Add deterministic synthetic follow fixtures across multiple existing users/shops, including followed, unfollowed, self-owner boundary, and empty states, with idempotent repeated seed behavior.
- [x] 2.5 Extend guarded database verification for composite uniqueness, both indexes, relations, cascades, timestamp preservation, per-user isolation, accurate counts, and no existing-data backfill.
- [x] 2.6 Add isolated PostgreSQL migration compatibility checks proving existing catalog, shop ownership, favorites, and recently viewed data remain unchanged.

## 3. Canonical catalog projection reuse

- [x] 3.1 Identify and characterize the current global catalog displayability, projection, category hierarchy, relevance, sort, and pagination behavior with regression fixtures before refactoring.
- [x] 3.2 Promote an explicit catalog public facade that owns the Prisma displayability predicate and canonical `CatalogProductCard` presentation without leaking Prisma types through shared contracts.
- [x] 3.3 Refactor global catalog discovery to consume the facade while preserving every existing response field, filter, default, stable tie-breaker, and error behavior.
- [x] 3.4 Add a shop-scoped facade operation that requires a resolved shop id, excludes foreign/non-displayable products, and returns unfiltered category sources plus filtered deterministic candidates.
- [x] 3.5 Implement keyword normalization/relevance, category hierarchy filtering, supported sort modes, out-of-range pages, and stable product-id tie-breakers for shop-scoped results.
- [x] 3.6 Add equivalence and regression tests proving global and shop-scoped cards share displayability/pricing/media rules and `/search` output remains backward-compatible.

## 4. Shop storefront backend domain

- [x] 4.1 Create and register a capability-oriented NestJS shop storefront module with separate public-read and authenticated-follow controller boundaries.
- [x] 4.2 Add strict canonical shop-slug, UUID, shop-catalog query, and ordered follow-state query parsing with stable sanitized domain errors.
- [x] 4.3 Implement repository reads for active non-deleted shops, owner identity checks, follower membership/counts, conflict-safe inserts, owned deletes, and bounded state lookups.
- [x] 4.4 Implement public profile composition with safe integer sums, rating-count-weighted average, joined time, category counts, follower count, and explicit null response metadata.
- [x] 4.5 Implement shop catalog composition using the catalog facade, unfiltered deterministic facets, filtered totals/items, canonical query metadata, and empty out-of-range pages.
- [x] 4.6 Implement follow as an idempotent transaction that validates public status and self-owner policy, preserves the first timestamp under retries/concurrency, and returns a persisted count snapshot.
- [x] 4.7 Implement owned idempotent unfollow without a public-status prerequisite, using nullable count for unavailable/unknown targets and never altering another buyer's relationship.
- [x] 4.8 Implement bounded follow-state lookup that preserves request order, returns false for canonical unknown/unavailable shops, and never exposes another buyer's membership or timestamps.
- [x] 4.9 Ensure inactive/deleted/unknown shops, account deactivation, database failures, and concurrent requests preserve rollback, privacy, stable errors, and no relationship data in logs.

## 5. Public and authenticated shop API

- [x] 5.1 Expose `GET /api/v1/shops/:shopSlug` with uniform public not-found handling, strict response parsing, OpenAPI schemas, and explicit `Cache-Control: no-store`.
- [x] 5.2 Expose `GET /api/v1/shops/:shopSlug/products` with only `q`, `category`, `sort`, `page`, and `pageSize`, strict validation, OpenAPI bounds, and non-personalized no-store responses.
- [x] 5.3 Expose authenticated `GET /api/v1/account/followed-shops/status` for up to 48 shop IDs in request order with owner scope and `Cache-Control: no-store`.
- [x] 5.4 Expose authenticated, trusted-origin `PUT` and `DELETE /api/v1/account/followed-shops/:shopId` with documented idempotent `200`, validation, self-follow conflict, unavailable, and failure responses.
- [x] 5.5 Extend exception/log sanitization and OpenAPI tests so owner IDs, follower identities, complete membership batches, SQL/internal lifecycle details, and behavioral URLs never enter public errors or telemetry.

## 6. Frontend shop data and state boundary

- [x] 6.1 Add server-only public shop profile/catalog helpers that encode canonical queries, parse every response strictly, and distinguish not-found, validation, and retryable failures.
- [x] 6.2 Add route helpers that accept only public shop discovery parameters, build canonical `/shops/{slug}` links/forms, preserve valid filters across pages, and reject repeated or unsafe URL values.
- [x] 6.3 Generalize catalog product-grid, controls, empty state, and pagination primitives with an action path/href builder while preserving `/search` URLs and visible favorite batching.
- [x] 6.4 Add authenticated follow API helpers that use only `authenticatedFetch`, encode bounded status requests, parse confirmations strictly, and never persist behavioral state.
- [x] 6.5 Implement scoped follow client state after session restoration with optimistic boolean/count updates, per-shop pending guard, parsed authoritative confirmation, rollback announcement, and reset on user/logout change.
- [x] 6.6 Implement safe guest sign-in handoff with only the current validated internal storefront return path and no queued follow, shop state, or browser storage mutation.

## 7. Public shop storefront experience

- [x] 7.1 Add dynamic `/shops/[shopSlug]` server rendering with public profile, canonical metadata, uniform not-found mapping, and profile-preserving catalog error/retry composition.
- [x] 7.2 Build the public shop header with deterministic initial/banner presentation, location/joined date, product/rating/sales/follower summaries, and honest unavailable response-metadata placeholders.
- [x] 7.3 Add accessible follow/unfollow controls with guest, restoring, pressed, pending, success, self-owner/unavailable, and rollback failure states.
- [x] 7.4 Add shop-scoped keyword, category, sort, product-grid, active-filter, empty, validation, retry, and deterministic pagination states using canonical catalog cards and favorite controls.
- [x] 7.5 Link the product-detail shop identity to `/shops/{shopSlug}` without changing the product-detail API contract or breaking variants, favorites, recent-view recording, related products, and purchase intents.
- [x] 7.6 Add responsive mobile/tablet/desktop styles and verify semantic headings, landmarks, keyboard focus, live announcements, contrast, 44-pixel touch targets, and no horizontal overflow.

## 8. Automated behavior verification

- [x] 8.1 Add shop/catalog repository and service unit tests for availability, weighted aggregates, safe sums, facets, query/sort stability, ownership, self-follow, first timestamp, repeated delete, batch order, and privacy-safe failures.
- [x] 8.2 Add Supertest coverage for every exact route, public/auth boundaries, strict validation, uniform 404, self-follow 409, origin enforcement, idempotent `200`, cache headers, OpenAPI, and sanitized Problem Details.
- [x] 8.3 Add isolated PostgreSQL tests for composite uniqueness, indexes/cascades, cross-user isolation, concurrent follow/unfollow, timestamp preservation, inactive-shop unfollow, and count accuracy.
- [x] 8.4 Add frontend unit/integration tests for public route helpers and states, global-search regression, session restoration, guest handoff, optimistic success/rollback, duplicate prevention, favorites integration, and URL/storage privacy.
- [x] 8.5 Add mocked non-mutating Playwright coverage and a pinned `test:e2e:shop:quick` command for product-to-shop navigation, profile/catalog/filter/pagination, guest/auth follow controls, request shapes, accessibility, responsive layouts, and no developer-database mutation.

## 9. Documentation and delivery gates

- [x] 9.1 Document shop/profile/catalog/follow endpoints, query and batch bounds, aggregate formulas, inactive/self-follow policy, privacy/cache boundary, screen verification, and pinned local test commands.
- [x] 9.2 Run migration deploy twice, deterministic seed twice, guarded `db:verify`, and focused shop-follow PostgreSQL suites against the isolated `_test` database.
- [x] 9.3 Run formatting, lint, typecheck, all contract/API/web unit suites, and production builds with pinned pnpm; resolve every new error or warning.
- [x] 9.4 Run `test:e2e:shop:quick`, `test:e2e:product:quick`, `test:e2e:engagement:quick`, `test:e2e:auth:quick`, and `test:e2e:homepage:quick`, documenting mocked quick-mode boundaries and leaving automatic CI triggers unchanged.
- [x] 9.5 Review the final diff for scope, secrets, follower fixtures/logging, generated artifacts, migration compatibility, endpoint/screen guidance, and traceability to every T15 acceptance criterion.
