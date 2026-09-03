## Purpose

Provides a trustworthy public product-detail experience where buyers can inspect server-backed media and metadata, resolve a valid variant and quantity, understand availability, and enter later authentication and commerce flows safely.

## ADDED Requirements

### Requirement: Public product-detail API

The system SHALL expose anonymous product detail at `GET /api/v1/catalog/products/:productId`, SHALL accept exactly one canonical UUID product identifier, SHALL return `Cache-Control: no-store`, and SHALL validate successful payloads against the shared product-detail contract.

#### Scenario: Load a public product

- **WHEN** an anonymous client requests an existing public product with a canonical UUID
- **THEN** the API returns status `200` with the complete product-detail response and `Cache-Control: no-store`

#### Scenario: Reject a malformed identifier

- **WHEN** a client requests product detail with a non-UUID or non-canonical identifier
- **THEN** the API returns sanitized `400` Problem Details without querying by an unsafe identifier

#### Scenario: Hide a non-public product

- **WHEN** the identifier belongs to a missing, draft, archived, deleted, inactive-shop, or inactive-category product
- **THEN** the API returns the same sanitized `404` Problem Details without disclosing which eligibility rule failed

#### Scenario: Sanitize a data-source failure

- **WHEN** the product-detail data source fails
- **THEN** the API returns `503` Problem Details without connection strings, credentials, stack traces, or internal records

### Requirement: Server-backed detail and gallery

The successful response SHALL include product identity, name, description, category, ordered gallery media, rating average/count, sold count, and a deterministic primary image. Each gallery item SHALL provide a stable identifier, local or approved URL, meaningful fallback alt text, order, and optional variant association; a product without media SHALL remain representable with a safe fallback.

#### Scenario: Return an ordered gallery

- **WHEN** a public product has generic and variant-associated images
- **THEN** the API returns them by `sortOrder ASC, id ASC`, identifies the first item as primary, and preserves every valid variant association

#### Scenario: Resolve variant media

- **WHEN** the buyer selects a variant that has associated media
- **THEN** the page activates that variant's first ordered image while retaining access to the complete product gallery

#### Scenario: Fall back when variant media is absent

- **WHEN** the selected variant has no associated media or the product has no image
- **THEN** the page uses the product primary image or an accessible non-broken media fallback

### Requirement: Variant, price, discount, and stock authority

The response SHALL include each active, non-deleted flat variant combination with ID, name, SKU, integer-minor-unit price, optional valid comparison price/discount, available quantity derived as `quantityOnHand - quantityReserved`, availability, and preferred image ID. The server SHALL exclude inactive/deleted variants, SHALL clamp neither invalid money nor invalid stock into a purchasable value, and SHALL determine whether the product has any purchasable variant.

#### Scenario: Resolve a purchasable variant

- **WHEN** the buyer selects a returned variant with positive available quantity
- **THEN** the page shows that variant's exact SKU, price, valid discount, stock, and media and enables quantity selection within the available limit

#### Scenario: Select an unavailable variant

- **WHEN** the buyer selects a returned variant whose available quantity is zero
- **THEN** the page labels it unavailable, prevents purchase entry, and does not substitute another variant silently

#### Scenario: Ignore a non-public variant

- **WHEN** a variant is inactive or deleted
- **THEN** it is absent from the public response and cannot be selected through the page

#### Scenario: Omit invalid promotion metadata

- **WHEN** a comparison price is absent, unsafe, or not greater than the variant price
- **THEN** the variant remains usable at its valid price but exposes no comparison price or discount claim

#### Scenario: Show a product-wide unavailable state

- **WHEN** a public product has no active variant with positive available quantity
- **THEN** the API still returns its public details with `purchasable=false` and the page presents an unavailable state with all purchase entry points disabled

### Requirement: Deterministic initial selection and quantity

The page SHALL initially select the lowest-priced purchasable variant using price then ID order, SHALL fall back to the first returned variant when none is purchasable, and SHALL keep quantity as a whole number from `1` through the selected variant's current available quantity. Changing variant SHALL reset an invalid quantity to `1` and SHALL update all dependent presentation atomically.

#### Scenario: Initialize a product with stock

- **WHEN** a product has multiple purchasable variants
- **THEN** the lowest-price variant with ID tie-breaker is selected with quantity `1`

#### Scenario: Increase and decrease quantity

- **WHEN** the buyer changes quantity within the selected variant's limit
- **THEN** the control exposes the new whole-number quantity and keeps both purchase intents consistent with it

#### Scenario: Reject an invalid quantity

- **WHEN** the buyer enters zero, a fraction, a non-number, or a value above available stock
- **THEN** the page prevents purchase entry and exposes an accessible validation message without mutating inventory

#### Scenario: Change to a lower-stock variant

- **WHEN** the buyer changes from a variant whose selected quantity exceeds the new variant's stock
- **THEN** the page selects the new variant and resets quantity to `1`

### Requirement: Anonymous purchase handoff

For a purchasable selection, the page SHALL expose distinct add-to-cart and buy-now entry points. Because T10 has no authenticated session or persistent cart, both SHALL identify that sign-in is required and SHALL navigate only to the internal `/login` route with an allowlisted intent, product return path, selected variant ID, and quantity; the page SHALL never claim that an item, order, or reservation was created.

#### Scenario: Hand off add-to-cart intent

- **WHEN** an anonymous buyer activates add to cart for a valid selection
- **THEN** navigation reaches `/login` with `intent=add-to-cart` and the safe product, variant, and quantity context

#### Scenario: Hand off buy-now intent

- **WHEN** an anonymous buyer activates buy now for a valid selection
- **THEN** navigation reaches `/login` with `intent=buy-now` and the safe product, variant, and quantity context

#### Scenario: Block an unavailable purchase handoff

- **WHEN** the selected variant is unavailable or the quantity is invalid
- **THEN** both purchase entry points are disabled and no login/cart/checkout navigation is generated

#### Scenario: Reject arbitrary return destinations

- **WHEN** purchase-handoff context is constructed from product-detail state
- **THEN** only the current internal product path and documented intent/variant/quantity fields are serialized, with no external or unsupported destination preserved

### Requirement: Shop, shipping, rating, and related context

The response SHALL include an active shop summary with ID, slug, name, location, and active public product count; product rating/sales presentation facts; a non-binding shipping preview owned by the server; and at most six stable same-category related product cards that satisfy T08 display eligibility and exclude the current product. The shipping preview SHALL identify origin and explain that fee/time are confirmed later rather than inventing address-specific promises before T13/checkout.

#### Scenario: Present shop and marketplace facts

- **WHEN** product detail loads successfully
- **THEN** the page displays the server-backed shop identity/location, rating average/count, sold count, and active product count without claiming review or order-ledger authority

#### Scenario: Present anonymous shipping context

- **WHEN** no buyer address exists in T10
- **THEN** the page identifies the shop origin and states that destination-specific fee and delivery time will be confirmed later

#### Scenario: Return related products

- **WHEN** other displayable products exist in the same category
- **THEN** the API returns no more than six ordered by `createdAt DESC, id ASC`, excludes the current ID, and gives each a non-broken product-detail link

#### Scenario: No related products exist

- **WHEN** no other eligible same-category product exists
- **THEN** the page omits or honestly empties the related section without hardcoded product claims

### Requirement: Product-detail route states and accessibility

`/products/[productId]` SHALL render product detail inside the shared storefront shell with explicit loading, not-found, unavailable, and recoverable service-error compositions. Gallery, variant, quantity, and purchase controls SHALL be keyboard operable, programmatically named, visibly focused, at least 44 by 44 CSS pixels where interactive, announced when selection changes, and responsive without horizontal page overflow at 360×800, 768×1024, and 1440×900.

#### Scenario: Render the complete detail page

- **WHEN** a browser opens a public product URL
- **THEN** server-backed content appears within one main landmark and the interactive selection state matches the API's deterministic initial variant

#### Scenario: Render not found

- **WHEN** the API reports a missing or non-public product
- **THEN** the route uses the framework not-found behavior inside the storefront experience and offers a safe path back to discovery

#### Scenario: Render a recoverable failure

- **WHEN** the adapter times out, transport fails, returns a non-404 status, or receives a malformed contract
- **THEN** the shared shell remains usable and the page provides a retry link to the same allowlisted product URL

#### Scenario: Operate controls with a keyboard

- **WHEN** a keyboard user traverses gallery, variant, quantity, and purchase controls
- **THEN** focus follows visual order, selected/current states are exposed, and unavailable controls cannot be activated

#### Scenario: Verify responsive accessibility

- **WHEN** the route is tested at each reference viewport
- **THEN** it has no horizontal document overflow and no serious or critical automated accessibility violation
