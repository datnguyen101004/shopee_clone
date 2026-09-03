# Đặc tả UI/UX tích hợp thanh toán VNPAY redirect

## 1. Mục tiêu trải nghiệm

- Người mua hiểu rõ VNPAY là phương thức thanh toán trực tuyến và sẽ được chuyển sang cổng VNPAY.
- Người mua không nhập thông tin thẻ ngân hàng trực tiếp trong Shopee Clone.
- Người mua có thể chọn QR hoặc thẻ/ngân hàng trên giao diện do VNPAY cung cấp.
- Sau khi thanh toán, hủy hoặc gặp lỗi tại VNPAY, người mua được đưa về Shopee Clone và nhìn thấy trạng thái rõ ràng.
- Giao diện không tuyên bố “đã thanh toán” chỉ dựa trên nội dung của URL quay về.
- Không tự động gọi API lặp lại theo chu kỳ. Giao diện nhận cập nhật theo sự kiện, tải lại khi tab hoạt động trở lại và cho phép người mua chủ động kiểm tra.

## 2. Lựa chọn phương thức tại checkout

Khối “Phương thức thanh toán” giữ cùng bố cục card hiện tại và hiển thị ba radio option theo thứ tự:

1. Thanh toán khi nhận hàng (COD).
2. Ví MoMo (sandbox).
3. VNPAY (sandbox).

Mỗi option có vùng bấm tối thiểu 44 px, radio hiển thị rõ focus ring khi dùng bàn phím và toàn bộ hàng có thể click.

Khi chọn VNPAY, hiển thị phần mô tả ngay bên dưới:

> Bạn sẽ được chuyển sang cổng VNPAY để chọn quét mã QR hoặc thanh toán bằng thẻ/ngân hàng.

Không hiển thị hai option QR/thẻ trong checkout và không dựng form nhập số thẻ giả lập. Quyết định kênh thanh toán thuộc trang VNPAY.

Nút hành động cuối trang đổi nhãn theo phương thức:

- COD: “Đặt hàng”.
- MoMo: giữ hành vi hiện tại.
- VNPAY: “Thanh toán với VNPAY”.

## 3. Trạng thái trước khi chuyển sang VNPAY

Khi người mua nhấn “Thanh toán với VNPAY”:

- Nút chuyển sang disabled và hiển thị “Đang tạo thanh toán…”.
- Khối phản hồi dùng role status và thông báo “Đang kết nối tới VNPAY…”.
- Các trường checkout tạm thời không cho gửi lại nhưng không bị xóa khỏi màn hình.
- Nếu tạo URL thành công, trình duyệt điều hướng trong cùng tab sang VNPAY.
- Nếu thất bại trước khi điều hướng, giữ người mua ở checkout, hiển thị banner lỗi an toàn và nút “Thử lại”.

Không hiển thị mã lỗi nội bộ, chữ ký, URL đầy đủ hoặc thông tin cấu hình merchant.

## 4. Trang callback

Route frontend là /payment/callback. Đây là màn hình chuyển tiếp có chiều rộng tối đa khoảng 640 px, nằm giữa trang và sử dụng header/footer hiện có.

### Đang xác định giao dịch

- Spinner nhỏ hoặc progress indicator có nhãn truy cập được.
- Tiêu đề: “Đang kiểm tra kết quả thanh toán”.
- Nội dung: “Vui lòng chờ trong giây lát. Không đóng trang này.”
- Giao diện tải trạng thái backend lần đầu, sau đó polling có giới hạn với backoff cho tới khi IPN cập nhật trạng thái cuối cùng.

### Chờ xác nhận từ VNPAY

Nếu backend vẫn chưa có kết quả chắc chắn:

- Tiêu đề: “Đang chờ VNPAY xác nhận”.
- Nội dung: “Giao dịch chưa có kết quả cuối cùng. Đơn hàng của bạn vẫn được giữ trong thời hạn thanh toán.”
- Nút chính: “Kiểm tra lại”.
- Link phụ: “Xem đơn mua”.

Không hiển thị đồng hồ giả và không dùng polling không giới hạn. Callback dùng backoff có giới hạn,
dừng ngay khi backend đã có trạng thái cuối cùng hoặc hết thời gian thanh toán; không báo lỗi chỉ vì IPN đến sau Return URL.

Khi tab được đưa về foreground, giao diện tải lại trạng thái một lần. Nút “Kiểm tra lại” phải có trạng thái loading và chống click lặp.

### Thành công

- Biểu tượng check màu xanh.
- Tiêu đề: “Thanh toán thành công”.
- Nội dung: “VNPAY đã xác nhận thanh toán. Đơn hàng đã được chuyển cho shop xử lý.”
- Nút chính: “Xem đơn mua”.
- Khi backend trả trạng thái cuối cùng, callback tự dùng router.replace sang chi tiết ShopOrder nếu giao dịch chỉ có một shop; giao dịch nhiều shop được đưa về danh sách đơn mua.

### Người mua hủy

- Biểu tượng trung tính, không dùng màu đỏ như lỗi hệ thống.
- Tiêu đề: “Bạn đã hủy thanh toán”.
- Nội dung nêu rõ đơn vẫn chờ thanh toán trong thời hạn giữ hàng.
- Nút chính: “Thanh toán lại”.
- Link phụ: “Xem đơn mua”.

### Thanh toán thất bại

- Banner màu đỏ nhạt và biểu tượng cảnh báo.
- Tiêu đề: “Thanh toán không thành công”.
- Nội dung ngắn gọn, không suy đoán nguyên nhân ngân hàng.
- Nút chính: “Thử thanh toán lại”.
- Link phụ: “Xem đơn mua”.

### Phiên hết hạn

- Tiêu đề: “Phiên thanh toán đã hết hạn”.
- Nếu purchase còn trong thời hạn giữ hàng, hiển thị nút “Tạo phiên thanh toán mới”.
- Nếu thời hạn giữ hàng cũng đã hết, hiển thị “Quay lại giỏ hàng”.

### Không tìm thấy hoặc không có quyền

- Không tiết lộ giao dịch có tồn tại hay thuộc tài khoản nào.
- Tiêu đề: “Không thể mở giao dịch này”.
- Nút: “Về đơn mua”.
- Với người dùng chưa đăng nhập, chuyển tới đăng nhập và giữ returnTo an toàn.

## 5. Trang đơn mua

Mỗi card và trang chi tiết là một ShopOrder duy nhất: một shop có thể chứa nhiều sản phẩm.
Nếu một lần checkout có nhiều shop, danh sách hiển thị nhiều đơn tương ứng; `purchaseReference`
chỉ dùng để đối soát/thanh toán và không thay thế `orderReference` trên đường dẫn buyer.

Danh sách và chi tiết đơn mua hiển thị canonical order status cùng payment status riêng:

- ShopOrder `PENDING_PAYMENT`: “Chờ thanh toán”.
- ShopOrder `PENDING_CONFIRMATION`: “Chờ xác nhận”.
- ShopOrder `CANCELLED`: “Đã hủy”.

- PENDING_RECONCILIATION hoặc UNKNOWN: “Đang xác minh thanh toán”.
- PAID: “Đã thanh toán”.
- FAILED: “Thanh toán thất bại”.
- CANCELLED: “Thanh toán đã hủy”.
- EXPIRED: “Phiên thanh toán hết hạn”.

Trong lúc chưa PAID, không hiển thị nội dung khiến người mua hiểu rằng shop đã xác nhận hoặc đang chuẩn bị hàng. Khi giao dịch VNPAY kết thúc thất bại, đơn được hiển thị là **Đã hủy** và CTA dẫn về giỏ hàng để tạo checkout mới; không retry trên cùng Purchase.

### Tab chờ thanh toán

Danh sách đơn mua có tab **Chờ thanh toán** với giá trị chuẩn `filter=PENDING_PAYMENT`.
Tab này gọi filter server-side và chỉ bao gồm ShopOrder có canonical order status
`PENDING_PAYMENT`. Đơn COD bắt đầu ở `PENDING_CONFIRMATION`; các payment status
terminal không nằm trong tab này.

### Tab vận chuyển của đơn mua

Danh sách đơn mua chỉ hiển thị một tab **Vận chuyển** với giá trị chuẩn
`filter=SHIPPING`. Tab này bao gồm cả đơn có trạng thái fulfillment
`AWAITING_PICKUP` (Chờ lấy hàng) và `SHIPPING` (Đang giao); hai trạng thái domain
không bị đổi tên hoặc gộp trong dữ liệu. Trên card, trang chi tiết và timeline vẫn
hiển thị nhãn granular tương ứng. Liên kết cũ `filter=AWAITING_PICKUP` được chuyển
đổi sang `filter=SHIPPING` khi truy cập.

## 6. Responsive và accessibility

- Mobile: card callback chiếm chiều rộng khả dụng, CTA xếp dọc và full width.
- Tablet/Desktop: card nằm giữa, CTA chính và phụ có thể nằm cùng hàng.
- Nội dung trạng thái dùng aria-live polite; lỗi dùng role alert.
- Spinner có văn bản thay thế; không dựa chỉ vào màu sắc để phân biệt trạng thái.
- Focus được chuyển tới tiêu đề trạng thái khi callback đổi từ loading sang terminal.
- Hỗ trợ prefers-reduced-motion; transition màu/opacity trong khoảng 150–200 ms và không dùng animation lặp vô hạn ngoài progress indicator thiết yếu.

## 7. Nguyên tắc nội dung

- Luôn dùng “VNPAY”, không hiển thị tên biến cấu hình hoặc thuật ngữ IPN cho người mua.
- Không dùng query parameter từ Return URL để viết “thành công”.
- Khi chưa chắc chắn, dùng “đang xác nhận”, không dùng “lỗi”.
- Giao dịch VNPAY terminal không được retry trên cùng Purchase; CTA tạo đơn mới từ
  giỏ hàng và luôn tạo payment session/transaction reference mới.
