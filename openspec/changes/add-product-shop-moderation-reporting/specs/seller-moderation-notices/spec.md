## Purpose

Notify affected sellers of product and shop enforcement through a durable owner-only notice surface that communicates actionable safe reasons without leaking trust-and-safety data.

## ADDED Requirements

### Requirement: Effective enforcement creates one durable seller notice
Every effective product or shop suspension and restoration decision SHALL create exactly one durable notice for the target shop owner in the same transaction as the decision and target mutation. The notice SHALL identify the affected resource using a bounded snapshot, state the public action category and seller-safe reason, record the effective UTC time, and start unread. `NO_ACTION`, failed commands, unauthorized commands, stale conflicts, and idempotent no-op retries MUST NOT create seller notices. A later ownership change MUST NOT transfer an existing notice to another account.

#### Scenario: Reported product is suspended
- **WHEN** a moderation decision suspends a product
- **THEN** its shop owner receives one unread product notice atomically with the suspension

#### Scenario: Same decision is retried
- **WHEN** the admin retries a committed decision with the same idempotency key and body
- **THEN** the original result is returned and the seller still has exactly one notice for that decision

### Requirement: Seller notice projections are privacy-safe
Seller notice APIs and UI MUST expose only notice id, target type, target id when still owner-readable, captured target label, action `SUSPENDED` or `RESTORED`, seller-safe reason, effective time, and read time. They MUST NOT expose reporter identity/count, raw report evidence, evidence references, moderation case id, assignment, private notes, admin identity, privileged-audit summaries, or another seller's notices. When a target is deleted or no longer owned, the captured label SHALL remain but the response MUST omit a navigable target id.

#### Scenario: Seller reads a suspension notice
- **WHEN** the affected seller opens a product suspension notice
- **THEN** the UI explains the safe reason and effective state without revealing who reported or reviewed it

#### Scenario: Seller requests another shop's notice
- **WHEN** a seller requests a notice not owned by their authenticated account
- **THEN** the API returns the same sanitized not-found response used for an unknown notice

### Requirement: Sellers can page and acknowledge notices
An authenticated seller SHALL retrieve their notices newest first through bounded cursor pagination with optional unread-only filtering and private no-store caching. The seller SHALL mark one owned notice read through a trusted-origin, idempotent mutation. Reading or acknowledging a notice MUST NOT change the moderated resource, case, decision, or audit history. General email, push, and cross-domain notification preferences SHALL NOT be introduced by this capability.

#### Scenario: Seller marks an unread notice read
- **WHEN** the owning seller acknowledges an unread notice
- **THEN** the server records the first read UTC time and repeated acknowledgements return the same state

#### Scenario: Seller filters unread notices
- **WHEN** a seller requests only unread notices with a valid cursor
- **THEN** only their unread safe projections are returned in stable order
