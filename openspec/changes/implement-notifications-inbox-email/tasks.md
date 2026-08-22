## 1. Contracts and Persistence

- [x] 1.1 Define notification types, categories, channel enums, rich metadata schemas, preference request/response DTOs, and error codes in `@shopee-clone/contracts`
- [x] 1.2 Add Prisma schema models (`Notification`, `NotificationPreference`, `NotificationDeliveryAttempt`, `NotificationTemplate`) with unique deduplication, foreign keys, and performance indexes
- [x] 1.3 Create and verify Prisma migration `20260823000000_notification_framework` and run schema verification tests

## 2. Backend Notification Engine and Email Adapter

- [x] 2.1 Implement `NotificationRepository` supporting unread count queries, category filtering, cursor pagination, and quick popover slicing
- [x] 2.2 Implement `NotificationPreferenceService` to manage user subscriptions and enforce non-opt-outable mandatory alerts
- [x] 2.3 Implement `NotificationEmailAdapter` with pluggable transporters (`ConsoleEmailTransporter`, `SmtpEmailTransporter`, `SesEmailTransporter`) and branded HTML/plaintext template compiler
- [x] 2.4 Implement `NotificationService` for idempotent event ingestion, rich metadata formatting, role-scoped dispatching, in-app notification creation, and background delivery queueing
- [x] 2.5 Implement background delivery runner script (`scripts/process-notification-outbox.ts`) using `FOR UPDATE SKIP LOCKED` and exponential retry
- [x] 2.6 Implement `NotificationsController` with endpoints for inbox query, unread counter, single/bulk mark-as-read, archival, and preference management

## 3. Domain Event Integrations

- [x] 3.1 Integrate notification triggers for order lifecycle events (`ORDER_CONFIRMED`, `SHIPPING`, `DELIVERED`, `CANCELLED`) for both buyer and seller shop owners
- [x] 3.2 Integrate notification triggers for return & refund lifecycle events (`RETURN_REQUESTED`, `RETURN_ACCEPTED`, `DISPUTE_ESCALATED`, `REFUNDED`) spanning buyer, seller, and admin roles
- [x] 3.3 Integrate notification triggers for moderation notices (product approved/rejected) and seller voucher assignment events

## 4. Frontend UI Components and Workflows

- [x] 4.1 Implement header notification bell icon with real-time/polling unread badge and quick preview popover (5 latest notifications) in `MarketplaceHeader` and `SellerCenterLayout`
- [x] 4.2 Build notification inbox page at `/account/notifications` with category tabs (`Tất cả`, `Đơn hàng`, `Khuyến mãi`, `Hệ thống`), deep-link click navigation, mark-all-as-read button, and cursor pagination
- [x] 4.3 Build notification settings view in Account Settings (`/account/profile/notifications`) to toggle email and in-app preferences per category

## 5. Testing and Validation

- [x] 5.1 Add contract and unit tests for notification DTOs, preference rules, deduplication, and template rendering
- [x] 5.2 Add API integration tests for unread counting, pagination, outbox dispatching, and retry mechanisms
- [x] 5.3 Add Playwright E2E test verifying notification bell badge update, popover interaction, and deep-link navigation on order state changes
