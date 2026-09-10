## Why

Search and recommendation hiện chưa có nguồn clickstream thực để phân tích hành vi hoặc xây dựng dữ liệu huấn luyện personal ranking. Shopee Clone cần một ranh giới thu thập đáng tin cậy để gửi sự kiện khám phá sản phẩm lên AWS API Gateway, nơi dữ liệu tiếp tục đi qua Glue, S3, Athena và QuickSight theo pipeline đã chọn.

## What Changes

- Định nghĩa clickstream envelope có version cho các sự kiện `search_submitted`, `product_impression`, `product_clicked`, `recommendation_impression`, `recommendation_clicked`, `favorite_changed`, `cart_changed` và `order_completed`.
- Ghi nhận context tối thiểu cần cho phân tích/ranking: event ID, UTC timestamp, surface, session, product, vị trí hiển thị, request/correlation ID và các version của projection/profile/model/script; không gửi credential, raw profile, model weights hoặc dữ liệu thanh toán.
- Thêm first-party ingestion boundary trong NestJS để xác thực event, lấy buyer identity từ session phía server, pseudonymize identifier trước khi export và không tin buyer ID do client cung cấp.
- Ghi event hợp lệ vào transactional outbox và gửi bất đồng bộ theo batch tới AWS API Gateway với idempotency, timeout, retry có exponential backoff, bounded retention và trạng thái terminal để tránh chặn search, recommendation, cart hoặc checkout.
- Cấu hình endpoint và thông tin xác thực API Gateway bằng environment/secret; cung cấp health/lag/failure metrics, privacy-safe logs và cơ chế replay có giới hạn.
- Định nghĩa integration contract tại API Gateway để downstream có thể kiểm tra schema version, event ID và batch metadata trước khi chuyển raw clickstream sang Glue → S3 → Athena → QuickSight.
- Thêm feature flags và sampling policy độc lập theo event/surface; khi pipeline analytics lỗi, nghiệp vụ buyer vẫn hoạt động và event được retry hoặc loại bỏ theo retention policy đã cấu hình.
- Chỉ lập kế hoạch cho producer và delivery boundary đến API Gateway trong change này; chưa triển khai Glue job, S3 data lake layout, Athena tables/queries, QuickSight dashboards hoặc đưa dữ liệu thu được vào model training/activation.

## Capabilities

### New Capabilities

- `clickstream-api-gateway-export`: Định nghĩa schema clickstream, first-party collection, privacy/identity boundary, durable asynchronous delivery, API Gateway contract, retry/replay, observability và failure isolation.

### Modified Capabilities

None. Search, recommendation và commerce contracts tiếp tục giữ nguyên; clickstream là side effect bất đồng bộ không làm thay đổi response nghiệp vụ.

## Impact

- **Frontend:** Bổ sung instrumentation có kiểm soát cho impression và interaction trên search, homepage recommendations, product detail, favorite và cart; không chứa AWS secret.
- **Backend:** Thêm capability NestJS cho validation, server-owned identity, pseudonymization, outbox persistence và batch dispatcher tới API Gateway.
- **Persistence:** Thêm bảng clickstream outbox/attempt hoặc mở rộng hạ tầng outbox hiện có bằng Prisma migration cộng thêm, với retention và index phục vụ lease/retry.
- **AWS integration:** Thêm contract/configuration cho HTTPS API Gateway endpoint; Glue, S3, Athena và QuickSight là downstream dependency do hạ tầng analytics sở hữu.
- **Security/privacy:** Không export access token, email, địa chỉ, raw search profile, model weights, cart totals chi tiết hoặc payment data; identifier được pseudonymize bằng key quản lý phía server.
- **Operations:** Cần secret/config cho endpoint, authentication, batch size, timeout, retry, sampling và retention; thêm metric backlog age, delivery latency, accepted/rejected/retried/dropped counts.
- **Testing:** Cần unit/contract tests cho schema và redaction, PostgreSQL integration tests cho idempotency/lease/retry, mock API Gateway tests cho batch delivery, và failure drills chứng minh analytics outage không ảnh hưởng nghiệp vụ chính.
