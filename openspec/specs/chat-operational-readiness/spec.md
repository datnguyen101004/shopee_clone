# chat-operational-readiness Specification

## Purpose

Make floating chat releasable through documented HTTP contracts, privacy-safe outbox readiness signals, and mandatory real PostgreSQL and Socket.IO verification rather than mocked-only coverage.

## Requirements

### Requirement: Chat HTTP contracts are present in OpenAPI

The generated OpenAPI document SHALL describe every authenticated `/api/v1/chat` operation, its request parameters or body, successful response, bearer authentication requirement, and stable Problem Details error classes without exposing private example data.

#### Scenario: OpenAPI document is generated

- **WHEN** API documentation is built or inspected
- **THEN** target resolution, conversation list, unread count, message history, message send, read watermark, and realtime ticket operations are all discoverable with their expected success and error responses

#### Scenario: Request is invalid or unauthorized

- **WHEN** a documented chat operation receives invalid input or insufficient authorization
- **THEN** its documentation identifies the applicable validation or authorization response shape without revealing another participant's data

### Requirement: Operations can inspect chat outbox readiness safely

The system SHALL expose a read-only chat outbox health response containing readiness, pending backlog count, failed backlog count, oldest pending age, processing counters, and non-sensitive poll/error timestamps. The response MUST NOT contain message content, participant identifiers, conversation identifiers, ticket values, or raw exception text.

#### Scenario: Outbox is healthy

- **WHEN** the outbox worker is polling and no event exceeds the configured readiness threshold
- **THEN** the health response reports ready with current aggregate counters and timestamps

#### Scenario: Outbox is stale or backlogged

- **WHEN** pending work exceeds an accepted age or the worker is not polling successfully
- **THEN** the health response reports not ready and exposes only aggregate diagnostic values

#### Scenario: Health response is inspected for privacy

- **WHEN** the outbox health payload is serialized or logged
- **THEN** it contains no chat content, user identifier, conversation identifier, realtime ticket, session identifier, or raw error detail

### Requirement: Real chat verification is an explicit release gate

The release workflow SHALL run chat tests against PostgreSQL and a real Socket.IO connection with two authenticated accounts. Chat database tests MUST NOT be silently skipped, and browser tests that claim realtime coverage MUST NOT replace the realtime ticket with a forced failure or abort Socket.IO traffic.

#### Scenario: PostgreSQL chat verification runs in CI

- **WHEN** the chat integration job executes
- **THEN** database-backed concurrency, idempotency, ordering, unread, authorization, and repair assertions run and a skipped suite fails the job

#### Scenario: Two-account realtime journey runs

- **WHEN** the realtime browser suite executes
- **THEN** two authenticated browser sessions exchange messages, reconcile read and unread state, recover from a controlled interruption, and converge across multiple tabs using the real API and Socket.IO transport

#### Scenario: Test setup and cleanup are repeated

- **WHEN** the realtime suite is run more than once
- **THEN** deterministic fixtures and scoped cleanup prevent prior chat data from changing the expected outcome and do not delete unrelated conversations

### Requirement: Migration history is verified before release

The release workflow SHALL verify Prisma migration status and applied migration checksums before and after the targeted repair and chat migration checks. A checksum mismatch or unapplied migration MUST stop release verification.

#### Scenario: Migration history is consistent

- **WHEN** repository migrations match the applied database history and chat preflight succeeds
- **THEN** the release gate may continue to integration and browser verification

#### Scenario: Migration checksum differs

- **WHEN** an applied migration's repository checksum does not match recorded history
- **THEN** release verification stops and requires an explicit reconciliation plan rather than rewriting applied history automatically
