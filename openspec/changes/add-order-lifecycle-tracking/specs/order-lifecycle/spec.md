## Purpose

Defines a deterministic, auditable lifecycle for each per-shop buyer order, including safe cancellation and immutable transition history.

## ADDED Requirements

### Requirement: Shop orders follow an explicit lifecycle state machine

The system SHALL represent shop orders with `PENDING_CONFIRMATION`, `AWAITING_PICKUP`, `SHIPPING`, `DELIVERED`, `CANCELLED`, `RETURN_REQUESTED`, `RETURNED`, and `REFUNDED`. It MUST allow only `PENDING_CONFIRMATION → AWAITING_PICKUP | CANCELLED`, `AWAITING_PICKUP → SHIPPING | CANCELLED`, `SHIPPING → DELIVERED`, `DELIVERED → RETURN_REQUESTED`, `RETURN_REQUESTED → RETURNED | REFUNDED`, and `RETURNED → REFUNDED`. Every other transition MUST fail without changing the order or timeline.

#### Scenario: Allowed transition succeeds

- **WHEN** an authorized internal actor moves an order from its current state along an allowed transition edge
- **THEN** the order advances exactly once and exposes the new status and version

#### Scenario: Disallowed transition is attempted

- **WHEN** any actor attempts to skip, reverse, or leave a terminal lifecycle state
- **THEN** the system returns a stable conflict and leaves the status, version, and timeline unchanged

#### Scenario: Concurrent transitions race

- **WHEN** two commands target the same current order version concurrently
- **THEN** at most one transition commits and the loser receives a stale-order conflict with the current version

### Requirement: Every lifecycle change creates an immutable audit event

The system SHALL atomically append one immutable timeline event for initial creation and every committed transition. An event MUST identify the order, previous status or null for creation, resulting status, actor type, optional actor user identifier, stable reason code, optional bounded note, order version, and UTC occurrence time.

#### Scenario: New T20 order is created

- **WHEN** checkout creates a new `PENDING_CONFIRMATION` shop order
- **THEN** the same transaction creates one initial timeline event attributed to `SYSTEM` with no previous status

#### Scenario: Existing T19 order is migrated

- **WHEN** the T20 migration encounters a shop order that predates timeline storage
- **THEN** it creates exactly one deterministic initial event at the order creation time without changing any order snapshot or total

#### Scenario: Transition persistence fails

- **WHEN** either the status update or timeline insertion cannot complete
- **THEN** both operations roll back and no partial lifecycle effect is visible

#### Scenario: Historical event is queried after later transitions

- **WHEN** an order has advanced through multiple states
- **THEN** every prior event remains unchanged and is returned in chronological order with a deterministic tie-breaker

### Requirement: Buyer cancellation is owner-scoped and state-limited

The system SHALL expose authenticated cancellation for an owned shop order only while it is `PENDING_CONFIRMATION`. The request MUST contain the current order ETag, a canonical UUID idempotency key, one supported cancellation reason code, and an optional normalized note. Successful cancellation SHALL atomically set `CANCELLED`, increment the order version once, and append a buyer-attributed event.

#### Scenario: Buyer cancels a pending order

- **WHEN** the owning buyer submits a valid reason, current order version, and unused idempotency key for a `PENDING_CONFIRMATION` order
- **THEN** cancellation succeeds once and returns the updated owner-scoped detail with its cancellation event

#### Scenario: Buyer tries to cancel after processing begins

- **WHEN** the order is `AWAITING_PICKUP`, `SHIPPING`, `DELIVERED`, in return/refund handling, or already terminal
- **THEN** the system returns a cancellation-not-allowed conflict and changes nothing

#### Scenario: Cancellation request is replayed after success

- **WHEN** the same buyer repeats an equivalent cancellation with the same idempotency key
- **THEN** the system returns the original cancelled result without another version increment or timeline event

#### Scenario: Cancellation key is reused differently

- **WHEN** a successful cancellation key is reused for a different reason or normalized note
- **THEN** the system returns an idempotency conflict and preserves the original event

#### Scenario: Foreign buyer addresses the order reference

- **WHEN** another authenticated buyer attempts cancellation using the order reference
- **THEN** the system returns the same non-enumerating not-found response as an unknown reference and exposes no order data

### Requirement: Cancellation inputs and browser mutations are strictly protected

The system SHALL accept only documented cancellation reason codes, reject unknown request fields, normalize bounded free text, and apply the project-wide authentication and browser Origin controls before lifecycle mutation.

#### Scenario: Cancellation reason is invalid

- **WHEN** the request contains an unsupported reason, control characters, an overlong note, an unknown field, malformed ETag, or malformed idempotency key
- **THEN** the system returns stable Problem Details and performs no write

#### Scenario: Browser origin is untrusted

- **WHEN** a browser submits cancellation from an origin rejected by the project-wide guard
- **THEN** the request returns `403` before order ownership or lifecycle logic executes

### Requirement: Lifecycle changes never rewrite committed business snapshots

The system MUST keep T19 address, shop, product, variant, shipping, voucher, currency, quantity, and monetary snapshots immutable across every lifecycle transition and cancellation.

#### Scenario: Catalog or saved address changes after purchase

- **WHEN** source catalog, shop, or account-address records change after the order was committed
- **THEN** order detail and timeline continue to display the original committed snapshots and totals

#### Scenario: Order is cancelled

- **WHEN** cancellation commits successfully
- **THEN** only lifecycle metadata and timeline data change; committed quantities and financial snapshots remain unchanged
