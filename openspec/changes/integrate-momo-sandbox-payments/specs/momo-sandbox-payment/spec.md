## ADDED Requirements

### Requirement: Adapter MoMo thay thế được
Hệ thống SHALL định nghĩa cổng `PaymentProvider` độc lập với MoMo cho các thao tác tạo payment, query payment, refund và xác thực notification. `MomoSandboxAdapter` MUST triển khai cổng này, còn domain checkout/order MUST chỉ phụ thuộc vào cổng và các trạng thái chuẩn hóa.

#### Scenario: Chạy kiểm thử với fake adapter
- **WHEN** test suite khởi động với fake payment provider
- **THEN** toàn bộ luồng checkout/payment SHALL chạy mà không cần mạng hoặc thông tin bí mật MoMo

#### Scenario: Chạy với MoMo sandbox
- **WHEN** cấu hình bật MoMo sandbox và đủ credential hợp lệ
- **THEN** dependency injection SHALL dùng `MomoSandboxAdapter` mà không thay đổi logic domain

### Requirement: Tạo giao dịch One-Time Wallet có chữ ký
Adapter SHALL gọi MoMo sandbox `POST /v2/gateway/api/create` với `requestType=captureWallet`, `autoCapture=true`, một `orderId` opaque duy nhất dưới 64 byte, một `requestId` ổn định cho retry, callback URL HTTPS và chữ ký HMAC-SHA256 theo đúng canonical field order của MoMo. Số tiền MUST nằm trong giới hạn sandbox và bằng tổng VND đã lưu.

#### Scenario: Tạo payment thành công
- **WHEN** domain yêu cầu tạo một payment attempt hợp lệ
- **THEN** adapter SHALL gửi payload đã ký đến host sandbox được allowlist và SHALL trả về các chỉ dẫn hợp lệ trong `payUrl`, `deeplink` hoặc `qrCodeUrl`

#### Scenario: Retry sau timeout tạo payment
- **WHEN** lời gọi create bị timeout và hệ thống thử lại
- **THEN** adapter MUST dùng lại cùng `requestId` và `orderId` thay vì tạo một giao dịch merchant mới

#### Scenario: Số tiền ngoài giới hạn sandbox
- **WHEN** số tiền nhỏ hơn 1.000 VND hoặc lớn hơn 50.000.000 VND
- **THEN** adapter SHALL từ chối trước khi gọi MoMo và trả lỗi domain có thể hiển thị an toàn

### Requirement: Xác thực phản hồi create và URL điều hướng
Adapter MUST kiểm tra schema, chữ ký phản hồi khi giao thức cung cấp chữ ký, các định danh tương quan và host của URL điều hướng. `resultCode=0` từ API create SHALL chỉ có nghĩa là intent được tạo thành công, không có nghĩa buyer đã thanh toán.

#### Scenario: Create trả resultCode bằng không
- **WHEN** MoMo chấp nhận yêu cầu create với `resultCode=0`
- **THEN** payment SHALL vẫn ở `PENDING` và UI SHALL có thể điều hướng buyer đến URL đã được allowlist

#### Scenario: MoMo trả URL host lạ
- **WHEN** phản hồi chứa `payUrl`, `deeplink` hoặc `qrCodeUrl` không thuộc scheme/host được cho phép
- **THEN** adapter MUST không đưa URL đó cho client và SHALL đánh dấu attempt cần điều tra/đối soát

#### Scenario: Phản hồi create sai tương quan
- **WHEN** orderId, requestId hoặc amount trong phản hồi không khớp attempt
- **THEN** adapter MUST không công nhận phản hồi và SHALL trả kết quả mismatch an toàn cho orchestration

### Requirement: IPN công khai nhưng được xác thực chặt chẽ
Backend SHALL cung cấp một endpoint IPN MoMo không yêu cầu session, CSRF hoặc Origin của buyer. Endpoint MUST xác thực JSON schema, HMAC bằng so sánh timing-safe, partnerCode, orderId, requestId, amount và currency trước khi phát sự kiện domain; endpoint SHALL trả HTTP 204 trong vòng 15 giây cho sự kiện đã tiếp nhận, kể cả bản trùng idempotent.

#### Scenario: IPN success hợp lệ
- **WHEN** MoMo gửi IPN có chữ ký hợp lệ và mọi trường tương quan khớp payment attempt
- **THEN** endpoint SHALL lưu event idempotent, ủy quyền finalize cho orchestration và phản hồi HTTP 204

#### Scenario: IPN sai chữ ký
- **WHEN** chữ ký không khớp canonical payload
- **THEN** endpoint MUST không thay đổi payment, SHALL ghi log bảo mật đã che dữ liệu và SHALL trả response không tiết lộ secret hoặc canonical string

#### Scenario: IPN đúng chữ ký nhưng sai amount
- **WHEN** IPN có chữ ký hợp lệ nhưng amount/currency không bằng dữ liệu server
- **THEN** endpoint MUST không chuyển payment sang `PAID` và SHALL đưa attempt vào đối soát

#### Scenario: IPN được gửi lặp
- **WHEN** cùng provider event hoặc cùng kết quả giao dịch được gửi nhiều lần
- **THEN** endpoint SHALL phản hồi idempotent và side effect domain MUST xảy ra tối đa một lần

### Requirement: Chuẩn hóa kết quả và thứ tự trạng thái MoMo
Adapter SHALL ánh xạ result code MoMo thành các trạng thái domain có phân biệt success, pending, user denied, merchant cancelled, expired, failure và unknown. Các mã pending như `1000`, `7000`, `7002` MUST còn đối soát; mã `0` và kết quả thành công/authorized hợp lệ của luồng auto-capture SHALL được công nhận theo tài liệu MoMo; mã lạ MUST là `UNKNOWN`, không phải success.

#### Scenario: Buyer từ chối thanh toán
- **WHEN** MoMo trả mã kết quả `1006`
- **THEN** adapter SHALL chuẩn hóa thành user-cancelled/failure cuối và orchestration SHALL giải phóng reservation

#### Scenario: QR hết hạn
- **WHEN** MoMo trả mã `1005`
- **THEN** adapter SHALL chuẩn hóa thành `EXPIRED`

#### Scenario: Kết quả đang xử lý
- **WHEN** MoMo trả một mã pending được hỗ trợ
- **THEN** adapter SHALL giữ payment có thể query lại và MUST không kết luận đã thanh toán hoặc thất bại

#### Scenario: Mã kết quả chưa biết
- **WHEN** MoMo trả result code không có trong bảng ánh xạ đã kiểm thử
- **THEN** adapter SHALL trả `UNKNOWN`, ghi metric và lên lịch query đối soát

### Requirement: Query trạng thái server-to-server
Adapter SHALL hỗ trợ MoMo `POST /v2/gateway/api/query` bằng request có chữ ký và timeout HTTP tối thiểu 30 giây, SHALL xác thực/đối chiếu phản hồi trước khi chuẩn hóa và SHALL không suy diễn thất bại từ lỗi mạng.

#### Scenario: Query xác nhận đã thanh toán
- **WHEN** query trả kết quả thành công có chữ ký và amount/định danh khớp
- **THEN** adapter SHALL trả xác nhận authoritative để orchestration finalize payment

#### Scenario: Query timeout
- **WHEN** MoMo không phản hồi trong timeout cấu hình
- **THEN** adapter SHALL trả lỗi tạm thời/unknown có thể retry và MUST không trả kết quả terminal failure

### Requirement: Hoàn tiền idempotent
Adapter SHALL hỗ trợ hoàn tiền toàn phần cho late success và SHALL nhận một merchant refund request id ổn định để retry. Kết quả refund MUST được đối chiếu với payment gốc và lưu provider transaction id mà không làm lặp số tiền hoàn.

#### Scenario: Refund thành công
- **WHEN** orchestration yêu cầu hoàn toàn bộ một late-success payment
- **THEN** adapter SHALL gửi refund đã ký, xác thực phản hồi và trả kết quả thành công có provider transaction id

#### Scenario: Refund timeout rồi retry
- **WHEN** lần gọi refund đầu tiên timeout
- **THEN** lần retry MUST dùng cùng merchant refund request id và hệ thống SHALL query/đối soát trước khi phát sinh yêu cầu hoàn mới

### Requirement: Cấu hình và quan sát an toàn
Credential MoMo MUST đến từ biến môi trường hoặc secret store, MUST không được commit và MUST được validate khi khởi động nếu MoMo được bật. Host API, redirect và IPN SHALL được kiểm soát theo môi trường; log/trace/metric MUST không chứa secret key, access key đầy đủ, chữ ký, raw payload nhạy cảm, payment URL đầy đủ hoặc dữ liệu định danh cá nhân.

#### Scenario: Thiếu credential khi bật MoMo
- **WHEN** ứng dụng khởi động với MoMo enabled nhưng thiếu partner code, access key hoặc secret key
- **THEN** cấu hình SHALL fail fast với thông báo không tiết lộ giá trị bí mật

#### Scenario: Ghi log request provider
- **WHEN** adapter log một lần create/query/refund hoặc IPN
- **THEN** log SHALL chỉ chứa correlation id nội bộ, operation, result class, latency và metadata đã che

### Requirement: Luồng UAT MoMo sandbox có thể lặp lại
Dự án SHALL tài liệu hóa và cung cấp lệnh opt-in để kiểm tra sandbox thật: cấu hình M4B sandbox, public HTTPS tunnel cho IPN, chạy web/API, tạo checkout MoMo, thanh toán bằng MoMo Test App, theo dõi IPN/trạng thái, query xác minh và kiểm tra refund. Lệnh sandbox MUST không chạy trong CI mặc định và MUST bỏ qua an toàn khi chưa có credential.

#### Scenario: Happy path sandbox
- **WHEN** tester có credential M4B sandbox, URL HTTPS công khai và ví MoMo Test App đã nạp tiền thực hiện thanh toán QR/deep link
- **THEN** IPN SHALL đến backend, trạng thái polling SHALL chuyển `PAID`, tài nguyên SHALL được tiêu thụ và query SHALL xác nhận cùng giao dịch

#### Scenario: Buyer hủy hoặc để hết hạn trong sandbox
- **WHEN** tester hủy trên Test App hoặc không hoàn tất trong thời hạn
- **THEN** trang kết quả SHALL không báo thành công, query/reconciliation SHALL đưa payment về trạng thái phù hợp và reservation SHALL được giải phóng khi kết quả terminal được xác nhận

#### Scenario: Replay IPN đã bắt được
- **WHEN** tester gửi lại cùng một payload IPN hợp lệ vào endpoint sandbox
- **THEN** endpoint SHALL phản hồi idempotent và dữ liệu business SHALL không có side effect lặp

#### Scenario: CI thông thường
- **WHEN** unit, integration và Playwright chạy không có credential hoặc truy cập MoMo
- **THEN** test suite SHALL dùng fixture chữ ký và fake adapter để kiểm tra success, failure, cancel, timeout, duplicate, reordered callback, late callback và reconciliation một cách xác định
