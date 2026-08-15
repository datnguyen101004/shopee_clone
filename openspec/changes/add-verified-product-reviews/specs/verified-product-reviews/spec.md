## Purpose

Lets buyers publish trustworthy product feedback only after a delivered purchase while preserving strict ownership, privacy, concurrency, media, and moderation boundaries.

## ADDED Requirements

### Requirement: Buyer can review one eligible delivered order line

The system SHALL allow an authenticated buyer to create at most one review for an `OrderLine` when the line belongs to that buyer's purchase and its shop order is `DELIVERED`. A review SHALL contain an integer rating from 1 through 5, optional normalized text, and zero or more owner-bound review media references. Pending, cancelled, return/refund, unknown, and foreign lines MUST NOT be reviewable.

#### Scenario: Buyer reviews a delivered line

- **WHEN** the owner submits a valid review for a line in a delivered shop order
- **THEN** exactly one review is created and marked as a verified purchase

#### Scenario: Buyer submits a duplicate review

- **WHEN** the owner attempts to create a second review for the same order line
- **THEN** the system returns a stable duplicate conflict and leaves the original review and aggregates unchanged

#### Scenario: Foreign or ineligible line is addressed

- **WHEN** a buyer addresses an unknown, foreign, or non-delivered order line
- **THEN** the response exposes no order data and creates no review

### Requirement: Review create and edit operations are owner-scoped and concurrency-safe

The system SHALL expose authenticated create, author-detail, and update operations. Create MUST accept a canonical UUID idempotency key; update MUST require the current review ETag. Rating, text, and media inputs MUST reject unknown fields, control characters, unsupported ratings, overlong content, excess media, expired media, and media not owned by the caller. Editing MUST preserve review identity and verified-purchase linkage while incrementing the review version exactly once.

#### Scenario: Creation is replayed after response loss

- **WHEN** the author repeats an equivalent create request using the same successful idempotency key
- **THEN** the system returns the original canonical review without another review, media attachment, or aggregate contribution

#### Scenario: Idempotency key is reused with different content

- **WHEN** a successful key is reused with a different rating, text, or ordered media set
- **THEN** the system returns an idempotency conflict and preserves the original review

#### Scenario: Buyer edits using the current ETag

- **WHEN** the author submits a valid update using the current review version
- **THEN** the same review is updated once and the canonical response carries its new ETag

#### Scenario: Stale edit races a newer update

- **WHEN** an author submits an update against an obsolete review version
- **THEN** the system returns a stable conflict without changing review, media, or aggregates

#### Scenario: Another buyer attempts author access

- **WHEN** a different authenticated buyer requests or updates the review
- **THEN** the response is non-enumerating and no review content changes

### Requirement: Review media is staged, validated, and bound to its uploader

The system SHALL provide authenticated review-media staging that yields immutable media identifiers only after validating uploader ownership, supported image MIME type, byte size, dimensions, and item count. A review MAY reference only unexpired staged media belonging to its author. Public reads MUST expose only attached media through safe display URLs and metadata, never storage keys, staging state, credentials, or arbitrary submitted URLs.

#### Scenario: Buyer attaches valid staged images

- **WHEN** a buyer stages supported images and includes their ordered identifiers in a valid review
- **THEN** the media becomes attached atomically and appears in the review's public content

#### Scenario: Buyer supplies foreign or invalid media

- **WHEN** a request contains an arbitrary URL, expired identifier, invalid image, or media owned by another user
- **THEN** the request is rejected without attaching media or changing the review

#### Scenario: Expired staging is cleaned

- **WHEN** the explicit cleanup operation encounters media that remained staged beyond the retention window
- **THEN** it removes only those expired staged records/files and never removes attached review media

### Requirement: Review visibility is auditable

The system SHALL preserve `VISIBLE` and `HIDDEN` review states. New reviews and valid buyer edits SHALL be `VISIBLE` in T21. A hidden review MUST remain available to its author with an explained state, MUST be absent from public review reads and aggregates, and MUST retain append-only moderation events containing prior/new state, actor, reason, and UTC time.

#### Scenario: Visible review appears publicly

- **WHEN** a verified review is `VISIBLE`
- **THEN** public product review reads include it with a verified-purchase marker

#### Scenario: Hidden review is requested

- **WHEN** a review is `HIDDEN`
- **THEN** public callers cannot see it while its author can retrieve its content and hidden state

### Requirement: Buyer order detail exposes server-authoritative review capability

The authenticated order-detail response and screen SHALL identify each line as eligible for first review, already reviewed, or ineligible. The UI SHALL offer accessible create/edit controls only when declared by the server, preserve entered data across recoverable failures, and refresh canonical data after stale conflicts.

#### Scenario: Buyer opens a delivered order

- **WHEN** the owner opens an order detail containing delivered lines
- **THEN** each line displays its server-declared review state and only valid review actions

#### Scenario: Save fails recoverably

- **WHEN** a network, validation, or stale-version failure occurs while saving
- **THEN** the form retains valid local input and presents a clear retry or refresh action
