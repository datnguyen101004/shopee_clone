## Purpose

Provide each approved seller with authoritative, auditable stock balances for their own product variants while preventing invalid or unaudited inventory changes.

## ADDED Requirements

### Requirement: Inventory exposes consistent stock concepts
The system SHALL maintain non-negative integer on-hand, reserved, and sold quantities for every product variant. Available quantity MUST equal on-hand minus reserved, reserved MUST NOT exceed on-hand, and every API or screen that reports purchasable stock MUST use that same available quantity.

#### Scenario: Seller reads a variant balance
- **WHEN** an approved seller reads a variant with 20 units on hand, 4 active reserved units, and 7 sold units
- **THEN** the system reports on-hand 20, reserved 4, sold 7, and available 16

#### Scenario: New variant receives initial stock
- **WHEN** a seller creates a new variant with an initial quantity
- **THEN** the system creates its inventory balance and an initial-stock audit event atomically with the variant

### Requirement: Seller inventory access is shop scoped
The system SHALL provide a paginated seller inventory workspace containing only variants owned by the authenticated seller's approved active shop. Each item SHALL include product and variant identity, SKU, lifecycle state, on-hand, reserved, sold, available, low-stock state, inventory version, and update time. Foreign, absent, or deleted variants MUST use non-enumerating not-found behavior for detail and mutation operations.

#### Scenario: Seller lists own inventory
- **WHEN** an approved seller requests their inventory workspace with valid pagination and filters
- **THEN** the system returns only that shop's variants in stable order with authoritative balance summaries

#### Scenario: Seller targets another shop variant
- **WHEN** a seller requests or adjusts a variant owned by another shop
- **THEN** the system returns the same not-found behavior as an unknown variant and exposes no foreign inventory data

### Requirement: Seller adjustments are validated and idempotent
The system SHALL expose a seller-owned adjustment operation that accepts a non-zero signed integer delta, a supported reason code, an optional bounded note, the expected inventory version, and a canonical idempotency key. An accepted adjustment MUST apply once, increment the inventory version, and return the resulting balance. Replaying the same key with the same canonical request MUST return the original result without changing stock again; reusing the key with different input MUST fail with conflict.

#### Scenario: Seller adds stock
- **WHEN** a seller adds 25 units to an inventory balance at its current version with a new idempotency key
- **THEN** on-hand increases by 25 exactly once and the response contains the advanced version and updated available quantity

#### Scenario: Adjustment request is replayed
- **WHEN** the same seller repeats an accepted adjustment with the same idempotency key and equivalent canonical input
- **THEN** the system returns the original adjustment result and does not apply the delta again

#### Scenario: Idempotency key is reused differently
- **WHEN** a seller reuses an adjustment idempotency key with a different delta, reason, note, variant, or expected version
- **THEN** the system returns conflict and preserves the previously committed adjustment

### Requirement: Adjustments preserve stock invariants under concurrency
The system MUST serialize competing mutations for the same variant and reject stale versions or deltas that would make on-hand negative or lower than the active reserved quantity. A rejected adjustment MUST create no audit event and MUST leave every balance unchanged.

#### Scenario: Seller tries to remove reserved units
- **WHEN** a variant has 10 on hand and 4 reserved and the seller requests a delta of negative 7
- **THEN** the system rejects the adjustment because the resulting on-hand quantity would be below reserved quantity

#### Scenario: Two adjustments race on one version
- **WHEN** two different adjustment requests concurrently present the same current inventory version
- **THEN** at most one commits at that version and the other receives a version conflict with no partial stock change

### Requirement: Every stock change has immutable audit history
The system SHALL persist an immutable event for initial stock and every accepted seller adjustment, including the shop, variant, actor, reason, optional note, signed delta, before and after balances, inventory version, idempotency identity, and UTC occurrence time. The owning seller SHALL be able to retrieve this history in stable cursor pagination and MUST NOT modify or delete audit events.

#### Scenario: Seller reviews adjustment history
- **WHEN** the owning seller requests a variant's inventory history
- **THEN** the system returns newest-first immutable events whose deltas and before/after values reconcile with the balance versions

#### Scenario: Adjustment fails validation
- **WHEN** an adjustment is rejected for ownership, input, stale version, or insufficient unreserved stock
- **THEN** no success audit event is recorded

### Requirement: Product authoring cannot bypass inventory commands
The system SHALL route initial stock and subsequent stock differences originating from seller product create or edit flows through the same invariant checks and audit-event persistence used by inventory adjustments. Editing product content, price, media, or option labels without changing stock MUST NOT create an inventory event.

#### Scenario: Seller changes stock in product editor
- **WHEN** a seller saves an existing variant with a quantity different from its current on-hand balance
- **THEN** the system records the resulting signed delta with a product-edit reason and applies it atomically with the permitted product update

#### Scenario: Seller edits only product content
- **WHEN** a seller changes a product description without changing any variant stock quantity
- **THEN** inventory balances and audit history remain unchanged

### Requirement: Seller Center presents safe stock controls
The Seller Center SHALL provide an inventory screen or equivalent product-management controls that display on-hand, reserved, sold, and available quantities, require a reason for stock changes, prevent invalid client input, and refresh after accepted adjustments. The client MUST treat API balances and versions as authoritative and retain entered reason and note values after a rejected request.

#### Scenario: Seller adjusts stock from Seller Center
- **WHEN** the seller submits a valid stock adjustment from the inventory interface
- **THEN** the interface displays the committed balance and audit event returned by the API without reconstructing stock locally

#### Scenario: Inventory version becomes stale
- **WHEN** another mutation advances the inventory version before the seller submits
- **THEN** the interface reports the conflict, reloads the authoritative balance, and does not claim the requested adjustment succeeded
