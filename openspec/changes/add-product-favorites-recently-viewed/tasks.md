## 1. Shared buyer engagement contracts

- [x] 1.1 Add framework-neutral engagement pagination constants, availability types, favorite state, favorite/history item, page, and mutation response types in `packages/contracts`.
- [x] 1.2 Define the available and unavailable private product-summary shapes without making the public `CatalogProductCard` contract personalized.
- [x] 1.3 Implement strict runtime parsers for canonical UUIDs, timestamps, favorite-state batches, mutations, pages, pagination metadata, and engagement Problem Details.
- [x] 1.4 Add pure strict query helpers/constants for page 1, page size 20, maximum page size 48, maximum 48 status IDs, and recent-history retention 100.
- [x] 1.5 Export the engagement contract surface and add tests for exact valid shapes, unknown keys, unavailable items, batch ordering, pagination bounds, and invalid timestamps/identifiers.

## 2. PostgreSQL engagement persistence

- [x] 2.1 Add `ProductFavorite` and `RecentlyViewedProduct` Prisma models plus `User`/`Product` relations with composite buyer-product primary keys and UTC relationship timestamps.
- [x] 2.2 Create an additive migration with cascading foreign keys and deterministic `(user_id, timestamp DESC, product_id)` pagination indexes for both relations.
- [x] 2.3 Generate, format, and validate Prisma artifacts; prove migration deployment succeeds from empty and remains idempotent on repeat deploy.
- [x] 2.4 Extend deterministic seed fixtures with multiple users, available/unavailable favorites, repeated-view ordering, and empty engagement states without embedding real behavioral data.
- [x] 2.5 Extend guarded database verification for composite uniqueness, relations, cascade behavior, timestamp order, per-user isolation, indexes, and the 100-row history bound.
- [x] 2.6 Add migration/schema compatibility checks showing existing users and products need no backfill and public catalog data remains unchanged.

## 3. Buyer engagement backend domain

- [x] 3.1 Create and register a capability-oriented NestJS buyer engagement module without changing authentication token, cookie, or public catalog contracts.
- [x] 3.2 Add strict page, page-size, batched-product-ID, and canonical route-parameter parsing with stable domain errors and a sanitized engagement Problem Details filter.
- [x] 3.3 Implement repository predicates that reuse public product/shop displayability rules while keeping engagement queries owner-scoped and deterministic.
- [x] 3.4 Implement favorite listing with available catalog-card projections, minimal unavailable projections, newest-save ordering, count metadata, and out-of-range page behavior.
- [x] 3.5 Implement favorite PUT as insert-if-absent preserving the original timestamp and favorite DELETE as an owned idempotent delete that works for unavailable saved products.
- [x] 3.6 Implement bounded batched favorite-state lookup that preserves canonical request order, returns false for canonical unknown IDs, and never exposes another buyer's relationships.
- [x] 3.7 Implement recently viewed recording in a user-row-locked transaction with server time, displayability validation, composite upsert, repeat-view promotion, and deterministic trimming to 100 rows.
- [x] 3.8 Implement recently viewed listing that omits non-displayable products from items and totals while preserving latest-view deterministic ordering.
- [x] 3.9 Ensure account deactivation, missing/invalid products, database failures, and concurrent requests preserve privacy, idempotency, rollback, and stable public error behavior.

## 4. Authenticated engagement API

- [x] 4.1 Expose `GET /api/v1/account/favorites` and `GET /api/v1/account/favorites/status` with bearer authentication, strict query validation, owner scope, and `Cache-Control: no-store`.
- [x] 4.2 Expose idempotent `PUT /api/v1/account/favorites/:productId` and `DELETE /api/v1/account/favorites/:productId` with bearer authentication, trusted-origin enforcement, and documented status codes.
- [x] 4.3 Expose `GET /api/v1/account/recently-viewed` and idempotent `PUT /api/v1/account/recently-viewed/:productId` with strict validation, authentication, origin enforcement for recording, and non-cacheable responses.
- [x] 4.4 Document all engagement operations, bounds, response schemas, authentication/origin requirements, success codes, unavailable policy, validation, not-found, and internal failures in OpenAPI.
- [x] 4.5 Extend exception/log sanitization and tests so complete favorite/history collections or buyer-product mappings cannot enter errors, telemetry, URLs, or response metadata.

## 5. Frontend engagement data boundary

- [x] 5.1 Add engagement API helpers that use only `authenticatedFetch`, encode bounded queries canonically, parse every shared response strictly, and never persist behavioral state.
- [x] 5.2 Build a scoped visible-product favorite-state coordinator that batches up to 48 distinct IDs once session restoration resolves and shares results without per-card request fan-out.
- [x] 5.3 Implement optimistic favorite/unfavorite state with per-product pending guards, parsed server confirmation, accessible rollback errors, and state reset on session/logout changes.
- [x] 5.4 Add safe guest sign-in handoff that returns to the current internal storefront path without queuing a favorite mutation or placing engagement state in the URL.
- [x] 5.5 Add a non-blocking product-detail view recorder that fires once per authenticated mounted product, tolerates retry/failure, and never records guest views.

## 6. Favorite and recently viewed user experience

- [x] 6.1 Add accessible favorite controls with pressed, pending, guest, success, and failure states to product detail and reusable homepage/search product-card surfaces without breaking product navigation.
- [x] 6.2 Add `/account/favorites` with protected session restoration, newest-first available cards, unavailable removable cards, loading, empty, failure/retry, and paginated states.
- [x] 6.3 Add `/account/recently-viewed` with protected session restoration, latest-view timestamps, displayable product cards, loading, empty, failure/retry, and paginated states.
- [x] 6.4 Extend account navigation and header/account entry points for favorites and recently viewed without exposing behavioral values in links.
- [x] 6.5 Reuse canonical product image/price/rating/shop presentation for available items and create a minimal non-clickable treatment for unavailable favorites.
- [x] 6.6 Add responsive styles for mobile, tablet, and desktop; verify semantic headings, live announcements, keyboard focus, contrast, touch targets, and no horizontal overflow.

## 7. Automated behavior verification

- [x] 7.1 Add engagement repository/service unit tests for ownership, favorite timestamp preservation, repeated delete, batch order/bounds, displayability, deterministic pages, locked history upsert/trim, rollback, and privacy-safe failures.
- [x] 7.2 Add Supertest coverage for every exact route, 401 versus not-found behavior, origin enforcement, strict query/parameter rejection, idempotent status codes, cache headers, unavailable policy, and safe error bodies.
- [x] 7.3 Add isolated PostgreSQL tests for composite uniqueness, unrelated-user isolation, concurrent favorite/view requests, repeat-view promotion, deterministic retention, cascades, unavailable projections, and filtered recent totals.
- [x] 7.4 Add frontend unit/integration tests for restoration/guest states, batched hydration, favorite optimistic success/rollback, duplicate-submit prevention, non-blocking view recording, unavailable favorites, pages, and browser-memory privacy.
- [x] 7.5 Add mocked non-mutating Playwright coverage and a pinned `test:e2e:engagement:quick` command for favorite controls, both account screens, accessibility, responsive layouts, request shapes, URL/storage privacy, and no developer-database mutation.

## 8. Documentation and delivery gates

- [x] 8.1 Document engagement endpoints, pagination/status/retention bounds, unavailable policies, user-first lock order, privacy boundary, screen verification, and local test commands.
- [x] 8.2 Run migration deploy twice, deterministic seed twice, guarded `db:verify`, and focused engagement PostgreSQL suites against the isolated `_test` database.
- [x] 8.3 Run formatting, lint, typecheck, all contract/API/web unit suites, and production builds with pinned pnpm; resolve every new error or warning.
- [x] 8.4 Run `test:e2e:engagement:quick`, `test:e2e:auth:quick`, `test:e2e:product:quick`, and `test:e2e:homepage:quick`, documenting mocked quick-mode boundaries and leaving automatic CI triggers unchanged.
- [x] 8.5 Review the final diff for scope, secrets, behavioral-data fixtures/logging, generated artifacts, migration compatibility, endpoint/screen verification guidance, and traceability to every T14 acceptance criterion.
