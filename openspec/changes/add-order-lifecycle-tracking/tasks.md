## 1. Shared order lifecycle contracts

- [x] 1.1 Add framework-neutral constants and types for shop-order statuses, buyer list filters, timeline actors, cancellation reason codes, and cancellation capabilities.
- [x] 1.2 Define exact shared response contracts for cursor-paginated order summaries, owner order detail, timeline events, and cancellation results.
- [x] 1.3 Define strict request parsers for list query parameters, opaque cursors, order references, `If-Match`, `Idempotency-Key`, and cancellation bodies with normalized optional notes.
- [x] 1.4 Add shared invariant guards for safe VND integer values, order total equations, timeline version continuity, actor identity, deterministic ordering, and unknown-key rejection.
- [x] 1.5 Export the T20 contracts from the shared package without introducing NestJS, Prisma, or browser dependencies.
- [x] 1.6 Add contract tests for valid payloads plus malformed filters, cursors, headers, money, actors, timelines, cancellation reasons, notes, and extra fields.

## 2. Prisma lifecycle persistence and migration

- [x] 2.1 Extend `ShopOrderStatus`, add `ShopOrder.version`, and model `OrderTimelineActor` plus immutable `OrderTimelineEvent` relations and fields in Prisma.
- [x] 2.2 Add unique constraints for `(orderId, orderVersion)` and `(orderId, idempotencyKey)`, restrictive relations, and indexes for order history and chronological timeline reads.
- [x] 2.3 Create an additive SQL migration with checks for non-negative versions, actor identity shape, paired idempotency fields, and bounded normalized reason data.
- [x] 2.4 Backfill exactly one deterministic `SYSTEM / ORDER_CREATED` version-0 event per existing shop order using the persisted creation time without changing snapshots or totals.
- [x] 2.5 Update the T19 checkout writer so every newly committed shop order receives its creation event in the same transaction.
- [x] 2.6 Add schema and PostgreSQL migration tests for enum values, constraints, indexes, restrictive relations, deterministic backfill, and rerun-safe verification queries.
- [x] 2.7 Regenerate Prisma artifacts and verify a clean database can migrate, seed, and create a new T19 order with one timeline event.

## 3. State machine and concurrency primitives

- [x] 3.1 Implement a table-driven, framework-neutral transition matrix covering every allowed and forbidden lifecycle edge.
- [x] 3.2 Implement stable lifecycle conflict codes and a reusable transition validator that does not write when a transition is disallowed.
- [x] 3.3 Implement canonical ETag formatting/parsing, cancellation request digesting, reason-note normalization, and UUID idempotency-key handling.
- [x] 3.4 Implement a versioned base64url cursor bound to `(createdAt, id)` ordering and the normalized status filter.
- [x] 3.5 Add exhaustive table tests for transition edges, terminal states, stale versions, canonical digests, cursor/filter compatibility, and invalid inputs.

## 4. Owner-scoped order reads

- [x] 4.1 Add repository queries for newest-first `(createdAt DESC, id DESC)` keyset pagination with `limit + 1`, supported status filters, and SQL-level buyer ownership.
- [x] 4.2 Add an owner-scoped detail query that returns one shop order, parent purchase reference, committed snapshots, relevant voucher allocations, and ordered timeline only.
- [x] 4.3 Build deterministic list and detail projectors that convert BigInt safely, sort nested data, validate financial equations, and never read mutable catalog or saved-address records.
- [x] 4.4 Return identical non-enumerating not-found errors for unknown and foreign order references and a safe unavailable error for corrupted persisted invariants.
- [x] 4.5 Add repository/projector tests for ownership isolation, every filter including `RETURN_REFUND`, stable pagination, multi-shop isolation, snapshot immutability, and malformed persistence.

## 5. Atomic lifecycle and cancellation service

- [x] 5.1 Implement the internal lifecycle service so status/version updates and immutable audit-event insertion share the caller's Prisma transaction.
- [x] 5.2 Implement buyer cancellation with an owner-scoped row lock, replay lookup before state validation, current-version check, and `PENDING_CONFIRMATION` restriction.
- [x] 5.3 Persist the cancellation request digest and idempotency key on the buyer timeline event, returning the original result for an equivalent replay and conflict for key reuse with different input.
- [x] 5.4 Increment the order version exactly once, append exactly one `BUYER` event, and project the authoritative updated detail before transaction commit.
- [x] 5.5 Ensure rejected, stale, foreign, disallowed, and failed transitions leave lifecycle metadata, timeline rows, and all T19 snapshots/totals unchanged.
- [x] 5.6 Add unit and PostgreSQL tests for successful cancellation, response-loss replay, conflicting reuse, duplicate clicks, different-key races, concurrent internal transitions, rollback atomicity, and immutable snapshots.

## 6. Authenticated NestJS order APIs

- [x] 6.1 Add the account-orders NestJS module, controller, DTO boundaries, OpenAPI documentation, Problem Details mappings, and dependency wiring.
- [x] 6.2 Implement `GET /api/v1/account/orders` with strict filter/limit/cursor validation, authenticated ownership, and private no-store caching.
- [x] 6.3 Implement `GET /api/v1/account/orders/:orderReference` with exact contract validation, ETag output, authenticated ownership, and private no-store caching.
- [x] 6.4 Implement `POST /api/v1/account/orders/:orderReference/cancel` with AuthGuard, project-wide Origin protection, strict headers/body validation, and stable lifecycle/idempotency conflicts.
- [x] 6.5 Add HTTP integration tests for authentication, Origin rejection, owner isolation, filters, pagination, response contracts/cache headers, cancellation success/replay/conflicts, and corrupted-data safety.

## 7. Buyer order list and detail screens

- [x] 7.1 Add exact web API client functions and query state for listing, reading, and cancelling orders without trusting unvalidated server payloads.
- [x] 7.2 Add the `Tài khoản → Đơn mua` navigation entry and authenticated `/account/orders` route.
- [x] 7.3 Build responsive, deep-linkable status tabs and snapshot-based order cards with loading, empty, pagination, expired-session, and recoverable-error states.
- [x] 7.4 Add `/account/orders/[orderReference]` with shop/line/address/shipping/voucher/total snapshots, payment and lifecycle labels, parent purchase reference, and chronological timeline.
- [x] 7.5 Build an accessible cancellation modal driven by `cancellation.allowed`, requiring a supported reason, retaining one UUID for transport retries, sending the current ETag, and preventing duplicate submission.
- [x] 7.6 Refresh authoritative detail after cancellation or a stale-order conflict and render non-enumerating not-found plus mobile sticky-action states correctly.
- [x] 7.7 Add component tests for URL filter synchronization, pagination reset, list/detail states, timeline rendering, reason validation, duplicate clicks, replay, stale refresh, authentication, and not-found behavior.

## 8. End-to-end flow and documentation

- [x] 8.1 Add deterministic test fixtures/helpers that create an authenticated buyer purchase without placing fake transactional orders in the normal seed.
- [x] 8.2 Add a focused Playwright journey for order list → status filter → detail → cancel → refreshed timeline at 360px, 768px, and 1440px widths.
- [x] 8.3 Add the `test:e2e:orders:quick` package script and keep it independent from the full E2E suite.
- [x] 8.4 Update API/setup documentation with the three T20 endpoints, required cancellation headers/body, status semantics, and commands needed to inspect the result.
- [x] 8.5 Update `flow.md` with the T20 buyer order-history, detail, cancellation, idempotency, concurrency, and lifecycle-state diagrams.

## 9. Verification and handoff

- [x] 9.1 Run focused shared-contract, state-machine, API unit/integration, migration, and web component tests and fix all regressions.
- [x] 9.2 Run the guarded PostgreSQL migration/database suite and verify backfill counts, creation-event atomicity, row-lock races, and idempotent replay against a real database.
- [x] 9.3 Run workspace typecheck, lint, tests, and production builds for every affected package/app.
- [x] 9.4 Run `test:e2e:orders:quick` followed by `test:e2e:homepage:quick` and record any environment-only skips explicitly.
- [x] 9.5 Validate `add-order-lifecycle-tracking` with strict OpenSpec validation and prepare the implementation summary plus endpoint/screen test guide for T20 review.
