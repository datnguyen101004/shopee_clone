## Purpose

Define a deterministic and auditable seller workflow that confirms, prepares, rejects, and hands off shop orders without cross-shop access, duplicate effects, or inventory drift.

## ADDED Requirements

### Requirement: Seller fulfillment follows an explicit state machine
The system SHALL represent seller fulfillment as `PENDING_CONFIRMATION`, `CONFIRMED`, `PREPARING`, `READY_FOR_PICKUP`, `HANDED_OFF`, `REJECTED`, or `CANCELLED`. It MUST allow seller commands only for `PENDING_CONFIRMATION → CONFIRMED | REJECTED`, `CONFIRMED → PREPARING`, `PREPARING → READY_FOR_PICKUP`, and `READY_FOR_PICKUP → HANDED_OFF`; `CANCELLED` is a terminal system-synchronized state for an order cancelled outside seller rejection. Every other seller transition MUST fail without changing order, fulfillment, shipment, inventory, or audit state.

#### Scenario: Seller completes the normal path
- **WHEN** the owning seller confirms, starts preparing, marks ready, and hands off an order in sequence
- **THEN** each command commits exactly once and the final fulfillment state is `HANDED_OFF`

#### Scenario: Seller skips a preparation step
- **WHEN** the seller attempts to mark a confirmed order ready or hand off an order that is not ready
- **THEN** the system returns a stable transition conflict and leaves every state unchanged

#### Scenario: Seller rejects an unconfirmed order
- **WHEN** the owning seller rejects an order still in `PENDING_CONFIRMATION` with a supported reason
- **THEN** fulfillment becomes `REJECTED`, the order becomes `CANCELLED`, and no later fulfillment action is allowed

#### Scenario: Buyer cancels before seller confirmation
- **WHEN** the existing buyer cancellation flow cancels an order that still has fulfillment `PENDING_CONFIRMATION`
- **THEN** fulfillment becomes terminal `CANCELLED` in the same transaction without being represented as a seller rejection

### Requirement: Fulfillment maps coherently to the buyer order lifecycle
Confirmation SHALL atomically move the order from `PENDING_CONFIRMATION` to `AWAITING_PICKUP`. Preparation and pickup-readiness changes SHALL leave the order in `AWAITING_PICKUP`. Mock-carrier handoff SHALL atomically move it from `AWAITING_PICKUP` to `SHIPPING`. Rejection SHALL atomically move an eligible order to `CANCELLED`; an eligible cancellation committed through another authorized lifecycle flow SHALL synchronize fulfillment to terminal `CANCELLED`. Buyer-visible order timelines MUST reflect lifecycle transitions, while fulfillment detail exposes the finer seller preparation events.

#### Scenario: Seller confirms an order
- **WHEN** confirmation succeeds
- **THEN** the buyer sees `AWAITING_PICKUP` and one seller-attributed lifecycle event while the seller sees fulfillment `CONFIRMED`

#### Scenario: Seller prepares an order
- **WHEN** a confirmed seller fulfillment advances to `PREPARING`
- **THEN** the buyer order remains `AWAITING_PICKUP` and the seller fulfillment timeline records the preparation event

#### Scenario: Seller hands off a ready order
- **WHEN** handoff succeeds
- **THEN** the buyer order becomes `SHIPPING`, the seller fulfillment becomes `HANDED_OFF`, and both views retain consistent event times and actor attribution

### Requirement: Only the owning approved seller can mutate fulfillment
Every fulfillment command SHALL require an authenticated seller who owns the order's active approved shop. Ownership and eligibility MUST be enforced before private order content is returned or any mutation is attempted. Unknown, foreign-shop, inactive-shop, and unauthorized requests MUST not reveal whether the order exists.

#### Scenario: Seller owns the order
- **WHEN** an authenticated approved seller submits a valid command for their shop order
- **THEN** the command proceeds to state, version, deadline, and inventory validation

#### Scenario: Seller targets another shop's order
- **WHEN** an authenticated seller submits a command for a foreign order reference
- **THEN** the system returns a non-enumerating failure and writes no event or state change

### Requirement: Commands are versioned, idempotent, and race safe
Every seller fulfillment mutation SHALL require the current authoritative ETag and a canonical UUID idempotency key. The system MUST bind each key to the owned order, action, normalized reason/note, and expected state. Equivalent retries MUST return the original committed result, key reuse with different input MUST conflict, and concurrent commands against one version MUST allow at most one commit.

#### Scenario: Response is lost after commit
- **WHEN** the seller retries the same command with the same idempotency key and equivalent request after losing the response
- **THEN** the system returns the original result without adding another event, shipment, lifecycle transition, or inventory change

#### Scenario: Idempotency key is reused differently
- **WHEN** the seller reuses a committed key for another action or changed reason input
- **THEN** the system returns an idempotency conflict and preserves the committed result

#### Scenario: Two commands race
- **WHEN** concurrent seller commands use the same current version for one order
- **THEN** at most one command commits and the loser receives a stale-state conflict containing only the safe current version

### Requirement: Every fulfillment command is immutably audited
The system SHALL append one immutable fulfillment event for the initial state and each committed command. An event MUST contain the order, prior/resulting fulfillment states, fulfillment version, seller actor, stable action/reason code, optional bounded note, idempotency identity, and UTC occurrence time. Event creation MUST be atomic with all command effects and MUST have no production update/delete path.

#### Scenario: Existing order is introduced to fulfillment storage
- **WHEN** migration encounters an existing non-terminal order without fulfillment data
- **THEN** it creates one deterministic initial state/event consistent with the order lifecycle without changing snapshots, totals, or buyer timeline

#### Scenario: Audit insertion fails
- **WHEN** the fulfillment event cannot be persisted
- **THEN** the order, fulfillment, inventory, and shipment effects all roll back

### Requirement: Pre-fulfillment cancellation restores sold inventory exactly once
Because successful checkout already consumes inventory, seller rejection and the existing eligible buyer cancellation SHALL atomically restore each ordered variant's on-hand quantity, decrement its sold quantity and product sold summary by the ordered amount, append immutable inventory audit entries linked safely to the cancelled order, and synchronize fulfillment to `REJECTED` or `CANCELLED` according to the actor. Compensation MUST preserve all order-line and price snapshots, MUST never produce negative counters, and MUST replay without applying inventory changes twice.

#### Scenario: Seller rejects an eligible order
- **WHEN** rejection commits for an unconfirmed order whose checkout inventory was consumed
- **THEN** every ordered quantity becomes available again exactly once, sold counters decrease consistently, and the order is cancelled

#### Scenario: Rejection is retried
- **WHEN** the same committed rejection is replayed
- **THEN** inventory balances, sold summaries, lifecycle events, and fulfillment events remain unchanged

#### Scenario: Buyer cancels before seller confirmation
- **WHEN** the existing buyer cancellation command commits for an order whose checkout inventory was consumed
- **THEN** the same shared compensation restores its quantities exactly once and fulfillment becomes `CANCELLED`

#### Scenario: Compensation cannot satisfy an invariant
- **WHEN** stored inventory or order-line data cannot be compensated safely
- **THEN** rejection fails atomically and the order remains pending confirmation for investigation

### Requirement: Seller deadlines are server-authored and observable
The system SHALL calculate a confirmation deadline 24 hours after order creation and a handoff deadline 48 hours after successful confirmation using UTC server time. Queue/detail responses MUST expose deadlines and overdue state. T25 MUST NOT auto-cancel an order solely because a deadline passed; a late valid action SHALL remain possible and MUST be marked as late in its immutable fulfillment event for later policy automation.

#### Scenario: Order awaits confirmation beyond 24 hours
- **WHEN** the confirmation deadline passes without a seller action
- **THEN** the order remains pending, appears overdue in Seller Center, and no background cancellation or stock mutation occurs

#### Scenario: Seller acts after a deadline
- **WHEN** the owning seller submits an otherwise valid confirmation or handoff after its deadline
- **THEN** the command can commit, and its fulfillment event records that the transition was late

### Requirement: Ready orders can be handed to mock shipping once
Handoff SHALL create exactly one mock shipment for the owned order with a stable mock tracking code, service snapshot, UTC handoff time, and initial normalized tracking event. It MUST reuse committed delivery/shipping data, MUST NOT call or imply success from a real carrier, and MUST commit atomically with order `SHIPPING` and fulfillment `HANDED_OFF` transitions.

#### Scenario: Ready order is handed off
- **WHEN** the seller hands off a `READY_FOR_PICKUP` order
- **THEN** one mock shipment and initial tracking event are created and the updated detail exposes the safe tracking code

#### Scenario: Shipment creation fails
- **WHEN** mock shipment persistence fails during handoff
- **THEN** order and fulfillment states remain unchanged and no partial timeline event exists

### Requirement: Seller actions use controlled input and private errors
The system SHALL accept only supported action and rejection reason codes, normalize bounded optional notes, enforce the project-wide browser Origin protection, and return private non-cacheable Problem Details for validation, stale version, idempotency, transition, inventory, ownership, and temporary-unavailable failures. Errors and logs MUST exclude buyer contact data, credentials, internal reservation identifiers, and foreign order content.

#### Scenario: Rejection reason is invalid
- **WHEN** a seller rejects an order without a supported reason or with an oversized note
- **THEN** the system returns validation details and performs no cancellation or inventory compensation

#### Scenario: Browser mutation has an untrusted origin
- **WHEN** a seller action request fails the project Origin policy
- **THEN** the system rejects it before any fulfillment or audit write
