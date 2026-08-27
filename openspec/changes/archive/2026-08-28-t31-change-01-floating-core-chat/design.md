## Context

See `proposal.md` for motivation and `specs/floating-core-chat/spec.md` for observable behavior.

The storefront is a Next.js App Router application whose shared `StorefrontShell` already sits inside `AuthSessionProvider`, making it the stable mount point for a route-independent widget. Product-detail and public-shop contracts already expose the shop owner's user ID; checkout groups expose a shop ID and therefore need a chat-target resolution boundary rather than client-side ownership assumptions. Access tokens are kept in browser memory and refreshed through `AuthSessionProvider`.

The NestJS API is currently REST-only and has no realtime dependency. A historical `20260824170000_chat_foundation` migration creates buyer/shop-oriented chat tables plus future attachment, block, and report structures, but the current Prisma schema contains no chat models and no chat module consumes those tables. Since the product now guarantees one shop owner account and chat is explicitly user-to-user, the old buyer/shop identity and side enums cannot become the public Change 1 model unchanged. `NotificationType.CHAT_MESSAGE` exists, but aggregated notification-center delivery is outside this milestone.

## Goals / Non-Goals

**Goals:**

- Preserve the modular-monolith boundary with a dedicated chat capability and framework-neutral contracts.
- Make first-message conversation creation, message sequencing, idempotency, read watermarks, and unread totals transactionally correct under concurrent tabs and participants.
- Add low-latency server-to-client updates while retaining REST snapshots as the recovery source of truth.
- Reconcile the existing unapplied-or-partially-applied chat foundation safely through a forward migration instead of rewriting migration history.
- Mount one chat state owner across storefront routes and retain only session-scoped temporary drafts and navigation intent in the browser.
- Keep authentication, authorization, validation, privacy, OpenAPI, and Problem Details behavior consistent with existing repository conventions.

**Non-Goals:**

- A horizontally scaled realtime topology, Redis pub/sub, or a separately deployed chat service.
- Persistent drafts or cross-device draft synchronization.
- Notification-center/email fanout for closed-chat messages.
- Attachments, rich cards, blocking, reporting, moderation, editing, deletion, or shop-specific chat identities.
- Reusing the historical buyer/shop fields as externally visible chat identity.

## Decisions

### 1. Model a conversation as one canonical unordered user pair

`ChatConversation` will store `participantLowUserId` and `participantHighUserId`, ordered lexicographically, with a unique constraint on the pair. Self-pairs are rejected before persistence and by a database check. Two `ChatMembership` rows provide participant-scoped state: `lastReadSequence`, `unreadCount`, and read timestamps. `ChatMessage` stores a conversation-local monotonically increasing sequence, sender user ID, client message ID, bounded text content, and UTC creation time.

The first accepted send runs in one short database transaction that:

1. canonicalizes and validates the user pair;
2. creates or locks the unique conversation;
3. ensures exactly two memberships;
4. allocates the next sequence;
5. inserts the message with an idempotency constraint;
6. advances the sender membership to the new sequence and increments the recipient unread count;
7. updates the conversation summary; and
8. inserts transactional outbox records for realtime projection.

The unique user-pair key is the final race defense. If concurrent first sends collide during conversation creation, the losing transaction resolves the existing pair and retries sequence allocation; it never creates a second conversation. Message idempotency is unique on `(conversationId, senderUserId, clientMessageId)` and stores a request digest so an exact replay returns the original message while a conflicting reuse returns HTTP 409.

This is preferred over retaining `(buyerId, shopId)` because both users can own shops, roles can change, and the approved UX has no buyer/seller chat identity. It is preferred over creating a conversation when “Chat now” is clicked because that would violate the no-empty-conversation requirement.

### 2. Migrate the historical chat foundation forward; do not edit it in place

A new migration will add the canonical user-pair representation and Prisma models for conversations, memberships, messages, and realtime outbox records. If legacy conversation rows exist, a preflight will resolve each legacy `shop_id` to `shops.owner_id`, reject self-pairs or duplicate/conflicting pairs that cannot be reconciled safely, and convert valid rows without losing messages or sequence/read state. Legacy sender-side and membership-role columns become non-authoritative and are removed only after the new invariants validate.

Attachment, block, and report tables from the foundation remain unused and unexposed in Change 1. They may remain physically present for forward compatibility, but no generated contract, controller, or UI depends on them. The current `CHAT_MESSAGE` notification enum also remains compatible but no new notification-center records are generated by this change.

This is preferred over editing the historical migration because local or shared databases may already record it as applied. It is preferred over dropping all chat tables because existing local data may contain messages that need explicit review rather than silent loss.

### 3. Keep mutations and recovery on authenticated REST boundaries

The public REST surface will use `/api/v1/chat` and strict DTO validation:

- `GET /api/v1/chat/targets/shops/:shopId` resolves a public shop to the owner user's chat identity and reports whether the current account is the same user.
- `GET /api/v1/chat/conversations?limit=&cursor=&query=` returns keyset-paginated materialized contacts ordered by `(lastMessageAt DESC, id DESC)` plus the authoritative unread total.
- `GET /api/v1/chat/conversations/unread-count` returns the lightweight global badge total.
- `GET /api/v1/chat/conversations/:conversationId/messages?limit=&beforeSequence=` loads stable older history.
- `GET /api/v1/chat/conversations/:conversationId/messages?afterSequence=` backfills accepted messages after reconnect; `beforeSequence` and `afterSequence` are mutually exclusive.
- `POST /api/v1/chat/messages` accepts `{ recipientUserId, clientMessageId, content }` and returns the materialized conversation summary plus accepted message. The server resolves the canonical pair, so the same shape handles first and later sends.
- `PUT /api/v1/chat/conversations/:conversationId/read` accepts `{ throughSequence }` and advances the participant watermark monotonically.
- `POST /api/v1/chat/realtime-ticket` issues a short-lived, audience-scoped ticket for an already authenticated active session.

All endpoints use `AuthGuard`, participant-scoped repository predicates, no-store caching, OpenAPI annotations, and capability-specific Problem Details for validation, self-chat, target unavailable, membership unavailable, idempotency conflict, rate limit, and temporary service failure. Collection limits and message content are bounded; Change 1 uses a 2,000-character server limit matching the existing foundation constraint.

A server-resolved shop target is preferred over trusting checkout to infer or expose ownership. REST remains authoritative for writes and recovery because it provides existing validation, refresh, Problem Details, test, and OpenAPI conventions more reliably than socket acknowledgements.

### 4. Use Socket.IO only for authenticated server-to-client projections

Add NestJS WebSocket support with the Socket.IO platform adapter and `socket.io-client` in the web app. The client obtains a short-lived realtime ticket through `authenticatedFetch` and presents it in the Socket.IO authentication payload. The gateway validates ticket audience, session ID, active account state, origin, and expiry before joining a private room keyed by user ID. Raw access or refresh tokens are never placed in URLs or persisted by the chat client.

Client chat mutations continue through REST. The gateway emits versioned projection events such as:

- `chat.message.accepted`;
- `chat.conversation.updated`;
- `chat.read.updated`;
- `chat.unread.updated`; and
- `chat.presence.updated`.

Events contain only contract fields the receiving account is authorized to see and include conversation/message sequence information for deterministic merging. Unknown event versions fail closed and trigger a REST refresh. On reconnect, the client refreshes the conversation snapshot and selected history after its highest confirmed sequence; Socket.IO delivery itself is not treated as durable storage.

Socket.IO is preferred over pure polling because the approved behavior requires low-latency messages, presence, unread counts, and cross-tab convergence. It is preferred over bidirectional socket mutations because REST keeps writes idempotent, documented, and uniformly protected. SSE was considered but rejected for this milestone because authenticated reconnect, multiple event types, connection liveness, and presence would require custom protocol machinery already provided by Socket.IO.

### 5. Project committed changes through a transactional outbox

Message acceptance and read-watermark transactions append deduplicated `ChatOutbox` records. A bounded scheduled dispatcher claims rows with `FOR UPDATE SKIP LOCKED`, emits the corresponding projection to connected user rooms, and marks the row delivered. Failures use capped retry/backoff and structured logs without message content. Reconnect REST backfill remains the correctness path if an event is delayed or emitted while no client is connected.

This is preferred over emitting directly inside the database transaction because a process crash after commit could otherwise leave connected clients stale with no retry signal. It reuses the repository's existing PostgreSQL and scheduled-worker pattern without introducing Redis or another service for Change 1.

### 6. Treat the three-second rule as a bounded client attempt, never an unlimited queue

Each Send action creates a new UUID `clientMessageId`, a pending bubble, and an attempt deadline three seconds later. If the browser is offline or reconnecting, it may transmit that exact request when connectivity returns within the window. At the deadline it aborts further automatic transmission and marks the attempt failed. Reconnection code never queues or replays expired attempts.

If the server accepted an already-transmitted request before the browser observed the timeout, a later REST response, realtime event, or reconnect backfill with the same `clientMessageId` reconciles that original bubble as accepted; this is acknowledgement recovery, not an automatic resend. A user's later normal Send action always uses a new client message ID and cannot mutate the prior failed attempt.

This interpretation avoids the impossible promise that aborting a browser request rolls back a server commit, while preserving the observable rule that the application never initiates a send after the three-second window.

### 7. Use monotonic read watermarks and transactional unread counters

`throughSequence` updates lock the caller's membership and set `lastReadSequence = max(current, boundedRequestedSequence)`. The unread count is recomputed or reduced within the same transaction using messages after the new watermark, preventing stale tabs from moving state backward. Sending from an open conversation advances the sender's own watermark through the accepted message; only the other participant gains unread count.

The global badge total is the sum of membership unread counts for the current account. REST responses provide authoritative totals and realtime events provide low-latency convergence. The client separates “read watermark advanced” from “new-message marker reached,” allowing badges to clear while navigation remains visible for a user reading older history.

A sequence watermark is preferred over one read row per message because Change 1 defines read state cumulatively and requires efficient updates and totals.

### 8. Keep presence approximate and process-local

The gateway tracks authenticated connection counts per user and refreshes a short activity lease from socket liveness and chat interaction. A user is approximately active while at least one valid connection has a fresh lease. Events expose only `ACTIVE` or `INACTIVE`, never exact timestamps or connection metadata. Disconnect uses a small grace period to avoid flicker during tab reloads and transport upgrades.

This process-local model is acceptable for the current single modular-monolith deployment. It deliberately does not promise globally exact presence under multiple API replicas; adding Redis-backed presence and socket fanout requires a later scaling change.

### 9. Own browser chat state in a provider mounted by StorefrontShell

Add `ChatProvider` beneath `AuthSessionProvider` and above `StorefrontShell` content. It owns widget visibility, selected materialized conversation, temporary target, contact pages, message pages, drafts keyed by recipient, pending/failed attempts, unread total, realtime lifecycle, and reconnect reconciliation. The floating widget and global trigger render once from `StorefrontShell`, so route navigation does not remount chat.

Contextual buttons dispatch a shop target to the provider rather than navigating to a chat route. Temporary drafts and widget state may use `sessionStorage` under an authenticated-user-scoped versioned key; logout, account change, malformed data, or session end clears them. Persisted messages and unread state always come from the API.

This is preferred over page-local state because product, shop, and checkout entry points must converge on one widget and retain state while navigating.

### 10. Resume guest intent through a validated internal continuation

Guest “Chat now” actions store only `{ shopId, returnPath, source }` in session storage and invoke the existing sign-in flow with a safe internal return path. After authentication, `ChatProvider` consumes the intent once, resolves the shop target through the authenticated API, rejects stale/self/unavailable targets, and opens the temporary composer. No user profile, message text, access token, or resolved private conversation ID is stored in the continuation.

This is preferred over storing an owner user ID before authentication because ownership can change and checkout does not currently expose it uniformly.

### 11. Apply privacy, validation, and abuse controls at every boundary

Repository queries always constrain conversation access by membership before returning participant identity, history, read state, or events. Gateway rooms are joined only after active-session verification. DTOs reject unknown fields, whitespace-only content, unsupported message types, invalid cursors/sequences, and oversized text. Message submission receives per-account and per-source bounded rate limits with retry metadata; logs include trace, account, conversation, client-message, and event identifiers but never message content or auth credentials.

When sending is prohibited but retained history remains viewable, the API returns a generic capability state rather than private moderation or account details. This preserves the UI requirement without adding block/report behavior to Change 1.

## Risks / Trade-offs

- **[The historical chat migration and actual database state may differ from the current Prisma schema]** → Add preflight queries and a forward-only reconciliation migration; stop on ambiguous duplicate/self pairs rather than deleting data.
- **[Concurrent first sends or retries could duplicate conversations/messages]** → Canonical unique user pairs, row locking, sequence constraints, request digests, and PostgreSQL concurrency tests provide layered protection.
- **[A browser timeout can race a server commit]** → Reconcile by `clientMessageId`; never auto-transmit after the deadline, but accept authoritative evidence that the original request committed.
- **[Socket events may be delayed, duplicated, or missed]** → Versioned idempotent projections plus authoritative REST snapshot/history backfill on reconnect.
- **[Outbox backlog increases realtime latency]** → Use short polling intervals, indexed pending rows, batch limits, metrics, and reconnect recovery; REST acceptance remains independent of projection latency.
- **[Process-local presence is inaccurate with multiple API replicas]** → Label it approximate, avoid exact timestamps, and document single-process scope until a Redis-backed scaling change is approved.
- **[The floating widget can interfere with checkout or mobile keyboards]** → Mount once at the shell, use safe-area and viewport-aware sizing, and verify the three required breakpoints with Playwright.
- **[Chat without blocking/reporting has limited abuse controls]** → Enforce authentication, rate limits, content bounds, session suspension, and authorization now; keep user-facing safety tools explicitly scheduled for a later change.
- **[Temporary drafts can leak across accounts on shared browsers]** → Namespace by authenticated user, clear on logout/account transition, avoid persistent storage, and never store server messages in draft storage.

## Migration Plan

1. Add contract types and migration preflight coverage without exposing UI or endpoints.
2. Inspect existing chat tables for duplicate canonical user pairs, self-pairs, missing shop owners, invalid memberships, duplicate client IDs, and sequence/read violations.
3. Add a forward migration that converts valid legacy buyer/shop rows to canonical user pairs, establishes membership/message/outbox constraints, and adds the corresponding Prisma models; stop for reviewed reconciliation if preflight finds ambiguity.
4. Deploy the chat module, REST endpoints, realtime ticket validation, gateway, and outbox dispatcher with the validated runtime limits; chat remains available when dependencies are healthy.
5. Deploy shared contracts and the web `ChatProvider`, widget, and contextual entry points after API health, migration, and multi-client smoke tests pass.
6. Verify first-message races, idempotent replay, unread/read convergence, reconnect backfill, active-session revocation, and the three responsive browser journeys.
7. Monitor Problem Details rates, send latency, socket connection failures, and outbox age after release; use the normal application rollback procedure if health degrades.

Rollback is application-level and non-destructive: revert the application code while retaining compatibility with the migrated tables, and preserve committed chat rows. Destructive schema rollback or message deletion is not automatic and requires a separately reviewed data operation.
