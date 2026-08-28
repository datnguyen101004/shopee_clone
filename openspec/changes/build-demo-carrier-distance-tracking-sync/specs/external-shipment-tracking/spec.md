## Purpose

Defines authenticated, replay-safe external tracking synchronization and a normalized shipment journey that keeps buyer, seller, and order lifecycle views consistent.

## ADDED Requirements

### Requirement: Shipment tracking follows one explicit state machine

Normalized outbound shipment state SHALL use `REGISTRATION_PENDING`, `REGISTRATION_FAILED`, `CREATED`, `ACCEPTED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERY_FAILED`, `RETURN_IN_TRANSIT`, `DELIVERED`, and `RETURNED`. It MUST allow only forward registration/delivery transitions, `OUT_FOR_DELIVERY → DELIVERY_FAILED`, `DELIVERY_FAILED → OUT_FOR_DELIVERY | RETURN_IN_TRANSIT`, and `RETURN_IN_TRANSIT → RETURNED`. `DELIVERED` and `RETURNED` are terminal and mutually exclusive; every invalid skip, reversal, or terminal change MUST leave shipment, order, and timelines unchanged.

#### Scenario: Successful delivery journey
- **WHEN** a registered shipment receives `ACCEPTED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, and `DELIVERED` in order
- **THEN** every state commits once and the final shipment state is `DELIVERED`

#### Scenario: Failed delivery is retried
- **WHEN** an `OUT_FOR_DELIVERY` shipment becomes `DELIVERY_FAILED` and later returns to `OUT_FOR_DELIVERY`
- **THEN** both events remain chronological and the shipment can subsequently become `DELIVERED` or fail again

#### Scenario: Failed delivery is returned
- **WHEN** a failed shipment advances through `RETURN_IN_TRANSIT` to `RETURNED`
- **THEN** the return events commit in order and no later delivered event is accepted

### Requirement: Carrier callbacks are signed, time bounded, and exact

Demo Carrier callbacks SHALL contain an external event ID, carrier shipment identity, marketplace shipment reference, normalized state, carrier occurrence time, and state-specific reason when required. The callback endpoint MUST verify a keyed signature over the exact raw body, enforce a bounded timestamp replay window, reject malformed/unknown fields, and apply signature and transport validation before looking up or exposing shipment data.

#### Scenario: Valid signed callback arrives
- **WHEN** a callback has a trusted signature, timestamp within the accepted window, exact schema, and known shipment identity
- **THEN** it proceeds to duplicate and transition reconciliation

#### Scenario: Signature is invalid
- **WHEN** the raw body, signature, or timestamp cannot be authenticated
- **THEN** the request is rejected without shipment lookup details or state changes

#### Scenario: Signed callback is too old
- **WHEN** an otherwise valid callback falls outside the accepted replay window
- **THEN** it is rejected and no event identity is reserved as successfully processed

### Requirement: External events are idempotent and causally reconciled

The system SHALL store at most one normalized event for each `(provider, externalEventId)` and at most one effective transition for an equivalent carrier shipment/state occurrence. An exact duplicate MUST acknowledge the original outcome without adding another event. A stale or out-of-order event that cannot validly follow the current state MUST be recorded only as a bounded reconciliation outcome and MUST NOT move state backward.

#### Scenario: Carrier retries the same event
- **WHEN** the same authenticated external event ID and equivalent body arrives more than once
- **THEN** every retry receives the original acknowledgement and exactly one shipment event exists

#### Scenario: Event identity is reused differently
- **WHEN** a carrier reuses an external event ID with a different shipment, state, time, or reason
- **THEN** the callback conflicts, neither event overwrites the other, and shipment state remains unchanged

#### Scenario: Delayed earlier state arrives
- **WHEN** `IN_TRANSIT` arrives after the shipment already committed `OUT_FOR_DELIVERY`
- **THEN** the event is acknowledged as stale without appending a second effective transition or moving the shipment backward

### Requirement: Tracking and order lifecycle commit atomically

An accepted callback SHALL lock and update the shipment before its shop order, append one immutable shipment event, and apply any related order lifecycle transition in one transaction. `DELIVERED` SHALL move an order from `SHIPPING` to `DELIVERED` with one system-attributed order event. `RETURNED` SHALL move an undelivered `SHIPPING` order to `CANCELLED` with reason `CARRIER_RETURNED_UNDELIVERED`; it MUST NOT automatically restock inventory or rewrite payment, address, shipping, voucher, or line snapshots. Nonterminal carrier states SHALL leave the coarse order status as `SHIPPING`.

#### Scenario: Delivered callback commits
- **WHEN** a valid `DELIVERED` event is accepted for a `SHIPPING` order
- **THEN** shipment state, shipment event, order `DELIVERED`, version, and order timeline event commit together

#### Scenario: Undelivered parcel returns to shop
- **WHEN** a valid terminal `RETURNED` event is accepted before delivery
- **THEN** shipment becomes `RETURNED`, order becomes `CANCELLED` with the carrier-return reason, and inventory is not silently made sellable

#### Scenario: Order transition persistence fails
- **WHEN** a terminal shipment event cannot commit its required order lifecycle event
- **THEN** shipment state and event also roll back so buyer and seller cannot observe contradictory terminal states

### Requirement: Concurrent terminal events have one winner

Callbacks and authorized demo commands targeting one shipment SHALL serialize on the current shipment version. If delivered and return-terminal updates race, at most one terminal path SHALL commit; the other SHALL receive or record a stable terminal conflict without changing the committed outcome.

#### Scenario: Delivered and returned race
- **WHEN** valid `DELIVERED` and `RETURNED` updates target the same current shipment concurrently
- **THEN** exactly one terminal state and its matching order lifecycle transition commit

#### Scenario: Duplicate command races its callback
- **WHEN** a demo operation response and its resulting callback are retried concurrently
- **THEN** the external event identity yields one effective transition and one timeline entry

### Requirement: Buyer and seller receive owner-scoped tracking projections

Buyer order detail and seller order detail SHALL expose the same safe shipment identity, provider label, simulation marker, service, current normalized state, estimated delivery window, last update time, and chronologically ordered event projection. Buyer access MUST remain order-owner scoped; seller access MUST remain active approved shop-owner scoped; unknown and foreign references MUST be non-enumerating. List responses MUST omit full recipient contact/address data.

#### Scenario: Buyer opens an owned shipping order
- **WHEN** the authenticated buyer requests their order detail after carrier updates
- **THEN** the response contains the latest normalized shipment and complete buyer-safe tracking timeline

#### Scenario: Seller opens a foreign shipment
- **WHEN** a seller requests tracking belonging to another shop
- **THEN** the result is indistinguishable from an unknown reference and exposes no shipment or buyer data

#### Scenario: Buyer and seller refresh after one update
- **WHEN** both authorized views reload after the same accepted callback
- **THEN** they report the same current state, event ordering, and last update time with role-appropriate copy

### Requirement: Tracking UI follows approved responsive behavior

Buyer and seller order detail SHALL render the simulation label, tracking code, copy feedback, current state, timestamped timeline, pending registration, registration failure, delivery failure, retry, return, delivered, loading, empty, disconnected, and recoverable-error states from the approved T33 UI/UX specification. Visible pages SHALL refresh on focus and while actively viewed without shifting a user away from older timeline content.

#### Scenario: New event arrives near the timeline end
- **WHEN** the user is actively viewing near the newest event and the detail refresh observes another state
- **THEN** the new event is announced and brought into view without reloading unrelated order content

#### Scenario: New event arrives while reading history
- **WHEN** the user is reading an older timeline entry
- **THEN** the page preserves the reading position and offers a “Có cập nhật mới” control to reach the latest event

#### Scenario: Tracking refresh fails
- **WHEN** the latest tracking projection cannot be loaded temporarily
- **THEN** last confirmed data remains visible with a retry affordance and no fabricated empty or terminal state
