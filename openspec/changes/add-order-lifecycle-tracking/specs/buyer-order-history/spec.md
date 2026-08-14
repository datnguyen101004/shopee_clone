## Purpose

Defines the authenticated buyer experience for finding, filtering, inspecting, and safely cancelling previously placed per-shop orders.

## ADDED Requirements

### Requirement: Buyer can list owned shop orders with stable cursor pagination

The system SHALL expose `GET /api/v1/account/orders` for an authenticated buyer. Each result item SHALL represent one T19 per-shop order, use committed snapshots and totals, include status/version/timestamps and purchase reference, and be ordered newest first with an opaque stable cursor.

#### Scenario: Buyer has orders from multiple purchases and shops

- **WHEN** the buyer requests the first page
- **THEN** the system returns only that buyer's shop orders in deterministic newest-first order with a next cursor when more results exist

#### Scenario: Buyer has no matching orders

- **WHEN** the buyer requests a valid page or filter with no matches
- **THEN** the system returns an empty successful page rather than an error

#### Scenario: Cursor is malformed or incompatible with the filter

- **WHEN** the caller supplies an invalid cursor, unsupported limit, unknown field, or cursor created for another filter
- **THEN** the system returns strict validation Problem Details and no order data

### Requirement: Buyer order list supports Shopee-like status filters

The order list SHALL support `ALL`, `PENDING_CONFIRMATION`, `AWAITING_PICKUP`, `SHIPPING`, `DELIVERED`, `CANCELLED`, and `RETURN_REFUND` filters. `RETURN_REFUND` MUST include `RETURN_REQUESTED`, `RETURNED`, and `REFUNDED`; every other filter MUST map to exactly its named status.

#### Scenario: Buyer selects a concrete status tab

- **WHEN** the buyer filters by `SHIPPING`
- **THEN** every returned item is an owned order currently in `SHIPPING`

#### Scenario: Buyer selects return/refund tab

- **WHEN** the buyer filters by `RETURN_REFUND`
- **THEN** the page contains only owned orders in one of the three return/refund representation states

### Requirement: Buyer can retrieve an owner-scoped order detail

The system SHALL expose `GET /api/v1/account/orders/:orderReference` and return the owned shop order's committed address, shop, product/variant lines, shipping, voucher allocations relevant to that shop, itemized totals, payment state, lifecycle state/version, cancellation availability, and complete ordered timeline.

#### Scenario: Owner opens an order

- **WHEN** the authenticated owner requests a valid order reference
- **THEN** the system returns an exact shared-contract detail built only from committed snapshots and lifecycle events

#### Scenario: Unknown or foreign order is requested

- **WHEN** the reference is unknown or belongs to a different buyer
- **THEN** both cases return identical non-enumerating `404` Problem Details with no order fields

#### Scenario: Purchase contains multiple shop orders

- **WHEN** the buyer opens one child order from a multi-shop purchase
- **THEN** detail contains only that shop's lines, shipping, voucher allocations, totals, and timeline while retaining the parent purchase reference

### Requirement: Order history responses are private and contract validated

The system SHALL return exact shared-contract payloads, safe integer VND minor units, RFC-style Problem Details, and `Cache-Control: private, no-store` for list, detail, and cancellation responses.

#### Scenario: List or detail response is malformed internally

- **WHEN** persisted data cannot satisfy snapshot, money, pagination, or timeline invariants
- **THEN** the API returns a safe unavailable response rather than leaking partial or malformed order data

#### Scenario: Session is missing or expired

- **WHEN** an unauthenticated caller requests order list, detail, or cancellation
- **THEN** the system returns `401` and exposes no buyer order information

### Requirement: Storefront provides order list and detail screens

The storefront SHALL add `Tài khoản → Đơn mua`, an authenticated `/account/orders` list with responsive status tabs and pagination, and `/account/orders/[orderReference]` detail showing snapshots, totals, payment/lifecycle status, and timeline. Cancellation controls MUST appear only when the server declares the order cancellable.

#### Scenario: Buyer opens Đơn mua

- **WHEN** a signed-in buyer navigates from account navigation
- **THEN** the list renders loading, populated, empty, filter, pagination, and recoverable error states without exposing another account's data

#### Scenario: Buyer inspects timeline

- **WHEN** the buyer opens an order detail
- **THEN** creation and transition events appear in chronological order with localized labels, actor attribution, reason, and time

#### Scenario: Buyer cancels from detail

- **WHEN** an eligible buyer confirms a valid cancellation reason
- **THEN** the screen prevents duplicate submission, sends the current version and stable idempotency key, then renders the cancelled status and new timeline event

#### Scenario: Cancellation loses a race

- **WHEN** another transition commits before the buyer's cancellation
- **THEN** the screen refreshes authoritative detail, explains that cancellation is no longer available, and does not display a false success

#### Scenario: Buyer refreshes or deep-links order detail

- **WHEN** the owner reloads `/account/orders/[orderReference]`
- **THEN** the same immutable snapshots and latest timeline are retrieved without relying on navigation state
