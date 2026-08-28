## 1. Baseline, Migration, and Generated Client

- [x] 1.1 Record current migration/checksum, Change 1/2 chat, notification, moderation, audit, typecheck, lint, and build baselines before schema changes.
- [x] 1.2 Add Prisma enums/models/relations for directed chat blocks, message replies, membership mute state, shared chat rate-limit events, attention leases, chat report targets, current user chat restrictions, and notification activity ordering.
- [x] 1.3 Add database check/unique/index constraints for self-block prevention, target-specific report/case column shapes, active case grouping, reply lookup, rate windows, attention expiry, and stable notification aggregates.
- [x] 1.4 Create a forward-only migration that backfills notification `activityAt` from `createdAt` without changing existing message, membership, moderation, or non-chat notification semantics.
- [x] 1.5 Regenerate Prisma clients and add migration/preflight tests proving existing data remains valid and new constraints reject malformed target combinations.

## 2. Shared Contracts, DTOs, Problem Details, and OpenAPI

- [x] 2.1 Add framework-neutral contact action, mute/block response, attention lease, reply reference, reply-aware send, chat report receipt/query, and shared rate-limit contracts with strict exact-key parsers.
- [x] 2.2 Add discriminated CHAT notification category/metadata and activity cursor contracts while preserving all existing notification variants.
- [x] 2.3 Extend moderation target/outcome/case/detail/decision contracts with chat-specific variants and target-valid combinations while preserving product/shop projections.
- [x] 2.4 Extend privileged audit filters/actions and realtime event unions for chat safety, eligibility, and notification aggregate convergence without private fields.
- [x] 2.5 Add NestJS DTO validation and stable Problem Details mappings for invalid reply, mute/block authorization, report validation/replay, shared rate limits with retry timing, stale cases, and invalid chat moderation transitions.
- [x] 2.6 Document every new or changed authenticated operation, request, success response, bearer requirement, and stable error class in OpenAPI.
- [x] 2.7 Add contract tests for valid/invalid exact keys, backwards-compatible legacy fixtures, target-specific moderation unions, bounded notification metadata, and prohibited-field rejection.

## 3. PostgreSQL-Backed Shared Chat Rate Enforcement

- [x] 3.1 Implement privacy-safe account/source subject derivation and require configuration for source HMAC without storing or logging raw addresses.
- [x] 3.2 Implement transaction-scoped shared send allowance using deterministic advisory-lock order, active-window counts, accepted/rejected events, and authoritative `retryAfterSeconds`.
- [x] 3.3 Resolve exact message idempotent replay before allowance consumption and include `replyToMessageId` in the request digest conflict rules.
- [x] 3.4 Integrate pair lock, rate locks, block/restriction eligibility, message acceptance, unread counters, notification aggregate, and chat outbox in one bounded transaction.
- [x] 3.5 Remove the process-local chat rate `Map` only after shared limiter unit and PostgreSQL concurrency tests pass.
- [x] 3.6 Add bounded cleanup for expired chat rate events and prove it leaves every active enforcement window unchanged.
- [x] 3.7 Add privacy-safe send-rate metrics/logging that expose counts and retry classes but no message content, raw source, or subject hash.

## 4. Mute, Block, Reply, and Conversation Projections

- [x] 4.1 Extend conversation summary reads with `notificationsMuted`, `blockedByMe`, and server-authoritative `canMessage` without revealing reverse block or restriction reasons.
- [x] 4.2 Implement idempotent participant-authorized `PUT|DELETE /api/v1/chat/conversations/:conversationId/mute` operations and realtime convergence events.
- [x] 4.3 Implement idempotent directed `PUT|DELETE /api/v1/chat/users/:userId/block` operations with self/unrelated rejection and canonical pair serialization.
- [x] 4.4 On effective block, suppress presence disclosure, disable both composers generically as appropriate, mark existing chat notification aggregate read, and retain authorized history/drafts.
- [x] 4.5 Validate optional reply targets inside the canonical conversation and persist the reply relation during message acceptance.
- [x] 4.6 Project bounded reply metadata in history, send responses, and Socket.IO events, including safe unavailable-original behavior.
- [x] 4.7 Add API/unit/PostgreSQL tests for mute idempotency, both block directions, block/send races, unblock restoration, same-conversation reply validation, reply idempotency conflict, and overlapping history pages.

## 5. Participant Chat Reporting and Durable Abuse Limits

- [x] 5.1 Extend the reporting repository with chat conversation/message target adapters, server-derived reported user, normalized request digest, and valid target-column constraints.
- [x] 5.2 Implement `POST /api/v1/chat/reports` with participant authorization, bounded reasons/details, `OTHER` detail requirement, idempotent replay/conflict, and no private case disclosure.
- [x] 5.3 Reuse PostgreSQL report-rate events/advisory locking for chat attempts and return consistent retry timing across tabs/processes/devices.
- [x] 5.4 Group eligible reports into one active case by conversation/reported user while preserving immutable individual receipts and message anchors.
- [x] 5.5 Implement bounded caller-only `GET /api/v1/chat/reports` pagination/filtering for already-reported UI state.
- [x] 5.6 Add tests for conversation/message reports, own-participant derivation, non-participant privacy, `OTHER` validation, duplicate targets, exact/conflicting replay, rate races, and case convergence.

## 6. Admin Chat Moderation, Restrictions, and Audit

- [x] 6.1 Extend moderation list filters/summaries for chat target kinds, status, reason, assignee, exact case/conversation identifiers, stable cursor order, and no message bodies in list responses.
- [x] 6.2 Extend moderation detail with one highlighted evidence anchor, bounded neighboring context, safe participant projections, case-local opaque reporters, and unavailable-evidence behavior.
- [x] 6.3 Add target-specific validation for `NO_ACTION`, `WARN_USER`, `RESTRICT_CHAT_TEMPORARY`, `RESTRICT_CHAT_INDEFINITE`, and `RESTORE_CHAT` while rejecting chat outcomes for product/shop cases and vice versa.
- [x] 6.4 Implement current user chat restriction projection and authoritative UTC expiry checks in every message eligibility path.
- [x] 6.5 Commit effective decision, case version/event, restriction transition, user-safe notice, idempotency command response, and exactly one privileged audit event atomically.
- [x] 6.6 Preserve assignment, private-note, decision history, reversal, optimistic conflict, and exact replay semantics for chat cases.
- [x] 6.7 Extend `/api/v1/admin/audit` filters/safe summaries for chat moderation actions without message, reporter, private-note, presence, notification preview, or raw-source data.
- [x] 6.8 Add unit/API/PostgreSQL tests for admin authorization, bounded evidence, target-specific outcomes, required expiry/private note, concurrent decisions, replay/conflict, temporary expiry, restore, user notices, and audit exactly-once.

## 7. Attention-Aware Aggregated Chat Notifications

- [x] 7.1 Add the CHAT in-app preference/filter and stable per-recipient/conversation notification aggregate with authoritative unread count, newest sequence, bounded preview, and `activityAt` ordering.
- [x] 7.2 Implement authenticated `PUT /api/v1/chat/conversations/:conversationId/attention` refresh/clear bound to user, session, and browser client instance.
- [x] 7.3 Enforce fresh explicit newest-region attention, mute, global CHAT preference, both block directions, restrictions, accepted delivery, and replay deduplication before aggregate creation/reactivation.
- [x] 7.4 Upsert the aggregate in the message transaction and replace count/metadata authoritatively so concurrent/retried projections cannot duplicate or overcount.
- [x] 7.5 Synchronize chat `markRead` and matching aggregate read/count in one monotonic transaction while leaving general notification `read`/`read-all` unable to advance chat watermarks.
- [x] 7.6 Add deduplicated realtime events for notification aggregate/read totals and authoritative REST recovery after reconnect or unknown versions.
- [x] 7.7 Ensure `CHAT_MESSAGE` creates no per-message email attempt and preserves all existing non-chat notification dispatch/preference behavior.
- [x] 7.8 Add tests for closed widget, passive visibility, exact engaged conversation, older-history reading, wrong conversation, mute/unmute, block, restriction, lease expiry/clear/session revocation, multi-tab attention, concurrent aggregate upsert, read-all semantics, and cursor reordering.

## 8. Floating Chat Contact and Message Actions

- [x] 8.1 Add the always-visible centered-right contact action trigger without obscuring names, previews, status, or unread badges.
- [x] 8.2 Implement one-open contact popover with exactly mute/unmute and block/unblock actions, target label, outside-click/Escape dismissal, focus restoration, pending/error states, and responsive mobile action sheet.
- [x] 8.3 Render muted and blocked states with text/icon labels beyond color and keep opening the action menu from selecting or reading the conversation.
- [x] 8.4 Implement block/unblock confirmation, retained-history composer states, draft preservation, privacy-safe reverse-block messaging, and realtime multi-tab updates.
- [x] 8.5 Add per-message focus/hover/touch action triggers and one-open popover/action sheet with Reply and Report without message reflow.
- [x] 8.6 Implement reply composition preview, cancel-without-draft-loss, accepted quoted bubble, original-message anchoring/loading/highlight, unavailable-original state, and failed-send preservation.
- [x] 8.7 Implement conversation/message report dialogs with target preview, reason radio list, conditional details, character count, privacy notice, duplicate prevention, rate-limit countdown, receipt, optional post-report block, and recoverable failure state.
- [x] 8.8 Add component tests for menu geometry/state, keyboard/touch behavior, focus restoration, 44 × 44 px targets, draft/reply preservation, dialogs, block privacy, rate feedback, reduced motion, and no horizontal overflow.

## 9. Notification Bell and Account Inbox Integration

- [x] 9.1 Make header/account notification clients recognize bounded `CHAT_MESSAGE` metadata and render grouped title, count, latest preview, activity time, avatar fallback, and unread state.
- [x] 9.2 Route chat notification selection through `ChatProvider` to open the exact conversation/newest sequence on the current page, marking it read only after successful open/engagement.
- [x] 9.3 Refresh chat and notification badges from authoritative results/realtime events and represent notification-read/chat-unread state correctly after notification `read-all`.
- [x] 9.4 Add the Chat filter and empty/loading/error states to the account inbox without changing navigation for existing notification types.
- [x] 9.5 Add tests for grouped rendering, stable aggregate reactivation/order, exact-conversation outside first contact page, failed open retention, mute suppression, read synchronization, and non-chat navigation regression.

## 10. Admin Chat Moderation UI

- [x] 10.1 Add the Chat tab, queue metrics, target/status/reason/assignment filters, exact-ID search, chips, sorting, pagination, skeleton, empty, retry, and stale-data states to the existing moderation center.
- [x] 10.2 Add responsive queue cards with report kind/count, primary reason, priority, assignment, activity time, and no message body.
- [x] 10.3 Add chat case detail with highlighted report anchor, bounded transcript context, safe participant data, grouped reports, opaque reporters, decisions, events, and append-only timeline.
- [x] 10.4 Add target-valid decision dialogs for no action, warning, temporary/indefinite restriction, and restore with confirmation, expiry, public reason, required private note, pending/error, and optimistic conflict refresh.
- [x] 10.5 Surface chat moderation events in the existing privileged audit UI with safe labels and links back to authorized case detail.
- [x] 10.6 Add admin component/page tests for role denial, filters, responsive list/detail navigation, privacy exclusions, outcome validation, concurrent stale state, timeline, audit linking, accessibility, and reduced motion.

## 11. Real Integration, CI, and Release Verification

- [x] 11.1 Extend deterministic PostgreSQL fixtures with multiple participant pairs, block directions, muted memberships, reply history, report cases, restrictions, attention leases, notification aggregates, two admins, and scoped cleanup.
- [x] 11.2 Add real PostgreSQL tests across independently constructed service/API instances for shared rate limits, block/send ordering, report convergence, aggregate races, read synchronization, attention expiry, and concurrent admin decisions.
- [x] 11.3 Extend real Socket.IO Playwright journeys for block/unblock, mute/unmute, reply navigation, report receipt/rate feedback, notification suppression/aggregation/opening, multi-tab convergence, admin action, restriction propagation, expiry/restore, and reconnect recovery.
- [x] 11.4 Run user and admin journeys at 360 × 800, 768 × 1024, and 1440 × 900 with axe, keyboard-only operation, focus visibility/restoration, 44 × 44 px targets, reduced motion, composer reachability, bounded dialogs, and no horizontal page scroll.
- [x] 11.5 Extend CI and `chat:release:verify` so migration/checksum, non-skipped PostgreSQL safety suites, real Socket.IO journeys, notification/moderation/audit regressions, and privacy assertions are mandatory and mocked tests remain separately labeled.
- [x] 11.6 Run complete contracts, API, web, PostgreSQL opt-in, real Playwright, existing E2E, typecheck, lint, production build, migration status/checksum, outbox readiness, and OpenSpec strict validation; record exact pass/skip/warning counts.

## 12. Completion Documentation

- [x] 12.1 Reconcile implementation with the UI/UX spec, proposal, design, Vietnamese design, and every delta requirement without changing completed Change 1/2 history.
- [x] 12.2 After implementation and verification, create `flow.md` in Vietnamese covering mute, block, reply, report, grouped notification, admin decision, restriction, errors, recovery, and one practical example without code or architecture.
- [x] 12.3 Record migration/rollout/rollback constraints, shared rate cleanup, attention lease thresholds, privacy guarantees, and exact release evidence in the change verification notes.
- [x] 12.4 Run `openspec validate t31-change-03-chat-safety-moderation-notifications --strict` and resolve every planning or implementation discrepancy before requesting archive.
