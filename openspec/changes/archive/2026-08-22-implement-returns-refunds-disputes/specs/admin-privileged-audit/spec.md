## ADDED Requirements

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
