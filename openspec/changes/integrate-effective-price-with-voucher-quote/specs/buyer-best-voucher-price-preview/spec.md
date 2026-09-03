## Purpose

Defines a trustworthy, personalized best-voucher price preview for authenticated buyers while preserving scheduled effective pricing for guests and authoritative recalculation at cart and checkout.

## ADDED Requirements

### Requirement: Guest product prices remain effective product prices

The system SHALL display the server-authoritative scheduled `effectivePriceMinor` to a guest on every covered live buyer product-price surface. It MUST NOT infer voucher eligibility, expose buyer-specific voucher data, or claim a shipping benefit without an authenticated buyer context.

#### Scenario: Guest views a product with an active campaign

- **WHEN** an unauthenticated guest views a covered product card or detail price
- **THEN** the displayed merchandise price equals the scheduled effective price and contains no buyer voucher preview

#### Scenario: Guest views a product without a campaign

- **WHEN** an unauthenticated guest views a covered product with no active scheduled campaign
- **THEN** the displayed merchandise price equals the stored sellable variant price

### Requirement: Authenticated buyers receive a quantity-one best merchandise preview

For an authenticated buyer, the system SHALL evaluate one sellable unit of each covered product using its scheduled effective price, current voucher definitions, scopes, activity windows, global usage, and that buyer's usage. It SHALL expose the lowest eligible merchandise payable obtained from at most one shop voucher followed by at most one platform voucher.

#### Scenario: Shop and platform vouchers both improve the price

- **WHEN** an authenticated buyer is eligible for a shop voucher and a platform voucher for one unit of a product
- **THEN** the preview applies the shop voucher first, the platform voucher to the remaining merchandise value, and displays the resulting merchandise payable

#### Scenario: Minimum spend is not met for one unit

- **WHEN** a voucher requires more eligible spend than the scheduled effective price of one unit
- **THEN** that voucher is excluded from the product preview even if it could become eligible for a larger cart quantity

#### Scenario: Buyer has exhausted a personal limit

- **WHEN** the authenticated buyer has reached a voucher's per-buyer usage limit
- **THEN** the voucher contributes no preview discount while other eligible vouchers remain candidates

### Requirement: Best voucher selection is deterministic and server authoritative

The system SHALL discover voucher candidates from PostgreSQL and evaluate allowed combinations using the existing shop-before-platform calculation order and exact integer minor-unit rules. It SHALL choose the combination with the lowest payable amount and use canonical voucher identity ordering as the final tie-breaker. The browser MUST NOT submit candidate rates, discount amounts, eligibility facts, or a claimed best combination.

#### Scenario: Two combinations produce different payable amounts

- **WHEN** multiple eligible voucher combinations exist for a product
- **THEN** the system chooses the combination with the lowest merchandise payable regardless of database row order

#### Scenario: Two combinations produce the same payable amount

- **WHEN** eligible combinations produce the same payable amount
- **THEN** the system chooses the same canonical voucher set for repeated requests and equivalent data orderings

#### Scenario: No voucher improves the price

- **WHEN** every candidate is ineligible or produces zero additional benefit
- **THEN** the buyer display falls back to `effectivePriceMinor` and does not claim a voucher saving

### Requirement: Shipping voucher preview requires a usable buyer address

The system SHALL evaluate a shipping voucher only when the authenticated buyer has a usable default delivery address and the product has enough authoritative shop-origin, weight, and availability facts to produce a standard-service shipping estimate. Shipping discount SHALL reduce estimated shipping payable only and MUST NOT reduce the displayed merchandise unit price.

#### Scenario: Buyer has a usable default address

- **WHEN** a standard shipping estimate exists and one or more shipping vouchers are eligible
- **THEN** the preview exposes the estimated fee, selected shipping voucher benefit, shipping payable, and combined estimated payable separately from merchandise price

#### Scenario: Buyer has no usable address

- **WHEN** the authenticated buyer has no usable default delivery address
- **THEN** shipping fee, shipping voucher, shipping payable, and combined landed-price fields are absent or null while merchandise voucher pricing remains available

#### Scenario: Shipping facts are incomplete

- **WHEN** product weight, shop origin, destination, or service support is insufficient for an authoritative estimate
- **THEN** the system omits shipping claims instead of inventing a fee or free-shipping saving

### Requirement: Buyer price previews are explicit and internally consistent

The system SHALL keep top-level `priceMinor` as the scheduled effective merchandise price for compatibility and SHALL expose personalized results in an optional versioned buyer-preview object. That object SHALL identify quantity one, currency, evaluation instant, applied voucher evidence, merchandise discount, merchandise payable, and nullable shipping facts. Every amount SHALL be a safe non-negative integer and SHALL reconcile exactly.

#### Scenario: Valid merchandise preview

- **WHEN** an eligible combination discounts a product
- **THEN** `merchandisePayableMinor = effectivePriceMinor - shopVoucherDiscountMinor - platformVoucherDiscountMinor` and the shared buyer display selector returns `merchandisePayableMinor`

#### Scenario: Valid address-aware preview

- **WHEN** shipping facts are present
- **THEN** `shippingPayableMinor = shippingFeeMinor - shippingVoucherDiscountMinor` and `estimatedPayableMinor = merchandisePayableMinor + shippingPayableMinor`

#### Scenario: Client receives malformed preview data

- **WHEN** a personalized preview fails version, identity, integer, chronology, or reconciliation validation
- **THEN** the client rejects that preview and uses the validated effective product price

### Requirement: Every live buyer product-price surface uses the same display rule

Catalogue/search cards, homepage product modules, public-shop cards, product detail and related cards, favorites, recently viewed, cart, and checkout SHALL use the same server-provided price-selection rule. Authenticated collection filtering, price facets, representative selection, and explicit price sorting SHALL use the displayed best merchandise preview when available. Seller/admin editors and immutable order, return, and purchase-history snapshots MUST retain their own stored or committed price semantics.

#### Scenario: Authenticated buyer sorts by lowest price

- **WHEN** personalized voucher previews change the relative merchandise payable of two products and the buyer selects ascending price order
- **THEN** the lower displayed buyer price appears first

#### Scenario: Same product appears on several live surfaces

- **WHEN** equivalent buyer, product, address, voucher, and evaluation facts are used
- **THEN** every covered live surface displays the same merchandise price and equivalent voucher evidence

#### Scenario: Buyer views historical purchase data

- **WHEN** an authenticated buyer views an order, return, or completed purchase
- **THEN** the system displays committed snapshot amounts and does not replace them with current voucher previews

### Requirement: Collection preview enrichment is bounded and resilient

The system SHALL batch product, shop, voucher, scope, address, and buyer-usage reads for collection responses and SHALL use one UTC evaluation instant for every item in one response. It MUST NOT perform a PostgreSQL voucher query per card. Failure of optional voucher-preview enrichment SHALL preserve sellable results and their effective prices while cart and checkout remain independently authoritative.

#### Scenario: Collection contains many products

- **WHEN** a covered collection response contains multiple product cards
- **THEN** voucher discovery and buyer-usage loading use bounded batched operations rather than one query per product

#### Scenario: Voucher preview dependency fails

- **WHEN** the optional buyer-preview calculation cannot complete
- **THEN** the product response still displays validated effective prices, exposes no unverified voucher saving, and does not weaken checkout validation

### Requirement: Personalized previews remain private and non-reserving

Authenticated personalized product responses SHALL be private and non-cacheable across buyers, SHALL expose no internal usage counters or other buyers' data, and SHALL create no reservation, redemption, or usage increment. Guest responses MUST NOT be contaminated by an authenticated response cache.

#### Scenario: Buyer repeatedly previews a product

- **WHEN** an authenticated buyer requests the same preview multiple times
- **THEN** voucher usage and redemption records remain unchanged

#### Scenario: Another buyer requests the same product

- **WHEN** two buyers have different usage or address facts
- **THEN** neither buyer receives the other's voucher selection or shipping estimate

### Requirement: Cart and checkout recalculate the actual best combination

Product previews SHALL be informational. Cart and checkout SHALL recalculate from actual selected lines, quantities, address, service, voucher definitions, scopes, and usage. When no explicit voucher override is supplied, the quote SHALL automatically choose the best allowed shop vouchers, platform voucher, and address-eligible shipping voucher. Checkout SHALL revalidate and atomically consume only the combination valid inside the purchase transaction.

#### Scenario: Larger quantity unlocks a voucher

- **WHEN** the quantity-one product preview excludes a minimum-spend voucher but the actual cart qualifies
- **THEN** the cart quote may choose that voucher and display a lower actual payable

#### Scenario: Buyer has no address in cart

- **WHEN** the cart has merchandise but no usable delivery address
- **THEN** merchandise best-voucher calculation can proceed while no shipping voucher benefit is claimed

#### Scenario: Voucher state changes before checkout

- **WHEN** a previewed voucher expires, is disabled, or reaches a usage limit before purchase
- **THEN** checkout excludes it or fails according to existing transactional voucher rules and never trusts the stale preview

### Requirement: Sellers cannot purchase from their own shop

The system SHALL prohibit an authenticated user from adding, quoting, or checking out merchandise owned by that user's own shop. A covered buyer purchase action SHALL show a clear warning dialog and MUST NOT mutate the cart or create a purchase. Backend enforcement SHALL remain authoritative when a client bypasses the dialog.

#### Scenario: Seller attempts to add an own-shop product

- **WHEN** an authenticated seller selects Add to cart or Buy now for a product owned by that seller's shop
- **THEN** the action is rejected and a warning dialog explains that sellers cannot purchase from their own shop

#### Scenario: Own-shop line already exists in the cart

- **WHEN** ownership changes or a stale cart contains a selected line owned by the current user
- **THEN** pricing and checkout exclude or reject that line and no purchase is created for it
