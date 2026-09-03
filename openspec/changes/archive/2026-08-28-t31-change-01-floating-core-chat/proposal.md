## Why

Marketplace users currently have no usable way to contact another account while viewing products, shops, or checkout. The existing database migration is not exposed through application contracts, APIs, or UI, so T31 Change 1 is needed to deliver a coherent text-chat baseline without introducing separate buyer, seller, or full-page chat experiences.

## What Changes

- Add one global, responsive two-column floating chat widget as the only chat surface across the marketplace.
- Add contextual “Chat now” entry points on product detail, shop detail, and each shop section in checkout, resolving every shop to its single owner account and preventing self-chat.
- Preserve the intended chat target across authentication and reopen a temporary composer after successful sign-in without creating an empty conversation.
- Materialize a contact and persisted conversation only after the first text message is accepted successfully; opening or drafting alone creates no conversation, unread count, or notification.
- Support authenticated user-to-user text messaging with stable history ordering, pagination, idempotent sends, unread totals, per-conversation read watermarks, approximate presence, and cross-tab consistency.
- Provide realtime delivery and reconnection behavior while limiting an interrupted send attempt to three seconds; after that window the client marks the attempt failed and never resends it automatically.
- Add responsive, loading, empty, offline, forbidden, send-failure, draft-protection, keyboard, reduced-motion, and assistive-technology behavior defined by the approved UI/UX specification.
- Keep attachments, rich message cards, blocking, reporting, moderation, message editing/deletion, full-page chat, and aggregated closed-chat notifications outside this change.

## Capabilities

### New Capabilities

- `floating-core-chat`: Covers the floating marketplace chat surface, contextual shop-owner targeting, conversation materialization, text-message delivery, history, read/unread state, presence, reconnection, and accessibility behavior.

### Modified Capabilities

None.

## Impact

- **Frontend:** The shared storefront shell, product detail, public shop storefront, checkout shop sections, authentication continuation state, responsive styling, and browser tests.
- **Backend:** A new chat capability module, authenticated REST and realtime boundaries, authorization checks, idempotent message handling, read-state updates, and presence tracking.
- **Contracts:** Framework-neutral chat request/response, event, cursor, validation, and Problem Details contracts in `packages/contracts`.
- **Persistence:** Reconciliation of the existing chat-foundation migration with the current Prisma schema, user-to-user conversation identity, ordered messages, membership/read state, and indexes supporting conversation and unread queries.
- **Dependencies and operations:** A supported NestJS realtime transport, authenticated connection handling, local configuration, OpenAPI documentation for REST endpoints, and observability for connection and delivery failures.
- **Testing:** Contract, unit, integration, PostgreSQL concurrency/idempotency, multi-client realtime, and Playwright coverage at 360 × 800, 768 × 1024, and 1440 × 900.
