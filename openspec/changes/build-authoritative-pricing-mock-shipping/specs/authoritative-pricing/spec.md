## Purpose

Defines a single authenticated, server-authoritative quote for merchandise, discounts, shipping, and payable totals that cart and future checkout consumers can share without trusting browser money.

## ADDED Requirements

### Requirement: Quote only the authenticated buyer's current cart

The system SHALL expose `POST /api/v1/cart/quote` only to an authenticated buyer. The request SHALL identify only a buyer-owned shipping address and optional shipping service codes per selected shop; it SHALL NOT accept a user ID, cart ID, quantity, unit price, discount, fee, or total. The response SHALL be private, non-cacheable, and SHALL contain the cart version used for calculation.

#### Scenario: Quote a signed-in buyer's cart

- **WHEN** an authenticated buyer requests a quote with an active address that belongs to that buyer
- **THEN** the system derives the cart and owner from the session and returns a private quote for that cart only

#### Scenario: Reject anonymous quote access

- **WHEN** a caller without a valid session requests a quote after passing the shared browser mutation boundary
- **THEN** the API returns sanitized `401` Problem Details and performs no pricing calculation

#### Scenario: Hide address ownership

- **WHEN** the buyer submits an absent, deleted, or other user's address identifier
- **THEN** the API returns the same sanitized not-found response without revealing whether that address exists

#### Scenario: Reject browser-supplied money

- **WHEN** a request contains an undocumented unit price, discount, shipping fee, subtotal, or total field
- **THEN** strict boundary validation rejects the request and no supplied money influences a quote

### Requirement: Rebuild every quote from authoritative commerce facts

The system SHALL reload selected cart lines and their current shop, category, product, variant, inventory, purchase-limit, price, compare-at price, and weight facts from persistence. It SHALL include only currently eligible selected quantities and SHALL never calculate from a previous cart response or client projection.

#### Scenario: Price changes before quoting

- **WHEN** a selected variant's persisted price changes after it was added to the cart
- **THEN** the quote uses the current persisted price and itemizes the current catalog markdown independently of the stale cart snapshot

#### Scenario: A selected line becomes invalid

- **WHEN** a selected line becomes unavailable or has insufficient stock for its stored quantity
- **THEN** the quote excludes that line from all payable amounts and reports its exclusion in a non-monetary issue list

#### Scenario: Empty effective selection

- **WHEN** no selected cart line is currently eligible
- **THEN** the system returns a valid zero quote with no shop shipments, discounts, fees, or payable amount

### Requirement: Calculate VND with checked integer arithmetic

Every monetary field SHALL use non-negative integer minor units with currency `VND`, where one minor unit equals one Vietnamese đồng. Multiplication, addition, subtraction, and aggregation SHALL remain within JavaScript safe-integer bounds, SHALL use no binary floating-point rates, and SHALL fail closed when an input or result is invalid or unsafe.

#### Scenario: Calculate an exact integral amount

- **WHEN** positive integral prices and quantities produce totals within safe-integer bounds
- **THEN** every returned amount is an exact integer VND value with no fractional rounding

#### Scenario: Detect arithmetic overflow

- **WHEN** any line or aggregate operation would exceed safe-integer bounds or produce a negative amount
- **THEN** the API returns sanitized unavailable Problem Details and exposes no partial or wrapped total

### Requirement: Itemize catalog discounts and payable totals

For each included line, the system SHALL define list unit price as the greater of current compare-at price and current selling price, product discount as `(list unit price - selling unit price) × quantity`, and merchandise payable as `selling unit price × quantity`. It SHALL return line, shop, and quote-level list subtotals, product-discount totals, merchandise subtotals, shipping fees, and final payable totals whose documented sums reconcile exactly.

#### Scenario: Quote a discounted variant

- **WHEN** a current compare-at price is greater than the current selling price
- **THEN** the quote itemizes the difference as a non-negative product discount and uses the selling price for merchandise payable

#### Scenario: Ignore an invalid compare-at markdown

- **WHEN** compare-at price is absent or is not greater than the current selling price
- **THEN** list unit price equals selling unit price and product discount equals zero

#### Scenario: Reconcile all levels

- **WHEN** a quote contains multiple lines and shops
- **THEN** every shop total equals its line amounts plus its shipping fee and the final payable amount equals all shop payable totals exactly

### Requirement: Protect quote consistency with the cart version

The quote request SHALL require the current cart ETag through `If-Match`. The system SHALL compare it with the persisted cart version before calculation and SHALL return `409` conflict for a stale or malformed precondition so a buyer cannot proceed with a quote for a different selection state.

#### Scenario: Quote the current cart version

- **WHEN** the request presents the cart's current ETag
- **THEN** the quote is calculated from that exact persisted version and returns the same version in its response

#### Scenario: Reject a stale cart version

- **WHEN** another cart mutation commits before a quote using an older ETag
- **THEN** the API returns conflict Problem Details and the client reloads the cart before requesting another quote

### Requirement: Reuse one calculation contract for cart and checkout

The system SHALL expose one versioned pricing calculation contract whose deterministic inputs and outputs are consumed by the cart quote adapter and SHALL be reused by future checkout. A quote response SHALL be informational rather than a trusted price token; any later checkout SHALL reload authoritative facts and run the same calculation contract again.

#### Scenario: Compare identical consumers

- **WHEN** cart and checkout adapters provide identical authoritative facts, destination, services, and calculation version
- **THEN** they receive structurally and monetarily identical quote results

#### Scenario: Facts change after displaying a quote

- **WHEN** a price, stock, address, or shipping input changes after the buyer sees a quote
- **THEN** no later consumer trusts the displayed total and a new calculation reflects the changed facts

### Requirement: Present server-confirmed pricing in the cart

The authenticated cart screen SHALL select the buyer's default active address when available, allow another owned address to be selected, request a quote for the current cart version, and render line/shop/overall list prices, product discounts, shipping, and final payable amount only from a validated server response. Pending, empty, missing-address, stale, and recoverable-error states SHALL remain accessible and responsive at supported widths.

#### Scenario: Open a quotable cart

- **WHEN** an authenticated buyer opens a populated cart with a default address
- **THEN** the screen requests a standard-service quote and renders its itemized server-confirmed totals

#### Scenario: No shipping address exists

- **WHEN** an authenticated buyer has selected items but no active address
- **THEN** the screen explains that an address is required and links to account address management without inventing shipping or final totals

#### Scenario: Quote request fails

- **WHEN** quote loading fails or returns a cart-version conflict
- **THEN** the screen retains the last confirmed cart, labels stale totals as unavailable, and offers reload or retry without client-side money reconstruction

#### Scenario: Use pricing controls accessibly

- **WHEN** the buyer uses keyboard input or a 360, 768, or 1440 pixel viewport
- **THEN** address, service, retry, and summary controls retain logical focus, accessible labels, visible status, practical touch targets, and no document overflow
