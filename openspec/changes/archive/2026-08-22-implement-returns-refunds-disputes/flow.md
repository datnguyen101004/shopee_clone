# T29 — Planned critical flows

Các sơ đồ dưới đây mô tả **implemented flow** cho change `implement-returns-refunds-disputes`, đã đối chiếu với Nest returns module, PostgreSQL e2e, UI workflows, và Playwright `e2e/returns.spec.ts`.

## 1. Buyer tạo hồ sơ trả hàng

**Task liên quan:** 1.1-1.8, 2.1-2.7, 3.1, 3.4-3.7, 5.1, 6.1-6.5, 7.1-7.6, 10.1-10.6.

```mermaid
flowchart TD
    A[Buyer mở chi tiết đơn đã giao] --> B[API trả returnCapability và deadline]
    B --> C{Còn đủ điều kiện?}
    C -- Không --> D[Ẩn form và hiển thị lý do an toàn]
    C -- Có --> E[Chọn order lines và số lượng]
    E --> F[Nhập reason và description]
    F --> G[Upload 1-5 ảnh evidence]
    G --> H{File hợp lệ và thuộc buyer?}
    H -- Không --> I[Từ chối file hoặc request; không lộ asset khác]
    H -- Có --> J[Nhận opaque evidence IDs, hết hạn sau 24h]
    J --> K[POST /account/orders/:orderReference/returns]
    K --> L[Auth + Origin + strict contract validation]
    L --> M[BEGIN transaction]
    M --> N[Lock ShopOrder]
    N --> O{Idempotency key đã commit?}
    O -- Cùng digest --> P[Replay canonical result]
    O -- Khác digest --> Q[409 idempotency conflict]
    O -- Chưa có --> R{Owner + DELIVERED + <= 7 ngày + ETag đúng?}
    R -- Không --> S[404/409; rollback, không tạo dữ liệu]
    R -- Có --> T[Validate distinct lines và quantity]
    T --> U[BigInt: tính net-paid allocation từ snapshot]
    U --> V[Attach evidence thuộc buyer và chưa hết hạn]
    V --> W[Tạo ReturnRequest + items + event v0]
    W --> X[Order DELIVERED -> RETURN_REQUESTED]
    X --> Y[COMMIT]
    Y --> Z[Trả canonical detail + return ETag]
```

Điểm cần kiểm tra trực quan:

- Giá/discount lấy từ `OrderLine` đã commit, không lấy từ product hiện tại.
- Toàn bộ request, item, evidence attachment và order transition cùng commit hoặc cùng rollback.
- Unknown order và order của buyer khác có cùng biểu hiện `404`.
- Client không được gửi số tiền hoàn; server tự tính.

## 2. State machine, deadline và đồng bộ trạng thái đơn hàng

**Task liên quan:** 3.1-3.3, 3.6-3.7, 5.2-5.7, 7.4-7.5, 8.3-8.4, 9.4, 12.2-12.4.

```mermaid
stateDiagram-v2
    [*] --> REQUESTED: Buyer tạo request\nOrder -> RETURN_REQUESTED

    REQUESTED --> AWAITING_RETURN: Seller ACCEPT_RETURN
    REQUESTED --> ESCALATED: Seller REJECT_AND_ESCALATE / ESCALATE
    REQUESTED --> ESCALATED: System quá 48 giờ
    REQUESTED --> CANCELLED: Buyer CANCEL\nOrder -> DELIVERED

    AWAITING_RETURN --> IN_TRANSIT: Buyer SUBMIT_SHIPMENT
    AWAITING_RETURN --> EXPIRED: System quá 5 ngày\nOrder -> DELIVERED

    IN_TRANSIT --> REFUNDED: Seller CONFIRM_RECEIPT\nOrder -> RETURNED -> REFUNDED
    IN_TRANSIT --> ESCALATED: Seller ESCALATE
    IN_TRANSIT --> ESCALATED: System quá 7 ngày

    ESCALATED --> AWAITING_RETURN: Admin APPROVE_RETURN\nchưa có shipment
    ESCALATED --> REFUNDED: Admin APPROVE_REFUND\nOrder -> REFUNDED
    ESCALATED --> REJECTED: Admin REJECT\nOrder -> DELIVERED

    CANCELLED --> [*]
    EXPIRED --> [*]
    REJECTED --> [*]
    REFUNDED --> [*]
```

Nguyên tắc:

- Deadline được lưu thành UTC instant khi state bắt đầu, không tính lại theo đồng hồ trình duyệt.
- Foreground command luôn kiểm tra deadline dưới lock; deadline worker chạy trễ không làm action hết hạn trở nên hợp lệ.
- Mỗi transition sinh một `ReturnEvent`; mỗi thay đổi order sinh một `OrderTimelineEvent` với version liên tục.
- Từ chối, hủy hoặc hết hạn chỉ đảo trạng thái order về `DELIVERED`; không xóa lịch sử request.

## 3. Race condition, idempotency và thứ tự lock

**Task liên quan:** 2.3-2.5, 3.6, 4.3, 5.1-5.8, 8.3-8.5, 9.4-9.6, 12.5.

```mermaid
sequenceDiagram
    autonumber
    participant S as Seller/Admin/Buyer
    participant W as Deadline worker
    participant API as Return service
    participant DB as PostgreSQL

    par Hai command cùng nhắm version N
        S->>API: action + If-Match return-N + Idempotency-Key A
    and
        W->>API: overdue transition + deterministic key B
    end

    API->>DB: BEGIN
    API->>DB: SELECT ShopOrder FOR UPDATE
    DB-->>API: order lock
    API->>DB: SELECT ReturnRequest FOR UPDATE
    DB-->>API: return lock, state/version hiện tại
    API->>DB: Lookup idempotency key trước state validation

    alt Key đã commit, digest giống
        DB-->>API: previous event/result identity
        API-->>S: replay canonical result
    else Key đã commit, digest khác
        API-->>S: 409 IDEMPOTENCY_CONFLICT
    else Version/state/deadline còn hợp lệ
        API->>DB: Update state/version + append event
        API->>DB: COMMIT
        API-->>S: canonical result + new ETag
    else Command kia đã thắng
        API->>DB: ROLLBACK
        API-->>S: 409 STALE_RETURN_VERSION / current state
    end
```

Thứ tự lock bắt buộc ở mọi mutation:

```text
ShopOrder -> ReturnRequest -> dependent rows read/write
```

Không có code path nào được lock `ReturnRequest` trước rồi quay lại lock `ShopOrder`; quy tắc này ngăn vòng chờ giữa seller, admin và deadline worker.

## 4. Transaction hoàn tiền, audit và rollback

**Task liên quan:** 2.1-2.7, 3.3-3.6, 5.3-5.6, 9.1-9.6, 12.1-12.5.

```mermaid
flowchart TD
    A[Admin APPROVE_REFUND hoặc Seller CONFIRM_RECEIPT] --> B[Auth/scope + ETag + idempotency]
    B --> C[BEGIN; lock ShopOrder rồi ReturnRequest]
    C --> D{State và actor action hợp lệ?}
    D -- Không --> E[ROLLBACK và 409]
    D -- Có --> F[Revalidate item allocation từ persisted snapshots]
    F --> G{Goods đã được seller nhận?}
    G -- Có --> H[Append order RETURNED event]
    G -- Không --> I[Refund-only path]
    H --> J[Append order REFUNDED event]
    I --> J
    J --> K[Set ReturnRequest REFUNDED + append ReturnEvent]
    K --> L[Insert unique MOCK_CREDIT RefundLedgerEntry]
    L --> M{Admin-authored?}
    M -- Có --> N[Insert ReturnDecision]
    N --> O[Insert correlated PrivilegedAuditEvent]
    M -- Không --> P[Không tạo privileged audit]
    O --> Q[Project canonical result]
    P --> Q
    Q --> R{Mọi write thành công?}
    R -- Có --> S[COMMIT]
    R -- Không --> T[ROLLBACK tất cả]
    S --> U[Response + new ETag]
```

Invariant sau commit:

```text
ReturnRequest.status = REFUNDED
RefundLedgerEntry count for return = 1
Order status = REFUNDED
Return event versions liên tục
Order event versions liên tục
Admin decision hiệu lực => đúng 1 privileged audit correlation
```

Nếu bất kỳ insert/update nào thất bại, không được tồn tại trạng thái nửa chừng như “đã refund nhưng chưa có ledger” hoặc “đã audit nhưng order chưa đổi”.

## 5. Ranh giới dữ liệu theo vai trò

**Task liên quan:** 1.2-1.7, 4.1-4.7, 6.3-6.5, 7.1-7.6, 8.1-8.5, 9.1-9.6, 11.1-11.7.

```mermaid
flowchart LR
    subgraph Clients[Client boundaries]
        B[Buyer UI]
        S[Seller Center]
        A[Admin Console]
    end

    subgraph API[Role-specific API/projectors]
        BP[Buyer projector\nowner only]
        SP[Seller projector\nown shop only]
        AP[Admin projector\ncurrent admin only]
        EP[Evidence authorization]
    end

    subgraph Private[Private persistence]
        R[(Return + items + public events)]
        E[(Evidence metadata + object)]
        N[(Admin internal note)]
        L[(Refund ledger)]
        AU[(Privileged audit safe summary)]
    end

    B --> BP
    S --> SP
    A --> AP
    BP --> R
    SP --> R
    AP --> R
    BP --> EP
    SP --> EP
    AP --> EP
    EP --> E
    AP --> N
    AP --> L
    A --> AU

    N -. Không đi vào .-> BP
    N -. Không đi vào .-> SP
    E -. storage key không đi vào JSON .-> BP
    E -. storage key không đi vào JSON .-> SP
    E -. storage key không đi vào JSON .-> AP
    N -. Không đi vào audit summary .-> AU
```

Ma trận dữ liệu dự kiến:

| Dữ liệu                       | Buyer               | Seller của shop | Admin | Public/khác shop |
| ----------------------------- | ------------------- | --------------- | ----- | ---------------- |
| Order-line snapshot được trả  | Có, của chính buyer | Có, của shop    | Có    | Không            |
| Buyer description + evidence  | Có                  | Có              | Có    | Không            |
| Seller public reason          | Có                  | Có              | Có    | Không            |
| Admin public decision reason  | Có                  | Có              | Có    | Không            |
| Admin internal note           | Không               | Không           | Có    | Không            |
| Evidence storage key/path     | Không               | Không           | Không | Không            |
| Safe privileged audit summary | Không               | Không           | Có    | Không            |

## 6. Planned API verification map

| API                                                     | Happy path cần test                                           | Nhánh lỗi/race cần test                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST /api/v1/account/return-evidence`                  | Upload ảnh hợp lệ, trả opaque ID                              | MIME giả, file hỏng, quá dung lượng/kích thước, thiếu auth                                           |
| `POST /api/v1/account/orders/:orderReference/returns`   | Partial return, amount đúng, evidence attach, order đổi state | Foreign/unknown, hết 7 ngày, stale ETag, duplicate line, quá quantity, key replay/conflict, rollback |
| `GET /api/v1/account/returns`                           | Filter + cursor ổn định                                       | Cursor khác filter, invalid query, không lộ return khác                                              |
| `GET /api/v1/account/returns/:returnReference`          | Detail/timeline/evidence đúng vai trò                         | Unknown/foreign giống nhau, internal note bị loại                                                    |
| `POST /api/v1/account/returns/:returnReference/actions` | Cancel và submit mock shipment                                | Sai state, quá deadline, stale/replay/race                                                           |
| `GET /api/v1/seller/returns`                            | Queue đúng shop/filter/deadline                               | Non-seller, cross-shop, cursor invalid                                                               |
| `GET /api/v1/seller/returns/:returnReference`           | Evidence và actions đúng shop                                 | Cross-shop 404, không lộ internal note                                                               |
| `POST /api/v1/seller/returns/:returnReference/actions`  | Accept, reject/escalate, receipt/refund                       | Deadline-worker race, admin race, duplicate receipt/ledger                                           |
| `GET /api/v1/admin/returns`                             | Escalated queue + reference search                            | Non-admin, invalid filter/cursor                                                                     |
| `GET /api/v1/admin/returns/:returnReference`            | Full adjudication context                                     | Non-admin, unavailable/corrupt invariant                                                             |
| `POST /api/v1/admin/returns/:returnReference/decisions` | Approve return/refund, reject + audit                         | Stale decision, invalid state, key conflict, ledger/audit rollback                                   |
| `GET /api/v1/return-evidence/:evidenceId`               | Buyer/shop/admin authorized read                              | Guest, other buyer/shop, staged/expired/unknown asset                                                |
