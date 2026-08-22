## Purpose

Allow buyers to create and track eligible post-delivery returns with validated private evidence while exposing only their own order and return information.

## ADDED Requirements

### Requirement: Buyers can stage validated return evidence

An authenticated buyer SHALL stage JPEG, PNG, or WebP evidence images through a multipart endpoint. Each file MUST decode as its declared type, be no larger than 5 MiB, use bounded dimensions, receive an opaque identifier, and expire after 24 hours while unattached. SVG, video, external URLs, malformed files, and executable content MUST be rejected. A return request MUST attach between one and five unexpired evidence assets owned by its buyer.

#### Scenario: Buyer stages valid images

- **WHEN** a buyer uploads valid images within the count, type, size, and dimension limits
- **THEN** the system returns owner-bound opaque evidence identifiers without exposing storage keys

#### Scenario: Buyer references another user's evidence

- **WHEN** a request includes a staged evidence identifier owned by another account
- **THEN** the system rejects the entire request without attaching or disclosing that asset

#### Scenario: Unattached evidence expires

- **WHEN** cleanup evaluates an unattached asset after its 24-hour expiry
- **THEN** both its metadata and stored object are safely removed without affecting attached evidence

### Requirement: Buyers can create one eligible return request

The API SHALL expose `POST /api/v1/account/orders/:orderReference/returns`. It MUST require the current order ETag, a UUID `Idempotency-Key`, one reason from `DAMAGED`, `WRONG_ITEM`, `MISSING_ITEM`, `NOT_AS_DESCRIBED`, or `OTHER`, a normalized description of 20 to 1,000 characters, valid line quantities, and one to five evidence identifiers. A successful response SHALL be private/no-store and return the canonical return detail and return ETag.

#### Scenario: Valid buyer request

- **WHEN** the order owner submits valid lines, description, evidence, current order ETag, and a new idempotency key
- **THEN** the API returns the created return detail with status `REQUESTED`, deadlines, amount preview, and version zero

#### Scenario: Stale order page submits

- **WHEN** the submitted order ETag does not match the locked order version
- **THEN** the API returns a conflict with the current version and creates no request

### Requirement: Buyers can list and read only their returns

The API SHALL expose newest-first owner-scoped `GET /api/v1/account/returns` and `GET /api/v1/account/returns/:returnReference`. The list MUST support bounded status filtering and filter-bound cursor pagination. Detail MUST include selected line snapshots, buyer-visible reasons, evidence identifiers and authorized media URLs, deadlines, mock shipment, refund outcome, and a chronological public timeline; it MUST exclude private admin notes and seller/admin-only metadata.

#### Scenario: Buyer pages their returns

- **WHEN** a buyer requests a valid status filter and cursor
- **THEN** only that buyer's stable return summaries are returned with a next cursor when more exist

#### Scenario: Buyer probes another return

- **WHEN** a buyer requests a return owned by someone else
- **THEN** the API responds exactly as it does for an unknown return reference

### Requirement: Buyers can cancel or submit the mock return shipment when allowed

The API SHALL expose `POST /api/v1/account/returns/:returnReference/actions` with return ETag and idempotency key. `CANCEL` SHALL be allowed only from `REQUESTED`. `SUBMIT_SHIPMENT` SHALL be allowed only from `AWAITING_RETURN` before its deadline and SHALL create one server-generated mock tracking code and immutable destination snapshot derived from the order's committed shop snapshot.

#### Scenario: Buyer cancels before seller response

- **WHEN** the owner submits `CANCEL` for the current `REQUESTED` version
- **THEN** the return becomes `CANCELLED` and the order returns to `DELIVERED`

#### Scenario: Buyer submits mock shipment

- **WHEN** the owner submits `SUBMIT_SHIPMENT` before the handoff deadline
- **THEN** one mock shipment is created, the state becomes `IN_TRANSIT`, and its tracking summary appears in buyer and seller detail

### Requirement: Buyer order history exposes server-declared return capability

Buyer order detail SHALL expose whether a return may be created, the return deadline when applicable, and the existing return reference when one exists. Order list/detail and timeline SHALL present `RETURN_REQUESTED`, `RETURNED`, and `REFUNDED` consistently without inferring eligibility solely from client-side status strings.

#### Scenario: Delivered order is eligible

- **WHEN** the buyer opens an eligible delivered order with no existing request
- **THEN** the UI presents the server-declared return action and deadline

#### Scenario: Existing return is present

- **WHEN** the buyer opens an order that already has a return request
- **THEN** the UI links to that return and does not offer a duplicate creation action

### Requirement: Buyer return UI is responsive and failure-aware

The buyer interface SHALL provide line and quantity selection, reason and description validation, evidence previews/removal, amount preview, confirmation, return detail, and timeline views at supported mobile, tablet, and desktop widths. It MUST handle loading, empty, expired-session, forbidden/not-found, stale-version, deadline, upload, duplicate-submit, and recoverable server failures without losing valid draft input.

#### Scenario: Duplicate submit is attempted

- **WHEN** a buyer activates the submit control repeatedly while a request is pending
- **THEN** one idempotent command is sent and the form remains disabled until an authoritative result or recoverable error returns
