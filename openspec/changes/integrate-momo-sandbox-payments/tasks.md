## 1. Baseline và hợp đồng thanh toán

- [x] 1.1 Ghi nhận baseline test của checkout COD, multi-shop order, inventory reservation, voucher và seller fulfillment trước khi sửa.
- [x] 1.2 Rà soát tài liệu MoMo sandbox hiện hành cho create/query/refund/IPN, canonical field order, result code, amount limit và yêu cầu URL; lưu link/phiên bản tài liệu trong tài liệu vận hành.
- [x] 1.3 Định nghĩa shared API contracts cho `COD | MOMO`, payment reference, payment status chuẩn hóa, expiry và payment instructions mà không lộ payload provider.
- [x] 1.4 Định nghĩa state-transition table và precedence cho created/pending/unknown/paid/failure/cancel/expiry/refund, kèm unit test phủ mọi transition hợp lệ và bị từ chối.
- [x] 1.5 Bổ sung feature flag và schema cấu hình MoMo sandbox; kiểm tra fail-fast khi enabled thiếu credential, callback không HTTPS hoặc payment TTL vượt inventory hold TTL.

## 2. Persistence và migration

- [x] 2.1 Mở rộng Prisma payment method/status bằng các giá trị MoMo/lifecycle theo design mà không thay đổi fulfillment state.
- [x] 2.2 Thêm model `PaymentAttempt` với public reference, Purchase relation, provider IDs, amount/currency, state, expiry, reconciliation/version fields và unique constraints.
- [x] 2.3 Thêm model append-only `PaymentEvent` với source, dedupe key/fingerprint, result class, sanitized metadata và quyết định xử lý.
- [x] 2.4 Thêm model `PaymentRefund` với stable refund request id, amount, state, provider transaction id và reconciliation fields.
- [x] 2.5 Tạo migration additive, backfill/giữ tương thích dữ liệu COD hiện có và kiểm tra migrate trên database có seed data.
- [x] 2.6 Viết integration test cho foreign key/unique constraints, concurrent event dedupe, optimistic/conditional state update và refund idempotency.

## 3. Payment provider port và fake adapter

- [x] 3.1 Tạo `PaymentsModule` cùng `PaymentProvider` port cho create, query, refund và notification verification với DTO framework-neutral.
- [x] 3.2 Tạo domain result classifier và error taxonomy phân biệt terminal, pending, unknown, mismatch và lỗi provider tạm thời.
- [x] 3.3 Tạo `FakePaymentProvider` cấu hình được success, failure, cancel, expire, delay, timeout, malformed response và late/duplicate/reordered callbacks.
- [x] 3.4 Tạo adapter contract test dùng chung cho create/query/refund/correlation/idempotency; chạy suite với fake adapter và MoMo HTTP-mocked adapter.
- [x] 3.5 Wiring dependency injection theo `MOMO_ENABLED`/environment để CI mặc định không gọi mạng và môi trường sandbox chọn đúng adapter.

## 4. MoMo sandbox adapter và security

- [x] 4.1 Cài HTTP client/config timeout cho host sandbox allowlist, không cho base URL hoặc redirect host tùy ý.
- [x] 4.2 Implement canonical string builder riêng cho create, IPN, query và refund đúng thứ tự tài liệu; tạo HMAC-SHA256 và timing-safe verification.
- [x] 4.3 Thêm known signature fixtures cùng negative tests cho field order, encoding, thiếu field, signature sai độ dài và secret sai.
- [x] 4.4 Implement create `captureWallet`/`autoCapture=true` với opaque `orderId` dưới 64 byte, stable `requestId`, amount 1.000–50.000.000 VND và HTTPS callbacks.
- [x] 4.5 Validate create response schema/correlation/signature nếu có, allowlist `payUrl`/`deeplink`/`qrCodeUrl`, và giữ payment pending khi create `resultCode=0`.
- [x] 4.6 Implement MoMo result-code mapping cho success/pending/denied/cancelled/expired/failure/unknown kèm exhaustive table tests và unknown-code metric.
- [x] 4.7 Implement signed query với timeout tối thiểu 30 giây, response validation/correlation và semantics timeout thành unknown/retryable.
- [x] 4.8 Implement signed full refund với stable request id, response correlation và query/retry an toàn sau timeout.
- [x] 4.9 Thêm structured redaction và tests chứng minh log/trace/error không chứa secret/access key/signature/raw payload/full payment URL/PII.

## 5. Checkout online và resource holds

- [x] 5.1 Tách phần server-authoritative pricing/order construction dùng chung khỏi `confirmCod` nhưng giữ API và regression behavior COD.
- [x] 5.2 Implement transaction tạo Purchase/ShopOrders/PaymentAttempt và giữ inventory/voucher cho MoMo; rollback toàn bộ và không gọi provider nếu transaction lỗi.
- [x] 5.3 Gọi create provider sau commit, lưu payment instructions bằng conditional update và xử lý create timeout/mismatch thành reconciliation thay vì failure.
- [x] 5.4 Bảo đảm một payment bằng đúng `Purchase.payableTotalMinor` áp dụng nguyên tử cho checkout nhiều shop.
- [x] 5.5 Thêm idempotency cho request checkout/retry để refresh hoặc retry mạng không tạo Purchase/giao dịch merchant thứ hai.
- [x] 5.6 Sửa consume/release inventory và voucher nhận idempotency key để side effect xảy ra đúng một lần.
- [x] 5.7 Thêm integration tests cho rollback trước network, không giữ DB transaction trong network call, IPN đến trước create response và multi-shop atomicity.

## 6. Finalization, IPN, reconciliation và refund

- [x] 6.1 Implement `applyProviderObservation` dùng chung cho IPN/query với event insert, dedupe, correlation check, state guard và transaction atomic.
- [x] 6.2 Implement paid finalization tiêu thụ holds, cập nhật Purchase/timeline và enqueue notification/outbox đúng một lần.
- [x] 6.3 Implement terminal failure/cancel/expiry finalization giải phóng holds, kết thúc Purchase/ShopOrders và hướng buyer checkout lại.
- [x] 6.4 Tạo public MoMo IPN controller với strict DTO, HMAC/correlation/amount validation, idempotent HTTP 204 và giới hạn đường xử lý dưới 15 giây.
- [x] 6.5 Viết Supertest cho valid/invalid signature, amount/order/request mismatch, duplicate IPN, pending-after-paid và failure-after-terminal.
- [x] 6.6 Tạo reconciliation worker có lease/lock, backoff+jitter cho stale pending/unknown/expired candidates và dùng query qua cùng finalize path.
- [x] 6.7 Implement late-success detection sau resource release, chuyển `REFUND_PENDING`, chặn fulfillment và tạo full refund idempotent thay vì phục hồi order.
- [x] 6.8 Implement refund reconciliation/notification cho success, timeout, retry và backlog failure; thêm metrics/alerts cho pending age và refund backlog.
- [x] 6.9 Viết crash tests cho create timeout sau DB commit, paid commit trước IPN 204, worker chạy cạnh tranh và refund timeout/retry.

## 7. API, authorization và seller gating

- [x] 7.1 Thêm `POST /api/v1/checkout/online-payments` với DTO/OpenAPI/Problem Details, server recalculation và response chỉ chứa safe payment instructions.
- [x] 7.2 Thêm `GET /api/v1/payments/:paymentReference` owner-scoped với normalized status, `expiresAt` và safe next action; không rò rỉ payment của buyer khác.
- [x] 7.3 Bảo đảm redirect/browser parameters và endpoint buyer `payment-failed` không thể mutate trạng thái MoMo authoritative.
- [x] 7.4 Gate seller list/detail/actions để Purchase MoMo chỉ fulfillment được khi `PAID`, trong khi COD tiếp tục hoạt động.
- [x] 7.5 Cập nhật shared clients/contracts và API tests cho auth, ownership, invalid state, concurrent retry và COD compatibility.

## 8. Frontend checkout và payment result

- [x] 8.1 Thêm payment method selector COD/MoMo responsive và accessible, hiển thị tổng tiền server-authoritative cùng nội dung chuyển sang MoMo.
- [x] 8.2 Gọi online checkout API, xử lý creating/error an toàn và render QR/pay URL/deep link theo thiết bị với fallback.
- [x] 8.3 Tạo route `/checkout/payment/:paymentReference` polling backend có backoff, refresh-safe và không tin query string redirect.
- [x] 8.4 Render countdown và đầy đủ trạng thái pending/paid/failure/cancel/expiry/reconciling/refund pending/refunded với CTA checkout lại phù hợp.
- [x] 8.5 Thêm frontend unit/interaction tests cho selector, instructions allowlist behavior, polling transitions, reload, accessibility và không hiển thị provider secrets.
- [x] 8.6 Thêm Playwright dùng fake adapter cho happy path, cancel, expiry, timeout/reload, duplicate/late callback và refund UI; giữ COD journey xanh.

## 9. Sandbox tooling và UAT

- [x] 9.1 Cập nhật `.env.example` bằng tên biến/placeholder MoMo không bí mật và tài liệu cách lấy M4B sandbox credential, không commit giá trị thật.
- [x] 9.2 Viết hướng dẫn cài MoMo Test App/test wallet, nạp test balance và xác minh OTP/password theo tài liệu sandbox hiện hành.
- [x] 9.3 Tạo preflight/lệnh opt-in yêu cầu `RUN_MOMO_SANDBOX_E2E=1`, kiểm tra credential/HTTPS IPN/redirect/tunnel/amount mà không in secret và skip an toàn nếu thiếu.
- [x] 9.4 Tài liệu hóa cách mở ngrok/cloudflared (hoặc tunnel tương đương), map public IPN URL đến API và kiểm tra endpoint có thể nhận POST từ internet.
- [ ] 9.5 Chạy UAT happy path với cart nhiều shop: create QR/deep link, thanh toán Test App, IPN 204, UI `PAID`, holds consume, seller fulfillment và query đối chiếu transaction.
- [ ] 9.6 Chạy UAT cancel và expiry: không nhận client assertion, query/reconciliation terminalize và holds release đúng một lần.
- [ ] 9.7 Replay signed IPN sandbox đã bắt được trong môi trường test và xác minh event dedupe, state không thoái lui, không lặp notification/inventory/voucher.
- [ ] 9.8 Chạy UAT refund được kiểm soát cho late-success/refund fixture, xác minh stable refund id, query kết quả và buyer-visible `REFUNDED`.
- [ ] 9.9 Ghi checklist/evidence UAT chỉ bằng safe references/result classes/timestamps; xác nhận sandbox suite không chạy trong CI mặc định.

## 10. Hoàn thiện và release gate

- [ ] 10.1 Chạy format, lint, typecheck, Prisma validation, backend/frontend unit, PostgreSQL integration và Playwright; xử lý mọi regression COD/order/inventory/voucher.
- [ ] 10.2 Thực hiện security review cho signature/correlation, SSRF/open redirect, secret redaction, public IPN rate limiting và authorization payment status.
- [ ] 10.3 Kiểm tra observability dashboard/log/metrics cho create latency, invalid/duplicate IPN, pending age, reconciliation outcome và refund backlog bằng dữ liệu đã che.
- [ ] 10.4 Kiểm thử migration/rollback: tắt feature flag ngăn attempt mới nhưng vẫn cho IPN/reconciliation/refund xử lý backlog; không drop dữ liệu payment.
- [ ] 10.5 Cập nhật runbook sandbox, failure/reconciliation/refund troubleshooting và ghi rõ production vẫn disabled, cần change go-live riêng.
