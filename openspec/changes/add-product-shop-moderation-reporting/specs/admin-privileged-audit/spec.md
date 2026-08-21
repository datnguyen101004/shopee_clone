## ADDED Requirements

### Requirement: Every moderation decision has append-only audit evidence
Every committed moderation decision SHALL append exactly one immutable privileged-audit event. Effective product and shop state changes SHALL target the affected resource; review hide/restore SHALL target the review; and a `NO_ACTION` or already-effective case decision SHALL target the moderation case. Each event MUST record actor, target type/id, action, public reason, bounded before/after state summary, UTC time, and a correlation to the immutable moderation decision or review-moderation event. Failed, unauthorized, stale, and idempotent retries of an already committed command MUST NOT append another event. Case assignment and private notes SHALL remain in append-only case events and MUST NOT be duplicated into privileged audit.

#### Scenario: Product case is resolved with suspension
- **WHEN** a product suspension decision commits
- **THEN** exactly one product-targeted privileged audit event links to that decision and records the moderation state transition

#### Scenario: Case is resolved without enforcement
- **WHEN** a no-action decision commits
- **THEN** exactly one case-targeted privileged audit event records the outcome without claiming a target state change

### Requirement: Moderation audit projections protect reports and notes
Admin audit listing SHALL support the new moderation case and review target types and moderation actions using the existing bounded cursor and filters. Before/after summaries and list projections MUST NOT contain reporter identity, report evidence, evidence references, private notes, seller notice contents, credentials, or session data. Correlation identifiers MAY allow an authorized admin to navigate from an audit event to an existing moderation case but MUST NOT expose that relationship to non-admin APIs.

#### Scenario: Admin filters review visibility actions
- **WHEN** an admin filters privileged audit by review target and hide action
- **THEN** matching events include safe visibility transitions and correlation while omitting review-report evidence and private notes

#### Scenario: Seller reads a moderation notice
- **WHEN** a seller receives a safe notice originating from an audited decision
- **THEN** no privileged-audit identifier, admin identity, or before/after summary appears in the seller response
