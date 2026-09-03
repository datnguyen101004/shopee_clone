## Why

The current checkout flow reads stock but does not reserve it atomically, so two buyers using different checkout idempotency keys can both purchase the same remaining units. Seller product edits also overwrite stock without a durable adjustment history, making reconciliation and incident investigation unreliable.

## What Changes

- Define one authoritative inventory model for on-hand, reserved, sold, and available quantities, with `available = on-hand - reserved` and no negative balances.
- Add seller-owned stock adjustment operations that require an actor, reason, idempotency key, and signed quantity delta, and persist an immutable audit event for every accepted change.
- Route initial variant stock and later stock edits through inventory commands instead of directly overwriting inventory counters.
- Add durable checkout reservations that atomically claim available units per variant, prevent overselling under concurrency, and expire or release safely after failed checkout attempts.
- Give every active reservation the existing server-owned 15-minute lifetime and persist one transactional pg-boss job at its database-derived `expiresAt`, without RabbitMQ, a recurring CronJob, or an in-process timer.
- Release active reservations immediately on authoritative payment failure; when a linked order is still pending at expiry, keep the order pending but mark its inventory hold expired and require a new reservation before payment or fulfillment can continue.
- Retain terminal reservation records for audit and idempotency instead of hard-deleting them after stock is returned.
- Convert a successful reservation into sold inventory exactly once when the COD purchase commits, while preserving checkout and voucher idempotency.
- Make cart, pricing, catalog, product detail, and seller summaries read the same server-derived available quantity.
- Add concurrency, rollback, expiry, replay, audit, and invariant tests across PostgreSQL-backed integration and checkout end-to-end paths.
- Keep warehouse locations, purchase-order receiving, external ERP synchronization, and carrier-driven inventory movements out of scope.

## Capabilities

### New Capabilities

- `seller-inventory-management`: Authoritative stock balances, seller adjustment commands, ownership enforcement, immutable audit history, and Seller Center stock controls.
- `checkout-stock-reservations`: Concurrency-safe reservation, release, expiry, and exactly-once conversion to sold inventory during checkout.

### Modified Capabilities

None. The repository currently has no synced main capability specs for inventory or checkout reservations; this change introduces both contracts as new capabilities while integrating with the existing checkout and seller-product implementation.

## Impact

- PostgreSQL and Prisma: inventory balance changes, reservation and adjustment/audit models, constraints, indexes, and migrations.
- NestJS API: a dedicated inventory module, seller inventory endpoints, checkout reservation orchestration, Problem Details mappings, and transaction/locking helpers.
- Existing backend consumers: seller products, cart, pricing quote, checkout, catalog, product detail, engagement, and order writing.
- Shared contracts and frontend: seller inventory responses and adjustment requests, checkout conflict details, stock display, and Seller Center stock editing behavior.
- Operations: pg-boss/PostgreSQL one-shot reservation-expiry processing, worker readiness and failure visibility, plus correctness backstops on inventory mutations; no RabbitMQ and no client-authoritative stock calculations.
