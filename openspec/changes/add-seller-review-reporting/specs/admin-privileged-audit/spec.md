## MODIFIED Requirements

### Requirement: Privileged audit records review-report resolutions safely

An admin decision to hide a seller-reported review or keep it visible SHALL append exactly one immutable review-target audit event. The event MAY include safe visibility and report-resolution summaries but MUST NOT include seller identity, seller-report details, buyer identity, review text, or private moderation notes. Idempotent retries and failed/stale commands MUST NOT append another audit event.

#### Scenario: Admin keeps a reported review visible

- **WHEN** an admin resolves one or more seller reports with `KEEP_VISIBLE`
- **THEN** the reports are marked resolved, review visibility is unchanged, and exactly one safe review-target audit event is recorded
