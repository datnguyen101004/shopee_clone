## Purpose

Defines one server-authoritative effective product price that remains consistent across PostgreSQL-backed buyer displays and all catalogue behavior that depends on price.

## ADDED Requirements

### Requirement: Server determines the displayed effective price
The system SHALL calculate scheduled product discounts on the server from the stored variant base price, the active PostgreSQL campaign, and a server-controlled evaluation instant. A client MUST NOT calculate, select, or submit the effective product price.

#### Scenario: Active scheduled campaign
- **WHEN** an enabled, non-archived campaign is active for a product and produces a valid positive discount for a sellable variant
- **THEN** the displayed price equals `basePriceMinor - floor(basePriceMinor * discountBasisPoints / 10000)`

#### Scenario: No applicable campaign
- **WHEN** a campaign is absent, disabled, archived, not started, expired, or produces no valid lower positive price
- **THEN** the displayed price equals the stored variant `priceMinor` and no active scheduled-price metadata is exposed

### Requirement: Existing product price contracts remain compatible
The system SHALL keep top-level `priceMinor` as the canonical displayed price. When `scheduledPrice` is present, `priceMinor` SHALL equal `scheduledPrice.effectivePriceMinor`, the effective price SHALL be lower than `scheduledPrice.basePriceMinor`, and no additional top-level effective-price field SHALL be required.

#### Scenario: Scheduled price response
- **WHEN** a buyer product response includes `scheduledPrice`
- **THEN** its price fields satisfy `priceMinor = effectivePriceMinor < basePriceMinor` and use safe integer minor units

#### Scenario: Existing consumer reads priceMinor
- **WHEN** an existing storefront consumer ignores the optional `scheduledPrice` breakdown
- **THEN** it still receives the correct currently payable product price through `priceMinor`

### Requirement: Comparison and discount metadata remain honest
The system SHALL expose `compareAtPriceMinor` only when it is greater than the displayed effective price and SHALL derive discount labels from server-authoritative pricing metadata. Existing variant comparison prices MUST NOT be reduced or replaced with a misleading lower value when a scheduled campaign is applied.

#### Scenario: Existing comparison price exceeds base price
- **WHEN** a variant has an existing valid `compareAtPriceMinor` above its base price and an active campaign lowers the effective price
- **THEN** the existing comparison price is retained and displayed above the effective price

#### Scenario: No valid comparison price exists
- **WHEN** an active campaign lowers a variant price but its stored comparison price is absent or below the base price
- **THEN** the base price becomes the comparison price for display

### Requirement: Price-dependent catalogue behavior uses the displayed price
The system SHALL use the same effective price shown to the buyer for representative-offer selection, minimum/maximum price filters, price-range facets, and explicit ascending or descending price ordering.

#### Scenario: Discount changes the representative variant
- **WHEN** an in-stock variant with a higher base price becomes the product's lowest-priced in-stock variant after an active campaign
- **THEN** that discounted variant supplies the product card's displayed price and scheduled-price metadata

#### Scenario: Price ascending with a campaign
- **WHEN** a buyer selects ascending price order and an active campaign lowers a product below another product
- **THEN** the discounted product is ordered using its effective displayed price

#### Scenario: Effective-price filter boundary
- **WHEN** a product's base price is outside an active price filter but its effective displayed price is inside the filter
- **THEN** the product is included and the price facet represents the effective price

### Requirement: PostgreSQL-backed buyer surfaces show a consistent price
Catalogue/search cards, homepage product cards, public-shop cards, and product-detail variants SHALL display the server-provided effective price under the same campaign conditions and SHALL fall back to their stored base price under the same non-campaign conditions.

#### Scenario: Same product appears on multiple surfaces
- **WHEN** the same product is requested from multiple PostgreSQL-backed buyer surfaces at the same evaluation instant
- **THEN** every surface exposes the same effective price, comparison price, and campaign discount metadata

#### Scenario: Client renders an active scheduled price
- **WHEN** a valid `scheduledPrice` breakdown is present
- **THEN** the client displays `scheduledPrice.effectivePriceMinor` without recomputing the campaign discount

### Requirement: Campaign evaluation is temporally deterministic per response
The system SHALL capture one UTC evaluation instant for each assembled response and SHALL use that instant for all scheduled-price resolutions within the response.

#### Scenario: Campaign boundary occurs during assembly
- **WHEN** a campaign start or end boundary passes while a multi-product response is being assembled
- **THEN** every item in that response is evaluated against the same captured instant

### Requirement: Effective price display does not depend on Elasticsearch
The system SHALL provide all behavior in this capability while Elasticsearch is disabled, unavailable, or has no product index, using PostgreSQL as the only campaign and base-price source.

#### Scenario: Elasticsearch is unavailable
- **WHEN** a buyer requests a covered product surface and Elasticsearch is disabled or unavailable
- **THEN** effective prices are still resolved from PostgreSQL and displayed without an Elasticsearch request
