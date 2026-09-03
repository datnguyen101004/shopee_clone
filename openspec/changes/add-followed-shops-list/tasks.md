## 1. Shared followed-shop contracts

- [x] 1.1 Add followed-shop page/query constants for page 1, default size 20, and maximum size 48 without changing the existing shop-catalog defaults.
- [x] 1.2 Define canonical followed-shop pagination, available summary, unavailable summary, relationship item union, and page response types in the framework-neutral shop contract surface.
- [x] 1.3 Implement strict parsers for page queries, canonical UUIDs/timestamps/links, exact available and unavailable shapes, pagination math, and response item bounds.
- [x] 1.4 Export the new contract surface and add tests for default/custom queries, unknown/repeated/invalid parameters, exact populated/empty/out-of-range pages, union privacy, and malformed responses.

## 2. Backend query and projection

- [x] 2.1 Extend shop-storefront input handling with allowlisted `page`/`pageSize` parsing and safe invalid-parameter reporting for `GET /account/followed-shops`.
- [x] 2.2 Add repository methods that count one buyer's relationships and read a bounded page by `followedAt DESC, shopId ASC` while selecting only required shop identity/lifecycle fields.
- [x] 2.3 Add one grouped follower-count query for available shop IDs on the current page and reconstruct counts without per-shop database calls.
- [x] 2.4 Add a service list operation that calculates canonical pagination and maps public shops to available summaries and inactive/deleted shops to the minimal unavailable projection.
- [x] 2.5 Add `GET /api/v1/account/followed-shops` before dynamic routes with authentication, `Cache-Control: no-store`, strict query parsing, OpenAPI success/error schemas, and existing sanitized exception mapping.
- [x] 2.6 Add repository, input, and service tests for owner scoping, stable ties, defaults/bounds, out-of-range pages, grouped counts, unavailable privacy, hard-delete absence, and aggregate/persistence failure handling.
- [x] 2.7 Extend Supertest and OpenAPI coverage for exact route precedence, authenticated success, `400`, `401`, `503`, no-store headers, response contracts, and sanitized errors without regressing status/PUT/DELETE routes.

## 3. PostgreSQL verification without a migration

- [x] 3.1 Confirm the existing `(user_id, followed_at DESC, shop_id)` index matches the planned list query and document that T15.1 introduces no Prisma schema or migration change.
- [x] 3.2 Extend the real PostgreSQL shop suite with deterministic same-timestamp ordering, page boundaries, out-of-range reads, current grouped counts, and unrelated-user isolation.
- [x] 3.3 Cover inactive and soft-deleted relationship retention plus hard-delete cascade removal and verify unavailable rows remain removable through the existing DELETE operation.
- [x] 3.4 Run migration deployment and seed/verification twice to prove T15.1 planning did not introduce schema drift or non-idempotent persistence behavior.

## 4. Frontend API and routing

- [x] 4.1 Extend the authenticated shop-follow API helper with canonical pagination serialization, `GET /api/v1/account/followed-shops`, strict page parsing, and transport/status/contract error handling.
- [x] 4.2 Add pure account-route query/href helpers that retain only normalized `page`/`pageSize` state and generate canonical pagination URLs.
- [x] 4.3 Add `/account/followed-shops/page.tsx` as a thin route around a dedicated `FollowedShopsManagement` client component.
- [x] 4.4 Extend `ProtectedAccountState` return-path typing and account navigation plus the authenticated marketplace header with a “Shop đang theo dõi” link.
- [x] 4.5 Add API/helper/navigation tests for exact request URLs, normalized defaults, unknown query removal, safe login handoff, and existing account-link regression behavior.

## 5. Followed-shops account experience

- [x] 5.1 Implement session-restored loading, guest, populated, empty, recoverable-error, invalid-query, and valid out-of-range states using existing account/UI primitives.
- [x] 5.2 Render responsive available cards with canonical storefront links, current location/follower count, followed date, deterministic text avatar, and accessible labels.
- [x] 5.3 Render unavailable cards with only retained name, unavailable explanation, follow date, and no slug/link/location/count/lifecycle detail.
- [x] 5.4 Implement per-shop pending unfollow through the existing DELETE helper, retain the card until confirmation, and announce success or retryable failure without optimistic follower-count arithmetic.
- [x] 5.5 Refetch authoritative list contents after success, navigate to the nearest preceding page when the final item on a later page is removed, and restore logical keyboard focus.
- [x] 5.6 Add canonical pagination controls, mobile/tablet/desktop styles, visible focus, practical touch targets, live announcements, and horizontal-overflow protection.
- [x] 5.7 Add component tests for every page/card state, available/unavailable privacy, duplicate-submit prevention, success/failure reconciliation, page fallback, focus, accessibility, and absence of browser-storage persistence.

## 6. Browser coverage and documentation

- [x] 6.1 Extend `e2e/shop.spec.ts` with authenticated account navigation, populated/empty/unavailable list, pagination, successful unfollow, and recoverable failure using intercepted private list/mutation routes.
- [x] 6.2 Keep `test:e2e:shop:quick` read-only for the developer database and verify the followed-shops journey at 360, 768, and 1440 pixel reference widths with accessibility and overflow checks.
- [x] 6.3 Update shop documentation with the list endpoint, response availability policy, account screen, verification commands, and the distinction between quick mocks and real PostgreSQL tests.
- [x] 6.4 Update root `flow.md` after implementation so the delivered account-list and unfollow reconciliation flow matches the final code rather than only the planned diagram.

## 7. Final quality and compatibility gates

- [x] 7.1 Run Prettier, ESLint, TypeScript checks, focused contract/API/web tests, and shop/auth/account regression suites with pnpm 10.34.5.
- [x] 7.2 Run the guarded real PostgreSQL followed-shop tests and database verification, then run API and web production builds.
- [x] 7.3 Run `test:e2e:shop:quick` against already-running services and confirm existing storefront follow/status, product-detail shop navigation, favorites, and recently-viewed flows remain compatible.
- [x] 7.4 Re-run `openspec validate add-followed-shops-list --strict`, reconcile every artifact with the delivered implementation, and mark tasks complete only after all required evidence passes.
