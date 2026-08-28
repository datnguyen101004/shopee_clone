## Context

See `proposal.md` for motivation and `docs/ui-ux/t31-change-03-chat-safety-moderation-notifications.md` for approved visible behavior.

Change 1 and Change 2 already provide a canonical unordered user-pair conversation, ordered text messages, membership read watermarks/unread counters, REST writes, Socket.IO projections, a transactional chat outbox, approximate presence, a global `ChatProvider`, and real PostgreSQL/realtime release coverage. The current send limiter is a process-local `Map`, so changing tabs does not bypass it but reaching a different API process does. The schema already contains dormant historical chat attachment/block/report tables, but the live canonical models intentionally do not consume them.

The repository also has a production-shaped notification inbox with `CHAT_MESSAGE` reserved, per-category preferences, deduplicated `Notification` rows, email attempts, and header/account UIs. Chat does not yet project into it. Product/shop reporting already implements durable report-rate events, idempotent receipts, grouped moderation cases, optimistic case versions, immutable events/decisions, and privileged audit. Those capabilities currently assume product/shop targets and outcomes and must remain backward compatible.

There is no Redis dependency or shared cache in the local/CI topology. PostgreSQL is the authoritative shared service available to every API instance, and the existing release workflow already provisions an isolated PostgreSQL database.

## Goals / Non-Goals

**Goals:**

- Preserve one floating chat state owner while adding accessible contact/message actions and quoted replies.
- Make block, report, rate-limit, notification, moderation, and audit decisions server authoritative and race safe.
- Reuse the current notification, moderation, outbox, Problem Details, OpenAPI, and privileged-audit conventions instead of creating parallel product stacks.
- Keep notification aggregation and read synchronization deterministic under retries, reconnects, multiple tabs, and multiple API processes.
- Keep admin evidence bounded to the reported conversation context and prevent reporter/private-note leakage.
- Use forward-only migration and additive contract evolution so Change 1/2 and non-chat moderation/notification clients keep working.

**Non-Goals:**

- Browser push, mobile push, or per-message chat email.
- Message editing/deletion, attachment moderation, automated content classification, or full conversation export.
- Redis introduction, distributed Socket.IO fanout, or a separately deployed moderation service.
- A full-page chat inbox or a second frontend chat store.
- Automatic account suspension outside the existing user-administration workflow.
- Reusing historical buyer/shop chat block/report tables as the canonical public model.

## Decisions

### 1. Keep `ChatProvider` as the browser authority and compose notification actions through it

`ChatProvider` remains mounted around `MarketplaceHeader`, page content, and `FloatingChat`. It will own contact menu state, message action state, reply composition, mute/block projections, attention lease lifecycle, exact-conversation opening, and realtime merges. `NotificationBell` and the account notification inbox will call a provider action such as `openConversationFromNotification` for `CHAT_MESSAGE` items rather than assigning a chat URL.

The contact row always renders one 44 × 44 px trigger at its right edge. Its menu derives exactly two toggles from authoritative summary fields: `notificationsMuted` and `blockedByMe`. Message menus are keyed by message ID; selecting reply stores a normalized reply reference separately from draft text, while report opens the report dialog with the selected message anchor.

Alternative considered: a second notification/chat bridge store. It is rejected because the existing provider already owns route-independent conversation loading, auth refresh, realtime, drafts, and read engagement. A second store would create competing unread and selection authorities.

### 2. Model blocks as directed account relationships and mute as membership state

Add a canonical `ChatUserBlock` relation with `(blockerUserId, blockedUserId)` uniqueness, a self-block database check, UTC timestamps, and indexes for both directions. A block is directed for ownership and disclosure, but either direction prevents sends and notification projection for the pair. Only the blocker receives `blockedByMe=true`; the other participant receives only `canMessage=false` and a generic capability state. Block APIs are idempotent PUT/DELETE operations.

Add `notificationsMutedAt` to `ChatMembership`; `null` means enabled. Mute belongs to one user in one materialized conversation, survives reload/device changes, does not alter unread state, and does not delete existing notification history. Mute/unmute also uses idempotent PUT/DELETE semantics.

Both block mutation and send acceptance acquire the same canonical pair transaction advisory lock. This gives a serial result to a block/send race: a send committed before the block remains valid; after the block commits, no later send, unread increment, notification aggregate, or message outbox side effect may commit.

Alternative considered: reactivating legacy `chat_blocks`. It uses buyer/shop-era identity and is not represented in the canonical Prisma model, so it would reintroduce the identity ambiguity removed by Change 1.

### 3. Store reply identity, not a copied message body

Add optional `replyToMessageId` to `ChatMessage` with a self-relation and an index. The send request accepts an optional UUID and includes it in the request digest. Inside the locked message transaction the server verifies that the target exists in the same conversation before accepting the new message.

Message projections add an optional bounded reply object containing original message ID, sequence, sender user ID, safe sender label, and a server-truncated preview. The preview is derived at read/projection time rather than stored as a second permanent copy of message content. The existing `beforeSequence` history query can load a missing original because the reply projection carries its sequence; no separate message-by-ID endpoint is required.

If a future retention/moderation change removes the original, the reply relation becomes unavailable and the UI renders its neutral placeholder. This change does not add message removal itself.

Alternative considered: storing an immutable quoted-content snapshot. It is rejected because later content removal would still leave the sensitive body duplicated in every reply.

### 4. Replace process-local send throttling with a PostgreSQL event ledger

Add `ChatRateLimitEvent` with scope (`ACCOUNT` or `SOURCE`), an opaque subject hash, accepted flag, attempted UTC time, and indexes by `(scope, subjectHash, attemptedAt DESC)`. Account subjects use a one-way stable derivation from user ID. Network-source subjects use HMAC-SHA256 with an application secret; raw addresses are never stored or returned.

For a new message, the transaction resolves an exact idempotent replay first. A replay returns the original message without consuming allowance. A genuinely new attempt acquires account and source advisory locks in deterministic order, counts active-window accepted events, calculates `Retry-After` from the oldest relevant event, and records the attempt in the same transaction as message acceptance. The canonical pair lock, rate locks, eligibility checks, message sequence allocation, unread counters, chat outbox, and notification aggregate therefore commit or roll back together.

Rejected attempts may be recorded as `accepted=false` for abuse diagnostics but do not extend the accepted allowance. A scheduled bounded cleanup removes events older than every configured window, and release verification checks that cleanup cannot touch active windows.

Chat reports continue using the existing PostgreSQL-backed `ReportRateLimitEvent` and its advisory locking, extended to recognize chat report receipts. Thus both send and report limits are shared without adding Redis.

Alternative considered: Redis token buckets. Redis would be appropriate once it is already required for multi-replica Socket.IO/presence, but introducing another operational dependency only for this change would expand local, CI, deployment, failure, and observability scope. PostgreSQL gives the needed shared correctness now.

Alternative considered: fixed counters on `User`. They cannot represent the source dimension or accurate retry timing and create unnecessary hot updates on the account row.

### 5. Extend the existing report/case pipeline with discriminated chat targets

Extend report target contracts and persistence with `CHAT_CONVERSATION` and `CHAT_MESSAGE`. `UserReport` gains optional `chatConversationId`, `chatMessageId`, and `reportedUserId`; `ModerationCase` gains optional `chatConversationId` and `reportedUserId`. Database checks enforce the valid target-column shape for each target type. Reports retain their original target kind, while an active chat case is grouped by `(chatConversationId, reportedUserId)` so multiple anchored messages from the same harmful participant converge without losing individual receipts.

`POST /api/v1/chat/reports` accepts `{ conversationId, messageId?, reasonCode, details? }` plus `Idempotency-Key`. The server authorizes membership, verifies an optional message belongs to the conversation, derives the other participant as the reported account, normalizes content, computes the request digest, enforces durable report limits, and creates/attaches the report in one transaction. The client never submits or learns a moderation case ID or reported-account enforcement state.

`GET /api/v1/chat/reports` returns only the current reporter's bounded receipts/status for rendering `Already reported`; it never exposes grouped reporters, private notes, or decisions.

Alternative considered: dedicated chat report/case tables and a second admin workflow. It is rejected because assignment, optimistic versions, notes, idempotent decisions, case events, and audit already exist and are exactly the semantics chat needs. Discriminated target adapters preserve one moderation center.

### 6. Add a target-specific chat moderation state machine

Extend target-specific decision contracts with:

- `NO_ACTION`;
- `WARN_USER`;
- `RESTRICT_CHAT_TEMPORARY` with a required future UTC expiry;
- `RESTRICT_CHAT_INDEFINITE`;
- `RESTORE_CHAT`.

Existing product/shop outcomes remain valid only for their current target types. DTO validation and service guards reject cross-target outcomes before mutation.

Add one current `UserChatRestriction` row per user with `restrictedAt`, optional `restrictedUntil`, originating decision ID, version, and restore fields. Decisions remain immutable history in `ModerationDecision`; the current row is the efficient send-eligibility projection. A temporary restriction is active while authoritative database time is before `restrictedUntil`; no cleanup is required for correctness, though expired rows may later be compacted. `WARN_USER` creates a public account notification but does not modify eligibility.

An effective decision transaction locks the case and current restriction, verifies `expectedVersion`, checks the idempotency command digest, appends decision/event, updates case and restriction, writes the user-safe notification, and appends privileged audit. Exact replay returns the stored response; a concurrent stale version changes nothing.

Alternative considered: suspending the whole `User` for chat violations. It is rejected because the approved outcome is chat-scoped and account suspension would unexpectedly disable buying, selling, login sessions, and unrelated capabilities.

### 7. Keep chat moderation evidence referential and bounded

Chat reports store conversation/message references and a bounded target snapshot containing safe labels/identifiers needed if an account label later changes. They do not copy the full conversation. Admin detail loads the reported message plus a configured number of neighboring messages after verifying the admin role and target case. Reporter identities are mapped to case-local opaque IDs.

The generic case list never includes message bodies. Detail projections omit tokens, addresses, presence/attention leases, raw network source hashes, notification previews, other conversations, and full-history export. Private notes remain in admin-only detail and never enter privileged audit summaries or user notifications.

Alternative considered: saving a full transcript at report time. It is rejected for data minimization, storage duplication, and the risk of exposing unrelated private content.

### 8. Reuse one stable `Notification` aggregate per recipient/conversation

Add notification category `CHAT` while retaining the reserved type `CHAT_MESSAGE`. A chat aggregate uses a stable deduplication key derived from recipient and conversation, so one row represents the conversation across unread cycles. Add `activityAt` for inbox ordering and cursoring; existing non-chat rows initialize it from `createdAt`. Chat metadata contains version, conversation ID, safe display/avatar values, current conversation unread count, newest incoming sequence, bounded preview, and latest activity time.

On an eligible new message, the message transaction upserts the stable notification row: it sets `isRead=false`, clears `readAt`, updates body/metadata/activity, and sets the count from the recipient membership's authoritative unread value. Replayed/outbox-delivered projections cannot increment it again because the count is replaced, not incremented heuristically.

This change creates in-app chat notifications only. It does not enqueue `NotificationDeliveryAttempt` email rows for `CHAT_MESSAGE`. Per-conversation mute overrides the global CHAT in-app preference; a globally disabled CHAT preference also suppresses the aggregate.

Alternative considered: one notification row per message followed by read-time grouping in the client. It is rejected because it still creates spam, complicates badge counts, and permits retries to duplicate visible items.

Alternative considered: one active aggregate plus archived historical episodes. A stable row is chosen for this milestone because the approved UX is conversation-centric and does not require episode history.

### 9. Use short PostgreSQL attention leases for cross-process suppression

Add `ChatAttentionLease` keyed by authenticated user, session, and browser `clientInstanceId`, with conversation ID, `atNewestRegion`, `engagedAt`, and `expiresAt`. `clientInstanceId` is a random UUID kept in session storage and is never accepted as an account identity. The authenticated endpoint can create/refresh or clear only the caller's lease.

`ChatProvider` refreshes a short lease only while the widget is open on the selected conversation, the page is visible, the user explicitly focused/clicked the conversation, and the viewport is in the newest region. It clears best-effort on close, selection change, older-history movement, and logout; expiry is the correctness fallback. The message transaction suppresses notification aggregation when any fresh newest-region lease exists for the recipient/conversation. Multiple passive tabs do not create leases, while one engaged tab can suppress redundant notification noise for the account.

The endpoint is `PUT /api/v1/chat/conversations/:conversationId/attention` with `{ clientInstanceId, engagedAtNewestRegion }`; `false` clears that instance's lease. Leases are not returned in participant, presence, notification, or moderation projections.

Alternative considered: process-local selected-conversation state in Socket.IO. It cannot suppress correctly when send and recipient sockets are handled by different processes and would recreate the same multi-instance flaw as the current rate limiter.

Alternative considered: treating socket presence or page visibility as attention. Both are too broad and would suppress notifications while the user is in another conversation or merely has the page in the foreground.

### 10. Synchronize chat read and notification aggregate in the chat transaction

`PUT /api/v1/chat/conversations/:conversationId/read` continues to advance a monotonic watermark. In the same transaction it recomputes the membership unread count and replaces the chat notification aggregate's metadata count. When the count reaches zero, it marks the aggregate read; a stale lower watermark cannot reactivate or regress anything.

The general notification `markRead`/`read-all` operations continue to affect notification rows only. They do not impersonate explicit chat engagement or advance chat watermarks. Therefore a read notification item can safely retain metadata stating that the conversation still has unread chat messages. Opening a chat notification goes through `ChatProvider`, loads the conversation, performs explicit read engagement, and only then relies on the chat read transaction to synchronize the aggregate. If opening fails, it stays unread.

Realtime outbox projections add versioned chat safety/notification events carrying only the authorized changed summary and aggregate notification unread total. Unknown versions or reconnects trigger authoritative chat and notification refreshes. No client decrements either badge heuristically after an authoritative value is available.

Alternative considered: marking the notification read before opening and then navigating. It is rejected because load/authorization failure would consume the notification without showing the conversation.

### 11. Keep all state-changing operations REST-authoritative and outbox-projected

New state changes remain on authenticated REST boundaries with strict DTO validation, OpenAPI documentation, no-store responses, and Problem Details. Socket.IO stays a server-to-client convergence channel. The attention lease is a REST mutation because it affects notification eligibility and needs the same authenticated, shared, testable boundary.

Block, mute, moderation decision, read, and notification changes append deduplicated chat outbox projections in their committing transactions where another tab/participant must converge. The existing bounded dispatcher and reconnect REST recovery remain the durability model.

Alternative considered: performing block/mute/attention mutations through custom socket acknowledgements. It is rejected because it would split validation, auth refresh, idempotency, OpenAPI, and failure behavior across protocols.

### 12. Extend contracts additively and classify failures by stable problem type

Conversation summaries add `notificationsMuted`, `blockedByMe`, and the existing generic `canMessage` remains the only other-participant eligibility disclosure. Messages add optional `replyTo`; send adds optional `replyToMessageId`. Notification metadata becomes a discriminated `CHAT_MESSAGE` variant. Moderation target/outcome unions widen, with target-specific validators preventing invalid combinations.

New Problem Details include invalid reply, block/mute target unavailable, already-reported receipt, report validation, report/send rate limit with `retryAfterSeconds`, stale moderation version, invalid chat moderation transition, and temporary unavailability. Forbidden responses never reveal block direction, restriction cause, report existence belonging to another user, or private moderation state.

All additive parsers remain strict about exact keys within their versioned variant. Existing notification and product/shop moderation payloads remain unchanged.

### 13. API verification matrix

- `GET /api/v1/chat/conversations`: mute/block/canMessage projections, stable pagination/search, privacy, and compatibility with existing summaries.
- `GET /api/v1/chat/conversations/:conversationId/messages`: reply projection, overlapping pages, original outside loaded history, unavailable reference, and participant authorization.
- `POST /api/v1/chat/messages`: optional reply target, same-conversation validation, request-digest conflict, block/restriction enforcement, shared account/source limits, first-send race, notification aggregation, and outbox atomicity.
- `PUT|DELETE /api/v1/chat/conversations/:conversationId/mute`: participant authorization, idempotent toggle, multi-tab convergence, no unread mutation, and notification suppression.
- `PUT|DELETE /api/v1/chat/users/:userId/block`: directed disclosure, self/unrelated rejection, idempotent toggle, opposite-direction block, concurrent send serialization, and retained history.
- `PUT /api/v1/chat/conversations/:conversationId/attention`: caller/session/client-instance binding, explicit engagement, newest-region state, expiry, clear, session revocation, and non-participant denial.
- `POST /api/v1/chat/reports`: conversation/message authorization, reason/detail validation, opaque reported-user derivation, exact replay/conflict, duplicate target behavior, shared report limits, and atomic case attachment.
- `GET /api/v1/chat/reports`: caller-only receipts, filters/pagination, already-reported state, and no case/private-note leakage.
- `GET /api/v1/account/notifications` and `/unread-count`: CHAT filter, stable activity cursor, bounded metadata, aggregate ordering/count, muted behavior, and non-chat regression.
- `POST /api/v1/account/notifications/:notificationId/read` and `/read-all`: notification-only semantics, chat metadata retention, and no chat watermark mutation.
- `GET /api/v1/admin/moderation/cases` and `/:caseId`: chat filters, bounded evidence, opaque reporters, target-specific projections, admin authorization, and product/shop regression.
- Existing assign/note/decision moderation endpoints: chat outcome validation, required expiry/private note, optimistic version conflict, idempotency, reversal, restriction/notice/event/audit atomicity, and cross-target rejection.
- `GET /api/v1/admin/audit`: chat moderation filtering, exactly-once entries, and content/private-note/source-hash exclusion.
- Socket.IO projections: block/mute/eligibility, accepted replies, grouped notification total, read synchronization, reconnect recovery, unknown-version fallback, and multiple tabs.

### 14. Frontend behavior follows the approved UI/UX state machines

Contact and message menus use one-open-menu state, outside-click/Escape dismissal, focus restoration, 44 × 44 px targets, responsive anchored popover/action sheet behavior, and no list/message reflow. Reply composition stores `{ messageId, sequence, senderLabel, preview }` separately from draft text; cancel removes only the reference. Report/block dialogs retain input on recoverable failure and prevent duplicate submits.

The admin page adds a Chat tab while preserving existing Cases/Reviews behavior. Chat list cards contain no message body; selecting a case loads detail and bounded context. Decisions show only target-valid actions, require explicit confirmation and notes/expiry where specified, and refresh on optimistic conflict.

The notification bell/inbox identifies `CHAT_MESSAGE` metadata and calls the provider rather than `window.location.assign`. Other notification types keep their current navigation path. The CHAT category filter and muted marker use text/icon labels beyond color.

### 15. Verification is layered and real-environment gates remain separate from mocks

- Contract tests cover exact-key parsers, discriminated variants, reply/report/restriction states, metadata privacy, and backward-compatible existing fixtures.
- API unit/Jest tests cover validation, transaction composition, target-specific moderation guards, notification projection, and Problem Details.
- PostgreSQL opt-in tests cover block/send races, shared allowance across independent service instances, reply constraints/idempotency, report/case convergence, aggregate upsert races, read synchronization, attention expiry, decision conflicts, restriction enforcement, audit exactly-once, and migration checks.
- Component tests cover contact/message menus, focus restoration, reply draft preservation, dialogs, muted badge behavior, notification-to-provider handoff, admin queue/detail, error states, reduced motion, and no horizontal overflow.
- Real Playwright uses deterministic accounts, at least two browser contexts and multiple tabs to cover block/unblock, mute/unmute, reply navigation, report submission, notification suppression/aggregation/opening, admin resolution, restriction propagation, reconnect, and accessibility at 360 × 800, 768 × 1024, and 1440 × 900.
- CI keeps mocked UI tests labeled separately and extends the dedicated PostgreSQL/Socket.IO chat gate so skipped database tests fail the job.

## Risks / Trade-offs

- [PostgreSQL rate events and attention leases add write volume] → Keep windows/leases short, index expiry queries, batch cleanup, avoid refresh when the widget is passive, and expose aggregate operational metrics without subjects.
- [Fixed one-row notification aggregation loses per-episode inbox history] → The approved UX is conversation-centric; preserve latest activity and unread metadata, and revisit episodes only if product requirements demand them.
- [Extending generic moderation unions can regress product/shop cases] → Use target-discriminated validation/projection, additive migrations, exhaustive contract tests, and full existing moderation regression suites.
- [Block/send and notification/read races span several rows] → Use deterministic advisory/row lock order and keep message, membership, rate event, notification aggregate, outbox, and audit changes within bounded transactions.
- [Attention leases can suppress too much if stale] → Bind to authenticated session plus client instance, require explicit newest-region engagement, use short expiry, clear best-effort, and verify expiry/session revocation.
- [Admin evidence exposes private messages] → Load only an authorized bounded window, use opaque reporters, exclude content from list/audit/logs, and test serialized responses for prohibited fields.
- [A stable notification row is reactivated after being read] → Order by `activityAt`, replace authoritative unread metadata, and test cursor stability when an older conversation becomes active again.
- [Temporary restriction expiry may be observed at slightly different client times] → Derive eligibility from server/database UTC and return authoritative expiry; clients only display the value and refresh at/after it.

## Migration Plan

1. Validate current migration status/checksums and run the complete Change 1/2, notification, moderation, and audit baselines.
2. Apply a forward-only Prisma migration adding block, reply, mute, shared rate, attention, chat report/case, restriction, notification activity, enum, index, and check-constraint changes. Backfill `Notification.activityAt = createdAt` and leave existing chat memberships/messages unchanged.
3. Deploy additive contracts and API read compatibility before enabling the new web controls; existing clients ignore the new fields.
4. Enable shared send throttling and remove the process-local map only after PostgreSQL concurrency and cleanup tests pass.
5. Enable block/mute/reply/report and chat moderation endpoints, then notification aggregation/attention leases and realtime projections.
6. Run the extended release order: migration/checksum → contract/unit → PostgreSQL shared-state/concurrency → real Socket.IO multi-client → Playwright breakpoints/accessibility → full regression/build/lint.
7. Roll back application code by leaving additive tables/columns unused. Do not reverse enum values or drop populated safety/audit data during an application rollback. A later reviewed forward migration may remove unused structures only after retention/export review.

Database rollback before production data exists may restore the pre-change snapshot. After reports, blocks, restrictions, or audit records exist, rollback is code-only because deleting those records would destroy safety history.
