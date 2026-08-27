## 1. Contracts, Dependencies, and Configuration

- [x] 1.1 Add framework-neutral chat identifiers, DTO shapes, paginated responses, realtime event envelopes, presence states, bounds, runtime parsers, and Problem Details contracts to `packages/contracts`.
- [x] 1.2 Add contract tests for exact-key validation, cursors/sequences, message bounds, event versions, idempotency conflicts, and unsupported rich-message payloads.
- [x] 1.3 Add compatible NestJS Socket.IO server packages and `socket.io-client`, then document and validate ticket TTL, presence lease, outbox batch, and chat rate-limit configuration with safe local defaults.
- [x] 1.4 Add chat capability exports and dependency boundaries without exposing Prisma, NestJS, or Socket.IO types through shared contracts.

## 2. Chat Foundation Reconciliation and Persistence

- [x] 2.1 **Critical — migration/privacy:** Implement a read-only preflight that reports legacy duplicate canonical pairs, self-pairs, missing shop owners, invalid memberships, duplicate client IDs, and sequence/read violations without logging message content.
- [x] 2.2 **Critical — migration:** Create a forward Prisma migration that converts valid buyer/shop conversations to canonical user pairs and stops on ambiguous data instead of editing the historical chat-foundation migration.
- [x] 2.3 Add Prisma models and database constraints for canonical conversations, two participant memberships, ordered text messages, request digests, read/unread state, and chat outbox rows while leaving out-of-scope tables unexposed.
- [x] 2.4 Add keyset and lookup indexes for canonical pair resolution, contact ordering/search, participant unread totals, message history, client-message idempotency, and pending outbox claims.
- [x] 2.5 Add isolated PostgreSQL migration tests covering empty databases, valid legacy conversion, duplicate/self-pair refusal, invariant checks, and preservation of existing ordered messages.

## 3. Backend Chat Domain and REST API

- [x] 3.1 Create the NestJS chat module, DTOs, exception filter, stable Problem Details errors, service boundaries, and repository interfaces.
- [x] 3.2 Implement authenticated shop-target resolution that returns the current owner chat identity, detects self-chat, and refuses unavailable or stale targets.
- [x] 3.3 Implement participant-scoped keyset conversation listing, contact search, authoritative unread totals, and lightweight unread-count queries.
- [x] 3.4 Implement participant-scoped stable message history for `beforeSequence` pagination and mutually exclusive `afterSequence` reconnect backfill.
- [x] 3.5 **Critical — concurrency/idempotency:** Implement one-transaction first-message materialization with canonical-pair uniqueness, stable row locking, two memberships, sequence allocation, request digest validation, summary update, unread increment, and outbox insertion.
- [x] 3.6 **Critical — state consistency:** Implement monotonic `throughSequence` read updates, bounded requested sequences, sender watermark advancement, transactional unread recomputation, and deduplicated outbox insertion.
- [x] 3.7 Implement per-account and per-source message rate limiting, 2,000-character text validation, unknown-field rejection, unsupported-message rejection, and privacy-safe structured logging.
- [x] 3.8 Expose and document the target, conversation list, unread count, message history/backfill, send message, read watermark, and realtime-ticket endpoints under `/api/v1/chat` with no-store caching and bearer authentication.
- [x] 3.9 Add Jest service tests for canonicalization, no-empty-conversation behavior, exact replay, digest conflict, sequence allocation, read monotonicity, forbidden history, and generic send-prohibition responses.
- [x] 3.10 Add PostgreSQL/Supertest tests for every chat endpoint, including validation, authentication, non-participant access, pagination boundaries, concurrent first sends, duplicate replay, stale read updates, and suspended sessions.

## 4. Realtime Projection, Presence, and Recovery

- [x] 4.1 Implement short-lived audience-scoped realtime tickets tied to an active account/session and reject expired, wrong-origin, revoked, or suspended connections.
- [x] 4.2 Implement the Socket.IO gateway with private user rooms and versioned message, conversation, read, unread, and presence projection events containing only participant-authorized contract fields.
- [x] 4.3 **Critical — exactly-once projection effects:** Implement a bounded `FOR UPDATE SKIP LOCKED` chat outbox dispatcher with deduplication, capped retry/backoff, metrics, and content-free failure logs.
- [x] 4.4 Implement approximate process-local presence with per-user connection counts, activity leases, disconnect grace, and only `ACTIVE`/`INACTIVE` disclosure.
- [x] 4.5 **Critical — recovery/multi-tab:** Add multi-client integration tests for delayed/duplicate events, reconnect snapshot and `afterSequence` backfill, cross-tab unread/read convergence, connection revocation, and outbox retry.

## 5. Web Chat State and API Integration

- [x] 5.1 Add a typed web chat API client that parses all REST responses and Problem Details, uses `authenticatedFetch`, and never trusts malformed payloads.
- [x] 5.2 Add `ChatProvider` beneath `AuthSessionProvider`, mounted once by `StorefrontShell`, to own widget, contacts, selected conversation, messages, drafts, unread totals, and realtime lifecycle across route navigation.
- [x] 5.3 Implement authenticated-user-scoped versioned `sessionStorage` for temporary targets, widget state, and per-recipient drafts, clearing it on logout, account change, malformed state, or session end.
- [x] 5.4 **Critical — send state machine:** Implement unique client message attempts, pending bubbles, the three-second automatic-transmission cutoff, safe draft restoration, manual resend with a new ID, and acknowledgement reconciliation by the original ID.
- [x] 5.5 Implement deterministic merge logic for REST pages, realtime events, reconnect backfill, contact ordering, unread totals, read watermarks, and pending/accepted message identities.
- [x] 5.6 Implement guest chat continuation using only `{ shopId, returnPath, source }`, safe internal return-path validation, one-time post-login consumption, and stale/self/unavailable target rejection.
- [x] 5.7 Add provider and API-client tests for malformed contracts, draft isolation, account transitions, expired attempts, late acceptance reconciliation, reconnect deduplication, and multi-tab event convergence.

## 6. Floating Widget and Contextual Entry Points

- [x] 6.1 Build the global chat trigger with accessible open/close names, exact unread badge through 99, `99+` overflow, focus return, and viewport safe-area placement.
- [x] 6.2 Build the two-column floating widget shell with desktop, tablet, and mobile contact-rail layouts, open/close transitions, reduced-motion behavior, and no page-level horizontal overflow.
- [x] 6.3 Build the contact column with skeleton, empty, error/retry, search, stable latest-message ordering, selected state, unread/presence indicators, and draft-discard confirmation.
- [x] 6.4 Build the conversation header and stable message history with grouping, date boundaries, older-page scroll anchoring, sent/read labels, reconnect banner, and generic forbidden state.
- [x] 6.5 Implement the “New message” marker and scroll behavior so arrivals do not move users reading older history, while explicit chat focus or contact selection advances the read watermark.
- [x] 6.6 Build the multiline text composer with Enter/Shift+Enter behavior, whitespace-only prevention, pending/failed bubbles, safe failed-content restoration, and no rich-message controls.
- [x] 6.7 Add “Chat now” actions to product detail and public shop detail, resolve the selected shop through `ChatProvider`, and preserve disabled self-shop layout with explanatory hover/focus text.
- [x] 6.8 Add one “Chat now” action to each checkout shop header without mutating shipping, shop notes, vouchers, or payment state, including disabled self-shop behavior.
- [x] 6.9 Add component tests for all loading, empty, temporary, success, offline, reconnecting, forbidden, send-failure, unread, read, self-chat, and draft-confirmation states.
- [x] 6.10 Add keyboard and assistive-technology tests for dialog naming, focus order, Escape behavior, live announcements, 44 × 44 px targets, non-color status cues, and reduced motion.

## 7. End-to-End Verification and Rollout

- [x] 7.1 Add Playwright fixtures for two authenticated accounts, one single-owner shop, multiple tabs, deterministic message cleanup, and controllable network interruption.
- [x] 7.2 Verify the product-detail, shop-detail, checkout, guest-login-resume, self-shop-disabled, and no-empty-conversation journeys at 360 × 800, 768 × 1024, and 1440 × 900.
- [x] 7.3 Verify first-message races, the three-second cutoff, manual resend, late acknowledgement, stable older-history pagination, new-message navigation, read watermark, and multi-tab convergence end to end.
- [x] 7.4 Run accessibility checks, contract tests, API unit/integration/PostgreSQL suites, web component tests, realtime multi-client tests, typecheck, lint, production builds, migration preflight, and OpenSpec strict validation. Verification completed; the read-only preflight correctly halted on one pre-existing legacy conversation with an invalid membership count, so no unsafe data mutation was performed.
- [x] 7.5 Exercise realtime ticket rejection, outbox health/age metrics, privacy-safe logs, and non-destructive rollback readiness in the local environment; chat has no feature-disable flag and remains available when dependencies are healthy.
- [x] 7.6 After implementation and verification, create `flow.md` in Vietnamese with an easy-to-understand user/business flow, visible success/error/retry behavior, and at least one realistic example, without code or architecture descriptions.
