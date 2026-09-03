## 1. Shared checkout and order contracts

- [x] 1.1 Add framework-neutral constants and types for checkout drafts, per-shop notes/services, readiness blockers, fingerprints, idempotency keys, COD/payment/order statuses, snapshots, purchase results, and Problem Details.
- [x] 1.2 Implement strict request normalization/parsers for preview and confirmation that reject unknown fields, duplicates, invalid UUIDs/codes, control characters, overlong notes, money fields, and non-participating-shop inputs.
- [x] 1.3 Implement exact-key response guards for previews, first/replayed confirmations, and purchase results, including safe-integer money and line/order/purchase reconciliation invariants.
- [x] 1.4 Add shared-contract tests for valid single/multi-shop payloads, deterministic ordering, every blocker/error shape, malformed snapshots, overflow, and total/allocation mismatches.
- [x] 1.5 Export the checkout/order contracts from the package entrypoint without changing existing cart, pricing, or voucher exports.

## 2. Purchase persistence and migration

- [x] 2.1 Add Prisma enums and the `Purchase`, `ShopOrder`, `OrderLine`, `PurchaseVoucher`, and `PurchaseVoucherAllocation` models with buyer/shop/catalog/voucher relations and immutable snapshot fields.
- [x] 2.2 Link `VoucherConsumption.purchaseReference` one-to-one to the purchase UUID and add inverse relations to the existing user, shop, product, variant, and voucher models.
- [x] 2.3 Create an additive migration with UUID/JSONB/money columns, foreign keys, deterministic indexes, buyer-idempotency and graph uniqueness constraints, enum values, and non-negative/row-local total checks.
- [x] 2.4 Extend Prisma schema and migration tests to verify names, mappings, constraints, relations, idempotency uniqueness, per-shop uniqueness, and restrictive historical references.
- [x] 2.5 Extend database verification for the new tables while keeping seeded transactional purchase/order tables empty and preserving idempotent dataset seeding.
- [x] 2.6 Regenerate the Prisma client, format/validate the schema, deploy the migration against PostgreSQL, and verify migration smoke from the current T18 schema.

## 3. Canonical checkout assembly

- [x] 3.1 Add test-first canonicalizers for voucher/service/note input, fixed shop ordering, request digests, advisory-lock keys, and timing-safe checkout-fingerprint comparison.
- [x] 3.2 Extend the internal pricing transaction result with the full owned address and selected product/variant/shop snapshot facts needed by orders while keeping `/api/v1/cart/quote` unchanged.
- [x] 3.3 Implement the canonical checkout assembler that reuses pricing-v2, voucher-v1, and mock-v1 calculations and requires an explicit service for every participating shop.
- [x] 3.4 Derive stable readiness blockers for empty selection, any selected-line exclusion, rejected voucher, missing service, and invalid shop-scoped input; return a fingerprint only for a ready preview.
- [x] 3.5 Compute a versioned SHA-256 fingerprint over sorted effective checkout/snapshot facts while excluding evaluation time and sufficient raw inventory counters.
- [x] 3.6 Add unit tests proving input-order independence and that price, eligibility, cart, address, service, voucher, note, and snapshot changes alter readiness or fingerprint as designed.

## 4. Transactional COD purchase creation

- [x] 4.1 Implement a purchase projector that reads only committed snapshots, converts BigInt safely, verifies graph/total/allocation invariants, and returns deterministic orders, lines, and vouchers.
- [x] 4.2 Implement an injectable order writer that persists the purchase, one order per sorted shop, each order line exactly once, and purchase-voucher allocation snapshots inside a provided Prisma transaction.
- [x] 4.3 Extend voucher consumption results with stable redemption identifiers needed for purchase linkage while preserving existing idempotent and concurrency-safe behavior.
- [x] 4.4 Implement per-buyer/idempotency-key PostgreSQL advisory transaction locking and successful request-digest replay/conflict lookup before mutable cart validation.
- [x] 4.5 Implement bounded retry for retryable PostgreSQL serialization/deadlock failures without retrying business conflicts or exposing database details.
- [x] 4.6 Implement COD confirmation in a Serializable transaction: lock cart, verify version, rebuild checkout, compare fingerprint, create graph, consume vouchers, remove mapped lines, and increment cart version exactly once.
- [x] 4.7 Implement owner-scoped committed purchase retrieval with identical non-enumerating `404` behavior for missing and foreign references.
- [x] 4.8 Add service tests for single/multi-shop grouping, snapshot persistence, all total equations, source-data mutation after commit, selective/complete cart cleanup, replay after cleanup, and safe-number failures.

## 5. Checkout HTTP API and security boundary

- [x] 5.1 Add strict NestJS DTOs plus stable checkout validation, address-not-found, stale-cart, not-ready, preview-changed, idempotency-conflict, and unavailable errors.
- [x] 5.2 Implement `POST /api/v1/checkout/preview` with `If-Match`, authenticated buyer context, private/no-store response headers, strict parsing, and the canonical assembler.
- [x] 5.3 Implement `POST /api/v1/checkout/cod` with required UUID `Idempotency-Key`, first-success `201`, replay `200`, current cart ETag handling, and no client-authoritative monetary fields.
- [x] 5.4 Implement `GET /api/v1/checkout/purchases/:purchaseReference` for the authenticated owner and return the shared immutable result contract.
- [x] 5.5 Add OpenAPI schemas/responses, the checkout exception filter, `CheckoutModule`, and application wiring while retaining the existing global Origin/media guard and AuthGuard behavior.
- [x] 5.6 Add HTTP tests for auth and Origin precedence, foreign/deleted addresses, malformed headers/bodies, unknown fields, stale ETags, blockers, private caching, status codes, and non-enumerating reads.
- [x] 5.7 Add PostgreSQL E2E tests for current-price/snapshot revalidation, multi-shop splitting, voucher expiry/limit changes, unselected-line retention, and full-cart cleanup.
- [x] 5.8 Add real PostgreSQL rollback and concurrency tests using the injectable order-writer fault seam and simultaneous equivalent idempotency requests; assert one graph, one voucher consumption, and no partial effects.

## 6. Storefront checkout state and API client

- [x] 6.1 Add a web checkout API client that sends credentials, Origin-compatible mutations, cart ETags and idempotency headers, validates every success/error contract, and never sends totals.
- [x] 6.2 Add a versioned `sessionStorage` checkout-draft parser/writer containing only cart/address/shop/service/voucher identifiers and preserving no personal address fields or monetary values.
- [x] 6.3 Add a submit-intent manager that creates one `crypto.randomUUID()` key, reuses it after unknown network outcomes, and rotates it only after definitive conflict or intentional input change.
- [x] 6.4 Add a checkout-preview hook with default address/`STANDARD` service initialization, normalized notes/vouchers, stale state, abort/sequence protection, `409` cart refresh, and server blocker handling.
- [x] 6.5 Add unit/hook tests for corrupt/stale drafts, default fallbacks, rapid request races, fingerprint replacement, network retry key reuse, intentional edit key rotation, and strict response rejection.

## 7. Checkout and confirmation screens

- [x] 7.1 Replace the cart placeholder action with draft creation and navigation to `/checkout` only while the authenticated authoritative quote and current cart version are ready.
- [x] 7.2 Add the authenticated `/checkout` route showing the full delivery address, selected items grouped by shop, per-shop shipping choices/ETA/fees, voucher results, and server totals.
- [x] 7.3 Add per-shop note editing with accessible limits plus address and service controls that mark prior totals stale and request a fresh preview.
- [x] 7.4 Render stable blocker/error recovery for missing address, empty/unavailable selections, rejected vouchers, stale cart/preview, authentication expiry, and transient server failures.
- [x] 7.5 Implement COD confirmation with duplicate-click prevention, stable-key retry behavior, fresh-preview conflict recovery, draft cleanup on success, and navigation by purchase reference.
- [x] 7.6 Add `/checkout/success/[purchaseReference]` that reloads the owner-scoped committed result and displays purchase reference, child orders, snapshots, COD amount, and pending-confirmation state.
- [x] 7.7 Add responsive Shopee-like styles and keyboard/screen-reader behavior for mobile, tablet, and desktop without obscuring the sticky total/action area.
- [x] 7.8 Add Testing Library coverage for cart handoff, checkout loading/ready/blocker/error states, edits and races, duplicate confirmation, lost-response retry, success rendering, refresh, and foreign/not-found handling.

## 8. Browser journey, documentation, and flow

- [x] 8.1 Add Playwright checkout fixtures/tests for authenticated multi-shop COD, address/service/voucher/note review, blocked confirmation, successful split orders, duplicate-submit safety, and confirmation refresh at 360/768/1440 widths.
- [x] 8.2 Register `test:e2e:checkout:quick` in the focused runner so routine T19 verification runs only checkout-related browser coverage.
- [x] 8.3 Document the three checkout endpoints, required headers, request/response examples, status/problem types, idempotent retry guidance, screens, and the deliberate T24 stock-reservation limitation.
- [x] 8.4 Update `flow.md` with the preview/fingerprint/confirmation transaction, replay/conflict branches, per-shop split, voucher consumption, cart cleanup, rollback, and confirmation-refresh flow.

## 9. Verification gates

- [x] 9.1 Run focused shared-contract, checkout domain/API, Prisma, and web component tests; fix all failures without weakening assertions.
- [x] 9.2 Run the guarded PostgreSQL checkout/voucher/cart integration suites and migration smoke; verify rollback and concurrent replay leave exact expected row counts.
- [x] 9.3 Run workspace typecheck, lint, full unit test suite, and production build; retain only documented pre-existing non-blocking warnings.
- [x] 9.4 Run `pnpm test:e2e:checkout:quick` plus `pnpm test:e2e:homepage:quick` as the focused checkout and regression browser gates rather than rerunning unrelated full E2E suites.
- [x] 9.5 Run `openspec validate implement-cod-checkout-orders --strict`, confirm every checkbox and acceptance criterion has evidence, and add the implementation/endpoint/screen verification summary.
