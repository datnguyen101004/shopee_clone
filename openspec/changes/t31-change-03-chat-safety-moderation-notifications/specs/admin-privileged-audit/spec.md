## ADDED Requirements

### Requirement: Effective chat moderation decisions append privileged audit
Every effective chat warning, temporary restriction, indefinite restriction, restore, no-action decision, and reversal SHALL append exactly one privileged-audit event in the same transaction as the moderation decision, case event, restriction change when applicable, and user-facing notice. Failed, unauthorized, stale, and exact idempotent replay requests MUST NOT append another audit event.

#### Scenario: Admin restricts chat temporarily
- **WHEN** an authorized admin applies a valid temporary chat restriction
- **THEN** one `MODERATION_CASE` audit event records the actor, case target, action, bounded reason, correlation identifiers, safe prior/next chat eligibility, and UTC timestamp

#### Scenario: Exact chat decision replay
- **WHEN** an admin repeats an identical idempotent chat moderation command
- **THEN** the original result is returned and the privileged-audit stream remains unchanged

#### Scenario: Concurrent stale chat decision
- **WHEN** a second admin submits a decision against an obsolete case version
- **THEN** the request fails without a decision, restriction mutation, notice, or audit event

### Requirement: Chat moderation audit is safe to search
The privileged audit list SHALL support existing bounded filtering for chat moderation case target identifiers and chat moderation actions. Audit summaries MUST omit message content, reporter identity, private notes, presence/session data, notification previews, raw source addresses, and unrelated participant profile data.

#### Scenario: Admin filters one chat case audit trail
- **WHEN** an authorized admin filters privileged audit by the moderation case identifier
- **THEN** matching chat decision and reversal events are returned newest first with safe action and before/after summaries

#### Scenario: Audit response is inspected for private chat data
- **WHEN** an authorized client reads a chat moderation audit event
- **THEN** the event contains no message body, report detail, private note, reporter identity, session data, or raw source address
