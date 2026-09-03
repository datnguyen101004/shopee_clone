# Luồng vận chuyển Demo Carrier

## 1. Người mua chọn cách giao hàng

Khi người mua chọn địa chỉ nhận hàng và mở giỏ hàng, hệ thống chia các sản phẩm theo từng shop. Mỗi shop có một báo giá vận chuyển riêng dựa trên khoảng cách từ điểm lấy hàng của shop đến quận giao hàng, khối lượng và cách giao đã chọn.

Ví dụ: một shop ở Hà Nội gửi hai sản phẩm nặng tổng cộng 1 kg đến Quận 1, Thành phố Hồ Chí Minh. Hệ thống hiển thị khoảng cách ước tính, thời gian dự kiến và từng phần phí. Người mua chỉ thấy đây là mô phỏng, không phải yêu cầu giao hàng thật.

Nếu địa chỉ người mua thiếu tỉnh hoặc quận, hoặc shop chưa có địa chỉ lấy hàng, báo giá của shop đó bị dừng và màn hình chỉ rõ thông tin cần bổ sung. Tổng tiền cũ không được dùng để đặt hàng.

## 2. Đặt đơn và bàn giao

Sau khi người mua xác nhận đơn COD, đơn của từng shop giữ nguyên phí vận chuyển đã được xác nhận. Người bán lần lượt xác nhận, chuẩn bị hàng và bấm “Bàn giao vận chuyển”.

Ngay lúc bàn giao, đơn có mã theo dõi bắt đầu bằng “DEMO-” và trạng thái “Đang chờ đăng ký”. Việc bấm lại hoặc mất phản hồi không tạo thêm đơn hay mã mới.

## 3. Nhân viên vận chuyển điều khiển trạng thái

Tài khoản có quyền Carrier Operator mở trang quản lý vận chuyển. Trang này chỉ là khu vực mô phỏng, có bảng tổng quan và danh sách vận đơn. Chọn một vận đơn sẽ thấy lịch sử và các nút hợp lệ ở bước hiện tại.

Trình tự giao thành công thường là: “Đã tạo vận đơn” → “Đã tiếp nhận” → “Đang vận chuyển” → “Đang giao hàng” → “Đã giao hàng”. Mỗi lần chuyển bước tạo thêm một mốc thời gian, không sửa các mốc cũ.

## 4. Giao không thành công, giao lại hoặc hoàn

Tại bước “Đang giao hàng”, nhân viên có thể chọn “Giả lập giao thất bại” và ghi lý do như không liên lạc được người nhận hoặc sai địa chỉ.

Từ “Giao hàng chưa thành công”, có hai hướng:

- Chọn “Giao lại” để quay về “Đang giao hàng”, sau đó tiếp tục giao.
- Chọn “Bắt đầu hoàn” rồi “Hoàn về shop” để kết thúc ở “Đã hoàn về shop”. Hàng hoàn không tự động nhập lại kho.

Khi giao thành công, đơn marketplace chuyển sang “Đã giao”. Khi hoàn về shop, đơn chuyển sang trạng thái bị hủy do hoàn không giao được. Các trạng thái này được lưu theo đúng thứ tự xảy ra.

## 5. Đăng ký lại và lỗi tạm thời

Nếu dịch vụ mô phỏng tạm thời không phản hồi, hệ thống thử lại một số lần với khoảng chờ tăng dần. Trong thời gian đó vận đơn vẫn hiện “Đang chờ đăng ký”. Khi hết lượt thử, vận đơn hiện “Đăng ký thất bại” để Carrier Operator bấm “Đăng ký lại”. Đăng ký lại dùng chính mã theo dõi cũ, không tạo vận đơn thứ hai.

## 6. Đồng bộ và an toàn dữ liệu

Mỗi cập nhật từ Demo Carrier được kiểm tra chữ ký và thời gian gửi. Gửi lại cùng một cập nhật chỉ trả lại kết quả cũ; cập nhật trễ hoặc đi lùi được ghi nhận là cũ và không làm trạng thái quay ngược.

Người mua và người bán chỉ xem được vận đơn thuộc đơn của mình. Người không có quyền Carrier Operator không nhìn thấy trang quản lý. Các bản ghi lịch sử đơn hàng cũ dùng vận chuyển `MOCK` vẫn được hiển thị như trước.
