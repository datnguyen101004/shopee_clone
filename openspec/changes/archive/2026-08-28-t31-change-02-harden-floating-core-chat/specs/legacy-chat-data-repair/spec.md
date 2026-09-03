## Purpose

Remove one explicitly identified corrupt legacy chat conversation and all of its dependent rows without broadening deletion scope or allowing the known record to block chat validation again.

## ADDED Requirements

### Requirement: The known invalid conversation is hard-deleted exactly once

The repair operation SHALL hard-delete conversation `2f6dd7f3-7982-47af-b230-442b54ba5e57` from every present legacy and canonical chat representation together with rows that depend on that exact conversation identifier. The operation MUST NOT select additional conversations by pattern, membership count, age, owner, or any other broad criterion.

#### Scenario: Known conversation exists with dependent data

- **WHEN** the guarded repair runs and the exact conversation identifier exists in one or more chat tables
- **THEN** all rows belonging to that identifier are permanently removed in one atomic operation and no other conversation identifier is changed

#### Scenario: Known conversation is already absent

- **WHEN** the guarded repair runs after the exact conversation and its dependent rows have already been removed
- **THEN** it succeeds as an idempotent no-op and reports zero remaining rows for that identifier

#### Scenario: Repair cannot complete atomically

- **WHEN** any required deletion or verification fails
- **THEN** the operation rolls back all deletions from that attempt and reports failure without continuing chat migration or release verification

### Requirement: Destructive scope is verified before and after deletion

The repair operation MUST report privacy-safe row counts grouped by affected table before deletion and MUST verify zero remaining rows for the exact identifier afterward. It MUST refuse execution if its configured target differs from `2f6dd7f3-7982-47af-b230-442b54ba5e57`.

#### Scenario: Target identifier differs

- **WHEN** the repair is invoked with or resolves any target other than the approved exact identifier
- **THEN** it fails before mutation and reports that the destructive scope is not authorized

#### Scenario: Post-delete verification finds a remaining row

- **WHEN** any present legacy or canonical chat table still contains the exact identifier after the attempted deletion
- **THEN** the transaction is treated as failed and release verification cannot proceed

### Requirement: Chat preflight passes after the targeted repair

The system SHALL run the chat migration preflight after the hard deletion. The known invalid membership report MUST disappear, while any unrelated invariant violation MUST still fail preflight and require separate authorization.

#### Scenario: Only the approved invalid conversation caused preflight failure

- **WHEN** the repair completes and no other legacy chat invariant is invalid
- **THEN** chat preflight reports valid data and migration verification may continue

#### Scenario: Another invalid conversation exists

- **WHEN** preflight detects an invariant violation for any other identifier
- **THEN** it fails without deleting or repairing that other conversation automatically
