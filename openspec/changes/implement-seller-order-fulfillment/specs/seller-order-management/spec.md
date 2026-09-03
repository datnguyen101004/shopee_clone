## Purpose

Provide each approved seller with a private, reliable view of only their shop's orders, packing information, fulfillment progress, and currently permitted actions.

## ADDED Requirements

### Requirement: Seller order queue is owned, filterable, and stably paginated
The system SHALL expose an authenticated seller order queue containing only orders whose shop is owned by the current seller. The queue MUST support stable cursor pagination, bounded page sizes, and normalized filters for order status, fulfillment state, created-date range, and order reference. Results MUST be ordered deterministically newest first and MUST NOT expose buyer orders belonging to another shop.

#### Scenario: Seller lists their shop orders
- **WHEN** an approved seller requests the queue without filters
- **THEN** the system returns the newest orders for that seller's owned shop with a bounded page and an opaque next cursor when more results exist

#### Scenario: Seller applies queue filters
- **WHEN** the seller requests a supported order-status, fulfillment-state, date-range, or exact-reference filter
- **THEN** every returned order matches the normalized filter and the cursor is valid only for that filter set

#### Scenario: Seller attempts cross-shop access
- **WHEN** a seller requests an order reference owned by another shop
- **THEN** the system returns the same non-enumerating not-found response used for an unknown order

### Requirement: Queue summaries expose authoritative fulfillment context
Each queue item SHALL be projected from committed order records and SHALL include the order reference, creation/update times, immutable shop and line summaries, item count, payable total, payment state, order status, fulfillment state, deadline/overdue indicators, and server-declared available actions. Product names, images, variants, quantities, and totals MUST come from order snapshots rather than mutable catalog data.

#### Scenario: Source product changes after checkout
- **WHEN** a seller renames, hides, or deletes a product after an order was created
- **THEN** the seller queue continues to show the product, variant, image, quantity, and price captured by that order

#### Scenario: No action is currently allowed
- **WHEN** an order is terminal or its current state does not allow a seller command
- **THEN** the queue item declares no available action and the UI does not infer one from labels alone

### Requirement: Seller order detail uses immutable purchase snapshots
The system SHALL expose an owner-scoped seller order detail containing all ordered lines, quantities, SKU/variant snapshots, buyer note, delivery recipient/address/phone snapshot, shipping service snapshot, itemized totals, order timeline, fulfillment timeline, deadline state, and server-declared commands. The response MUST preserve historical checkout meaning and MUST NOT read current account addresses or current catalog prices for these fields.

#### Scenario: Buyer edits their saved address
- **WHEN** the buyer changes or removes the saved address after placing the order
- **THEN** the seller detail continues to show the committed delivery snapshot for that order

#### Scenario: Detail data is malformed in storage
- **WHEN** persisted money or snapshot invariants cannot be validated safely
- **THEN** the system returns a private unavailable response rather than emitting a partial or misleading fulfillment detail

### Requirement: Packing and shipment information is printable and privacy bounded
The seller detail SHALL provide a print-ready packing/shipment view containing only the owned order reference, recipient and delivery snapshot required for fulfillment, shop return/pickup snapshot, shipping service, package/line quantities, SKU/variant labels, buyer note, and mock shipment identifier when available. It MUST exclude credentials, account identifiers, payment secrets, internal reservation identifiers, private audit metadata, and unrelated purchase siblings.

#### Scenario: Seller opens the packing view
- **WHEN** the owner opens the packing or print view for an eligible order
- **THEN** the system renders a printable document from committed snapshots without fetching mutable profile or product data

#### Scenario: Foreign seller requests packing information
- **WHEN** a seller requests the packing view for another shop's order
- **THEN** no recipient, phone, address, note, or shipment field is disclosed

### Requirement: Seller Center provides order queue and fulfillment detail screens
The web application SHALL add `Đơn hàng` to Seller Center and provide `/seller/orders` plus `/seller/orders/[orderReference]`. The screens MUST wait for session restoration, enforce the seller role, use authenticated API calls, synchronize validated filters with the URL, and render accessible loading, empty, populated, pagination, forbidden, non-enumerating not-found, stale, and recoverable-error states without persisting private order data in browser storage.

#### Scenario: Approved seller opens order management
- **WHEN** an authenticated approved seller opens Seller Center orders
- **THEN** the queue renders responsive Shopee-style status tabs/cards or table rows and links to an authoritative detail screen

#### Scenario: User is not a seller
- **WHEN** a guest or authenticated buyer without seller authorization opens a seller-order route
- **THEN** the application shows the established login or forbidden state and sends no seller-order mutation

#### Scenario: Mutation completes or conflicts
- **WHEN** a seller action succeeds or returns a stale-state conflict
- **THEN** the screen refreshes the authoritative detail and available actions while preserving a clear result message

### Requirement: Seller order responses remain private and strictly validated
All seller-order reads SHALL require authenticated seller authorization, return private no-store responses, validate exact response shapes, and reject malformed query parameters with stable Problem Details. Unknown and foreign references MUST remain indistinguishable, and logs/errors MUST NOT disclose buyer contact data or unrelated order content.

#### Scenario: Unauthenticated caller requests seller orders
- **WHEN** a request has no valid authenticated seller session
- **THEN** the system returns the established authentication or authorization error with no order data

#### Scenario: Unsupported filter is supplied
- **WHEN** a seller queue request contains an unknown filter, invalid cursor, reversed date range, or excessive limit
- **THEN** the system returns a validation Problem Details response identifying only safe invalid parameter names

