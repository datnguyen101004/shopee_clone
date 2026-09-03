## Purpose

Keep Seller Center inventory focused on products currently published for sale and make each inventory row easy to identify through authoritative product imagery.

## ADDED Requirements

### Requirement: Inventory lists only currently published products
The seller inventory API SHALL return only variants owned by the authenticated seller's approved active shop whose product is non-deleted, published, moderation-active, category-eligible, and whose variant is non-deleted and active. Draft, hidden, archived, suspended, and soft-deleted products MUST NOT appear, regardless of their on-hand, reserved, or sold quantities.

#### Scenario: Published product has active inventory
- **WHEN** a seller requests inventory and an owned published product has an active variant
- **THEN** the variant appears with authoritative on-hand, reserved, sold, available, version, and update-time values

#### Scenario: Product is not currently published
- **WHEN** an owned product is draft, hidden, archived, suspended, or soft deleted
- **THEN** none of its variants appear in seller inventory results

#### Scenario: Variant is inactive or deleted
- **WHEN** a published product contains an inactive or deleted variant
- **THEN** that variant is excluded while other eligible active variants remain visible

### Requirement: Inventory responses include authoritative product imagery
Every seller inventory item SHALL include a nullable primary product image URL selected by stable product media ordering. The URL MUST be seller-safe, strictly validated by shared contracts, and MUST NOT expose staged, expired, foreign-shop, or storage-credential data.

#### Scenario: Product has attached media
- **WHEN** an eligible product has one or more public attached images
- **THEN** each of its inventory rows returns the same first ordered product thumbnail URL

#### Scenario: Product has no usable media
- **WHEN** an eligible product has no attached public image
- **THEN** the inventory item returns a null image URL rather than an invalid or private media reference

### Requirement: Published-only filtering preserves stable pagination
Inventory filtering, low-stock filtering, cursor pagination, and ordering SHALL be applied against the same published-product eligibility boundary. A page MUST NOT include hidden rows or produce a next cursor that causes eligible rows to be skipped or duplicated because ineligible products were filtered after pagination.

#### Scenario: Ineligible rows fall between eligible rows
- **WHEN** draft or hidden variants sort between published variants in storage order
- **THEN** pagination returns a stable page of eligible variants and the next cursor continues after the last returned eligible variant

#### Scenario: Low-stock filter is enabled
- **WHEN** a seller requests only low-stock inventory
- **THEN** the system evaluates low stock from authoritative available quantity only among published eligible variants

### Requirement: Seller Center displays recognizable inventory rows
The `/seller/inventory` screen SHALL render a consistently sized product thumbnail beside product name, variant, and SKU, with an accessible fallback when no image exists or loading fails. The table/card layout MUST remain usable on mobile, tablet, and desktop without hiding stock quantities or adjustment/history actions.

#### Scenario: Thumbnail loads successfully
- **WHEN** an inventory item has a valid primary image URL
- **THEN** Seller Center displays the image with meaningful alternative text derived from the product name

#### Scenario: Thumbnail is missing or fails to load
- **WHEN** the image URL is null or cannot be displayed
- **THEN** a neutral product placeholder appears without collapsing the row or preventing inventory actions

### Requirement: Inventory mutations remain server-authoritative
Published-only list visibility MUST NOT weaken existing ownership, optimistic version, idempotency, audit, or reserved-stock protections. A variant that becomes ineligible between list and adjustment MUST be revalidated and rejected with private non-cacheable Problem Details.

#### Scenario: Product is hidden before an adjustment
- **WHEN** a seller opens an inventory row and the product stops being published before submission
- **THEN** the adjustment is rejected safely, no audit mutation is committed, and the UI refreshes the published-only inventory list

