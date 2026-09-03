# Seller report review — implemented flow

```mermaid
sequenceDiagram
  participant Seller as Seller sở hữu shop
  participant API as API
  participant DB as Database
  participant Admin as Admin

  Seller->>API: GET /seller/reviews (projection của shop hiện sở hữu)
  API-->>Seller: Review + trạng thái report của chính seller
  Seller->>API: Báo cáo review (reviewId, reason, idempotency key)
  API->>DB: Khóa review, kiểm tra review.shop.owner = seller
  alt Không thuộc shop hoặc review không tồn tại
    DB-->>API: Không tìm thấy an toàn
    API-->>Seller: 404, không lộ review ngoài shop
  else Hợp lệ
    API->>DB: Replay idempotency / dedupe unresolved report
    DB-->>API: Receipt
    API-->>Seller: Receipt (private, no-store); review chưa đổi visibility
    Admin->>API: Xem hàng đợi review bị báo cáo
    API-->>Admin: Review + lý do/dữ liệu report an toàn
    Admin->>API: HIDE hoặc KEEP_VISIBLE
    API->>DB: Transaction: review state + aggregate (nếu hide) + resolve reports + audit
    DB-->>API: Kết quả duy nhất
    API-->>Admin: Trạng thái mới
  end
```

Liên quan tasks 1.2, 2.1, 3.1, 4.1–4.2. Ranh giới riêng tư: seller chỉ nhận receipt của mình; buyer/public không nhận seller report; admin mới nhận lý do và dữ liệu báo cáo.
