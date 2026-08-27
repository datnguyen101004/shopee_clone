## Context

See `proposal.md` for motivation and `docs/ui-ux/t31-change-02-harden-floating-core-chat.md` for visible behavior. Change 1 already supplies the canonical user-pair persistence model, authenticated REST API, Socket.IO delivery, transactional outbox, and floating widget. This design corrects the remaining behavior without introducing a second chat surface or a `CHAT_ENABLED` switch.

The current client loads one message page, finds contextual conversations only in the first contact page, marks read primarily from pointer selection, keeps an empty temporary target on close, and exposes a retry shortcut for failed bubbles. Realtime presence removes the final connection immediately. PostgreSQL chat tests are opt-in and the Playwright chat suite forces realtime unavailable. The legacy preflight also reports conversation `2f6dd7f3-7982-47af-b230-442b54ba5e57` with one distinct membership.

The repair and verification described here target the local environment by default. Production execution is not included without a separate explicit instruction.

## Goals / Non-Goals

**Goals:**

- Complete the approved long-history, scrolling, failure, forbidden, loading, read-engagement, continuation, and presence behavior.
- Preserve the existing `/api/v1/chat` surface while making additive response fields available where the UI needs authoritative state.
- Permanently remove the exact known corrupt conversation and all rows scoped to that identifier in one guarded transaction.
- Turn PostgreSQL and real Socket.IO verification into explicit, non-skippable chat release gates.
- Provide complete OpenAPI coverage and privacy-safe aggregate outbox readiness.

**Non-Goals:**

- Attachments, rich commerce cards, message edit/delete, block/report/moderation, external notifications, or a full-page chat UI.
- Redis-backed multi-replica realtime, shared presence, or distributed rate limiting.
- Automatic cleanup of any conversation other than `2f6dd7f3-7982-47af-b230-442b54ba5e57`.
- Restoring the hard-deleted conversation through application logic.
- Production data mutation as part of this change's default execution.

## Decisions

### 1. Extend the existing provider state instead of creating another chat store

`ChatProvider` remains the single client authority. Its selected-conversation state will additionally track:

- `hasMoreBefore`, `loadingOlder`, and a scoped older-history error;
- whether the selected conversation is loading, readable-but-forbidden, or sendable;
- the authoritative oldest and newest sequence currently held;
- local pending attempts keyed by `clientMessageId`;
- one explicit newest-region/read-intent state per selected conversation.

All history, REST responses, Socket.IO events, and optimistic attempts merge through one normalization function keyed first by accepted message ID and then by the accepted `(conversationId, sequence)` position. Pending messages remain keyed by `clientMessageId` until an authoritative result is known.

Alternative considered: introducing a general client cache library. It is rejected because the repository already centralizes chat lifecycle and realtime reconciliation in `ChatProvider`; a second cache would add synchronization ownership without solving a broader application need.

### 2. Load older messages with a sequence cursor and DOM scroll anchoring

The existing `GET /api/v1/chat/conversations/:conversationId/messages?beforeSequence=<n>&limit=<n>` contract remains authoritative. The client requests the next page using the smallest accepted sequence currently displayed.

Before prepending, the widget records the scroll container height and scroll top, or the first visible message element and its offset. After React commits the older page, it adjusts scroll top by the height delta so the previous anchor remains stationary. A single-flight guard prevents overlapping older-page requests. `hasMoreBefore=false` permanently disables further requests for the selected snapshot until the conversation is reloaded.

Realtime and reconnect arrivals use the same merge function. The viewport auto-advances only while it is within the newest-region threshold. Otherwise the `Tin nhắn mới` marker is retained until the user navigates to the newest region.

Date separators are derived for display only from accepted UTC timestamps and the browser's locale. Only the newest message shows its time by default, preserving the already approved compact metadata behavior.

Alternative considered: reverse flex ordering. It is rejected because it complicates keyboard order, sequence reasoning, date boundaries, and stable prepend anchoring.

### 3. Resolve contextual targets authoritatively at the API boundary

`GET /api/v1/chat/targets/shops/:shopId` will add an `existingConversation` field containing an authorized `ChatConversationSummary` or `null`. The server resolves the canonical unordered user pair directly; the browser no longer infers existence from the currently loaded contact page.

The field is additive, and the current target identity, self-chat, active-shop, and owner-account checks remain unchanged. When a summary is returned, the provider selects and loads it. When it is `null`, the provider creates one session-local temporary target.

Conversation summaries and message pages will also expose a generic `canMessage` boolean. It is computed from server-authoritative eligibility and contains no private enforcement reason. A readable conversation with `canMessage=false` retains history while the composer becomes read-only.

Alternative considered: paginating all contacts until a matching participant is found. It is rejected because it increases latency and network volume and still makes correctness dependent on client list traversal.

### 4. Treat failed content restoration as a draft merge, not a retry action

Each send attempt captures its content and a composer revision. The UI clears the composer optimistically. At the three-second cutoff or an immediate failure:

- the attempt becomes locally failed;
- no dedicated retry control is rendered;
- content is restored only if the composer is still empty and has not advanced to a newer non-empty revision;
- otherwise the new draft wins and the failed bubble remains copyable.

The normal Send action always creates a new `clientMessageId`. The old failed attempt is never resubmitted automatically. If an authoritative response or realtime event for the original `clientMessageId` proves that the server accepted it, the accepted identity wins reconciliation; this is acknowledgement of an existing server result, not an automatic resend.

Closing an empty, unmaterialized target clears its selection, transient messages, and selected shop. A non-empty session draft remains namespaced by authenticated user and recipient.

Alternative considered: keeping the `Gửi lại` control. It is rejected because it hides whether a new idempotency key is created and conflicts with the approved normal-Send recovery flow.

### 5. Make read engagement semantic and monotonic

The conversation surface becomes keyboard-focusable and handles `focus`/`focusin` as well as pointer activation. Selecting a contact/avatar and focusing the composer are equivalent explicit engagement signals. Each signal snapshots the highest accepted sequence currently known and calls the existing read-watermark endpoint only when it advances beyond the current watermark.

Browser visibility and widget-open effects do not mark read. Responses and realtime read events are merged with `Math.max`; stale results cannot move the watermark backwards. The global unread total is replaced from the server response rather than decremented heuristically when an authoritative total is available.

Alternative considered: marking read whenever the selected conversation renders. It is rejected because it treats passive visibility as user attention and caused the mismatch described in Change 1.

### 6. Model loading and forbidden states separately

Contact loading, selected-history loading, older-page loading, list failure, history failure, and readable-but-forbidden are separate state values. The widget renders contact and message skeletons only for their own scope and retains already authorized cached content on refresh failures.

Problem Details are classified by stable problem type/status. A sendability restriction does not erase history. A true participant authorization failure remains privacy-preserving and does not reveal that another conversation exists.

Alternative considered: one global `loading` and one global error string. It is rejected because it blanks unrelated UI and cannot represent recoverable history with a disabled composer.

### 7. Validate guest continuation with shared authentication contracts

The stored handoff is parsed as an explicit shape: `{ shopId, returnPath, source }`. `shopId` must be a UUID, `returnPath` must pass `isSafeAuthReturnTo`, and `source` must be one of the supported contextual chat sources. The entry is consumed once before target resolution. Invalid JSON, missing fields, unsafe paths, stale shops, and self-targets are discarded without chat side effects.

Alternative considered: retaining `returnPath.startsWith('/')`. It is rejected because protocol-relative and malformed values require the same centralized validation already used by authentication.

### 8. Add a five-second disconnect grace period to process-local presence

`ChatPresenceService` keeps connection counts and one pending inactive timer per user. When the final socket disconnects, it schedules inactive projection after five seconds. A reconnect cancels the timer, restores/touches the lease, and emits active only when consumers actually need convergence. Disconnecting one of several tabs never starts the timer.

The lease continues to protect against stale connected sockets. Timers are process-local, matching Change 1's single-instance deployment boundary. No `CHAT_ENABLED` flag is introduced.

Alternative considered: using the full 45-second lease as disconnect grace. It is rejected because genuine offline transitions would be noticeably delayed. Immediate inactive projection is rejected because normal reloads visibly flicker.

### 9. Implement the approved hard deletion as a dedicated guarded repair command

A repository-owned repair command will contain the approved identifier as a constant and require an explicit matching confirmation argument. It will not accept arbitrary IDs. It opens one PostgreSQL transaction, acquires a transaction-scoped advisory lock, reports counts by table, deletes dependent rows, deletes conversation rows, verifies zero remaining matches, and commits only after verification.

The operation covers each present table in both representations:

- canonical: `chat_user_outbox`, `chat_user_messages`, `chat_user_memberships`, `chat_user_conversations`;
- legacy: `chat_outbox`, `chat_report_references`, `chat_blocks`, `chat_attachments`, `chat_messages`, `chat_memberships`, `chat_conversations`.

Rows are selected only by `conversation_id = '2f6dd7f3-7982-47af-b230-442b54ba5e57'`, or by the conversation table's `id` column. Dependent tables are deleted before parent tables even where a cascade exists, making counts and behavior explicit. Missing optional legacy tables are treated as zero rows. Output contains table names and counts only, never message content or participant data.

The command is idempotent: a second run reports zero rows and succeeds. Any other preflight violation remains a hard stop. This is an irreversible hard delete at row level; code rollback cannot reconstruct it, so environmental database backup/restore is the only data rollback mechanism.

Alternative considered: a broad repair based on invalid membership counts. It is rejected because the user authorized deletion of one exact conversation only. Soft deletion is rejected because it would leave the corrupt legacy invariant and contradict the requested hard deletion.

### 10. Expose additive OpenAPI and outbox readiness contracts

All chat controller operations receive `@ApiTags`, bearer auth, operation, parameter/query/body, success, and stable error response metadata. DTO and contract schemas remain the source for documented fields.

`GET /api/v1/health/chat-outbox` returns a shared aggregate contract with:

- `ready`;
- `pending`, `processing`, and `failed` counts;
- `oldestPendingAgeSeconds`;
- process counters (`claimed`, `sent`, `failedAttempts`, `polls`);
- `lastPollAt` and `lastErrorAt`.

Readiness is false when polling is stale or the oldest eligible pending event exceeds a configured threshold. The endpoint follows the repository's existing public operational-health pattern and contains no identifiers, content, ticket/session values, or raw exceptions. ChatModule exports only the readiness provider required by HealthModule.

Alternative considered: returning the current in-memory metrics object only. It is rejected because it omits durable backlog and oldest age, the two values needed to detect stalled delivery.

### 11. Separate mocked UI tests from real chat release tests

Component tests continue to mock transport for deterministic rendering and state-machine assertions. They will cover scroll anchoring, deduplication, skeletons, empty temporary close, safe draft restoration, keyboard read, forbidden composer, continuation validation, and presence grace.

Database integration tests run with `RUN_CHAT_DATABASE_TESTS=1` against an isolated PostgreSQL database and fail if the suite is skipped. They cover canonical-pair concurrency, idempotency conflicts, monotonic sequences/read watermarks, authorization, outbox aggregates, and exact-ID repair isolation.

A dedicated Playwright chat project starts the real API and web application and provisions two authenticated accounts plus one single-owner shop. Its fixture creates uniquely namespaced test data and deletes only that fixture's rows afterward. Socket.IO is not aborted and realtime-ticket responses are not mocked. Controlled interruption uses browser context/network controls, not server implementation hooks.

The suite exercises product, shop, and checkout entry points; first-message races; bounded send and late acknowledgement; long-history prepend; newest-region behavior; explicit read actions; reconnect backfill; presence grace; and multi-tab convergence at 360 × 800, 768 × 1024, and 1440 × 900.

Alternative considered: expanding the existing mocked Playwright spec and continuing to call it realtime coverage. It is rejected because it cannot verify the transport, authentication ticket, outbox delivery, or multi-client convergence.

## API Verification Matrix

- `GET /api/v1/chat/targets/shops/:shopId`: authentication, UUID validation, inactive/missing shop, self-target, no existing conversation, existing conversation outside the first contact page, and additive `existingConversation` contract.
- `GET /api/v1/chat/conversations`: stable cursor order, search, unread aggregation, eligibility projection, and participant privacy.
- `GET /api/v1/chat/conversations/unread-count`: authenticated aggregate and convergence after read.
- `GET /api/v1/chat/conversations/:conversationId/messages`: `beforeSequence`, `afterSequence`, mutual exclusion, stable ordering, overlap, no more pages, participant authorization, and `canMessage` projection.
- `POST /api/v1/chat/messages`: validation, self-target, unavailable recipient, three-second client cutoff, accepted late acknowledgement, exact replay, conflicting replay, concurrent first messages, rate limit, and outbox creation.
- `PUT /api/v1/chat/conversations/:conversationId/read`: monotonic advance, stale replay, unread-total response, multi-tab convergence, and non-participant denial.
- `POST /api/v1/chat/realtime-ticket`: authenticated session, one-time ticket, expiry, origin enforcement, inactive session, and safe failure.
- `GET /api/v1/health/chat-outbox`: healthy, stale poll, pending-age threshold, failed backlog, database failure, and privacy-safe response.
- Socket.IO projections: accepted message, conversation summary, unread total, read watermark, reconnect backfill, presence grace, and multiple authenticated tabs.

## Important Consistency and Security Paths

- **Destructive data path:** exact-ID confirmation, advisory lock, cross-table transaction, post-delete assertion, and no automatic handling of any second invalid ID.
- **First-message concurrency:** canonical unordered pair uniqueness, row lock, sequence assignment, idempotency key, and outbox rows remain atomic.
- **Late send result:** local cutoff never causes an automatic replay; authoritative acceptance for the same `clientMessageId` remains deduplicated.
- **Read state:** all pointer/keyboard paths advance one monotonic watermark and use authoritative unread totals.
- **Authorization:** contextual target resolution and `canMessage` are server-authoritative; retained history and private enforcement details remain separated.
- **Realtime convergence:** history, reconnect, and Socket.IO overlap merge through the same authoritative identity/order rules.

## Risks / Trade-offs

- [Hard deletion is irreversible] → Limit the command to the exact approved ID, require matching confirmation, count before/after, use one transaction, and rely on an environment backup for data rollback.
- [The invalid record may exist in both legacy and canonical tables] → Delete and verify both table families in dependency order within the same transaction.
- [Scroll anchoring can vary with late layout changes] → Anchor to a concrete message element and cover variable-height bubbles and breakpoint changes in component/browser tests.
- [A server acceptance can arrive after the local cutoff] → Reconcile by `clientMessageId` as authoritative acknowledgement without automatically resubmitting the attempt.
- [Public health details can leak operational data] → Return aggregate counts/timestamps only and test the serialized payload for prohibited fields.
- [Real chat E2E is slower and more failure-prone] → Isolate it as a dedicated release job with deterministic fixtures, scoped cleanup, bounded retries only at infrastructure startup, and retained traces on failure.
- [Five-second presence grace delays genuine offline state] → Keep the delay short, retain the existing lease, and make the value centrally configured and unit-tested.
- [Change 1 is complete but not archived] → Keep this change additive and dependent on Change 1; verify and sync/archive in dependency order after both are accepted.

## Migration Plan

1. Run the existing test suite and record the current chat preflight output.
2. Verify repository migration files against `_prisma_migrations`; stop on checksum drift or pending unexpected migrations.
3. Take an environment-appropriate database backup or snapshot before the destructive repair.
4. Run the guarded repair command locally with the exact confirmation ID and retain its count-only report.
5. Run the command a second time to prove idempotent zero-row behavior.
6. Run `chat:preflight`; stop if any unrelated invalid identifier remains.
7. Implement and run PostgreSQL integration, component, realtime multi-client, Playwright breakpoint, accessibility, typecheck, lint, and production build verification.
8. Exercise `/api/v1/health/chat-outbox` in healthy and stale/backlogged states and inspect OpenAPI coverage.
9. Roll out code only after all gates pass. Do not run the destructive repair against production without a separate explicit instruction and production backup procedure.

Code rollback reverts the provider/API/presence/readiness changes. It does not recreate hard-deleted chat rows; database restoration from the pre-repair snapshot is the only data rollback.
