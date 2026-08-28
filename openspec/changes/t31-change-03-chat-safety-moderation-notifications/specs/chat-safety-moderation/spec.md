## Purpose

Provide durable abuse prevention and an auditable, privacy-bounded workflow for reporting and moderating harmful chat behavior without exposing unrelated private conversation data.

## ADDED Requirements

### Requirement: Participants can report a conversation or anchored message idempotently
An authenticated conversation participant SHALL be able to report the conversation or one message within it using a bounded reason code and optional bounded details, with details required for `OTHER`. Submission MUST require an idempotency key, MUST derive the reported account and target context server-side, and MUST return the original receipt for an exact replay.

#### Scenario: Participant reports a message
- **WHEN** a participant submits an authorized message report with a valid reason and idempotency key
- **THEN** one report receipt is returned, the message is retained as the evidence anchor, and the report is attached to one active chat moderation case

#### Scenario: Participant reports a conversation
- **WHEN** a participant submits a conversation report without a message target
- **THEN** one conversation-scoped report is recorded with no unrelated conversation content copied into the receipt

#### Scenario: Other reason has no details
- **WHEN** a report uses reason `OTHER` without the required bounded description
- **THEN** validation fails with field-safe feedback and creates no report, case event, notification, or rate-limit acceptance

#### Scenario: Exact report replay
- **WHEN** the same reporter reuses an idempotency key with the same normalized report request
- **THEN** the original receipt is returned and no second report, case count, or moderation event is created

#### Scenario: Duplicate target with a new request key
- **WHEN** the same reporter submits the same conversation or anchored message again with a different idempotency key
- **THEN** the original target receipt is returned and no additional rate-limit event, report, or case-count increment is created

#### Scenario: Conflicting report replay
- **WHEN** the same reporter reuses an idempotency key with different target, reason, or details
- **THEN** the request fails with a conflict and the original report remains unchanged

#### Scenario: Non-participant reports private chat data
- **WHEN** an account attempts to report a conversation or message it cannot access
- **THEN** the request is denied without revealing whether that private target exists

### Requirement: Chat send and report limits are shared and race safe
Chat send and report abuse limits SHALL be enforced from shared durable state across tabs, processes, and devices. Concurrent attempts for the same account or protected source MUST observe one bounded allowance, rejected responses MUST provide retry timing, exact idempotent replays MUST NOT consume an additional accepted allowance, and raw source addresses MUST NOT be exposed in stored diagnostics or responses.

#### Scenario: Concurrent sends cross the allowance boundary
- **WHEN** multiple API processes receive concurrent new sends for the same account at the configured limit
- **THEN** shared serialization accepts only the remaining allowance and returns rate-limited responses with bounded retry timing for the rest

#### Scenario: User changes tab or API process
- **WHEN** a rate-limited account retries from another tab or reaches another API instance before expiry
- **THEN** the same limit remains effective and the retry cannot bypass it

#### Scenario: Exact accepted send is replayed
- **WHEN** a previously accepted client message identifier and request digest are replayed
- **THEN** the original message is returned without incrementing the shared accepted-attempt count

#### Scenario: Expired rate data is cleaned
- **WHEN** enforcement records are older than every configured window
- **THEN** they can be removed without changing any still-active allowance or moderation evidence

### Requirement: Chat reports are grouped into an administrable queue
Reports against the same active conversation and reported account SHALL converge into one active chat moderation case while preserving each immutable report receipt. Admins SHALL list cases with bounded cursor pagination and filters for status, reason, target kind, assignee, and exact identifiers.

#### Scenario: Multiple reports converge on one active case
- **WHEN** eligible reports target the same conversation and reported account while a case is open or in review
- **THEN** the case count and last activity advance while each report remains separately attributable through an opaque reporter projection

#### Scenario: Admin filters the chat queue
- **WHEN** an authorized admin filters by chat target kind, status, reason, or assignment
- **THEN** only matching bounded case summaries are returned in stable newest-activity order

#### Scenario: Non-admin requests the chat queue
- **WHEN** an authenticated non-admin requests chat moderation data
- **THEN** access is denied before any report content, participant data, or case existence is disclosed

### Requirement: Admin evidence is bounded and privacy preserving
Chat moderation detail SHALL expose the reported message when applicable, a bounded context window, safe participant identifiers, grouped report reasons/details, decisions, and case events required for adjudication. It MUST omit unrelated conversations, credentials, session or presence metadata, full-history export, reporter identity, and content outside the authorized evidence window.

#### Scenario: Admin opens a message report
- **WHEN** an authorized admin opens a message-targeted case
- **THEN** the reported message is highlighted with a bounded before/after context and reporters are represented by case-local opaque identifiers

#### Scenario: Evidence anchor is unavailable
- **WHEN** a referenced message is no longer available for projection
- **THEN** the case retains the report and displays a neutral unavailable-evidence marker without leaking removed content

### Requirement: Admin decisions follow a versioned reversible chat state machine
An authorized admin SHALL be able to record `NO_ACTION`, `WARN_USER`, `RESTRICT_CHAT_TEMPORARY`, `RESTRICT_CHAT_INDEFINITE`, and `RESTORE_CHAT` outcomes allowed by the current case and restriction state. Effective decisions MUST require an idempotency key, expected case version, bounded public reason, and private note where required; stale, invalid, failed, and conflicting replays MUST have no partial effect.

#### Scenario: Admin warns a reported user
- **WHEN** an assigned or otherwise authorized admin submits a valid warning decision
- **THEN** the case decision and timeline update atomically, the account remains able to chat, and the affected user receives only the approved public warning

#### Scenario: Admin applies a temporary restriction
- **WHEN** an admin confirms a valid future expiry and required private note
- **THEN** the account loses send eligibility across all conversations until expiry and the case decision, restriction, event, user notice, and audit record commit together

#### Scenario: Admin applies an indefinite restriction
- **WHEN** an authorized admin confirms an indefinite chat restriction
- **THEN** send eligibility remains disabled until an explicit restore decision and no private note is disclosed to marketplace users

#### Scenario: Two admins decide concurrently
- **WHEN** two admins submit decisions against the same expected case version
- **THEN** at most one effective transition commits and the stale request receives the latest safe case state without a duplicate restriction, notice, or audit event

#### Scenario: Exact decision replay
- **WHEN** the same admin replays an identical idempotent decision command
- **THEN** the original result is returned without duplicating the decision, case event, notice, restriction mutation, or audit event

### Requirement: Chat restrictions are enforced before message acceptance
An active account-wide chat restriction SHALL prevent new message acceptance in every conversation while retaining authorized history and drafts. Temporary restrictions SHALL expire according to authoritative UTC time, and restriction details exposed to non-admin users MUST contain only the public state and optional public expiry.

#### Scenario: Restricted account attempts to send
- **WHEN** a restricted account submits a new message
- **THEN** the send is rejected before message creation, unread increments, notification aggregation, or realtime delivery, and the draft remains recoverable by the client

#### Scenario: Temporary restriction expires
- **WHEN** authoritative time passes a temporary restriction expiry and no other block applies
- **THEN** the account can send again after state refresh without an admin restore command or automatic replay of an old draft

### Requirement: Case history is append only and safe to present
Assignment, notes, attached reports, decisions, reversals, and version changes SHALL be represented in an append-only case timeline. Private notes MUST remain admin-only, and marketplace users MUST NOT learn reporter or admin identity from chat eligibility or notification responses.

#### Scenario: Admin reviews completed history
- **WHEN** an authorized admin opens a resolved chat case
- **THEN** the timeline shows ordered actions, actors, timestamps, safe before/after states, and private notes according to admin permissions

#### Scenario: Marketplace participant observes a restriction
- **WHEN** a participant opens a conversation affected by another account's moderation state
- **THEN** the participant receives a generic unavailable composer state without case, reporter, admin, or private-reason details
