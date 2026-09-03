## Context

Checkout hiện tại được tối ưu cho COD: `confirmCod` tạo Purchase/ShopOrder rồi tiêu thụ reservation tồn kho và voucher ngay trong transaction. Prisma chỉ có phương thức `COD`, payment status chưa biểu diễn lifecycle online; endpoint `payment-failed` hiện do buyer gọi nên không thể là nguồn sự thật cho thanh toán. Frontend cũng cố định COD.

MoMo là hệ thống ngoài, có redirect phía browser, IPN bất đồng bộ và API query/refund. Các tín hiệu có thể trùng, đến sai thứ tự, đến trước phản hồi create, hoặc mất do timeout. Vì vậy tích hợp phải bảo toàn tính đúng đắn của Purchase nhiều shop, tồn kho và voucher ngay cả khi mạng/provider không chắc chắn.

Stakeholder gồm buyer, seller, vận hành/admin và developer/tester. Change nhắm tới MoMo M4B sandbox theo issue #33; mọi giao dịch và dữ liệu vẫn do backend làm nguồn sự thật.

## Goals / Non-Goals

**Goals:**

- Thêm MoMo One-Time Wallet sandbox cạnh COD mà không phá vỡ luồng COD.
- Tạo payment ở cấp Purchase, hỗ trợ redirect/QR/deep link và UI chờ có thể refresh.
- Xử lý IPN/query/refund có chữ ký, idempotent, chống sai thứ tự và đối soát được.
- Giữ tồn kho/voucher khi pending; tiêu thụ hoặc giải phóng đúng một lần theo kết quả authoritative.
- Cô lập MoMo sau một provider port để kiểm thử xác định bằng fake adapter.
- Cung cấp luồng UAT sandbox lặp lại được qua HTTPS tunnel, không đưa credential vào repository.

**Non-Goals:**

- MoMo production/go-live, onboarding merchant thật, settlement kế toán hoặc dispute dashboard.
- `payWithMethod`, thẻ ATM/tín dụng, trả sau, recurring payment hoặc quy trình authorize/capture hai bước.
- Thêm VNPay hay xây generic UI cho nhiều provider ngoài MoMo.
- Tự phục hồi giỏ hàng sau payment thất bại/hết hạn; buyer sẽ checkout lại ở phiên bản đầu.
- Tự động hóa MoMo Test App trong CI mặc định hoặc cam kết ép được mọi result code trên sandbox thật.
- Thay thế nghiệp vụ refund/return hiện tại; refund trong change này chỉ phục vụ payment online/late success.

## Decisions

### 1. Payment orchestration tách khỏi adapter MoMo

Tạo `PaymentsModule` trong NestJS với `PaymentProvider` port gồm `createPayment`, `queryPayment`, `refundPayment`, `verifyNotification`. Domain dùng DTO/trạng thái chuẩn hóa; `MomoSandboxAdapter` chịu trách nhiệm HTTP, canonical signature và result-code mapping. Test inject `FakePaymentProvider` điều khiển được delay, timeout và callback.

Chọn ports-and-adapters thay vì gọi MoMo trực tiếp từ `CheckoutService` vì callback/reconciliation/refund đều cần dùng cùng semantics, và issue yêu cầu adapter có thể thay thế. Không đưa SDK community vào lõi; dùng HTTP client hiện có để giữ payload/chữ ký minh bạch, dễ kiểm thử fixture và giảm rủi ro supply-chain.

### 2. Một payment cho toàn bộ Purchase

Một checkout nhiều shop tạo một MoMo payment bằng `Purchase.payableTotalMinor`; các ShopOrder không có giao dịch provider riêng. Payment success mở khóa toàn bộ ShopOrder nguyên tử, tránh buyer phải thanh toán nhiều lần và tránh partial-paid purchase.

COD và payment status tiếp tục tách khỏi fulfillment state. Điều kiện seller được xử lý đơn là `paymentMethod = COD OR paymentStatus = PAID`; không dùng order status để mô phỏng trạng thái payment.

### 3. Hai pha bền vững quanh lời gọi mạng

Pha 1 là transaction PostgreSQL: server tính lại giá, tạo Purchase/ShopOrder, tạo PaymentAttempt cùng `orderId`/`requestId`, giữ tồn kho và voucher, rồi commit. Pha 2 mới gọi provider bên ngoài transaction và ghi chỉ dẫn create bằng một update idempotent.

```text
Buyer -> API: confirm online checkout
API -> DB (tx): Purchase + ShopOrders + PaymentAttempt + resource holds
DB --> API: commit
API -> MoMo: create(orderId, requestId, amount, signature)
MoMo --> API: payUrl/deeplink/qrCodeUrl
API --> Buyer: paymentReference + instructions
MoMo -> IPN endpoint: signed result
IPN -> DB (tx): event + finalize + consume/release exactly once
Buyer -> API: poll owner-scoped payment status
```

Không giữ transaction trong khi gọi mạng. Nếu create timeout, attempt chuyển sang `UNKNOWN`/`PENDING_RECONCILIATION`, không phải `FAILED`; job query dùng cùng định danh để xác định. Nếu IPN đến trước khi pha 2 lưu response, nó vẫn tìm được attempt đã commit và finalize; update pha 2 phải có state guard để không hạ `PAID` về `PENDING`.

### 4. Mô hình dữ liệu và ràng buộc

Mở rộng payment method với `MOMO`. Purchase payment status tối thiểu gồm `UNPAID`, `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `EXPIRED`, `REFUND_PENDING`, `PARTIALLY_REFUNDED`, `REFUNDED`; fulfillment status vẫn độc lập.

Thêm các entity:

- `PaymentAttempt`: public reference, Purchase, provider/environment, merchant `orderId`, `requestId`, amount/currency, state chuẩn hóa, provider transaction id, create result an toàn, expiry, retry/reconcile timestamps, version và timestamps UTC.
- `PaymentEvent`: append-only, source (`IPN`, `QUERY`, `CREATE`, `REFUND`), provider event/fingerprint, result code/class, sanitized metadata, received/processed time và quyết định apply/ignore.
- `PaymentRefund`: attempt, merchant refund request id, amount, state, provider transaction id, retry/reconcile metadata.

Unique constraints áp dụng cho public reference, `(provider, orderId)`, `(provider, requestId)`, event dedupe key và refund request id. State update dùng conditional update/version hoặc row lock trong transaction. Inventory/voucher consume/release hiện có phải nhận idempotency key gắn với payment attempt.

Không lưu secret, signature, full payment URL hay raw payload tùy ý. Nếu cần forensic, chỉ lưu whitelist trường không nhạy cảm và hash/fingerprint.

### 5. State machine đơn điệu và finalize dùng chung

`CREATED -> PENDING -> PAID | FAILED | CANCELLED | EXPIRED`; `UNKNOWN` và `PENDING_RECONCILIATION` là trạng thái không chắc chắn, còn có thể query; late success sau khi giải phóng tài nguyên đi `REFUND_PENDING -> REFUNDED` (hoặc `REFUND_FAILED` nội bộ để retry).

IPN và query cùng gọi một `applyProviderObservation` trong transaction. Hàm này:

1. insert event bằng dedupe key;
2. xác thực observation khớp attempt;
3. phân loại terminal/non-terminal và so sánh độ ưu tiên state;
4. đổi state bằng guard;
5. consume/release hold, cập nhật Purchase/ShopOrder timeline và enqueue notification/outbox đúng một lần.

`PAID` không bị pending/failure cũ làm thoái lui. `FAILED/CANCELLED/EXPIRED` chỉ được kết luận từ provider hoặc query đáng tin cậy, không từ browser hay network error.

### 6. Redirect chỉ là UX; IPN/query là thẩm quyền

API dự kiến:

- `POST /api/v1/checkout/online-payments`: authenticated, nhận dữ liệu checkout và `provider=MOMO`, trả `purchaseReference`, `paymentReference`, `status`, `expiresAt`, URL/QR an toàn nếu có.
- `GET /api/v1/payments/:paymentReference`: authenticated và owner-scoped cho polling/trạng thái.
- `POST /api/v1/payment-providers/momo/ipn`: public transport endpoint, không session/CSRF/Origin; xác thực provider trước domain mutation.
- Redirect route frontend `/checkout/payment/:paymentReference` chỉ render/poll; query string MoMo chỉ dùng thông báo tạm thời, không ghi state.

Endpoint `payment-failed` do buyer gọi không được dùng cho MoMo và nên được giới hạn vào hành vi COD/legacy hoặc loại bỏ trong một change tương thích riêng nếu không còn consumer.

### 7. Chữ ký và hardening MoMo

Adapter dùng endpoint sandbox `https://test-payment.momo.vn/v2/gateway/api/create`, `requestType=captureWallet`, `autoCapture=true`. Amount là số nguyên VND trực tiếp từ `payableTotalMinor`, trong khoảng sandbox 1.000–50.000.000. `orderId` opaque, duy nhất, dưới 64 byte và không chứa email/phone/reference nhạy cảm; `requestId` ổn định qua retry và được lưu tối thiểu đủ cho cửa sổ idempotency của provider.

Mỗi operation có builder canonical string riêng đúng thứ tự field tài liệu MoMo và HMAC-SHA256. Verification decode/validate độ dài trước khi dùng `timingSafeEqual`. IPN phải khớp `partnerCode`, `orderId`, `requestId`, amount và currency/đơn vị đã lưu. IP allowlist nếu dùng chỉ là lớp phụ, không thay chữ ký.

Schema validate cả request boundary và response provider. Chỉ chấp nhận outbound base URL cùng URL điều hướng thuộc scheme/host allowlist. `resultCode=0` của create chỉ là create accepted; payment vẫn pending. Mapping table versioned bằng unit test: `0`/authorized hợp lệ cho auto-capture là success khi xuất hiện ở observation thanh toán, `1000/7000/7002` là pending, `1005` expired, `1006` buyer denied, `1017` merchant cancelled; code lạ là unknown và phải query.

IPN cố gắng xác thực, lưu event và phản hồi HTTP 204 dưới 15 giây; công việc phụ qua outbox/job. Invalid signature/schema không mutate state và không trả chi tiết giúp giả mạo signature.

### 8. Expiry, reconciliation và late success

Payment window mặc định 10 phút và luôn ngắn hơn/equal TTL inventory hold hiện có (15 phút); giá trị cuối được cấu hình nhưng phải validate quan hệ này. Khi hết thời gian local, worker query MoMo trước khi terminalize. Chỉ giải phóng khi có kết quả terminal hoặc chính sách hết hạn đã được xác nhận; timeout tiếp tục reconciliation với exponential backoff, jitter và lease/lock chống nhiều worker xử lý cùng attempt.

Nếu success hợp lệ đến sau khi hold đã release/Purchase đã terminal, không phục hồi order vì tồn kho/voucher có thể thuộc checkout khác. Hệ thống tạo refund toàn phần idempotent, đặt `REFUND_PENDING`, chặn fulfillment, query/retry refund đến kết quả chắc chắn và thông báo buyer.

### 9. Cấu hình và observability

Biến môi trường dự kiến: `MOMO_ENABLED`, `MOMO_ENV=sandbox`, `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `MOMO_IPN_URL`, `MOMO_REDIRECT_URL`, timeout/retry/expiry. Base URL chọn từ enum môi trường, không nhận URL tùy ý trong production config. Khi disabled, checkout không quảng bá MoMo; khi enabled thiếu secret/HTTPS callback thì fail fast.

Log chỉ gồm internal correlation id, operation, result class/code, latency và retry count; redaction bắt buộc cho secret/access key/signature/raw payload/full URL/PII. Metrics gồm create latency/error, IPN valid/invalid/duplicate, state transitions, pending age, reconciliation outcome và refund backlog. Alert cho signature mismatch tăng, pending quá SLA và refund pending lâu.

### 10. UI checkout và trang kết quả

Checkout hiển thị radio/card COD và MoMo, tổng tiền do server xác nhận và thông tin sẽ chuyển sang MoMo. Sau create, desktop ưu tiên QR + nút mở `payUrl`; mobile ưu tiên deep link nếu hợp lệ, vẫn có fallback. Trang payment có countdown theo `expiresAt`, polling có backoff và các trạng thái rõ ràng: creating, pending, paid, failed/cancelled, expired, reconciling, refund pending/refunded.

Refresh hoặc mở lại trang dùng `paymentReference` và API owner-scoped, không phụ thuộc state trong browser. Khi terminal failure/expiry, CTA quay lại giỏ/checkout mới; không hứa giỏ được tự khôi phục. UI giữ responsive/accessibility, không nhúng secret hoặc provider payload.

### 11. Chiến lược kiểm thử và sandbox UAT

Pyramid kiểm thử:

- Unit: canonical signature bằng known fixtures, timing-safe verify, result-code classifier, state precedence, mismatch/URL allowlist và log redaction.
- Adapter contract: cùng suite chạy cho fake và MoMo adapter HTTP-mocked; create/query/refund, timeout, malformed response, duplicate và reordered observations.
- PostgreSQL integration: unique constraints, transaction rollback, state monotonic, resource exactly-once, multi-shop atomicity, seller gating và late-success refund.
- HTTP/Supertest: IPN public nhưng signature bắt buộc, strict DTO, 204/idempotency, redirect không mutate và payment status owner-scoped.
- Crash/reconciliation: commit intent rồi create timeout; IPN đến trước create response; crash sau paid commit trước 204; query stale pending; retry cùng request/refund id.
- Playwright: fake adapter điều khiển happy, cancel, expire, timeout/reload và refund UI; không phụ thuộc sandbox mạng trong CI.

Luồng UAT sandbox opt-in:

1. Tạo/lấy M4B sandbox credential; cài MoMo Test App, tạo test wallet theo hướng dẫn sandbox và nạp test balance.
2. Chạy PostgreSQL, API và web; bật MoMo sandbox bằng env local không commit.
3. Mở HTTPS tunnel (ngrok/cloudflared hoặc tương đương) tới API; đặt `MOMO_IPN_URL=https://<public-host>/api/v1/payment-providers/momo/ipn`, redirect URL trỏ về web có thể truy cập, rồi restart để preflight kiểm tra HTTPS.
4. Tạo buyer/cart nhiều shop, chọn MoMo, xác nhận một amount hợp lệ; kiểm tra có payment reference và QR/pay/deep link, DB đang pending và holds chưa consume.
5. Thanh toán bằng Test App (sandbox thường dùng OTP/password test theo tài liệu hiện hành); quan sát IPN 204, UI polling sang paid, holds consume đúng một lần, seller mở được fulfillment và query xác nhận cùng amount/transId.
6. Chạy case buyer cancel và để hết hạn; xác nhận không có client-side success, reconciliation chạy và holds release đúng một lần khi terminal.
7. Replay cùng signed IPN đã bắt được trong môi trường test; xác nhận event dedupe và không lặp inventory/voucher/notification.
8. Chạy sandbox refund trên một late-success fixture/quy trình được kiểm soát; xác nhận refund request id ổn định và trạng thái `REFUNDED` sau query.

Script/lệnh sandbox phải yêu cầu cờ như `RUN_MOMO_SANDBOX_E2E=1`, bỏ qua khi thiếu credential, in preflight thay vì secret và không nằm trong CI mặc định. Vì sandbox không cam kết cơ chế ép mọi mã lỗi, failure matrix xác định vẫn dùng fake adapter; sandbox thật là smoke/UAT thủ công hoặc nightly opt-in.

## Risks / Trade-offs

- [IPN mất hoặc provider timeout tạo trạng thái không chắc chắn] → Lưu intent trước network, không coi timeout là failure, query reconciliation với retry/backoff.
- [Callback trùng/sai thứ tự làm lặp side effect] → Event dedupe, row lock/version guard, state precedence và idempotency key cho resource operations.
- [Success về sau khi tồn kho đã cấp cho đơn khác] → Không phục hồi Purchase; auto-refund toàn phần và chặn fulfillment.
- [Giữ tồn kho khi payment pending làm giảm availability] → Payment TTL ngắn hơn inventory TTL, countdown rõ và worker dọn/đối soát liên tục.
- [MoMo sandbox không ổn định hoặc khác production] → Fake adapter là cổng CI; sandbox opt-in chỉ chứng minh contract/end-to-end, production cần change/go-live review riêng.
- [Rò rỉ credential hoặc dữ liệu giao dịch] → Env/secret store, fail-fast validation, host allowlist, structured redaction và test chống log secret.
- [PostgreSQL enum khó rollback] → Ưu tiên enum mở rộng/additive schema, feature flag tắt MoMo và không drop dữ liệu khi rollback ứng dụng.
- [Refund tự động lỗi kéo dài] → Refund idempotency, reconciliation queue, metric/alert và trạng thái buyer-visible `REFUND_PENDING`.

## Migration Plan

1. Thêm schema/migration additive cho enum và bảng payment/event/refund, backfill Purchase COD hiện có với trạng thái tương thích; không sửa dữ liệu fulfillment.
2. Deploy `PaymentsModule`, fake adapter, API read/status và worker ở trạng thái `MOMO_ENABLED=false`; chạy migration và kiểm tra COD regression.
3. Tích hợp checkout resource holds/finalize, seller gate và UI sau feature flag; chạy toàn bộ unit/integration/Playwright bằng fake adapter.
4. Cấu hình credential/HTTPS URL trong môi trường sandbox, chạy preflight và checklist UAT happy/cancel/expiry/duplicate/reconciliation/refund.
5. Chỉ bật MoMo cho development/sandbox sau khi UAT đạt; production vẫn disabled cho tới change go-live riêng.

Rollback: tắt feature flag để ẩn lựa chọn MoMo và chặn tạo attempt mới; tiếp tục worker/IPN/query/refund cho attempt đang tồn tại đến terminal. Có thể rollback application code sau khi pending/refund backlog bằng 0; giữ nguyên bảng/cột additive để audit và tránh migration phá hủy.

## Open Questions

- Credential M4B sandbox và public HTTPS hostname nào sẽ được dùng cho UAT? Không lưu câu trả lời trong repository; cấu hình ở env local/secret store khi apply.
- Môi trường chạy UAT có cho phép deep link trực tiếp tới MoMo Test App hay chỉ dùng QR qua thiết bị thứ hai? UI hỗ trợ cả hai, checklist sẽ chọn cách khả dụng.
