## Purpose

Protect checkout stock under concurrent buyer activity by reserving available units atomically and converting successful reservations into sold inventory exactly once.

## ADDED Requirements

### Requirement: Checkout reserves selected inventory atomically
Before creating a purchase, the system SHALL atomically reserve the current selected quantity for every participating variant against authoritative available stock. A multi-line reservation MUST be all-or-nothing, MUST bind to the authenticated buyer, cart version, checkout idempotency key, and canonical request digest, and MUST NOT trust quantities or stock balances outside the server-owned cart and inventory records.

#### Scenario: Checkout reserves multiple available lines
- **WHEN** a buyer confirms a ready checkout whose selected variants all have sufficient available quantity
- **THEN** one checkout reservation claims every selected quantity and no other checkout can claim those same units

#### Scenario: One line is understocked
- **WHEN** any selected variant lacks sufficient available quantity while a multi-line reservation is attempted
- **THEN** the complete reservation fails, no selected variant's reserved quantity changes, and no purchase is created

### Requirement: Concurrent checkout cannot oversell
The system MUST serialize or conditionally guard reservations for each affected inventory balance so the sum of active reserved quantities never exceeds on-hand quantity. Competing reservations for multiple variants MUST use a deterministic acquisition order and MUST resolve without partial claims.

#### Scenario: Two buyers race for the final unit
- **WHEN** two buyers with different checkout idempotency keys concurrently confirm the only available unit of one variant
- **THEN** exactly one reservation succeeds and the other checkout receives an insufficient-stock conflict

#### Scenario: Opposite multi-variant order races
- **WHEN** concurrent checkouts contain the same variants in different cart-line orders
- **THEN** the system acquires inventory consistently, avoids a persistent deadlock, and commits at most the quantities supported by stock

### Requirement: Reservations have a durable lifecycle and expiry
Every reservation SHALL have a durable state, authoritative database creation time, server-defined expiry time exactly 15 minutes after creation, and immutable line quantities. Active reservations SHALL count against available stock. TTL expiry MUST NOT release a reservation before `expiresAt` and SHALL become eligible at or after that database-time boundary. A failed, explicitly released, or expired reservation MUST decrement reserved quantities exactly once and transition to a retained terminal state; repeated release or expiry processing MUST be a no-op.

#### Scenario: Reservation has not reached fifteen minutes
- **WHEN** expiry processing observes an active reservation before its database-derived `expiresAt`
- **THEN** the reservation remains active and its reserved stock is unchanged

#### Scenario: Buyer abandons an in-progress confirmation
- **WHEN** an active reservation reaches its exact 15-minute expiry time without a committed purchase
- **THEN** the system eventually marks it expired and returns its units to available stock exactly once

#### Scenario: Expiry processing is delayed
- **WHEN** the expiry worker is unavailable at the reservation expiry time
- **THEN** the reservation is not consumed early, remains safe against overselling, and is released idempotently when processing resumes

#### Scenario: Release is retried
- **WHEN** release processing repeats for an already released or expired reservation
- **THEN** inventory balances remain unchanged and no duplicate terminal event is created

#### Scenario: Terminal reservation is inspected
- **WHEN** stock has been returned by expiry or explicit release
- **THEN** the reservation record remains available for private audit and idempotency without continuing to reduce available stock

### Requirement: Pending orders keep lifecycle state after hold expiry
If an active reservation is linked to an order whose order and payment flow remain pending at `expiresAt`, the system SHALL release its stock and mark the inventory hold `EXPIRED` without automatically cancelling the order. Payment completion, seller confirmation, or fulfillment MUST NOT continue until the system atomically acquires a new authoritative reservation.

#### Scenario: Pending order outlives its reservation
- **WHEN** a linked order remains pending when its active reservation reaches 15 minutes
- **THEN** reserved stock returns exactly once, the reservation and order hold become expired, and the order remains pending

#### Scenario: Pending order resumes after expiry
- **WHEN** payment or fulfillment resumes for a pending order whose inventory hold is expired
- **THEN** the system acquires a new reservation before continuing or returns a safe insufficient-stock conflict without changing the order to a fulfilled state

### Requirement: Purchase commit consumes reserved stock exactly once
The successful COD purchase transaction SHALL verify an owned active unexpired reservation, create the purchase and orders, decrement reserved and on-hand quantities, increment sold quantities, and mark the reservation consumed as one atomic outcome. The inventory transition MUST be linked to the purchase reference and MUST occur once across checkout retries and idempotent replays.

#### Scenario: COD checkout commits successfully
- **WHEN** an authoritative reserved checkout passes final pricing, voucher, address, and cart validation
- **THEN** the purchase commits and each line moves from reserved to sold inventory exactly once

#### Scenario: Successful checkout is replayed
- **WHEN** the buyer repeats the same successful COD confirmation with the same idempotency key and request digest
- **THEN** the original purchase is returned without reserving, decrementing on-hand, or incrementing sold stock again

#### Scenario: Consumption loses validity
- **WHEN** the reservation is absent, terminal, expired, foreign, or does not match the checkout request during purchase commit
- **THEN** the system rejects confirmation and creates no purchase or inventory consumption

### Requirement: Failed checkout releases or rolls back inventory safely
If checkout or an authoritative payment attempt fails after obtaining a reservation but before purchase commit, the system SHALL immediately invoke an idempotent release or leave it eligible for durable expiry recovery when the process cannot complete compensation. Failures inside the purchase transaction MUST roll back orders, voucher consumption, cart cleanup, reservation consumption, and sold-stock changes together.

#### Scenario: Payment fails before reservation expiry
- **WHEN** an authoritative payment-failure outcome occurs while its reservation is active
- **THEN** the system releases reserved stock immediately, records `payment-failed` as the terminal reason, and a later expiry job is a no-op

#### Scenario: Voucher consumption fails after reservation
- **WHEN** checkout reserves stock but voucher consumption loses a concurrency race before purchase commit
- **THEN** no order or sold-stock change is committed and the reservation is released or expires without leaking reserved quantity

#### Scenario: Database write fails during purchase creation
- **WHEN** an order-line or inventory-consumption write fails inside the purchase transaction
- **THEN** every attempted purchase and consumption effect rolls back while the reservation remains recoverable for release

### Requirement: All commerce reads use available stock
Catalog, product detail, cart, pricing, checkout preview, and seller product summaries SHALL derive buyer-visible availability from the same current available quantity. Active reservations MUST reduce availability; terminal reservations MUST NOT reduce it. A stock value observed before a reservation is informational and MUST be revalidated during confirmation.

#### Scenario: Another buyer reserves stock after preview
- **WHEN** a buyer sees available stock and another checkout reserves those units before confirmation
- **THEN** the first buyer's confirmation revalidates inventory and fails safely rather than relying on the stale display

#### Scenario: Reservation is released
- **WHEN** an active reservation transitions to released or expired
- **THEN** subsequent availability reads include the returned quantity consistently across commerce endpoints

### Requirement: Stock conflicts use stable private API errors
Inventory reservation and consumption failures SHALL return private non-cacheable Problem Details with stable conflict types and current safe availability information for the caller's selected lines. Errors MUST NOT expose another buyer's reservation identity, cart, or checkout data.

#### Scenario: Confirmation encounters insufficient stock
- **WHEN** a reservation cannot claim all requested units
- **THEN** checkout returns a `409` conflict with a stable insufficient-stock problem type and enough current quantity data for the buyer to refresh the cart

#### Scenario: Caller probes a foreign reservation
- **WHEN** a checkout path references or resolves a reservation owned by another buyer
- **THEN** the API uses non-enumerating failure behavior and reveals no foreign reservation fields
