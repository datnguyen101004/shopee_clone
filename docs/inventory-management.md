# Inventory and checkout reservations

Inventory is authoritative in PostgreSQL. `available = quantityOnHand - quantityReserved`; active reservations reduce availability while terminal reservations do not. Seller stock edits use `If-Match: "inventory-<version>"` and `Idempotency-Key` and create immutable adjustment events.

Each checkout reservation keeps the existing **15-minute** lifetime. The API reads `clock_timestamp()` from PostgreSQL and stores `expiresAt = databaseNow + 15 minutes`; application/server clock values are not used for the business boundary. A reservation is released immediately when an authoritative payment failure calls the shared release command. Terminal rows remain for audit (`CONSUMED`, `RELEASED`, or `EXPIRED`).

Expiry is a one-shot delayed job in **pg-boss**, using the same PostgreSQL transaction as reservation creation. Scheduler/worker readiness and queue metrics (`backlog`, `active`, `failed`) are exposed at `GET /api/v1/health/inventory-reservations`; if the scheduler cannot persist a job, reservation creation fails closed and the transaction rolls back. The worker uses bounded local concurrency, re-checks database time, generation token, state, and sorted inventory locks before releasing stock, and logs startup failures for operational retry. Mutation-time expiry recovery remains a safety backstop. There is no RabbitMQ, Redis, recurring CronJob, or in-process 15-minute timer.

For a pending order, an expired/released inventory hold does not silently advance the order lifecycle. Payment, seller confirmation, and fulfillment must reacquire a new reservation generation first; otherwise the API returns a private, non-cacheable `409` inventory conflict with only safe availability data. Buyer order and purchase responses include owner-scoped `inventoryHold` metadata without exposing queue or other-buyer reservation details.

Useful checks:

```bash
pnpm --filter @shopee-clone/api typecheck
pnpm --filter @shopee-clone/api exec jest src/inventory --runInBand
pnpm typecheck
pnpm db:migrate:deploy
```
