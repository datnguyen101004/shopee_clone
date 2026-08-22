# return-refund-lifecycle Specification

## Purpose
Define a traceable and concurrency-safe post-delivery return lifecycle whose quantities, state transitions, deadlines, and monetary outcomes remain consistent with committed order data.
## Requirements
### Requirement: Return eligibility is server-authoritative

The system SHALL permit at most one return request for a shop order. A request SHALL be eligible only when the authenticated buyer owns the order, the current order status is `DELIVERED`, a committed delivery timeline event exists, and server time is no later than seven complete days after that event. Unknown and foreign order references MUST return the same non-enumerating result.

#### Scenario: Buyer requests within the return window

- **WHEN** the owner submits a valid request exactly seven days or less after the committed delivery event
- **THEN** the system creates the request and records the eligibility policy and deadline used

#### Scenario: Return window has closed

- **WHEN** server time is later than the persisted return deadline
- **THEN** the system rejects the request with a stable conflict code and creates no return, event, or ledger record

#### Scenario: Foreign buyer probes an order

- **WHEN** an authenticated buyer submits a return request for an order owned by another buyer
- **THEN** the system returns the same not-found response used for an unknown order and reveals no eligibility data

### Requirement: Requested items and quantities preserve purchase invariants

A request MUST contain at least one distinct line from the referenced shop order. Every requested quantity MUST be a positive integer no greater than the purchased quantity for that line. The system MUST reject duplicate, foreign, or mutable-catalog line data and MUST derive product, variant, price, and discount information only from committed order-line and voucher-allocation snapshots.

#### Scenario: Valid partial quantity

- **WHEN** a delivered order line contains three units and the owner requests two
- **THEN** the request stores quantity two against that immutable line without changing the purchased quantity or snapshot

#### Scenario: Quantity exceeds purchase

- **WHEN** the buyer requests more units than were purchased or repeats the same line in the request
- **THEN** the request fails atomically and no partial item rows are stored

### Requirement: Refund amounts use deterministic net-paid allocation

The system SHALL calculate each returned line amount from the line's persisted payable-merchandise amount using integer minor units and `floor(linePayableMinor * requestedQuantity / purchasedQuantity)`, except that returning the full purchased quantity MUST return the exact persisted line payable amount. The total refund SHALL equal the sum of requested-line amounts. Original shipping charges, voucher consumption, discounts, purchase totals, and order snapshots MUST remain unchanged, and shipping SHALL not be included in the T29 refund amount.

#### Scenario: Partial discounted line is refunded

- **WHEN** two of three units are approved from a line whose persisted payable amount is 100,000 VND
- **THEN** the line refund is 66,666 VND and the original order and voucher records remain unchanged

#### Scenario: Full line avoids rounding loss

- **WHEN** all purchased units of a line are approved
- **THEN** the line refund equals the exact persisted payable amount for that line

### Requirement: Return state transitions are explicit and deadline-bound

The return aggregate SHALL use only these transitions: `REQUESTED` to `AWAITING_RETURN`, `ESCALATED`, or `CANCELLED`; `AWAITING_RETURN` to `IN_TRANSIT` or `EXPIRED`; `IN_TRANSIT` to `REFUNDED` or `ESCALATED`; and `ESCALATED` to `AWAITING_RETURN`, `REFUNDED`, or `REJECTED`. Seller response SHALL expire after 48 hours into `ESCALATED`, buyer mock-shipment creation SHALL expire after five days into `EXPIRED`, and unconfirmed receipt SHALL escalate seven days after shipment. Every command MUST re-evaluate server time before applying a transition.

#### Scenario: Seller accepts a request

- **WHEN** the owning seller accepts a current `REQUESTED` return before the response deadline
- **THEN** the state becomes `AWAITING_RETURN` and a five-day buyer shipment deadline is persisted

#### Scenario: Seller does not respond

- **WHEN** the 48-hour response deadline passes while the request remains `REQUESTED`
- **THEN** the request becomes `ESCALATED` through one system-authored event

#### Scenario: Invalid transition is attempted

- **WHEN** any actor submits an action that is not allowed from the locked current state
- **THEN** the system returns a conflict and changes neither the return aggregate nor related order state

### Requirement: Return and order lifecycles remain atomically consistent

Creating a return MUST transition the order from `DELIVERED` to `RETURN_REQUESTED` in the same transaction. A cancelled, expired, or finally rejected request MUST transition it back to `DELIVERED`. A refund without returned goods MUST transition `RETURN_REQUESTED` to `REFUNDED`; a confirmed received return MUST record `RETURNED` and then `REFUNDED` before commit. All required order and return timeline events MUST commit together, and the original purchase snapshots MUST never be rewritten.

#### Scenario: Return creation rolls back

- **WHEN** either the return insert or order lifecycle event fails
- **THEN** neither the return request nor the `RETURN_REQUESTED` order transition is committed

#### Scenario: Returned goods are refunded

- **WHEN** the seller confirms receipt of the mock shipment
- **THEN** the return becomes `REFUNDED`, the order timeline records `RETURNED` followed by `REFUNDED`, and all records commit atomically

#### Scenario: Dispute is rejected

- **WHEN** an admin rejects an escalated request
- **THEN** the request becomes `REJECTED` and the order returns to `DELIVERED` without changing its purchase snapshots

### Requirement: Mutations are idempotent and race-safe

Return creation and every subsequent mutation SHALL require a canonical UUID idempotency key and an optimistic version precondition. The system MUST lock the shop order before the return aggregate, replay an equivalent committed command before current-state validation, reject reuse of a key with different canonical input, and allow at most one winner when seller, buyer, system, or admin commands race.

#### Scenario: Response is lost after a successful command

- **WHEN** a client retries the same command with the same key and canonical request after commit
- **THEN** the system returns the original authoritative result without incrementing a version or appending another event

#### Scenario: Seller and deadline worker race

- **WHEN** seller acceptance and automatic escalation target the same request version concurrently
- **THEN** exactly one transition commits and the loser receives or observes the authoritative state

#### Scenario: Idempotency key is reused differently

- **WHEN** a key previously used for one canonical command is reused with different input
- **THEN** the system returns an idempotency conflict and persists no new effect

### Requirement: Refund ledger is append-only and exactly-once

Each effective refund outcome MUST append exactly one immutable `MOCK_CREDIT` refund-ledger entry containing the return reference, buyer, shop order, currency, total amount, per-line allocation snapshot, deciding actor, reason, and UTC timestamp. The ledger MUST have no update/delete API, MUST be unique for the return request, and MUST commit in the same transaction as the terminal `REFUNDED` state and order transitions.

#### Scenario: Admin approves a refund-only dispute

- **WHEN** an admin approves an escalated request without requiring goods to be returned
- **THEN** one `MOCK_CREDIT` ledger entry and one terminal refund result commit together

#### Scenario: Duplicate receipt confirmation

- **WHEN** receipt confirmation is retried after the first refund committed
- **THEN** the original response is replayed and no second ledger entry exists

### Requirement: Original inventory and purchase history remain immutable

T29 MUST NOT automatically restock returned quantities because physical condition has not been assessed, and MUST NOT mutate original line quantities, totals, voucher usage, address, shop, shipping, or catalog snapshots. Any later restock SHALL use the existing explicit inventory-adjustment capability with its own reason and audit trail.

#### Scenario: Refund completes

- **WHEN** a partial return reaches `REFUNDED`
- **THEN** purchased quantities and checkout totals remain unchanged and no inventory adjustment is created automatically

