## 1. Baseline and Shared Contracts

- [x] 1.1 Re-run the current chat unit, component, PostgreSQL opt-in, Playwright, migration-status, and preflight checks and record which suites run, skip, or fail before implementation.
- [x] 1.2 Verify repository chat migration checksums against local `_prisma_migrations` without changing applied migration history, and stop the change if drift requires a separate reconciliation decision.
- [x] 1.3 Extend shared chat target contracts with authorized `existingConversation`, and extend conversation/message projections with generic `canMessage` state while preserving existing fields.
- [x] 1.4 Add the aggregate `ChatOutboxHealthResponse` contract and schema assertions, excluding content, user, conversation, session, ticket, and raw-error fields.
- [x] 1.5 Update chat API client types and contract tests for all additive fields and backward-compatible response parsing.

## 2. Exact Legacy Conversation Hard Deletion

- [x] 2.1 [Critical] Add a repository-owned repair command whose immutable target is `2f6dd7f3-7982-47af-b230-442b54ba5e57` and whose required confirmation must match that exact identifier.
- [x] 2.2 [Critical] Implement one PostgreSQL transaction with an advisory lock, count-only pre-delete reporting, dependency-ordered deletion across every present legacy and canonical chat table, zero-row post-delete assertions, and rollback on any failure.
- [x] 2.3 Add isolated PostgreSQL tests proving exact-ID scope, dependent-row removal, no mutation of a neighboring conversation, idempotent second execution, missing-optional-table handling, mismatched-confirmation rejection, and atomic rollback.
- [x] 2.4 Take a local database backup/snapshot, run the guarded hard-delete command with the approved exact confirmation, and retain only the privacy-safe table-count report.
- [x] 2.5 Run the repair command a second time and verify it succeeds with zero matching rows in both legacy and canonical chat table families.
- [x] 2.6 Run `chat:preflight` after deletion and confirm the known invalid membership finding is absent; stop without repairing automatically if any unrelated identifier fails an invariant.

## 3. Authoritative Chat API Hardening

- [x] 3.1 Update shop-target resolution to query the canonical authenticated user pair and return its authorized conversation summary or `null`, independent of contact pagination.
- [x] 3.2 Project generic `canMessage` eligibility in conversation summaries and message pages without exposing recipient account or enforcement details.
- [x] 3.3 Preserve participant-scoped history access while returning stable Problem Details for non-participants, invalid cursors, unavailable targets, forbidden sending, and idempotency conflicts.
- [x] 3.4 Add controller OpenAPI tags, bearer authentication, operation descriptions, parameters, request bodies, success schemas, and stable 400/401/403/404/409/429/503 responses for every `/api/v1/chat` endpoint.
- [x] 3.5 Add API unit and Supertest contract coverage for an existing conversation outside the first contact page, `canMessage=false`, self-target, unavailable shop/recipient, authorization privacy, and generated OpenAPI presence.

## 4. History, Merge, and Scroll State

- [x] 4.1 Extend `ChatProvider` with selected-conversation pagination, oldest/newest accepted sequences, `hasMoreBefore`, single-flight older loading, scoped failure, and retry state.
- [x] 4.2 Implement one authoritative message merge path that deduplicates accepted IDs and sequences across initial history, older pages, reconnect backfill, Socket.IO events, and optimistic attempts.
- [x] 4.3 Add older-page loading through `beforeSequence` and preserve the concrete visible message anchor when pages are prepended.
- [x] 4.4 Track newest-region intent so open/reopen and arrivals at the bottom move to the newest message, while arrivals during older-history reading preserve the viewport and show `Tin nhắn mới`.
- [x] 4.5 Render the beginning-of-conversation indicator, recoverable older-history error/retry, date boundaries, and default time metadata only for the newest message.
- [x] 4.6 Add component tests for multiple older pages, variable-height anchoring, overlap deduplication, no-more-pages, scoped retry, date boundaries, newest-region movement, and breakpoint-safe scrolling.

## 5. Composer, Temporary Target, Read, and Loading States

- [x] 5.1 Replace first-page contact inference with the API's `existingConversation` result and verify contextual entry points cannot create a duplicate temporary target.
- [x] 5.2 Discard an empty unmaterialized target on widget close while retaining a non-empty session draft under the authenticated-user/recipient namespace.
- [x] 5.3 Model send attempts by `clientMessageId` and composer revision, remove the dedicated `Gửi lại` control, restore failed content only into an unchanged empty composer, and keep newer drafts intact.
- [x] 5.4 Reconcile authoritative late acceptance for the original `clientMessageId` without automatic replay, while a later normal Send action always creates a new attempt.
- [x] 5.5 Separate contact loading, history loading, older loading, list failure, history failure, and readable-but-forbidden states; render scoped skeletons and retain safe cached history.
- [x] 5.6 Replace the composer with `Bạn không thể tiếp tục cuộc trò chuyện này` when history remains readable but `canMessage=false`.
- [x] 5.7 Make the conversation surface keyboard-focusable and advance read state on focus/activation of the surface, composer, avatar, or contact, but not on browser visibility or widget open.
- [x] 5.8 Reconcile read watermarks with monotonic maximums and authoritative unread totals across REST and Socket.IO instead of heuristic decrements.
- [x] 5.9 Validate stored chat handoffs with UUID, `isSafeAuthReturnTo`, and a supported source before one-time consumption; discard malformed, unsafe, stale, and self-target continuations.
- [x] 5.10 Add component and accessibility tests for empty temporary close, draft retention, failed-content merge, no retry shortcut, late acknowledgement, scoped skeletons/errors, forbidden composer, keyboard read, safe handoff, live announcements, focus visibility, and reduced motion.

## 6. Presence and Outbox Readiness

- [x] 6.1 [Critical] Add a five-second per-user disconnect grace timer that starts only after the final socket disconnects, is cancelled by reconnect, and does not affect users with another connected tab.
- [x] 6.2 Keep presence lease refresh and active/inactive projections consistent between header, contacts, REST summaries, first-message materialization, and realtime updates.
- [x] 6.3 Add fake-timer and multi-socket tests for quick reload, genuine disconnect, reconnect near the boundary, multiple tabs, lease expiry, and duplicate projection prevention.
- [x] 6.4 Extend outbox readiness calculation with durable pending/processing/failed counts, oldest pending age, polling freshness, and aggregate process counters.
- [x] 6.5 Expose `GET /api/v1/health/chat-outbox` through the existing health module, return ready/not-ready deterministically, and serialize no prohibited private fields.
- [x] 6.6 Add health unit/integration tests for empty, healthy, stale-poll, old-pending, failed-backlog, database-error, and privacy-safe response cases.

## 7. Real PostgreSQL and Socket.IO Verification

- [x] 7.1 Make the PostgreSQL chat suite explicitly runnable with `RUN_CHAT_DATABASE_TESTS=1` and add a guard that fails the dedicated job if all database chat tests are skipped.
- [x] 7.2 Add real PostgreSQL coverage for concurrent first sends, one canonical pair, idempotent replay/conflict, monotonic sequence/read state, unread totals, participant authorization, and outbox health aggregates.
- [x] 7.3 Build deterministic two-account, one-single-owner-shop, outsider, multi-tab, long-history, and scoped-cleanup fixtures for the dedicated Playwright chat project.
- [x] 7.4 Start the real API, web app, PostgreSQL, and Socket.IO transport for chat Playwright tests without mocking realtime-ticket failure or aborting `/socket.io/**`.
- [x] 7.5 Verify product-detail, public-shop, checkout, guest-login continuation, self-shop disabled, empty temporary close, and existing-conversation-outside-first-page journeys at 360 × 800, 768 × 1024, and 1440 × 900.
- [x] 7.6 Verify real first-message races, send cutoff and late acknowledgement, older-history anchoring, incoming-message scrolling, explicit read actions, reconnect backfill, presence grace, unread convergence, and multiple tabs.
- [x] 7.7 Run axe checks and verify 44 × 44 px targets, keyboard focus/close/read behavior, status text beyond color, responsive composer reachability, no horizontal page scroll, and reduced-motion behavior.

## 8. CI, Release Gates, and Completion

- [x] 8.1 Add a dedicated CI chat integration job with isolated PostgreSQL, explicit database-test enablement, real API/web startup, real chat Playwright project, bounded infrastructure readiness checks, and failure traces.
- [x] 8.2 Keep fast mocked component/browser tests labeled separately so they cannot satisfy the real database/realtime release gate.
- [x] 8.3 Add release commands that verify migration checksums/status, exact repair outcome, chat preflight, outbox readiness, and non-skipped integration suites in the documented order.
- [x] 8.4 Run chat unit, component, API, PostgreSQL, realtime multi-client, Playwright breakpoint, accessibility, contract, Prisma, typecheck, lint, and production build verification and record exact pass/skip counts.
- [x] 8.5 Run `openspec validate t31-change-02-harden-floating-core-chat --strict` and reconcile every planning or implementation discrepancy.
- [x] 8.6 After implementation and verification, create `flow.md` in Vietnamese describing the user-visible long-history, failed-send, read, forbidden, reconnect, and recovery flows with a practical example and without code or architecture.
- [x] 8.7 Verify Change 1 followed by Change 2, then prepare their spec synchronization and archive order without modifying completed history out of sequence.
