## Why

The platform supports critical buyer, seller, and admin lifecycles (orders, fulfillments, returns, refunds, moderation, and promotions), but users currently have no unified notification center to track updates asynchronously. T30 introduces a multi-channel notification framework providing an in-app notification inbox, header quick-preview popover, unread count indicators, user channel preferences, and reliable background email delivery for all marketplace roles (Buyer, Seller, Admin).

## What Changes

- Add an in-app notification system with real-time/polling unread counters, category filtering (Orders, Promotions, Account, System), cursor pagination, mark-as-read, and archive operations.
- Add deep-linking and rich metadata support (e.g. thumbnail images, direct target URLs like `/account/orders/:id` or `/seller/returns/:id`, and monetary summaries) for instant one-click navigation.
- Add a header notification bell popover displaying the 5 latest notifications with instant read-state transitions and a "View All" link to `/account/notifications`.
- Support role-tailored notifications:
  - **Buyer notices:** Order state transitions, delivery alerts, refund updates, voucher drops, moderation responses.
  - **Seller notices:** New orders to fulfill, buyer return requests, dispute escalations, product moderation outcomes.
  - **Admin alerts:** Escalated dispute resolution queues and seller report submissions.
- Add user notification preferences allowing users to toggle in-app and email channels per category, while strictly enforcing mandatory delivery for safety and transactional updates (e.g. order placed, payment, refund, dispute decisions).
- Add a persistent notification event pipeline triggered by marketplace lifecycles with strict deduplication keys (idempotency).
- Implement background email dispatching with exponential backoff retry for transient network failures and delivery audit tracking (`PENDING`, `DELIVERED`, `FAILED`).
- Implement an email notification adapter with responsive HTML/plain-text email templates, supporting local console logging and production SMTP/SES integration without blocking synchronous HTTP request flows.

## Capabilities

### New Capabilities

- `notification-inbox`: In-app notification center, header quick popover, unread badges, rich metadata & deep links, category filtering, single/bulk mark-as-read, and archival.
- `notification-preferences`: Channel subscription settings per notification category, honoring mandatory system-notice rules.
- `notification-delivery-engine`: Event ingestion, role-scoped routing, payload validation, idempotency deduplication, template versioning, and background delivery orchestration.
- `email-notification-adapter`: Email transporter adapter with responsive HTML rendering, transactional email layouts, and delivery status tracking.

### Modified Capabilities

<!-- No existing spec requirements modified -->

## Impact

- **Tracking:** Implements GitHub issue #31 (T30). Blocked by T20, T25, T28, and T29.
- **Contracts:** Defines notification models, notification types, category enums, preference requests/responses, rich metadata schemas, and cursor pagination DTOs in `@shopee-clone/contracts`.
- **Backend:** Adds `NotificationModule` under `apps/api/src/notifications`, background dispatch worker scripts (`pnpm notifications:dispatch`), and lifecycle event listeners/subscribers.
- **Persistence:** Adds Prisma models (`Notification`, `NotificationPreference`, `NotificationDeliveryAttempt`, `NotificationTemplate`) with unique deduplication indexes and efficient recipient-query indexes.
- **Frontend:** Adds notification bell with unread badge and quick popover in `MarketplaceHeader` and `SellerCenterLayout`, notification inbox page (`/account/notifications`), and notification settings view in Account settings.
- **Testing:** Unit, e2e, and integration tests for deduplication, preference enforcement, retry logic, rich deep-linking, and UI inbox interactions.
