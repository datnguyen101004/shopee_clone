## Purpose

Enable an approved seller to maintain complete, validated product listings in a private Seller Center while preserving exclusive ownership of that shop's catalogue.

## ADDED Requirements

### Requirement: Seller-owned product workspace
The system SHALL provide an authenticated seller with a paginated workspace of products owned by that seller's approved shop, including each listing's lifecycle state, primary media, category, variant count, stock summary, and update time. A seller MUST NOT read, create, edit, transition, or archive a product owned by another shop, and an account without an approved active seller shop MUST be denied seller product management operations.

#### Scenario: Seller reads own product list
- **WHEN** an approved seller requests their product workspace
- **THEN** the system returns only that seller's non-deleted products in stable pagination order with seller-management summaries

#### Scenario: Seller addresses another shop product
- **WHEN** a seller requests or mutates a product owned by a different shop
- **THEN** the system denies the request without exposing the other product's seller-management data

### Requirement: Draft product authoring
The system SHALL allow an approved seller to create and edit a draft containing a title, description, leaf category, controlled category attributes, ordered media, shipping weight and dimensions, and at least one variant. Product slugs MUST be normalized and unique within the shop. Category selection MUST reference an active leaf category, and submitted attribute keys and values MUST conform to that category's configured attribute definitions.

#### Scenario: Seller saves an incomplete listing as draft
- **WHEN** a seller submits a structurally valid listing that does not satisfy publication rules
- **THEN** the system saves it with the draft lifecycle state and returns the normalized seller product detail

#### Scenario: Seller submits invalid category attributes
- **WHEN** a seller supplies an unknown, missing-required, or invalid-value category attribute
- **THEN** the system rejects the request with field-specific validation errors and leaves the current listing unchanged

### Requirement: Media and variant authoring
The system SHALL accept listing media only when each URL is a safe supported HTTPS URL, ordering is unique and contiguous, and no duplicate media identity is submitted. The system SHALL derive variant combinations deterministically from one or two ordered option groups and their ordered unique values. Each resulting combination MUST occur once per product, and each variant MUST have a unique SKU, non-negative integer minor-unit price, optional compare-at price no lower than its selling price, non-negative stock, and positive shipping weight and dimensions.

#### Scenario: Seller generates combinations from option groups
- **WHEN** a seller provides two option groups with ordered values
- **THEN** the system presents exactly one stable combination for every cross-product of those values and preserves the matching variant details on subsequent edits

#### Scenario: Seller submits duplicate combination or SKU
- **WHEN** a seller submits duplicate option combinations or a SKU already used by a listing variant
- **THEN** the system rejects the invalid fields atomically and does not create a partial variant set

### Requirement: Seller product lifecycle
The system SHALL support seller transitions between draft, published, hidden, and archived listing states. A seller MAY update a draft, published, or hidden listing and MAY hide or archive it. An archived listing MUST remain readable in the owner's workspace but MUST NOT return to published state. Publishing MUST be rejected unless the listing has all required publication data, at least one valid active variant, at least one valid media item, and a currently eligible seller shop.

#### Scenario: Seller publishes a complete listing
- **WHEN** a seller requests publication for a complete valid listing from an eligible shop
- **THEN** the system marks the listing published and makes it eligible for buyer-facing availability checks

#### Scenario: Seller attempts to publish an incomplete listing
- **WHEN** a seller requests publication for a listing missing required content, media, or a valid variant
- **THEN** the system returns field-specific publication errors and preserves the prior lifecycle state

#### Scenario: Seller hides a published listing
- **WHEN** a seller hides a published listing
- **THEN** the system retains the listing and its seller data while removing it from buyer-facing availability

### Requirement: Seller Center product screens
The system SHALL provide Seller Center screens for a seller to browse product lifecycle states, start a listing, edit a listing, generate variants, manage listing media, save a draft, publish, hide, and archive. The screens MUST display API validation failures next to their affected inputs and MUST preserve unsaved inputs after a rejected submission.

#### Scenario: Seller corrects rejected publication
- **WHEN** the publish response identifies invalid listing fields
- **THEN** the editor retains the seller's entered data, shows the field errors, and permits resubmission after correction

