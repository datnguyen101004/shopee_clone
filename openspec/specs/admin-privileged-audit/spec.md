# admin-privileged-audit Specification

## Purpose
Record every privileged admin mutation in an append-only audit trail that operators can page through without exposing secrets or allowing edits to history.
## Requirements
### Requirement: Privileged mutations append an audit event
Every successful admin mutation in T27 (user/shop status, category writes, banner writes, homepage-module settings, and reuse of shop approval) MUST append exactly one privileged-audit event in the same transaction as the state change. The event MUST record actor user id, target type, target id, action, reason, a bounded before/after summary, and a UTC timestamp. Failed, unauthorized, and no-op idempotent commands MUST NOT append an event. Role grant/revoke MUST continue to write `RoleAuditEvent` records and MAY also write a privileged-audit event only if the implementation chooses a single-writer mapping that does not double-count in the UI; the default SHALL keep role-audit separate and list both streams.

#### Scenario: Shop suspend is audited
- **WHEN** an admin successfully suspends a shop
- **THEN** one audit event exists with actor, shop target, action `SUSPEND`, reason, and before/after status

#### Scenario: Denied mutation is not audited
- **WHEN** a seller calls an admin mutation
- **THEN** no privileged-audit row is inserted

### Requirement: Audit history is append-only
The system MUST NOT expose update or delete APIs for privileged-audit events. Application and migration paths MUST NOT rewrite historical events. Before/after summaries MUST omit password hashes, session tokens, cookies, and environment secrets.

#### Scenario: Audit update is impossible
- **WHEN** any client attempts to patch or delete an audit event
- **THEN** no such route exists and stored events remain unchanged

### Requirement: Admins can list privileged audit events
An admin SHALL retrieve a newest-first cursor-paginated audit page with optional filters for target type, target id, actor id, and action. Page size MUST be bounded. Projections MUST include actor id, target type/id, action, reason, summaries, and timestamp, and MUST NOT join password or session tables.

#### Scenario: Admin pages recent events
- **WHEN** an admin requests the first audit page
- **THEN** events are newest first and a cursor is returned when more exist

#### Scenario: Filter by shop target
- **WHEN** an admin filters by a shop target id
- **THEN** only events for that shop are returned

### Requirement: Effective return decisions append privileged audit

Every effective admin return decision MUST append exactly one privileged-audit event in the same transaction as the immutable decision, return event, order transition, and any refund-ledger entry. The event SHALL record the admin actor, `RETURN_REQUEST` target and reference, decision action, bounded public reason, safe before/after state and amount summaries, decision correlation identifier, and UTC timestamp. Failed, unauthorized, stale, and equivalent idempotent replay attempts MUST NOT append another audit event.

#### Scenario: Admin refund approval is audited

- **WHEN** an admin successfully approves an escalated refund
- **THEN** exactly one correlated audit event records the before/after states and server-calculated amount without evidence storage keys or internal notes

#### Scenario: Equivalent decision is replayed

- **WHEN** the same committed decision is retried with its original idempotency key and canonical request
- **THEN** the original result is returned and the privileged-audit stream remains unchanged

### Requirement: Return audit history remains safe to search

The privileged audit list SHALL support filtering return-decision events by `RETURN_REQUEST` target, target id, actor, and action using the existing bounded cursor rules. Audit summaries MUST omit buyer descriptions, evidence contents, addresses, internal decision notes, storage keys, and other unnecessary personal data.

#### Scenario: Admin filters one return audit trail

- **WHEN** an admin filters audit events by a return reference
- **THEN** the response contains only safe correlated decision metadata and no private evidence or note content

