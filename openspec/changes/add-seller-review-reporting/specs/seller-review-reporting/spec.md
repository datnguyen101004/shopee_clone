## ADDED Requirements

### Requirement: Sellers may report only reviews belonging to their shop

An authenticated seller SHALL list and submit a bounded report for a review only when the review belongs to a product in a shop currently owned by that seller. The report SHALL require a review-specific allowlisted reason, optional bounded details, and a UUID idempotency key. The seller MUST NOT hide, edit, or learn the existence of a review outside that scope. Missing, deleted, foreign, or otherwise inaccessible review IDs SHALL return the same sanitized not-found response.

#### Scenario: Seller reports a review of their product

- **WHEN** a seller submits a valid report for a review belonging to their shop
- **THEN** the system stores or replays one seller-safe receipt and the review remains publicly unchanged pending admin moderation

#### Scenario: Seller reports another shop's review

- **WHEN** a seller submits a review ID belonging to another shop
- **THEN** the system returns a sanitized not-found response and writes no report

### Requirement: Seller review reports are private and idempotent

The system SHALL allow at most one unresolved report per seller-review pair. Exact idempotency retries SHALL return the original receipt; mismatched reuse SHALL return 409. Seller list/receipt APIs MUST use private no-store caching and MUST omit buyer contact data, other sellers' reports, admin identity, decision notes, and audit data.

#### Scenario: Seller retries a submitted report

- **WHEN** a seller repeats the same report with the same idempotency key
- **THEN** the original receipt is returned without creating another report
