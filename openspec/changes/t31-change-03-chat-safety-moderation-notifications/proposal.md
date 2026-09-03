## Why

Floating chat is now reliable enough for normal messaging, but it exposes users and operators to unmanaged spam, harassment, and notification noise. The next release needs user-controlled safety actions, auditable chat moderation, shared enforcement across API instances, and notification behavior that returns users to the correct conversation without duplicating alerts while they are already engaged.

## What Changes

- Add a per-contact action menu in the floating widget for muting/unmuting notifications and blocking/unblocking the other account, while retaining readable history and privacy-safe forbidden states.
- Add per-message actions for replying with a quoted reference and reporting a message, plus a conversation-level report action with bounded reason and detail inputs.
- Replace process-local chat send throttling with PostgreSQL-backed shared rate enforcement and reuse durable report throttling so limits remain consistent across tabs, processes, and devices.
- Extend the existing moderation center with a chat queue, bounded evidence context, assignment/version conflict handling, warning and chat-restriction outcomes, reversals, private notes, and append-only privileged audit records.
- Create one in-app notification aggregate per recipient/conversation, suppress it when the recipient has muted or is actively engaged with that conversation, and synchronize it with authoritative chat read state.
- Make chat notification selection open the existing floating widget on the exact conversation and message region without introducing a full-page chat route or per-message email delivery.
- Add privacy, accessibility, responsive, real PostgreSQL, multi-client Socket.IO, notification, moderation, and concurrency release coverage for the combined capability.

## Capabilities

### New Capabilities

- `chat-conversation-actions`: Covers the per-contact mute/block menu, per-message reply/report menu, quoted replies, block enforcement, and user-visible safety states in the existing floating widget.
- `chat-safety-moderation`: Covers idempotent chat reports, shared send/report abuse limits, grouped admin cases, privacy-bounded evidence, warning/restriction decisions, reversals, and moderation history.
- `chat-notification-aggregation`: Covers attention-aware in-app chat notification creation, per-conversation aggregation, mute suppression, badge/read synchronization, and exact-conversation opening.

### Modified Capabilities

- `admin-privileged-audit`: Adds exactly-once, append-only audit coverage and safe filtering for effective chat moderation decisions and reversals.
- `chat-operational-readiness`: Extends the mandatory real-database and realtime release gate to cover shared rate limits, block/report races, grouped notifications, attention suppression, and moderation decisions.

## Impact

- **Web:** Floating chat contact/message action menus, quoted-reply composer and bubbles, report/block dialogs, notification bell/inbox chat behavior, account notification filters, and the admin moderation Chat tab.
- **API:** Additive authenticated chat safety/report endpoints, reply-aware message contracts, shared rate-limit enforcement, chat notification projection/synchronization, and chat-specific moderation projections and decisions.
- **Persistence:** Forward-only Prisma migration for directed blocks, membership mute state, reply references, shared rate-limit events, chat report targets, user chat restrictions, notification aggregation/activity ordering, and required indexes/constraints.
- **Contracts:** Framework-neutral chat action, report, notification metadata, moderation target/outcome, audit filter, Problem Details, and realtime projection contracts.
- **Operations and testing:** OpenAPI updates, rate-limit cleanup, privacy-safe metrics/logging, deterministic PostgreSQL fixtures, real two-account/multi-tab Socket.IO journeys, admin concurrency tests, and breakpoint/accessibility coverage.
- **Compatibility:** Existing `/api/v1/chat` message and history behavior remains backward compatible; new fields are additive. Existing product/shop moderation and non-chat notification behavior must remain unchanged.
