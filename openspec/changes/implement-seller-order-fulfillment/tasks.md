## 1. Shared seller-order contracts

- [x] 1.1 Define framework-neutral fulfillment states, seller actions, rejection reasons, queue filters, deadline constants, available-action mappings, and safe labels.
- [x] 1.2 Define exact contracts for seller order summaries, paginated queue, owned detail, packing projection, fulfillment events, mock shipment/tracking data, and action results.
- [x] 1.3 Add strict parsers for queue query parameters, date ranges, opaque cursors, order references, discriminated action bodies, rejection notes, `If-Match`, and UUID idempotency keys.
- [x] 1.4 Add canonical combined order/fulfillment ETag, action request digest, UTC deadline, money, timeline continuity, and snapshot invariant helpers.
- [x] 1.5 Enforce exact-key response guards, safe integer totals, action/state consistency, contact-field boundaries, and rejection of unknown/private fields.
- [x] 1.6 Export contracts from the shared package without NestJS, Prisma, or browser dependencies.
- [x] 1.7 Add shared-contract tests for valid payloads and malformed filters, cursors, dates, actions, reasons, ETags, deadlines, timelines, snapshots, money, and extra keys.

## 2. Fulfillment, shipment, and compensation persistence

- [x] 2.1 Extend Prisma with seller fulfillment, fulfillment-event, mock shipment/tracking, and order inventory-compensation enums/models/relations.
- [x] 2.2 Add `ORDER_CANCELLATION` inventory adjustment reason plus safe source-order linkage and defensive uniqueness for per-order compensation.
- [x] 2.3 Add non-negative version/counter, actor identity, paired idempotency fields, bounded note, state/timestamp, and immutable-event database constraints.
- [x] 2.4 Add indexes for owned-shop queue filters, deterministic keyset order, fulfillment timelines, shipment lookup, and compensation reconciliation.
- [x] 2.5 Write an additive migration that backfills exactly one fulfillment aggregate and version-0 system event per existing order using the documented status mapping.
- [x] 2.6 Derive backfilled deadlines and milestone times deterministically from lifecycle events/order timestamps without inventing seller actions.
- [x] 2.7 Add migration verification for row counts, lifecycle/fulfillment compatibility, rerun-safe diagnostics, constraints, indexes, and no snapshot/total mutation.
- [x] 2.8 Regenerate Prisma artifacts and update test factories so newly created checkout orders receive initial fulfillment state/event in the checkout transaction.

## 3. Fulfillment state machine and concurrency primitives

- [x] 3.1 Implement a pure table-driven seller action/state matrix and mapping to required/resulting buyer order lifecycle states.
- [x] 3.2 Implement pure available-action calculation from order status, fulfillment state, shop eligibility, and shipment presence.
- [x] 3.3 Implement canonical action normalization/digesting, combined ETag parsing/formatting, rejection-note normalization, and deadline/late calculation.
- [x] 3.4 Implement fixed-order row locking for owned shop order and fulfillment aggregate with safe database-time retrieval.
- [x] 3.5 Implement fulfillment-event replay lookup before current-state validation, same-digest replay, changed-digest conflict, and stale combined-version detection.
- [x] 3.6 Add exhaustive unit tests for all allowed/forbidden actions, terminal states, lifecycle compatibility, ETags, digests, deadlines, late flags, replay, and stale versions.

## 4. Shared cancellation inventory compensation

- [x] 4.1 Implement a transaction-compatible compensation service that aggregates order quantities by variant/product and locks inventory rows in stable order.
- [x] 4.2 Validate consumed quantities and guarded sold/on-hand/product counters before applying any compensation.
- [x] 4.3 Restore on-hand, decrement sold and product sold summaries, increment inventory versions, and append `ORDER_CANCELLATION` adjustments atomically.
- [x] 4.4 Persist an order-level compensation marker and make equivalent repeats no-op while conflicting/corrupt attempts fail safely.
- [x] 4.5 Integrate compensation and fulfillment `CANCELLED` synchronization into the existing T20 buyer cancellation transaction without changing its public contract.
- [x] 4.6 Add unit and PostgreSQL tests for multi-line aggregation, shared products/variants, buyer cancellation, seller rejection, replay, concurrent stock adjustment, negative-counter defense, and rollback injection.

## 5. Seller-owned order reads and projections

- [x] 5.1 Implement SQL-owned seller queue queries ordered by `(createdAt DESC, id DESC)` with `limit + 1` keyset pagination and active approved shop ownership.
- [x] 5.2 Implement normalized status, fulfillment-state, UTC date-range, and exact order-reference filters with cursor/filter binding.
- [x] 5.3 Implement an owner-scoped detail query containing only one shop order, committed snapshots, both timelines, fulfillment, shipment, and relevant allocations.
- [x] 5.4 Build deterministic queue projectors that omit buyer contact data and use only order-line/shop snapshots for product, image, variant, quantity, and totals.
- [x] 5.5 Build strict detail and packing projectors with delivery/shipping/shop snapshots, deadlines, available actions, timelines, and safe mock shipment data.
- [x] 5.6 Return identical non-enumerating not-found errors for unknown/foreign orders and a private unavailable error for corrupted persisted invariants.
- [x] 5.7 Add repository/projector tests for ownership, every filter, stable pagination, changed/deleted source data, contact privacy, terminal states, and malformed storage.

## 6. Atomic seller fulfillment commands and mock shipment

- [x] 6.1 Implement the seller command transaction with ownership resolution, fixed row locks, replay-first semantics, combined-version validation, and authoritative result projection.
- [x] 6.2 Implement `CONFIRM` to advance lifecycle to `AWAITING_PICKUP`, fulfillment to `CONFIRMED`, set the 48-hour handoff deadline, and append both audits atomically.
- [x] 6.3 Implement `START_PREPARING` and `MARK_READY_FOR_PICKUP` as fulfillment-only versioned audited transitions that retain `AWAITING_PICKUP`.
- [x] 6.4 Implement `REJECT` with controlled reason, lifecycle cancellation, fulfillment rejection, shared inventory compensation, and all-or-nothing replay safety.
- [x] 6.5 Implement a mock shipment adapter that creates one shipment, stable tracking code, immutable snapshot subset, and initial tracking event.
- [x] 6.6 Implement `HAND_OFF` to create the mock shipment and atomically advance lifecycle to `SHIPPING` plus fulfillment to `HANDED_OFF`.
- [x] 6.7 Mark late confirmation/handoff events from database time while allowing valid late commands and never scheduling automatic cancellation.
- [x] 6.8 Add service/PostgreSQL tests for normal flow, skipped actions, seller rejection, buyer-cancel race, duplicate response-loss replay, key misuse, different-action races, shipment failure, and audit atomicity.

## 7. Authenticated seller-order API

- [x] 7.1 Add the seller-order NestJS module, controller, DTO boundaries, dependency wiring, OpenAPI descriptions, and sanitized exception filter.
- [x] 7.2 Implement `GET /api/v1/seller/orders` with strict query validation, owner scope, opaque cursor, private no-store caching, and exact response guard.
- [x] 7.3 Implement `GET /api/v1/seller/orders/:orderReference` with non-enumerating ownership, combined ETag, private no-store caching, and detail/packing projection.
- [x] 7.4 Implement `POST /api/v1/seller/orders/:orderReference/actions` with AuthGuard, seller role/approved-shop enforcement, project Origin protection, required headers, and discriminated action validation.
- [x] 7.5 Map validation, not-found, stale, transition, idempotency, inventory, invariant, and unavailable failures to stable private Problem Details without contact/order leakage.
- [x] 7.6 Add HTTP integration tests for authentication, role/shop eligibility, Origin, ownership, filters, pagination, cache headers, ETag, every action, replay/conflict, and corrupted-data safety.

## 8. Seller Center order experience

- [x] 8.1 Add strict seller-order API clients, Problem Details mapping, query builders, ETag handling, and browser idempotency-key generation.
- [x] 8.2 Add `Đơn hàng` to Seller Center navigation and create role-gated `/seller/orders` plus `/seller/orders/[orderReference]` routes.
- [x] 8.3 Build responsive Shopee-style queue tabs/cards/table with URL-synchronized filters, overdue badges, item/total summaries, explicit pagination, and server-declared action affordances.
- [x] 8.4 Render owned order detail with lifecycle/fulfillment progress, immutable products, buyer note, delivery/shipping data, totals, deadlines, both timelines, and mock shipment state.
- [x] 8.5 Build custom accessible confirmation dialogs for confirm, prepare, ready, handoff, and reject; require controlled rejection reason and preserve input on failure.
- [x] 8.6 Prevent duplicate clicks, retain one idempotency key for transport retries, send the current ETag, and refresh authoritative detail after success or stale conflict.
- [x] 8.7 Add `/seller/orders/[orderReference]/print` using the validated detail contract and print CSS that includes only the bounded packing/shipment information.
- [x] 8.8 Implement loading, empty, forbidden, expired-session, non-enumerating not-found, stale, unavailable, and mobile layouts without storing private order payloads in browser storage.
- [x] 8.9 Add Testing Library coverage for navigation, filters/cursor reset, queue/detail/print states, progress, deadlines, every dialog, keyboard/focus, retry, stale refresh, and privacy boundaries.

## 9. End-to-end verification and documentation

- [x] 9.1 Add deterministic authenticated seller/buyer fixtures for pending orders, rejection, and full fulfillment without adding fake transactional orders to normal seed data.
- [x] 9.2 Add Playwright coverage for seller queue → detail → confirm → prepare → ready → handoff and mock tracking at 360px, 768px, and 1440px widths.
- [x] 9.3 Add Playwright/API coverage for controlled rejection, restored inventory, buyer-visible cancellation/timeline, duplicate-submit prevention, print view, and foreign-shop denial.
- [x] 9.4 Add `test:e2e:seller-orders:quick` and keep it independent from the full E2E suite and disabled CI flow.
- [x] 9.5 Update README/API documentation with all three endpoints, filters, required action headers/body, state mappings, deadlines, mock-shipping semantics, and local test commands.
- [x] 9.6 Update `flow.md` with seller queue, fulfillment state machine, command idempotency/concurrency, cancellation compensation, mock shipment, and buyer timeline integration diagrams.
- [x] 9.7 Run shared-contract, API unit/integration, migration/PostgreSQL, web component, typecheck, lint, and production-build checks for affected workspaces.
- [x] 9.8 Run `test:e2e:seller-orders:quick`, existing seller quick tests, and `test:e2e:homepage:quick`, recording only genuine environment skips.
- [x] 9.9 Run `openspec validate implement-seller-order-fulfillment --strict` and reconcile implementation, specs, diagrams, documentation, and every completed task checkbox before handoff.
