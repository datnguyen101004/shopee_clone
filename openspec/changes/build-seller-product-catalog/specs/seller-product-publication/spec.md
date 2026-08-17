## Purpose

Keep buyer catalogue, product detail, cart, pricing, and checkout behavior aligned with the authoritative publishability of seller-managed listings.

## ADDED Requirements

### Requirement: Buyer visibility follows publishability
The system SHALL expose a seller-managed listing to buyer catalogue, storefront, search, homepage, and product-detail read paths only when it is published, not archived or deleted, belongs to an active approved shop, and belongs to an active category. Draft, hidden, archived, suspended, and otherwise unavailable listings MUST be treated as not found by public product reads.

#### Scenario: Hidden listing is not publicly readable
- **WHEN** a seller hides a previously published listing
- **THEN** subsequent public catalogue and product-detail reads omit the listing or return not found

### Requirement: Purchase eligibility follows current listing facts
The system SHALL permit a product variant to be added to cart, quoted, or purchased only when its parent listing remains published and publicly visible, the seller shop and category remain eligible, the variant is active and not deleted, and available stock is positive. The system MUST re-evaluate these facts server-side for cart, pricing, and checkout operations.

#### Scenario: Product becomes hidden after cart addition
- **WHEN** a buyer has a line for a listing that the seller subsequently hides
- **THEN** the cart, quote, and checkout classify that line as unavailable and do not purchase it

### Requirement: Moderation-compatible availability
The system SHALL preserve seller-authored listing data while allowing a product moderation state to disable public visibility and purchase eligibility independently of seller lifecycle state. Seller product-management reads MUST clearly identify a moderation-disabled listing without permitting the seller to override that state.

#### Scenario: Moderation disables a published listing
- **WHEN** a moderation state disables an otherwise published listing
- **THEN** buyer-facing reads and purchase operations exclude it while the seller can still inspect the disabled state in Seller Center

