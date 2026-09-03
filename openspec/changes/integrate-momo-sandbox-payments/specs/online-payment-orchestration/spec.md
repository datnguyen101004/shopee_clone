## ADDED Requirements

### Requirement: Lựa chọn phương thức thanh toán tương thích COD
Hệ thống SHALL cho phép buyer chọn `COD` hoặc `MOMO` trong bước checkout, SHALL giữ nguyên hành vi và API COD hiện có, và MUST tính lại toàn bộ giá trị đơn ở server trước khi tạo Purchase.

#### Scenario: Buyer tiếp tục thanh toán COD
- **WHEN** buyer xác nhận checkout với phương thức `COD`
- **THEN** hệ thống SHALL hoàn tất luồng COD hiện tại mà không tạo payment attempt online

#### Scenario: Buyer chọn MoMo
- **WHEN** buyer xác nhận checkout hợp lệ với phương thức `MOMO`
- **THEN** hệ thống SHALL tạo một payment attempt cho toàn bộ Purchase và trả về chỉ dẫn thanh toán online

### Requirement: Thanh toán online ở cấp Purchase nhiều shop
Hệ thống SHALL liên kết đúng một payment attempt đang hoạt động với tổng tiền phải trả của một Purchase, kể cả khi Purchase chứa nhiều ShopOrder, và MUST sử dụng số tiền VND nguyên theo minor unit do server tính.

#### Scenario: Checkout chứa sản phẩm của nhiều shop
- **WHEN** server tạo một Purchase có từ hai ShopOrder với phương thức MoMo
- **THEN** hệ thống SHALL yêu cầu một giao dịch MoMo bằng đúng `payableTotalMinor` của Purchase và SHALL áp dụng kết quả thanh toán nguyên tử cho mọi ShopOrder thuộc Purchase

#### Scenario: Client gửi tổng tiền khác
- **WHEN** client gửi số tiền không khớp với phép tính checkout của server
- **THEN** hệ thống MUST bỏ qua giá trị từ client và MUST không tạo payment attempt bằng số tiền đó

### Requirement: Tạo intent và giữ tài nguyên trước khi gọi provider
Hệ thống MUST tạo Purchase, ShopOrder, payment attempt cùng reservation tồn kho và voucher trong một transaction cơ sở dữ liệu; transaction MUST commit trước khi gọi provider. Trong lúc payment đang chờ, tồn kho và voucher SHALL ở trạng thái giữ, chưa bị tiêu thụ.

#### Scenario: Lưu intent thành công
- **WHEN** transaction checkout MoMo commit thành công
- **THEN** Purchase SHALL có trạng thái thanh toán `PENDING`, payment attempt SHALL có định danh ổn định, và tồn kho/voucher SHALL được giữ đến hạn

#### Scenario: Transaction tạo intent thất bại
- **WHEN** bất kỳ thao tác ghi Purchase, payment attempt hoặc reservation thất bại
- **THEN** transaction MUST rollback toàn bộ và hệ thống MUST không gọi MoMo

#### Scenario: Provider phản hồi chậm
- **WHEN** lời gọi tạo giao dịch MoMo đang chờ hoặc timeout
- **THEN** transaction cơ sở dữ liệu MUST không còn mở và payment attempt SHALL chuyển sang trạng thái cần đối soát thay vì bị kết luận thất bại

### Requirement: Provider là nguồn xác nhận thanh toán có thẩm quyền
Hệ thống MUST chỉ chuyển payment sang `PAID` sau một IPN hợp lệ hoặc kết quả query server-to-server hợp lệ. Redirect, query string hoặc nội dung do client gửi MUST không được thay đổi trạng thái thanh toán.

#### Scenario: Buyer quay lại từ MoMo
- **WHEN** trình duyệt mở redirect URL với kết quả được cho là thành công
- **THEN** trang kết quả SHALL chỉ truy vấn trạng thái backend và MUST không đánh dấu Purchase đã thanh toán

#### Scenario: IPN thành công hợp lệ
- **WHEN** backend nhận một sự kiện thành công đã vượt qua xác thực provider và khớp payment attempt
- **THEN** hệ thống SHALL nguyên tử chuyển Purchase sang `PAID`, tiêu thụ reservation tồn kho/voucher đúng một lần, cập nhật timeline và phát notification

#### Scenario: Xác nhận thanh toán không khớp
- **WHEN** sự kiện provider có merchant, order, request, amount hoặc currency không khớp dữ liệu đã lưu
- **THEN** hệ thống MUST không đánh dấu đã thanh toán, SHALL ghi nhận bất thường an toàn và SHALL đưa attempt vào đối soát

### Requirement: Cổng xử lý đơn phụ thuộc trạng thái thanh toán
Hệ thống MUST chỉ cho seller xử lý ShopOrder khi Purchase dùng COD hoặc payment online đã ở trạng thái `PAID`.

#### Scenario: Seller mở đơn MoMo đang chờ
- **WHEN** seller xem hoặc cố nhận xử lý một ShopOrder có payment `PENDING`
- **THEN** hệ thống SHALL hiển thị đơn chưa sẵn sàng và MUST từ chối thao tác fulfillment

#### Scenario: Payment MoMo đã xác nhận
- **WHEN** payment của Purchase chuyển sang `PAID`
- **THEN** mọi ShopOrder thuộc Purchase SHALL trở nên đủ điều kiện cho luồng fulfillment hiện có

### Requirement: Chuyển trạng thái idempotent và không thoái lui
Hệ thống SHALL lưu payment event dạng append-only, MUST có khóa duy nhất để khử trùng lặp, và MUST áp dụng quy tắc ưu tiên trạng thái để callback trùng hoặc sai thứ tự không gây side effect lặp hay làm thoái lui trạng thái cuối.

#### Scenario: MoMo gửi lại cùng IPN
- **WHEN** backend nhận lại sự kiện provider đã được xử lý
- **THEN** endpoint SHALL phản hồi thành công idempotent và tồn kho, voucher, timeline cùng notification MUST không được xử lý lần hai

#### Scenario: Callback pending đến sau success
- **WHEN** payment đã `PAID` rồi nhận callback pending có thời gian xử lý muộn hơn
- **THEN** payment SHALL giữ `PAID` và hệ thống MUST không giải phóng reservation hay hạ trạng thái

#### Scenario: Callback thất bại đến sau trạng thái cuối
- **WHEN** payment đã ở trạng thái cuối hợp lệ rồi nhận callback thất bại hoặc hủy cũ hơn
- **THEN** hệ thống SHALL lưu sự kiện để audit nhưng MUST không thay đổi kết quả cuối

### Requirement: Hết hạn, thất bại và giải phóng tài nguyên
Hệ thống SHALL áp dụng thời hạn thanh toán online được cấu hình không dài hơn thời hạn giữ tồn kho. Khi provider xác nhận thất bại/hủy hoặc khi đối soát xác nhận hết hạn, hệ thống SHALL kết thúc Purchase không thanh toán và giải phóng tồn kho/voucher đúng một lần; phiên bản đầu MUST yêu cầu buyer checkout lại thay vì tự phục hồi giỏ hàng.

#### Scenario: Buyer hủy thanh toán
- **WHEN** provider xác nhận giao dịch bị buyer hủy
- **THEN** Purchase và các ShopOrder SHALL chuyển sang trạng thái kết thúc phù hợp, payment SHALL là `CANCELLED`, và reservation SHALL được giải phóng đúng một lần

#### Scenario: Payment hết hạn
- **WHEN** thời hạn local đã qua và query provider xác nhận giao dịch không thành công
- **THEN** payment SHALL chuyển `EXPIRED`, reservation SHALL được giải phóng, và UI SHALL hướng dẫn buyer checkout lại

#### Scenario: Hết hạn local nhưng provider chưa thể xác minh
- **WHEN** đã qua thời hạn nhưng query provider timeout hoặc trả trạng thái chưa xác định
- **THEN** hệ thống SHALL giữ trạng thái cần đối soát và MUST không suy diễn `FAILED` chỉ từ lỗi mạng

### Requirement: Đối soát giao dịch pending hoặc unknown
Hệ thống SHALL có job lặp lại để query provider cho các payment attempt `PENDING`, `UNKNOWN` hoặc quá hạn chưa có kết quả chắc chắn, với retry có backoff và giới hạn cạnh tranh an toàn.

#### Scenario: Mất IPN nhưng query trả thành công
- **WHEN** job đối soát query một attempt pending và provider xác nhận thành công hợp lệ
- **THEN** hệ thống SHALL áp dụng cùng đường finalize idempotent như IPN và chuyển Purchase sang `PAID`

#### Scenario: Query bị timeout
- **WHEN** provider query timeout hoặc lỗi tạm thời
- **THEN** attempt SHALL vẫn có thể đối soát, lần thử sau SHALL được lên lịch, và hệ thống MUST không giải phóng tài nguyên như một thất bại đã xác nhận

### Requirement: Xử lý thành công về muộn sau khi đã giải phóng tài nguyên
Hệ thống MUST không tự phục hồi Purchase đã kết thúc nếu provider báo thành công sau khi reservation đã được giải phóng. Hệ thống SHALL chuyển giao dịch sang `REFUND_PENDING`, chặn fulfillment và yêu cầu hoàn lại toàn bộ số tiền qua provider.

#### Scenario: Success đến sau expiry đã giải phóng tồn kho
- **WHEN** một xác nhận thành công hợp lệ đến sau khi Purchase đã hết hạn và tài nguyên đã được giải phóng
- **THEN** hệ thống MUST giữ ShopOrder không thể fulfillment, SHALL tạo refund idempotent toàn phần và SHALL hiển thị trạng thái đang hoàn tiền cho buyer

#### Scenario: Hoàn tiền late success hoàn tất
- **WHEN** provider xác nhận refund toàn phần thành công
- **THEN** payment SHALL chuyển `REFUNDED`, refund SHALL lưu provider transaction id, và buyer SHALL nhận được notification

### Requirement: API trạng thái thanh toán và trải nghiệm chờ
Hệ thống SHALL cung cấp API owner-scoped để buyer đọc trạng thái payment theo public reference không đoán được. UI SHALL có trạng thái đang tạo, chờ thanh toán, đã thanh toán, thất bại, hủy, hết hạn, cần đối soát và đang/đã hoàn tiền; UI MUST không hiển thị dữ liệu provider nhạy cảm.

#### Scenario: Chủ Purchase theo dõi payment
- **WHEN** buyer đã đăng nhập truy vấn payment reference thuộc Purchase của mình
- **THEN** API SHALL trả trạng thái chuẩn hóa, thời hạn và hành động an toàn tiếp theo để UI polling

#### Scenario: Người khác truy vấn payment
- **WHEN** một tài khoản truy vấn payment reference không thuộc mình
- **THEN** API MUST không tiết lộ sự tồn tại hoặc chi tiết giao dịch đó
