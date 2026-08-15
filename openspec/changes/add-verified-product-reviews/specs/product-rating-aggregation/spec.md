## Purpose

Provides deterministic public review discovery and rating summaries derived only from visible verified reviews so product and shop trust signals stay accurate as feedback changes.

## ADDED Requirements

### Requirement: Public product reviews are cursor-paginated and filterable

The system SHALL expose public product reviews ordered deterministically by most recently updated review with an opaque stable cursor. It SHALL support an optional exact 1–5 rating filter and bounded page size. Each item SHALL contain rating, normalized text, safe ordered media, verified-purchase marker, non-sensitive author display information, and revision time.

#### Scenario: Shopper browses reviews

- **WHEN** a caller requests the first page for an active public product
- **THEN** only visible reviews are returned in deterministic order with a next cursor when more results exist

#### Scenario: Shopper filters by rating

- **WHEN** a caller requests a valid exact rating filter
- **THEN** every returned review has that rating and the cursor remains bound to product and filter

#### Scenario: Query or cursor is invalid

- **WHEN** a caller supplies an unsupported rating, limit, unknown field, malformed cursor, or cursor created for another product/filter
- **THEN** the system returns validation Problem Details without review data

### Requirement: Product and shop summaries derive from visible reviews

The system SHALL derive visible review count and average rating in integer basis points for products and shops. Create, edit, hide, and restore operations MUST update the affected product and shop projections atomically with the review write. Products and shops with no visible reviews MUST expose a consistent zero-review state and MUST NOT retain fabricated seed ratings.

#### Scenario: New visible review updates summaries

- **WHEN** a valid visible review is created
- **THEN** its product and shop summaries include the review exactly once

#### Scenario: Rating edit replaces the prior contribution

- **WHEN** an author changes a visible review's rating
- **THEN** product and shop summaries remove the prior rating and include the replacement atomically

#### Scenario: Review visibility changes

- **WHEN** a visible review is hidden or a hidden review is restored
- **THEN** public reads and both aggregate projections change together without deleting review history

#### Scenario: Aggregate write fails

- **WHEN** product or shop summary refresh cannot commit
- **THEN** the review/media mutation rolls back and no partial aggregate is exposed

### Requirement: Storefront presents authoritative review data

Catalog cards, product detail, and public shop storefront SHALL consume server-derived rating averages and review counts. Product detail SHALL provide review summary, exact-rating filters, safe media, pagination, and explicit loading, empty, and recoverable-error states.

#### Scenario: Shopper opens a reviewed product

- **WHEN** a shopper opens a product with visible reviews
- **THEN** the displayed summary matches the public review collection and reviews can be filtered/paginated

#### Scenario: Product has no visible reviews

- **WHEN** a shopper opens a product with zero visible reviews
- **THEN** the storefront shows an explicit no-review state rather than a fabricated score

### Requirement: Public review payloads protect buyer privacy

Public review responses MUST omit buyer email, phone, order/purchase references, address, private moderation data, media staging metadata, storage keys, and credentials. They SHALL return only privacy-safe author display information and attached public media, with bounded cache semantics for visibility changes.

#### Scenario: Anonymous caller inspects response

- **WHEN** an anonymous caller reads product reviews
- **THEN** the payload contains no private account, order, address, or storage fields
