## Purpose

Enable authenticated buyers to report product or shop policy violations while providing durable anti-abuse controls, idempotent receipts, and strict separation from private moderation data.

## ADDED Requirements

### Requirement: Buyers can report public products and shops
The system SHALL let an authenticated account with buyer permission report a public product or public shop by selecting one allowlisted reason code and supplying trimmed evidence details between 20 and 1000 characters. A report MAY contain at most three HTTPS evidence references, each no longer than 2048 characters; the platform MUST treat those references as opaque moderator-only data and MUST NOT fetch or render active remote content from them. The server MUST derive the reporter from the authenticated session, resolve the target from its canonical identifier, reject a seller reporting their own product or shop, and capture a bounded target name/slug snapshot for later review. Requests for a missing, deleted, or non-public target MUST return the same sanitized not-found response.

#### Scenario: Buyer reports a public product
- **WHEN** an authenticated buyer submits a valid reason, evidence details, and idempotency key for a public product
- **THEN** the system stores one report owned by that buyer, attaches it to the target's active moderation case, and returns a safe receipt without moderation-private data

#### Scenario: Seller reports an owned target
- **WHEN** a seller attempts to report their own shop or one of its products
- **THEN** the request is rejected without creating a report, case, rate-limit acceptance, or audit event

#### Scenario: Target is not public
- **WHEN** a buyer submits a report for a missing, deleted, hidden, archived, moderation-suspended, inactive, or suspended target
- **THEN** the API returns the canonical sanitized not-found Problem Details response and discloses no target lifecycle reason

### Requirement: Report inputs and receipts are idempotent and bounded
Report creation MUST require a canonical UUID `Idempotency-Key`. Repeating a key with the same normalized reporter, target, reason, details, and evidence references SHALL return the original receipt without creating another report or case event. Reusing the key with a different normalized request MUST return a stable 409 conflict. The API MUST reject unknown fields, unsupported reason codes, unsafe evidence schemes, malformed identifiers, and values outside documented bounds with 400 Problem Details and no persistence.

#### Scenario: Buyer retries the same report
- **WHEN** a buyer repeats an accepted report with the same idempotency key and normalized body
- **THEN** the original report id and submitted timestamp are returned and no duplicate report, case count, or rate-limit acceptance is recorded

#### Scenario: Buyer reuses a key for another target
- **WHEN** a buyer reuses an idempotency key with a different target or body
- **THEN** the API returns an idempotency conflict and leaves both the original receipt and moderation queue unchanged

### Requirement: Duplicate and spam reporting is rate-limited durably
The system MUST enforce database-backed limits consistently across API instances: no more than one unresolved report per reporter and target, no more than 20 report attempts per reporter in a rolling hour, and no more than 10 newly accepted reports per reporter in a rolling 24-hour window. A duplicate unresolved target report SHALL return the existing safe receipt without adding evidence or increasing the case report count. An exhausted attempt or acceptance limit MUST return 429 Problem Details with a bounded `Retry-After` value, MUST NOT reveal other reporters or queue state, and MUST NOT create a report. Successful idempotent retries MUST NOT consume another attempt or acceptance allowance.

#### Scenario: Buyer repeats a report for an unresolved target
- **WHEN** the same buyer reports the same target again with a new idempotency key while their first report is unresolved
- **THEN** the system returns the existing receipt and the moderation case still contains one report from that buyer

#### Scenario: Buyer exceeds the rolling limit
- **WHEN** a buyer whose durable attempt or acceptance budget is exhausted submits another report
- **THEN** the API returns 429 with `Retry-After`, stores no report, and behaves the same regardless of the target's moderation queue state

### Requirement: Reporters can read only their safe report history
An authenticated reporter SHALL be able to retrieve a newest-first cursor-paginated list and detail for only their own reports with bounded page size and private no-store caching. The projection SHALL include report id, target type, captured target label, reason code, submitted time, and coarse status `SUBMITTED` or `REVIEWED`. It MUST NOT include reporter identifiers, other reports, case ids, assignment, administrator identity, internal notes, evidence from other users, enforcement rationale, privileged-audit data, or whether another report caused the final action.

#### Scenario: Reporter reads a reviewed report
- **WHEN** a buyer reads their own report after its moderation case is resolved
- **THEN** the response marks it `REVIEWED` without exposing the decision, private notes, assignee, or other reporters

#### Scenario: Reporter reads another buyer's report id
- **WHEN** a buyer requests a report not owned by their authenticated account
- **THEN** the API returns the same sanitized not-found response used for an unknown report
