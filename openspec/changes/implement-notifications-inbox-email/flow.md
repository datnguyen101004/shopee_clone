# Planned System Flows: Notification Framework (T30)

> [!NOTE]
> Tài liệu này mô tả **planned flows** cho proposal T30. Các sơ đồ sẽ được cập nhật thành **implemented flows** sau khi hoàn thành bước implementation.

---

## 1. Planned Flow 1: Event Ingestion & Outbox Fanout (Tasks 2.4, 3.1, 3.2, 3.3)

Flow xử lý khi một sự kiện trong hệ thống (Order, Return, Refund, Moderation) phát sinh thông báo cho các đối tượng liên quan (Buyer, Seller, Admin).

```mermaid
sequenceDiagram
    autonumber
    actor Domain as Domain Event (Order / Return / Dispute)
    participant Engine as NotificationService
    participant DB as PostgreSQL (Prisma)
    participant Outbox as NotificationDeliveryAttempt

    Domain->>Engine: emitEvent(eventKind, payload, deduplicationKey)
    activate Engine

    Engine->>DB: Check deduplicationKey (Unique Constraint)
    alt Trùng deduplicationKey (Replay / Retry)
        DB-->>Engine: Key đã tồn tại
        Engine-->>Domain: Bỏ qua (Idempotent Ignore)
    else Key mới hợp lệ
        Engine->>Engine: Resolve Recipients (Buyer, Seller Shop Owner, Admin)
        loop For each recipient
            Engine->>DB: Query User Preferences & Mandatory Rule
            DB-->>Engine: Return Channel Preferences (In-App: On, Email: On/Off)

            rect rgb(240, 248, 255)
                Note over Engine,DB: Transactional Persistence
                Engine->>DB: INSERT INTO notifications (In-App Inbox Record with targetUrl & thumbnail)
                alt Email Channel Enabled OR Is Mandatory Notice
                    Engine->>Outbox: INSERT INTO notification_delivery_attempts (state: PENDING)
                end
            end
        end
        Engine-->>Domain: Event Ingested Successfully
    end
    deactivate Engine
```

---

## 2. Planned Flow 2: Asynchronous Email Dispatch & Retry Worker (Task 2.5)

Flow của worker chạy nền xử lý hàng đợi gửi email và cơ chế retry khi gặp lỗi mạng.

```mermaid
sequenceDiagram
    autonumber
    participant Worker as Background Dispatch Worker
    participant DB as PostgreSQL (Outbox)
    participant Adapter as NotificationEmailAdapter
    participant SES as Email Transporter (SES/SMTP/Console)

    loop Every 30s (hoặc qua Cron / EventBridge)
        Worker->>DB: SELECT * FROM notification_delivery_attempts WHERE state = 'PENDING' AND next_retry_at <= now() LIMIT 50 FOR UPDATE SKIP LOCKED
        DB-->>Worker: List pending email tasks (Locked)

        loop For each attempt
            Worker->>Adapter: renderTemplate(templateId, payload)
            Adapter-->>Worker: { subject, htmlBody, textBody }
            
            Worker->>SES: sendEmail(to, subject, htmlBody, textBody)
            alt Gửi email thành công (200 OK)
                SES-->>Worker: Success (Message ID)
                Worker->>DB: UPDATE notification_delivery_attempts SET state = 'DELIVERED', delivered_at = now()
            else Gửi email thất bại (Network Timeout / SMTP Error)
                SES-->>Worker: Error (5xx / Timeout)
                alt retryCount < maxRetries (3)
                    Worker->>DB: UPDATE notification_delivery_attempts SET state = 'PENDING', retry_count = retry_count + 1, next_retry_at = now() + backoff
                else Đã vượt quá số lần retry
                    Worker->>DB: UPDATE notification_delivery_attempts SET state = 'FAILED', last_error = error.message
                end
            end
        end
    end
```

---

## 3. Planned Flow 3: Header Popover, Inbox & Deep-Link Navigation (Tasks 4.1, 4.2)

Flow tương tác của người dùng trên giao diện web với icon chuông, popover xem nhanh và điều hướng deep-link.

```mermaid
sequenceDiagram
    autonumber
    actor User as Buyer / Seller
    participant Header as Header Bell Icon
    participant Popover as Quick Notification Popover
    participant Inbox as Inbox Page (/account/notifications)
    participant Target as Target Page (e.g. /account/orders/123)
    participant API as NotificationsController
    participant DB as PostgreSQL

    User->>Header: Truy cập trang web
    Header->>API: GET /api/v1/account/notifications/unread-count
    API->>DB: SELECT COUNT(*) WHERE recipient_id = user.id AND is_read = false AND is_archived = false
    DB-->>API: count: 3
    API-->>Header: { unreadCount: 3 }
    Header->>User: Hiển thị badge đỏ số 3 trên chuông

    User->>Header: Rê chuột (Hover) hoặc Click vào chuông
    Header->>API: GET /api/v1/account/notifications?limit=5
    API->>DB: SELECT top 5 notifications
    DB-->>API: 5 records
    API-->>Popover: Render 5 thông báo mới nhất kèm thumbnail & link
    Popover->>User: Hiển thị danh sách xem nhanh

    User->>Popover: Click vào 1 thông báo đơn hàng
    Popover->>API: POST /api/v1/account/notifications/:id/read
    API->>DB: UPDATE is_read = true
    Popover->>Target: Chuyển hướng tới targetUrl (/account/orders/123)
    Target->>User: Mở trực tiếp trang chi tiết đơn hàng
```
