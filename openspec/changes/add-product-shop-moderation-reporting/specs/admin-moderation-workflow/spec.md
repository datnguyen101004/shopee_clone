## Purpose

Give administrators a durable moderation queue that connects buyer reports to coordinated review, reversible target enforcement, private evidence, and transactionally consistent decisions.

## ADDED Requirements

### Requirement: Reports form one active case per target
Every accepted product or shop report SHALL attach to the target's single non-terminal moderation case, creating that case atomically when none exists. A case SHALL preserve target type/id and a bounded target snapshot, report count, reason summary, first/last report times, status `OPEN`, `IN_REVIEW`, or `RESOLVED`, nullable assigned admin, current outcome, and an integer version. Concurrent first reports for the same target MUST converge on one active case without losing either accepted report. A later report after resolution SHALL create a new active case rather than rewrite the resolved case.

#### Scenario: Two buyers concurrently report one product
- **WHEN** two valid first reports for the same product commit concurrently
- **THEN** both reports attach to one active product case whose report count is two

#### Scenario: A resolved target is reported again
- **WHEN** a valid new report arrives after the target's prior case was resolved
- **THEN** a new open case is created and the prior case and decision history remain immutable

### Requirement: Admins can page and inspect the private moderation queue
An authenticated admin SHALL be able to read a newest-activity-first cursor-paginated queue with bounded page size and filters for status, target type, exact canonical target ID, reason code, and assignment state. Each queue summary SHALL display its target ID. Case detail SHALL expose the target snapshot/current state, individual report evidence, opaque reporter ids, assignment, append-only case events, private notes, and decision history. Queue and detail responses MUST use private no-store caching and MUST omit reporter email, phone, addresses, order data, credentials, session data, and unrelated buyer activity. Buyers and sellers MUST receive 403 without any queue payload.

#### Scenario: Admin filters unassigned product cases
- **WHEN** an admin requests open product cases with assignment state `UNASSIGNED`
- **THEN** the API returns only matching safe summaries in stable cursor order

#### Scenario: Admin searches by exact target ID
- **WHEN** an admin supplies a canonical product or shop target ID
- **THEN** the API returns only cases for that target in stable cursor order

#### Scenario: Seller requests a case detail
- **WHEN** a seller calls an admin moderation endpoint
- **THEN** the request is forbidden and no report evidence, reporter id, note, or case existence is disclosed

### Requirement: Assignment and notes coordinate review without granting authority
An admin SHALL be able to assign a case to an active admin, unassign it, and append a private note using the expected case version and a required idempotency key. The first assignment or note SHALL move an `OPEN` case to `IN_REVIEW`; assignment MUST remain a coordination placeholder and MUST NOT prevent another currently authorized admin from deciding the case. Every accepted assignment, unassignment, and note SHALL append a case event with actor, UTC time, and resulting version. Stale versions MUST return 409 with the current safe case summary; retries MUST NOT duplicate events.

#### Scenario: Admin claims an open case
- **WHEN** an admin assigns an open case to themselves with the current version
- **THEN** the case becomes in review, its version advances once, and one assignment event is appended

#### Scenario: Two admins edit one case version
- **WHEN** one admin's assignment commits before another admin submits a note using the old version
- **THEN** the stale note returns 409 and no note or partial event is stored

### Requirement: Case decisions are explicit, atomic, and reversible
An admin SHALL resolve a product or shop case with exactly one outcome: `NO_ACTION`, `SUSPEND_TARGET`, or `RESTORE_TARGET`, a public seller-safe reason between 8 and 240 characters, an optional private note up to 2000 characters, the expected case version, and a required idempotency key. `SUSPEND_TARGET` MUST set a product's moderation state or a shop's operational state to suspended; `RESTORE_TARGET` MUST restore only a non-deleted product or an approved shop and MUST NOT change seller-authored product lifecycle or shop onboarding state. A valid reversal SHALL reference the latest effective enforcement decision, append a new decision, and restore the target according to current policy rather than deleting history. Target mutation, decision, case resolution/version, seller notice, case event, and privileged audit MUST commit in one transaction. Unauthorized, stale, invalid, failed, and idempotent no-op commands MUST create none of those writes.

#### Scenario: Admin suspends a reported product
- **WHEN** an admin resolves an active product case with `SUSPEND_TARGET` and current versions
- **THEN** the product becomes moderation-suspended and the decision, case event, seller notice, and one correlated privileged audit event commit atomically

#### Scenario: Admin resolves with no action
- **WHEN** an admin chooses `NO_ACTION` with a valid reason
- **THEN** the target state remains unchanged while the resolved case receives one immutable decision and one case-targeted privileged audit event

#### Scenario: Admin reverses a prior suspension
- **WHEN** an admin submits `RESTORE_TARGET` referencing the latest effective suspension and current target policy permits restore
- **THEN** a new reversal decision restores target availability, retains every prior record, and produces a new notice and audit event

#### Scenario: Shop is no longer eligible for restore
- **WHEN** an admin attempts to restore a shop whose onboarding state is not approved
- **THEN** the command returns a stable conflict and stores no target, case, notice, decision, or audit change

### Requirement: Enforcement uses existing public and purchaseability states
A moderation-suspended product and every product owned by a moderation-suspended shop MUST be absent from public catalog, search, homepage, shop storefront, and product detail reads and MUST be rejected from new cart additions, authoritative quote, and checkout. Existing cart rows and immutable order/review history MAY remain but MUST NOT make the target purchasable or expose private moderation data. Restoring the moderation state SHALL make a target eligible only if every existing product lifecycle, category, variant, stock, shop onboarding, and shop operational predicate also passes.

#### Scenario: Product is suspended after appearing in a cart
- **WHEN** quote or checkout revalidates a cart containing a newly moderation-suspended product
- **THEN** the line is rejected or removed using the existing unavailable-item contract and no order is created for it

#### Scenario: Product is restored while seller lifecycle is hidden
- **WHEN** an admin restores moderation state for a seller-hidden product
- **THEN** the product remains non-public and non-purchasable until the seller independently publishes it

### Requirement: Admins can hide and restore verified reviews
An authenticated admin SHALL be able to set a verified review to `HIDDEN` or restore it to `VISIBLE` using a reason between 8 and 240 characters, expected review version, and idempotency key. Each effective action MUST update visibility/version, append the existing review-moderation event, refresh product and shop rating aggregates from visible reviews, and append one correlated privileged audit event in the same transaction. A hidden review MUST remain visible to its author with a safe hidden state but MUST disappear from public reads and aggregates. No-op retries MUST be idempotent and stale versions MUST fail without partial aggregate changes.

#### Scenario: Admin hides a visible review
- **WHEN** an admin hides a visible review using its current version
- **THEN** public review reads and aggregates exclude it while its author can still read it and both moderation and privileged audit histories record the action

#### Scenario: Admin restores a hidden review
- **WHEN** an admin restores a hidden review using its current version
- **THEN** it becomes public again, aggregates are recomputed atomically, and prior hide history remains intact
