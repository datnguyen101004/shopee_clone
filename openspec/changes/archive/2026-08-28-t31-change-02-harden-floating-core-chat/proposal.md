## Why

Change 1 established the floating text-chat baseline, but production readiness is still blocked by incomplete long-history behavior, inconsistent recoverable states, default-skipped database coverage, mocked realtime browser tests, and one known invalid legacy conversation. This change hardens the existing experience and removes the exact corrupt legacy record before chat migrations and verification are treated as safe.

## What Changes

- Complete older-message pagination with stable scroll anchoring, date boundaries, overlap deduplication, newest-region behavior, and recoverable page-load failures.
- Align temporary composers, failed sends, forbidden conversations, keyboard-driven read marking, loading skeletons, and safe post-login chat continuation with the approved UI/UX behavior.
- Reuse an existing user-pair conversation even when it is outside the initially loaded contact page, and add a short presence disconnect grace period so quick reloads do not flicker offline.
- Hard-delete legacy conversation `2f6dd7f3-7982-47af-b230-442b54ba5e57` and every dependent legacy chat row in one guarded transaction. The repair is intentionally limited to this exact identifier, is rerunnable, and must prove the record is absent before preflight continues.
- Publish complete OpenAPI metadata for authenticated chat endpoints and expose privacy-safe chat outbox readiness data, including backlog size and oldest pending age.
- Replace the mocked-only confidence gap with PostgreSQL integration tests and real two-account Socket.IO Playwright journeys, deterministic setup/cleanup, controlled interruption, multi-tab coverage, and explicit CI execution.

## Capabilities

### New Capabilities

- `floating-core-chat-hardening`: Defines the corrected long-history, temporary-composer, send-failure, read, forbidden, presence, continuation, and loading behavior layered on the Change 1 floating chat baseline.
- `legacy-chat-data-repair`: Defines the narrowly scoped, verifiable hard deletion of the known invalid legacy conversation and its dependent records.
- `chat-operational-readiness`: Defines documented chat contracts, observable outbox readiness, and mandatory real-database/realtime verification before release.

### Modified Capabilities

None. The `floating-core-chat` capability is still owned by the completed but unarchived Change 1, so this follow-up declares additive hardening capabilities and explicitly depends on `t31-change-01-floating-core-chat` instead of mutating its artifacts.

## Impact

- **Dependency:** Requires the implementation and delta specification from `t31-change-01-floating-core-chat`.
- **Web:** Floating chat provider, widget rendering and styles, contextual chat continuation, component tests, and browser fixtures/journeys.
- **API:** Chat service/controller/realtime presence and outbox projection, health reporting, DTO/OpenAPI metadata, PostgreSQL integration tests, and shared contracts.
- **Persistence:** A new guarded repair artifact for the exact legacy conversation ID; no broad or pattern-based deletion is permitted.
- **CI and operations:** A PostgreSQL-backed chat job, real Socket.IO browser coverage, migration checksum/status checks, preflight enforcement, outbox readiness checks, and privacy-safe diagnostics.
- **Compatibility:** Existing `/api/v1/chat` request and response semantics remain backward compatible. A read-only health response is added for operations.
