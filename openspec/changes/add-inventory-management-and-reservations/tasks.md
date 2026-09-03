## 1. Contracts and persistence model

- [x] 1.1 Add framework-neutral inventory balance, adjustment, audit-page, reason-code, and pagination contracts with strict runtime parsers.
- [x] 1.2 Add checkout inventory-conflict payload contracts and canonical helpers for inventory ETags, idempotency keys, request digests, and UTC timestamps.
- [x] 1.3 Extend Prisma with inventory sold quantity/version, reservation lifecycle, reservation lines, immutable adjustment events, relations, indexes, and supported enums.
- [x] 1.4 Write a forward migration with non-negative/reserved-within-on-hand check constraints, live-reservation uniqueness, and deterministic query indexes.
- [x] 1.5 Backfill existing inventory versions/sold quantities and baseline audit events without altering current on-hand or reserved balances.
- [x] 1.6 Regenerate Prisma artifacts and update test/seed factories for the expanded inventory schema.
- [x] 1.7 Add contract and migration verification tests for exact keys, safe integers, invalid states, constraints, and rollback assumptions.

## 2. Inventory domain and concurrency controls

- [x] 2.1 Create a capability-oriented inventory module with repository, balance projector, UTC clock, domain errors, and transaction-compatible service interfaces.
- [x] 2.2 Implement safe available-quantity projection and checked integer arithmetic shared by seller and buyer-facing consumers.
- [x] 2.3 Implement parameterized sorted `FOR UPDATE` inventory locking and guarded balance updates with bounded PostgreSQL retry behavior.
- [x] 2.4 Implement shop-scoped inventory lookup with approved-seller ownership enforcement and non-enumerating not-found behavior.
- [x] 2.5 Implement seller adjustment canonicalization, request digesting, idempotent replay, stale-version detection, and key-reuse conflict handling.
- [x] 2.6 Apply seller adjustments and immutable before/after audit events atomically while enforcing on-hand/reserved invariants.
- [x] 2.7 Implement stable cursor pagination for seller inventory balances and per-variant adjustment history.
- [x] 2.8 Implement idempotent reservation release, expiry, and consumption domain commands plus balance/event reconciliation assertions.
- [x] 2.9 Add unit tests for arithmetic, ownership, stale versions, invalid negative deltas, reserved-stock protection, replay, and audit invariants.
- [x] 2.10 Add PostgreSQL integration tests that race two adjustments against one version and verify exactly one commit.

## 3. Seller inventory API

- [x] 3.1 Add `GET /api/v1/seller/inventory` with strict cursor/filter validation, stable ordering, private caching headers, and OpenAPI documentation.
- [x] 3.2 Add `GET /api/v1/seller/inventory/:variantId/adjustments` for immutable shop-owned audit history.
- [x] 3.3 Add `POST /api/v1/seller/inventory/:variantId/adjustments` using `If-Match` and `Idempotency-Key`, strict DTO validation, and canonical response ETags.
- [x] 3.4 Map validation, ownership, version, invariant, idempotency, and unavailable failures to sanitized RFC 9457 Problem Details.
- [x] 3.5 Verify the project-wide browser origin guard, seller role guard, request-size policy, and no-store behavior cover the new mutation endpoint.
- [x] 3.6 Add controller/service integration tests for list, history, successful adjustment, replay, key misuse, stale version, foreign variant, and reserved-stock conflicts.

## 4. Product authoring and stock-read integration

- [x] 4.1 Route new variant stock through an `INITIAL_STOCK` inventory command and baseline audit event inside product creation.
- [x] 4.2 Replace direct on-hand writes during product update with versioned `PRODUCT_EDIT` deltas while preserving protected variants and atomic product validation.
- [x] 4.3 Ensure content-only product updates produce no inventory mutation or audit event.
- [x] 4.4 Centralize available-stock reads across catalog, homepage, product detail, engagement, cart, pricing, checkout preview, and seller product summaries.
- [x] 4.5 Update sold summaries from consumed reservation lines in the purchase transaction without changing immutable order snapshots.
- [x] 4.6 Add regression tests proving every affected read path subtracts active reservations consistently and never exposes negative availability.
- [x] 4.7 Add seller-product tests for initial stock, audited stock edit, unchanged stock, stale concurrent adjustment, and rollback after product validation failure.

## 5. Checkout reservation and consumption

- [x] 5.1 Implement canonical multi-line reservation input derived only from the locked server cart and authoritative checkout assembly.
- [x] 5.2 Keep the existing 15-minute lifetime, derive authoritative database time, persist `expiresAt = databaseNow + 15 minutes`, and retain the sorted-lock, all-or-nothing, immutable-line, and generation-token guarantees.
- [x] 5.3 Resume an equivalent active reservation for the same buyer/idempotency key and reject a live key whose request digest differs.
- [x] 5.4 Integrate reservation acquisition into `POST /api/v1/checkout/cod` without changing the public confirmation request contract or preview behavior.
- [x] 5.5 Revalidate fingerprint, cart version, pricing, address, shipping, and vouchers after reservation and before purchase commit.
- [x] 5.6 Consume reservation lines in the same transaction as purchase/orders, vouchers, cart cleanup, on-hand/reserved/sold updates, and purchase linkage.
- [x] 5.7 Harden the shared idempotent compensation release for checkout and authoritative payment failures, recording a stable terminal reason and retaining durable expiry as the process-crash recovery path.
- [x] 5.8 Preserve successful checkout replay semantics so replay returns the original purchase before any new reservation or stock mutation.
- [x] 5.9 Return private `409` inventory conflicts with stable codes and safe current availability while exposing no foreign reservation identity.
- [x] 5.10 Add unit tests for reservation canonicalization, terminal state transitions, repeated release/consume, expiry boundaries, and digest mismatch.
- [x] 5.11 Add real PostgreSQL concurrency tests for the final unit, multi-line rollback, reversed lock ordering, separate idempotency keys, and no negative counters.
- [x] 5.12 Add checkout failure-injection tests for voucher race, order write failure, inventory consume failure, serializable retry, and process-gap recovery.
- [x] 5.13 Add order inventory-hold state separate from order lifecycle so expiry/release can leave the order pending while blocking payment completion, seller confirmation, and fulfillment.
- [x] 5.14 Implement atomic reservation reacquisition with a new generation for resumed pending orders and safe insufficient-stock conflicts when stock is no longer available.
- [x] 5.15 Add owner-scoped order response fields and private Problem Details for active, consumed, released, expired, and reacquisition-failed inventory holds without exposing queue internals.
- [x] 5.16 Add integration tests for pending-order expiry, immediate payment-failure release, blocked fulfillment, successful reacquisition, and payment/expiry/consume races.

## 6. Durable one-shot reservation expiry

- [x] 6.1 Add and configure a PostgreSQL-backed delayed-job dependency with no committed credentials and documented local/test defaults.
- [x] 6.2 Make pg-boss enqueue mandatory and transactional for each new active reservation at its exact `expiresAt`; remove the silent return when scheduler/worker startup is unavailable and roll back reservation creation if job persistence fails.
- [x] 6.3 Update the idempotent expiry worker to use authoritative database time, sorted row locks, generation/state checks, retained terminal records, and safe no-op handling before releasing stock.
- [x] 6.4 Add separate scheduler/worker readiness, graceful startup/shutdown, retry/failure logging, backlog visibility, and bounded worker concurrency without a recurring CronJob.
- [x] 6.5 Add mutation-time recovery that expires due reservations for already-locked variants as a safety backstop.
- [x] 6.6 Test worker restart, delayed execution, duplicate delivery, exact 15-minute boundary, early delivery, stale generation, already-consumed reservation, scheduler-unavailable fail-closed behavior, and reservation/job transaction rollback.

## 7. Seller Center inventory experience

- [x] 7.1 Add the seller inventory API client with strict response parsing, Problem Details mapping, ETag support, and idempotency-key generation.
- [x] 7.2 Add `/seller/inventory` and a Seller Center navigation option with authenticated loading, empty, forbidden, and recoverable-error states.
- [x] 7.3 Build a responsive paginated inventory table showing product, variant/SKU, lifecycle, on-hand, reserved, sold, available, low-stock state, and update time.
- [x] 7.4 Add an accessible adjustment dialog requiring signed quantity change and reason, with optional note and authoritative post-submit refresh.
- [x] 7.5 Add per-variant audit-history viewing with stable pagination and readable before/delta/after values.
- [x] 7.6 Preserve form input on rejected mutations and handle stale-version, reserved-stock, idempotency, and generic unavailable conflicts clearly.
- [x] 7.7 Update product editing to display authoritative stock/version and route changed stock through audited inventory behavior.
- [x] 7.8 Add Testing Library coverage for responsive states, keyboard/focus behavior, successful adjustment, replay-safe UI, stale refresh, and audit history.

## 8. End-to-end verification and documentation

- [x] 8.1 Add seller E2E coverage for opening inventory, adjusting stock, seeing updated availability, reviewing history, and rejecting an invalid reduction.
- [x] 8.2 Add checkout E2E/integration coverage proving two buyers cannot buy the same final unit and a failed reservation returns stock.
- [x] 8.3 Update documentation for the retained 15-minute database-derived TTL, pg-boss scheduler/worker readiness, payment-failure release, pending-order hold behavior, recovery, and no-RabbitMQ decision.
- [x] 8.4 Update `flow.md` with seller adjustment, checkout reservation, consume, release, and expiry diagrams.
- [x] 8.5 Verify forward migration/backfill against the Docker PostgreSQL database and document safe rollout and rollback commands.
- [x] 8.6 Run contract, API unit/integration, web unit/typecheck/build, focused seller/checkout Playwright, and `test:e2e:homepage:quick` regression suites.
- [x] 8.7 Run strict OpenSpec validation after apply and reconcile every implemented behavior and completed checkbox with both delta specs and test evidence before handoff.
