## 1. Authenticated cart contracts

- [x] 1.1 Restrict cart ownership contracts to authenticated users and remove guest/merge request, response, issue, and adjustment variants that no longer have an API path.
- [x] 1.2 Update contract fixtures for empty, multi-shop, price-changed, insufficient-stock, unavailable, adjusted, and malformed authenticated cart responses.

## 2. PostgreSQL cart persistence

- [x] 2.1 Add `Cart`, `CartLine`, nullable `ProductVariant.maxPurchaseQuantity`, user ownership, indexes, and normalized relations through an additive Prisma migration.
- [x] 2.2 Keep already-applied guest-compatible columns dormant while constraining every runtime repository operation to authenticated `userId` ownership.
- [x] 2.3 Update isolated persistence/concurrency fixtures to prove user ownership, line uniqueness, cross-user privacy, stale versions, duplicate-add locking, and idempotent setup without guest lifecycle behavior.

## 3. Application-wide browser mutation security

- [x] 3.1 Extract exact trusted-origin validation, centralized credential-cookie options/expiry, and sanitized security Problem Details into a shared NestJS security module.
- [x] 3.2 Register a global mutation guard that denies missing/malformed/untrusted Origin for ordinary unsafe methods, enforces strict documented media types/body bounds/method-override rejection, and shares origin configuration with credentialed CORS.
- [x] 3.3 Add reviewed route security classes and verifier composition for the existing Google OAuth callback and future provider-signed webhooks without adding a generic bypass.
- [x] 3.4 Inventory existing mutation routes, remove redundant controller-local origin guards, add trusted Origin to legitimate API tests/callers, and prove missing/untrusted requests fail before domain services while Google login remains functional.

## 4. Authenticated cart domain and API

- [x] 4.1 Replace optional cart identity resolution with the standard `AuthGuard`; derive ownership only from `request.user.sub` and return sanitized `401` responses for anonymous requests after the shared browser-security boundary.
- [x] 4.2 Remove guest credential/configuration services, guest cookie issuance/expiry, merge endpoint/domain behavior, and guest cleanup scripts from the application surface.
- [x] 4.3 Preserve batched canonical projection and current-fact validation for catalog status, deletion, price, inventory, maximum/purchase limit, deterministic multi-shop ordering, typed issues, counts, and integer subtotals.
- [x] 4.4 Update `GET /api/v1/cart` and every mutation to operate only on the authenticated user's cart with private no-store headers, version/ETag, OpenAPI documentation, and sanitized failures.
- [x] 4.5 Preserve transactional duplicate merging, quantity caps/adjustments, 100-line capacity, cart locking, unique-conflict handling, and full authoritative responses.
- [x] 4.6 Preserve versioned quantity update, idempotent owned-line removal, line/shop/all selection, stale conflict handling, and confirmed summary recalculation.

## 5. Storefront authenticated cart state and entry points

- [x] 5.1 Change `CartProvider` to wait for auth restoration, call cart APIs only while authenticated, clear cart data on logout, expose zero anonymous count, and never store cart data in browser storage.
- [x] 5.2 Remove guest merge/retry coordination and its UI notices from email, Google, restore, and cart flows.
- [x] 5.3 Make anonymous product-detail add-to-cart use the safe login handoff while authenticated add uses the selected variant/quantity, pending protection, accepted-cap feedback, and confirmed header refresh.
- [x] 5.4 Keep the storefront header badge authoritative for authenticated users and zero for anonymous users.

## 6. Responsive authenticated cart screen

- [x] 6.1 Render `/cart` as a login-required handoff for anonymous users and preserve loading, empty, authenticated populated, recoverable-error, stale-version, and reconciliation states after login.
- [x] 6.2 Preserve accessible line/shop/all selection, quantity, removal, price/issue, subtotal, retry, and non-committing checkout controls wired to confirmed API responses.
- [x] 6.3 Preserve keyboard operation, visible focus, live announcements, practical touch targets, and no document-level overflow at 360, 768, and 1440 px.

## 7. Verification and documentation

- [x] 7.1 Update cart controller/service/Supertest coverage for required authentication, cross-user privacy, no-store/ETag, origin/content-type policies, limits, and sanitized Problem Details; remove guest/merge expectations.
- [x] 7.2 Update guarded PostgreSQL cart tests for authenticated persistence and concurrency without guest creation, expiry, cleanup, or merge.
- [x] 7.3 Update `test:e2e:cart:quick` for anonymous login handoff, authenticated product-detail feedback, header count, multi-shop controls, keyboard flow, and reference-width overflow.
- [x] 7.4 Update OpenAPI, environment examples, setup/runbook documentation, and root `flow.md` with the authenticated-only cart flow and the default authentication rule for future user-scoped features.
- [x] 7.5 Run formatting, lint, typecheck, build, contract/unit/API tests, guarded PostgreSQL cart suites, `test:e2e:cart:quick`, clean migration smoke, and strict OpenSpec validation; resolve every regression before completion.
