# T28 — Product/shop moderation and user reporting flows

Trạng thái: **Implementation hoàn tất, verification còn mở**. Các sơ đồ mô tả implementation, test, locking, rate limiting và aggregate consistency; các hạng mục E2E full-stack còn thiếu được ghi rõ trong task và verification report.

## 1. Bản đồ các nhóm task quan trọng

```mermaid
flowchart LR
    A["Buyer report<br/>Tasks 3.1–3.8"] --> B["Rate limit + dedupe<br/>Tasks 2.3, 3.2, 3.4–3.5"]
    B --> C["Moderation case<br/>Tasks 4.1–4.4"]
    C --> D["Decision + reversal<br/>Tasks 4.5–4.7"]
    D --> E["Product/shop enforcement<br/>Tasks 7.1–7.3"]
    D --> F["Seller notice<br/>Tasks 6.1–6.4"]
    D --> G["Privileged audit<br/>Task 4.8"]
    H["Review hide/restore<br/>Tasks 5.1–5.3"] --> G
    H --> I["Rating aggregates"]
```

## 2. Report validation, idempotency, rate limit và case aggregation

Task liên quan: `2.3`, `3.1–3.5`, `3.7–3.8`.

```mermaid
flowchart TD
    R["POST /api/v1/reports"] --> Auth{"Authenticated buyer?"}
    Auth -- No --> Deny["401 / 403<br/>No write"]
    Auth -- Yes --> Replay{"Idempotency key exists?"}
    Replay -- Same digest --> Original["Replay original receipt<br/>Do not consume quota"]
    Replay -- Different digest --> Conflict["409 idempotency conflict<br/>No write"]
    Replay -- New key --> Target{"Public product/shop<br/>and not self-owned?"}
    Target -- No --> NotFound["Sanitized rejection<br/>No accepted report"]
    Target -- Yes --> ReporterLock["Lock reporter"]
    ReporterLock --> Limit{"20 attempts/hour<br/>10 accepted/24h?"}
    Limit -- Exhausted --> TooMany["429 + Retry-After<br/>No report"]
    Limit -- Available --> TargetLock["Lock reporter + target"]
    TargetLock --> Duplicate{"Unresolved report<br/>already exists?"}
    Duplicate -- Yes --> Existing["Return existing receipt<br/>Do not increment case"]
    Duplicate -- No --> Case{"Active target case exists?"}
    Case -- No --> CreateCase["Create one OPEN case"]
    Case -- Yes --> ReuseCase["Reuse active case"]
    CreateCase --> Attach["Insert report + evidence<br/>Update count/activity/event"]
    ReuseCase --> Attach
    Attach --> Commit["Atomic commit"]
```

### Race cần chặn: hai report đầu tiên cùng target

```mermaid
sequenceDiagram
    participant B1 as Buyer A
    participant B2 as Buyer B
    participant API
    participant DB

    par Concurrent requests
        B1->>API: Report Product X
        B2->>API: Report Product X
    end
    API->>DB: Target advisory lock
    API->>DB: Find/create active case
    DB-->>API: One case C1
    API->>DB: Attach both accepted reports to C1
    Note over DB: Partial unique index prevents a second active case
```

## 3. Case state và optimistic concurrency

Task liên quan: `4.1–4.4`, `8.4–8.5`.

```mermaid
stateDiagram-v2
    [*] --> OPEN: First accepted report
    OPEN --> IN_REVIEW: Assign or add private note
    IN_REVIEW --> IN_REVIEW: Reassign / unassign / add note
    OPEN --> RESOLVED: Direct decision
    IN_REVIEW --> RESOLVED: NO_ACTION / SUSPEND / RESTORE
    RESOLVED --> RESOLVED: Reversal decision keeps history
    RESOLVED --> NEW_CASE: Later buyer report creates a new case
```

```mermaid
sequenceDiagram
    participant A as Admin A
    participant B as Admin B
    participant DB

    A->>DB: Assign case, expectedVersion=4
    DB-->>A: Success, version=5
    B->>DB: Add note, expectedVersion=4
    DB-->>B: 409 stale version + current safe state
    Note over B,DB: No note or partial event is stored
```

## 4. Atomic decision và reversal

Task liên quan: `4.5–4.9`, `6.1`, `7.3`.

```mermaid
flowchart TD
    D["Admin submits decision<br/>expectedVersion + Idempotency-Key"] --> Lock["Lock command, case, then target"]
    Lock --> Valid{"Version and policy valid?"}
    Valid -- No --> Abort["409 / validation error<br/>Rollback all"]
    Valid -- Yes --> TX

    subgraph TX["One PostgreSQL transaction"]
        T1["Apply product/shop state"]
        T2["Append ModerationDecision"]
        T3["Resolve case and reports"]
        T4["Append case event"]
        T5["Create seller-safe notice<br/>only on effective change"]
        T6["Append one privileged audit"]
    end

    TX --> Done{"Every write succeeds?"}
    Done -- Yes --> Commit["Commit and replayable response"]
    Done -- No --> Rollback["Rollback every write"]
```

### Reversal giữ lịch sử, không xóa quyết định cũ

```mermaid
flowchart LR
    D1["Decision D1: SUSPEND"] --> S["Target suspended"]
    S --> D2["Decision D2: RESTORE<br/>reversesDecisionId = D1"]
    D2 --> Policy{"Current restore policy passes?"}
    Policy -- No --> Reject["409, keep suspended"]
    Policy -- Yes --> Active["Moderation active<br/>other eligibility still applies"]
    D1 -. retained .-> History["Immutable history"]
    D2 -. appended .-> History
```

## 5. Enforcement xuyên public và commerce flow

Task liên quan: `7.1–7.3`.

```mermaid
flowchart TD
    State["Product moderation + Shop operational state"] --> Predicate["Shared eligibility predicate"]
    Predicate --> Catalog["Catalog / search / homepage"]
    Predicate --> Detail["Product detail / storefront"]
    Predicate --> Cart["Cart add/update/read"]
    Predicate --> Quote["Authoritative quote"]
    Predicate --> Checkout["Checkout + inventory reservation"]
    Catalog --> Block{"Suspended?"}
    Detail --> Block
    Cart --> Block
    Quote --> Block
    Checkout --> Block
    Block -- Yes --> Reject["Hide or reject as unavailable<br/>No new order"]
    Block -- No --> Other["Continue only if lifecycle,<br/>category, variant and stock pass"]
```

## 6. Review moderation và aggregate consistency

Task liên quan: `5.1–5.3`.

```mermaid
flowchart TD
    Action["Admin HIDE / RESTORE review"] --> ReviewLock["Lock review + check version"]
    ReviewLock --> RT
    subgraph RT["One transaction"]
        V["Update visibility + version"]
        M["Append ReviewModerationEvent"]
        P["Recompute product rating"]
        S["Recompute shop rating"]
        A["Append privileged audit"]
    end
    RT --> Public["Public review and aggregates agree"]
    RT --> Author["Author retains safe hidden-state read"]
```

## 7. Privacy boundaries

Task liên quan: `4.3`, `4.8`, `6.4`, `8.8`.

```mermaid
flowchart TD
    Data["Moderation data"] --> Reporter
    Data --> Seller
    Data --> Admin
    Reporter["Reporter projection"] --> R["Own receipt, target snapshot,<br/>reason code, SUBMITTED/REVIEWED"]
    Seller["Seller projection"] --> S["Affected target, SUSPENDED/RESTORED,<br/>seller-safe reason, read state"]
    Admin["Admin-private projection"] --> A["Evidence, opaque reporter IDs,<br/>assignment, private notes, decisions"]
    A -. never exposed .-> R
    A -. never exposed .-> S
    R -. reporter identity never exposed .-> S
```

## 8. Browser verification: reporting and moderation journey

**Liên quan:** Task 8.2, 8.5, 8.7 và 9.5
**Mục tiêu:** Kiểm tra hành vi người dùng, khả năng truy cập và bố cục responsive của các màn hình mới mà không nhầm lẫn với kiểm thử giao dịch cơ sở dữ liệu.

```mermaid
flowchart LR
    A[Buyer mở trang sản phẩm hoặc shop thật] --> B[Mở ReportTargetDialog]
    B --> C{Evidence URL hợp lệ?}
    C -- http hoặc sai định dạng --> D[Chặn tại UI và hiện lỗi]
    C -- https hoặc không có --> E[Gửi report với idempotency key]

    E --> F[Buyer xem Report History]
    F --> G[Admin queue: quyết định + private note tùy chọn]
    G --> H[Admin ẩn review theo case]
    H --> I[Seller mở notice và đánh dấu đã đọc]

    B -. focus trap, Escape, trả focus .-> J[Axe + keyboard checks]
    F -. mobile / tablet / desktop .-> J
    G -. mobile / tablet / desktop .-> J
    I -. mobile / tablet / desktop .-> J
```

| Phần được kiểm tra | Cách kiểm tra | Ranh giới cần nhớ |
|---|---|---|
| Gửi report ở trang sản phẩm/shop | Render trang storefront thật; chỉ chặn request tạo report để kiểm tra payload | Không ghi dữ liệu test vào môi trường phát triển. |
| Lịch sử report, admin queue/review, seller notice | Browser chạy với API state giả lập xác định trước | Xác nhận UI, role flow, lỗi và payload; **không** thay thế kiểm thử transaction/PostgreSQL thật. |
| Accessibility và responsive | Axe, focus dialog, Escape/Tab, kích thước mobile/tablet/desktop | Bao gồm những màn hình T28 mới có trong luồng trên. |

> Kiểm thử browser không chứng minh rằng quyết định moderation đã làm sản phẩm biến mất khỏi catalogue hoặc bị từ chối ở checkout. Điều đó cần một E2E full-stack với dữ liệu cô lập và sẽ được giữ ở Task 9.4.
