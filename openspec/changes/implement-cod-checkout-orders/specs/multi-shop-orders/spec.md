## Purpose

Defines how one confirmed buyer checkout becomes an atomic purchase group containing durable, immutable orders separated by merchant shop.

## ADDED Requirements

### Requirement: One purchase is split into exactly one order per participating shop

The system SHALL create one buyer-owned purchase group for each successful COD confirmation and exactly one child order for each distinct shop represented by the purchased lines. Every selected purchased line MUST appear once in the order for its owning shop and MUST NOT appear in any other order.

#### Scenario: Cart contains lines from multiple shops

- **WHEN** a checkout commits selected eligible lines from three distinct shops
- **THEN** one purchase reference is created with three shop orders and each line is assigned to its owning shop order exactly once

#### Scenario: Cart contains multiple lines from one shop

- **WHEN** a checkout commits several variants owned by the same shop
- **THEN** the variants are stored as separate order lines under one shop order rather than separate orders

### Requirement: Purchase and order totals preserve pricing invariants

The system SHALL persist currency and itemized non-negative integer minor-unit amounts for product list value, product discounts, merchandise subtotal, shop-voucher discount, platform-voucher discount, shipping fee, shipping-voucher discount, shipping payable, and final payable. Each order total MUST equal its line and shipping allocations, and the purchase total MUST equal the sum of its child-order totals.

#### Scenario: Discounts span multiple shop orders

- **WHEN** platform, shop, and free-shipping vouchers allocate discounts across a multi-shop checkout
- **THEN** every persisted allocation reconciles with its order and line totals and the purchase totals equal the exact sum of the child orders

#### Scenario: COD amount is derived

- **WHEN** a purchase is committed
- **THEN** its COD amount equals the final purchase payable total and is never accepted from the client

### Requirement: Committed orders retain immutable business snapshots

The system SHALL snapshot all facts needed to interpret the purchase without relying on mutable catalog, account, shipping, or voucher rows. Snapshots MUST include buyer delivery recipient and phone, full legacy address fields, product and variant identifiers plus display name and SKU, representative image reference, quantity, price and discount breakdown, shop identity, normalized shop note, selected shipping service and fee breakdown, applied voucher identity and allocations, currency, payment method, and creation time.

#### Scenario: Catalog and address change after checkout

- **WHEN** product names, images, prices, shop names, or the buyer's saved address change after a purchase commits
- **THEN** the purchase result continues to show the values captured at checkout

#### Scenario: Source record is later unavailable

- **WHEN** a catalog item or saved address is deactivated after checkout
- **THEN** the committed order remains readable from its snapshots without recalculating historical values

### Requirement: New COD orders start in a deterministic state

Every child order created by this change SHALL use payment method `COD`, payment status `UNPAID`, and order status `PENDING_CONFIRMATION`. The purchase group SHALL expose a stable reference and each child order SHALL expose its own stable order reference suitable for later lifecycle work.

#### Scenario: First COD purchase is created

- **WHEN** checkout commits successfully
- **THEN** all child orders have `PENDING_CONFIRMATION` and `UNPAID` snapshots and are returned in a deterministic order

### Requirement: Purchase creation is all-or-nothing

The system MUST commit the purchase group, all child orders and lines, snapshots, idempotency result, voucher usage, and purchased-cart cleanup in one database transaction. Any error before commit MUST leave none of those effects visible.

#### Scenario: A child-order write fails

- **WHEN** persistence fails after some in-transaction purchase rows have been attempted
- **THEN** the purchase group, every child order and line, voucher usage changes, idempotency result, and cart deletions are all rolled back

#### Scenario: Voucher consumption loses a concurrency race

- **WHEN** a voucher reaches a global or per-buyer limit while checkout is committing
- **THEN** the transaction fails without partial orders or cart cleanup and returns a stable checkout conflict

#### Scenario: Commit succeeds

- **WHEN** every validation and write succeeds
- **THEN** the purchase, voucher redemptions, idempotency result, and cart cleanup become visible together

### Requirement: Voucher usage is linked to the committed purchase

The system SHALL consume only vouchers whose authoritative confirmation result is applied with a positive benefit, SHALL do so exactly once, and SHALL link the resulting redemptions to the committed purchase reference and their persisted per-shop or per-line allocations.

#### Scenario: Successful purchase uses multiple approved voucher slots

- **WHEN** a checkout commits with applied platform, shop, and free-shipping vouchers
- **THEN** each voucher usage count advances once and its redemption allocations reconcile with the purchase snapshots

#### Scenario: Idempotent replay occurs

- **WHEN** the successful confirmation is replayed
- **THEN** no voucher usage count or redemption row is incremented or inserted again

### Requirement: Only purchased cart lines are removed after success

The system SHALL delete the exact cart lines represented in the committed purchase only after all purchase work succeeds. Unselected lines MUST remain in the active cart, and the cart version MUST advance once for the successful cleanup.

#### Scenario: Selected and unselected lines coexist

- **WHEN** a buyer checks out selected lines while other lines remain unselected
- **THEN** only purchased selected lines are removed and the unselected lines remain available in the updated cart

#### Scenario: Confirmation fails

- **WHEN** checkout validation or transaction commit fails
- **THEN** all cart lines and the cart version remain unchanged

#### Scenario: All cart lines are purchased

- **WHEN** every line in the cart is included in a successful checkout
- **THEN** the active cart remains usable as an empty cart with its version advanced rather than becoming an inaccessible consumed cart

### Requirement: Purchase-result access is buyer scoped

The system SHALL let an authenticated buyer retrieve the immutable result for their own purchase reference for the confirmation experience. It MUST return the same non-enumerating not-found behavior for an unknown reference and a purchase owned by another buyer.

#### Scenario: Owner retrieves purchase result

- **WHEN** the owning buyer requests their committed purchase reference
- **THEN** the system returns the purchase group and all child-order snapshots in the shared response contract

#### Scenario: Another buyer requests the reference

- **WHEN** a different authenticated buyer requests that purchase reference
- **THEN** the system returns non-enumerating `404` Problem Details and exposes no purchase fields

### Requirement: T19 validates current availability without introducing reservations

Immediately before creation, the system SHALL reject lines that are currently unavailable or exceed current readable stock. This change SHALL NOT create stock reservations or claim oversell prevention across different idempotency keys; transactional reservation and sold-stock accounting remain the responsibility of T24.

#### Scenario: Current stock cannot satisfy the selected quantity

- **WHEN** confirmation observes that a selected quantity exceeds currently readable availability
- **THEN** the checkout is not ready and no purchase is created

#### Scenario: Separate buyers race before inventory reservations exist

- **WHEN** two different valid checkout keys race for the same remaining units during T19
- **THEN** order atomicity and idempotency still hold, while cross-purchase inventory reservation guarantees are explicitly deferred to T24
