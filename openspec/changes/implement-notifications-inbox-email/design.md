## Context

The system has rich domain lifecycles (orders, fulfillment, returns, refunds, moderation, vouchers) spanning Buyer, Seller, and Admin actors. Currently, these operations commit domain records and audit timeline events, but lack a decoupled notification fanout mechanism. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Provide a unified in-app notification center with fast unread counting, header quick-preview popovers, and cursor-paginated queries.
- Support role-tailored notifications for Buyers (order progress, vouchers), Sellers (new orders, return requests, moderation), and Admins (dispute escalations).
- Include rich structured metadata (`targetUrl`, `thumbnailUrl`, `referenceId`) for intuitive 1-click deep navigation.
- Allow users to control notification channel subscriptions per category (Orders, Promotions, Account, System).
- Enforce delivery for mandatory transaction/security notices (payment, refund, dispute outcome).
- Ensure background email dispatching never degrades synchronous HTTP transaction latencies.
- Guarantee at-most-once user notifications per domain event via deterministic deduplication keys.

**Non-Goals:**
- Native mobile push notifications (APNs / FCM) — reserved for future mobile client initiatives.
- Realtime WebSocket push — initial release uses efficient polling and header badge queries with window focus refresh.
- Marketing email campaign builder or newsletter segmentation engine.

## Decisions

### 1. Unified Event Ingestion with Deduplication Keys & Rich Metadata

- **Decision:** All notifications are ingested with a deterministic `deduplicationKey` (e.g., `order:9bff36bf:DELIVERED`, `return:7b168290:REFUNDED`) and store structured metadata (including `targetUrl` and `thumbnailUrl`).
- **Rationale:** Prevents duplicate notification records during webhook retries, transaction replays, or concurrent worker sweeps, while equipping the frontend with all context needed to render rich cards and instant navigation links.
- **Alternatives Considered:** Relying on client-side state or timestamps was rejected due to race conditions.

### 2. Transactional Inbox Persistence & Async Outbox Delivery

- **Decision:** In-app `Notification` records are persisted immediately; external channel dispatches (`NotificationDeliveryAttempt`) are queued in PostgreSQL and processed by background worker sweeps using `FOR UPDATE SKIP LOCKED`.
- **Rationale:** Isolates external email SMTP/SES latencies and transient network failures from core buyer checkout and seller fulfillment transactions.
- **Alternatives Considered:** Synchronous HTTP email sending was rejected because third-party email provider outages would cause buyer/seller checkout failures.

### 3. Pluggable Email Transporter Interface & Responsive HTML Templates

- **Decision:** Abstract email sending through a `NotificationEmailTransporter` interface (`ConsoleEmailTransporter`, `SmtpEmailTransporter`, `SesEmailTransporter`) coupled with semantic HTML/plain-text template compilation.
- **Rationale:** Enables zero-setup local development and hermetic unit/e2e testing while supporting production AWS SES or SMTP servers via environment variables with branded Shopee-style transactional emails.

### 4. Categorized Keyset Pagination & Quick Popover

- **Decision:** In-app inbox uses keyset cursor pagination `(createdAt DESC, id DESC)` with category filtering, and supports a lightweight `limit=5` endpoint for header popovers.
- **Rationale:** Ensures fast sub-millisecond query response times regardless of inbox depth.

## Risks / Trade-offs

- **[Risk] Email delivery delay or spam filtering** → Mitigation: Record granular delivery status (`PENDING`, `DELIVERED`, `FAILED`), apply exponential retry backoff, and provide in-app inbox as the primary source of truth.
- **[Risk] Inbox table growth** → Mitigation: Add composite index on `(recipient_id, is_archived, created_at DESC)` and add background archive cleanup policies for notifications older than 90 days.
- **[Risk] Unread count query overhead** → Mitigation: Index `(recipient_id, is_read, is_archived)` for quick count aggregation.
