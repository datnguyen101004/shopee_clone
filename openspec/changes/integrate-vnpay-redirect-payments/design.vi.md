## Bối cảnh

Xem proposal.md để biết động cơ của change. Modular monolith hiện tại đã có COD và MoMo sandbox. Online checkout được cung cấp tại POST /api/v1/checkout/online-payments, nhưng contract và OnlinePaymentService đang gắn riêng với MoMo, PaymentsModule chỉ inject một PAYMENT_PROVIDER, và PaymentAttempt đang có quan hệ một-một với Purchase. Một Purchase có thể chứa nhiều ShopOrder; hệ thống đã có sẵn giá do server quyết định, giữ tồn kho, tiêu thụ voucher, khóa seller fulfillment, đối soát và cơ chế an toàn hoàn tiền khi success về muộn.

VNPAY 2.1.0 là giao thức redirect GET qua trang thanh toán do VNPAY host. Merchant tạo URL thanh toán có chữ ký; VNPAY độc lập redirect browser tới Return URL đã cấu hình và gọi GET IPN URL công khai. VNPAY yêu cầu merchant kiểm tra checksum trước, xác thực giao dịch và số tiền, cập nhật trạng thái rồi trả HTTP 200 với JSON acknowledgement. Với một số lỗi IPN, VNPAY có thể gọi lại tối đa mười lần, cách nhau năm phút.

Design tổng quát được cung cấp giả định một order và một bảng Payment riêng. Dự án này thanh toán một checkout qua Purchase nội bộ đa shop và PaymentAttempt, nhưng mỗi ShopOrder là một đơn buyer riêng (một shop, có thể nhiều sản phẩm). Luồng buyer mới bổ sung `PENDING_PAYMENT` vào vòng đời ShopOrder để thể hiện payment gate; Purchase và PaymentAttempt chỉ là aggregate cho payment/resource.

## Mục tiêu / Ngoài phạm vi

**Mục tiêu:**

- Thêm VNPAY sandbox vào payment domain hiện hữu mà không nhân bản logic checkout, inventory, voucher, order hoặc seller.
- Làm provider selection tường minh và cô lập từng provider sau registry cùng common port.
- Tạo trạng thái ShopOrder ban đầu khác nhau cho COD và VNPAY, sau đó chuyển trạng thái đơn VNPAY theo observation có thẩm quyền từ provider.
- Biến IPN và QueryDR đã xác thực thành các observation có thẩm quyền, idempotent, đơn điệu và atomic với resource effects.
- Cung cấp trải nghiệm Return URL đọc trạng thái thanh toán authoritative từ backend bằng polling có giới hạn cho tới khi IPN hoàn tất, rồi mở đúng ShopOrder hoặc danh sách đơn nếu giao dịch có nhiều shop.
- Hiển thị mỗi ShopOrder thành một đơn buyer với toàn bộ sản phẩm của shop đó; không gộp nhiều shop thành một card/detail.
- Giữ nguyên COD và toàn bộ hành vi MoMo hiện hữu.

**Ngoài phạm vi:**

- Onboarding VNPAY production, traffic production, settlement kế toán, dispute operations, recurring/tokenized/installment payment hoặc multi-currency.
- Nhập thẻ trên giao diện merchant, form thẻ giả hoặc render trực tiếp QR từ dữ liệu do merchant tự tạo.
- API refund VNPAY do buyer yêu cầu hoặc tự động. Các trạng thái refund/manual-resolution hiện hữu vẫn là ranh giới an toàn cho success về muộn hoặc success trùng.
- Thay aggregate Purchase và ShopOrder hiện hữu bằng mô hình single-order trong tài liệu nguồn.
- Tin các field Return URL là xác nhận thanh toán.

## Quyết định

### 1. Mở rộng provider port hiện hữu bằng provider registry

PaymentProviderName trở thành closed union gồm MOMO và VNPAY. PaymentsModule đăng ký từng adapter được bật trong PaymentProviderRegistry theo provider. OnlinePaymentService nhận provider từ shared contract đã validate và resolve adapter tương ứng.

Cách này được chọn thay vì tạo VnpayCheckoutService song song vì creation, status normalization, observation application, reconciliation, redaction, ownership và seller gate phải giống nhau giữa các provider. Registry cũng giữ được adapter contract test xác định bằng fake provider. DTO và logic ký riêng của provider vẫn nằm trong từng adapter.

### 2. Giữ Purchase làm payment aggregate và dùng ShopOrder làm đơn buyer

Mỗi PaymentAttempt luôn tham chiếu một Purchase và amount bằng Purchase.payableTotalMinor. Một checkout có thể tạo nhiều ShopOrder, nhưng mỗi ShopOrder là một đơn buyer độc lập chứa toàn bộ line của đúng một shop. `purchaseReference` chỉ giữ vai trò correlation cho payment/checkout; URL đơn buyer dùng `orderReference`. Purchase.paymentStatus và PaymentAttempt.status vẫn là nguồn chi tiết có thẩm quyền, còn ShopOrder bổ sung `PENDING_PAYMENT` làm seller gate và trạng thái điều hướng cho buyer.

ShopOrder COD bắt đầu ở `PENDING_CONFIRMATION`. ShopOrder VNPAY bắt đầu ở `PENDING_PAYMENT`; seller list, detail và mutation loại trừ trạng thái này. Success đã xác thực chuyển toàn bộ ShopOrder trong Purchase sang `PENDING_CONFIRMATION`. Cancellation, failure hoặc expiry đã xác thực chuyển chúng sang `CANCELLED`. Nhờ vậy từng đơn buyer và seller eligibility có thể đọc trực tiếp từ canonical order status mà không phải diễn giải payment field ở từng consumer.

### 3. Giữ PaymentAttempt một-nhiều nhưng chỉ cho phép một VNPAY checkout attempt trên mỗi Purchase

Purchase.paymentAttempt đổi thành Purchase.paymentAttempts. Unique constraint trên payment_attempts.purchase_id được gỡ. Một partial unique index của PostgreSQL đảm bảo mỗi Purchase chỉ có tối đa một active attempt thuộc PENDING, UNKNOWN hoặc PENDING_RECONCILIATION. Các row MoMo hiện hữu được migrate mà không đổi dữ liệu.

Mỗi attempt giữ UUID publicReference nội bộ và provider correlation bất biến. Với VNPAY, orderId lưu vnp_TxnRef dạng alphanumeric ngắn, opaque và duy nhất theo attempt. Chính sách VNPAY tạo một attempt cùng Purchase và không thêm attempt khác sau kết quả terminal. Buyer muốn mua lại phải thực hiện checkout idempotent mới, tạo Purchase, ShopOrder, attempt và provider reference mới.

Các phương án đã cân nhắc:

- Mở lại Purchase đã hủy và thêm attempt khác: loại vì làm `CANCELLED` không còn terminal, khiến compensation tồn kho/voucher phức tạp và lịch sử đơn buyer gây hiểu nhầm.
- Tái sử dụng attempt hoặc transaction reference đã hủy: loại vì replay, audit, duplicate IPN và late-success sẽ trở nên mơ hồ.

### 4. Áp dụng kết quả payment terminal và hủy đơn trong một transaction

Checkout VNPAY ban đầu commit Purchase, các ShopOrder `PENDING_PAYMENT`, resource hold và PaymentAttempt trong một serializable transaction. Observation `CANCELLED`, `FAILED` hoặc `EXPIRED` đã xác thực sẽ lock attempt và Purchase, đặt payment state terminal, chuyển mọi ShopOrder `PENDING_PAYMENT` sang `CANCELLED`, cập nhật order/fulfillment timeline, release inventory và voucher hold, đồng thời khôi phục cart line hợp lệ đúng một lần.

Trạng thái unknown và reconciliation giữ ShopOrder ở `PENDING_PAYMENT` và tiếp tục giữ resource. Nếu hết payment deadline mà chưa có kết quả kết luận, hệ thống dùng cùng terminal cancellation transaction. Purchase VNPAY terminal không được mở lại hoặc retry.

Nếu hai attempt khác nhau cùng báo success, Purchase row lock và state precedence khiến success hợp lệ đầu tiên là settlement duy nhất. Success đến sau được lưu và chuyển sang refund/manual resolution, không consume resource hoặc mở fulfillment lại.

### 5. Tạo VNPAY URL xác định sau khi commit

Transaction ban đầu persist attempt trước khi tạo URL để IPN luôn correlate được với row bền vững. Việc tạo URL là phép toán mật mã local, không phải network call tới provider. Adapter xây bộ tham số VNPAY 2.1.0, format provider timestamp theo Asia/Ho_Chi_Minh tại boundary, sort tên tham số, áp dụng đúng encoding của VNPAY và ký HMAC-SHA512.

Money trong dự án tiếp tục là integer VND minor units. Adapter serialize vnp_Amount bằng amountMinor nhân 100 và validate phép chuyển đổi ngược bằng safe integer checks. Payment VNPAY dưới 5.000 VND bị từ chối. URL sinh ra phải khớp chính xác sandbox HTTPS origin và payment path đã cấu hình.

Full signed URL chỉ được trả trong authenticated checkout response và không được log. Idempotent checkout replay tạo lại cùng URL từ immutable attempt fields cùng provider create timestamp đã lưu, thay vì tạo attempt mới.

### 6. Dùng chung một observation finalizer cho IPN và QueryDR

VnpayIpnController là GET endpoint công khai tại /api/v1/payment-providers/vnpay/ipn và không dùng buyer AuthGuard, CSRF hoặc Origin checks. Endpoint áp dụng giới hạn nghiêm ngặt cho shape và độ dài query, tách hash fields, verify HMAC bằng timing-safe comparison trước database lookup, rồi validate terminal code, vnp_TxnRef, vnp_Amount, response status và transaction number.

Observation hợp lệ đi qua PaymentObservationService hiện hữu sau khi service được provider-neutral hóa. Transaction insert hoặc deduplicate PaymentEvent, lock PaymentAttempt và Purchase, kiểm tra monotonic precedence, rồi thực hiện chính xác một lần các effect inventory, voucher, payment, order timeline, notification/outbox và seller gate.

Endpoint luôn dùng JSON acknowledgement contract của VNPAY. Kết quả dự kiến gồm 00 cho confirmed, 01 cho không tìm thấy giao dịch, 02 cho đã confirmed, 04 cho sai amount, 97 cho sai checksum và 99 cho request không hợp lệ hoặc chưa xử lý được. HTTP error và Problem Details của ứng dụng không được trả cho VNPAY đối với protocol outcome.

### 7. Return URL resolve navigation nhưng không xác nhận thanh toán

Frontend Return URL được cấu hình là /payment/callback. Trang chỉ đọc vnp_TxnRef để điều hướng và gọi owner-scoped resolver có authentication nhằm nhận paymentReference nội bộ cùng Purchase reference. Các VNPAY query parameter khác không được chuyển thành application state và được xóa khỏi URL hiển thị bằng router.replace sau khi resolve.

Sau khi resolve giao dịch, callback VNPAY đọc có giới hạn GET /api/v1/payments/:paymentReference. Chu kỳ bắt đầu với delay ngắn, backoff tối đa năm giây và dừng khi backend trả terminal status hoặc hết payment window. Callback không tin vnp_ResponseCode, vnp_TransactionStatus hoặc vnp_SecureHash từ browser.

Khi nhận terminal status, callback dùng navigation target từ backend rồi redirect tới /account/orders/:orderReference nếu giao dịch chỉ có một ShopOrder, hoặc /account/orders nếu giao dịch có nhiều ShopOrder. Thao tác “Kiểm tra lại” vẫn có khi polling dừng hoặc API read lỗi. IPN là nguồn cập nhật trạng thái; callback không suy diễn từ query parameter VNPAY.

### 8. Chỉ tái sử dụng QueryDR cho backend recovery

Reconciliation worker hiện hữu được provider-neutral hóa. Candidate VNPAY chỉ đi vào QueryDR sau grace period, khi URL creation không chắc chắn hoặc attempt vẫn active mà không có IPN kết luận. QueryDR dùng request identity ổn định, transaction API của VNPAY, quy tắc HMAC-SHA512 request/response bắt buộc, bounded concurrency, lease locking và exponential backoff kèm jitter.

QueryDR result đã xác thực đi vào cùng observation finalizer như IPN. Timeout, malformed response, signature mismatch, correlation mismatch và response code 94 vẫn là uncertain, tuyệt đối không suy diễn thành success hoặc failure.

Đây là recovery trạng thái giao dịch, không phải settlement kế toán. Frontend chỉ polling bounded trên callback, không polling ở order list hoặc order detail.

### 9. Giữ late-success an toàn mà không thêm refund VNPAY vào scope

Trước terminal cancellation transaction, VNPAY success đã xác thực có thể settle Purchase đủ điều kiện và chuyển ShopOrder sang `PENDING_CONFIRMATION`. Sau khi cancellation đã release resource, success về muộn không được restore inventory, voucher, ShopOrder hoặc seller fulfillment. Event được giữ lại và payment đi vào REFUND_PENDING hoặc support state tương đương hiện hữu, kèm operational alert và thông báo hỗ trợ an toàn cho buyer.

Tự động gọi refund VNPAY bị loại khỏi phạm vi. Trade-off này giữ proposal sandbox đúng non-goal được cung cấp, đồng thời ngăn double collection hoặc fulfillment không hợp lệ bị bỏ qua. Production enablement phải bổ sung và xác minh VNPAY refund runbook hoặc adapter trước go-live.

### 10. Validate cấu hình mà không làm lộ credential

Cấu hình bổ sung enable flag, environment, terminal code, hash secret, payment URL, Return URL, IPN URL, transaction API URL, TTL, HTTP timeout, server IP fallback và trusted proxy policy. Credential chỉ bắt buộc khi VNPAY creation được bật. Sandbox payment/API host dùng exact allowlist; localhost frontend Return URL được phép trong development, còn IPN phải là public HTTPS.

Request IP chỉ được lấy từ socket hoặc các trusted proxy hop đã cấu hình rõ. Log, error, test, OpenAPI example, metric và trace phải redact secret, secure hash, full signed URL, raw query, bank transaction identifier và dữ liệu cá nhân.

### 11. Dùng additive migration và rollout qua feature flag

Migration thêm enum VNPAY và `PENDING_PAYMENT` vào ShopOrder status, gỡ ràng buộc một-một của Purchase, giữ các attempt correlation field bất biến và tạo partial active-attempt index. Row COD và MoMo giữ nguyên semantics hiện hữu.

Data migration cộng thêm suy ra trạng thái ShopOrder và payment attempt VNPAY hiện hữu từ payment state có thẩm quyền: `PENDING`, `UNKNOWN` và `PENDING_RECONCILIATION` thành `PENDING_PAYMENT`; `PAID` thành `PENDING_CONFIRMATION` nếu vẫn đang bị payment gate; `CANCELLED`, `FAILED` hoặc `EXPIRED` thành `CANCELLED`. Một repair command đi kèm kiểm tra invariant version/timeline và bổ sung transition còn thiếu; runtime finalizer và expiry worker xử lý inventory, voucher, seller fulfillment và cart restoration theo cách idempotent. Repair command từ chối row mơ hồ thay vì đoán.

Thứ tự rollout:

1. Backup local database và apply additive migration.
2. Deploy provider-neutral code với VNPAY disabled; chạy regression suite COD và MoMo.
3. Cấu hình sandbox variable cùng public HTTPS IPN, chạy preflight rồi bật VNPAY creation.
4. Chạy deterministic test và opt-in sandbox UAT trước khi nhận demo traffic.

Rollback trước hết disable VNPAY creation mới, nhưng vẫn để IPN, QueryDR, status read và manual-resolution xử lý các attempt hiện hữu. Code và schema chỉ được gỡ sau khi không còn VNPAY backlog hoặc row cần giữ; tuyệt đối không reset database để rollback.

### 12. Gộp điều hướng vận chuyển cho buyer nhưng không gộp domain state

Điều hướng lịch sử đơn mua dùng một filter canonical `SHIPPING` với nhãn “Vận chuyển”. Ở boundary repository, filter dành riêng cho buyer này map tới từng ShopOrder có `status IN (AWAITING_PICKUP, SHIPPING)`. Tab hiển thị không còn entry `AWAITING_PICKUP` riêng; deep link cũ `filter=AWAITING_PICKUP` được chuẩn hóa thành `filter=SHIPPING` để saved link không rơi vào trạng thái không hợp lệ.

Việc gộp chỉ áp dụng cho điều hướng buyer. Mỗi order card, detail, timeline và accessibility label vẫn hiển thị trạng thái fulfillment thật: `AWAITING_PICKUP` là “Chờ lấy hàng”, `SHIPPING` là “Đang giao”. Seller, carrier, admin, notification và transition logic tiếp tục phân biệt hai trạng thái. Thay đổi tab này không cần Prisma enum hoặc data migration.

### 13. Dùng trực tiếp ShopOrder status cho các tab thanh toán của buyer

Lịch sử đơn mua có filter canonical `PENDING_PAYMENT` với nhãn “Chờ thanh toán”, map trực tiếp tới `ShopOrder.status = PENDING_PAYMENT`; COD không bao giờ vào trạng thái này. Filter `CANCELLED` với nhãn “Đã hủy” map trực tiếp tới `ShopOrder.status = CANCELLED`, không còn OR predicate theo payment status.

Cả hai tab đều filter ở server với ownership và cursor pagination. Card/detail hiển thị canonical order status cùng payment result chi tiết, để đơn VNPAY thất bại được thấy là đã hủy nhưng vẫn giải thích kết quả provider là cancelled, failed hay expired. Timeline phản ánh đúng `PENDING_PAYMENT → PENDING_CONFIRMATION` hoặc `PENDING_PAYMENT → CANCELLED`.

## Rủi ro / Đánh đổi

- [Return URL có thể đến trước IPN] → Render trạng thái uncertain, dùng bounded owner-scoped status polling, visibility refresh và manual refresh; không suy diễn failure.
- [Attempt terminal có thể báo success muộn] → Lock Purchase, giữ attempt bất biến, áp dụng first-success-wins và chuyển success sau sang refund/manual resolution.
- [Không có automatic VNPAY refund trong scope] → Không mở lại order đã release, phát operational alert, hiển thị support state và chặn production enablement cho tới khi có refund operation.
- [Migration một-nhiều ảnh hưởng code MoMo] → Giữ MoMo ở chính sách một attempt và chạy đầy đủ contract, integration, reconciliation, refund cùng browser regression suite.
- [GET IPN công khai có thể bị lạm dụng] → Giới hạn nghiêm ngặt độ dài và allowlist tham số, timing-safe verification, rate control không chặn retry hợp lệ và security metric đã redact.
- [Buyer IP qua proxy có thể bị giả] → Chỉ tin proxy hop đã cấu hình; nếu không dùng socket address hoặc safe fallback.
- [Polling callback có thể tăng status-read traffic] → Chỉ polling khi callback đang mở, dùng backoff có giới hạn, dừng khi terminal hoặc hết payment window; order list/detail chỉ đọc một lần.
- [Filter `SHIPPING` của buyer trùng tên một domain status chi tiết] → Tập trung aggregate mapping tại buyer order-history boundary, giữ trạng thái chi tiết trong response và test inclusion, exclusion, pagination cùng legacy-link normalization.
- [COD có thể vô tình vào payment-gated state] → Đặt ShopOrder status ban đầu từ payment method do server sở hữu và test persistence cho COD/VNPAY.
- [Kết quả provider terminal có thể chỉ cập nhật payment mà không cập nhật order/resource] → Finalize Purchase, ShopOrder, timeline, inventory, voucher, cart restoration và seller gate trong một idempotent transaction.
- [Success về muộn sau khi hủy ngay] → Không mở lại ShopOrder `CANCELLED` hoặc giữ lại resource; chuyển payment sang refund/manual resolution kèm operational evidence.
- [Khác biệt encoding VNPAY có thể làm sai chữ ký] → Duy trì official fixture và đối chiếu canonical string với demo implementation của VNPAY.

## Kế hoạch migration

1. Ghi baseline schema và test cho COD, MoMo, inventory, voucher, seller fulfillment, order history, reconciliation và refund.
2. Bổ sung provider-neutral contract cùng registry với VNPAY disabled.
3. Apply additive PaymentAttempt và ShopOrder `PENDING_PAYMENT` migration, migrate row VNPAY hiện hữu từ payment state có thẩm quyền, rồi xác minh row/index MoMo và COD không đổi.
4. Bổ sung VNPAY protocol adapter, IPN, QueryDR, atomic order/resource finalization, callback resolver, bounded callback polling và UI sau feature flag.
5. Bổ sung filter trực tiếp `PENDING_PAYMENT`/`CANCELLED` và filter vận chuyển đã gộp, sau đó chạy unit, adapter contract, PostgreSQL integration, Supertest, frontend interaction, Playwright, migration và redaction test.
6. Chạy sandbox preflight cùng controlled UAT qua public HTTPS tunnel.
7. Khi rollback, disable creation, drain hoặc resolve active VNPAY attempt, sau đó dùng compensating migration cùng data policy rõ ràng; không xóa order không liên quan hoặc reset database.
