# Chạy Demo Carrier cục bộ

Demo Carrier chỉ dùng để mô phỏng, không gửi đơn đến hãng vận chuyển thật.

1. Sao chép `.env.example` thành `.env` và thay các giá trị bí mật cục bộ.
2. Chạy PostgreSQL marketplace như bình thường.
3. Chạy `docker compose --profile carrier up -d demo-carrier-postgres demo-carrier` để bật dịch vụ mô phỏng ở cổng 3010.
4. Đặt `DEMO_CARRIER_ENABLED=true` cho API marketplace rồi khởi động API và web.
5. Chạy seed cục bộ nếu cần dữ liệu mẫu. Tài khoản `an.nguyen@shopee-clone.local` được gán sẵn quyền Carrier Operator; đăng nhập tài khoản này rồi mở trang quản lý vận đơn.

Luồng thử nhanh: tạo đơn COD, đăng nhập tài khoản người bán, bấm bàn giao, sau đó mở trang vận chuyển và chuyển từng trạng thái. Có thể thử giao thất bại, giao lại, hoặc hoàn về shop.

Các khóa HMAC trong `.env` chỉ dùng giữa API và Demo Carrier. Khi đổi khóa, đặt khóa mới ở biến active và giữ khóa cũ ở biến previous trong thời gian ngắn rồi xóa khóa cũ.

Để khôi phục đăng ký thất bại, chọn “Đăng ký lại” trên vận đơn hiện có. Hệ thống giữ nguyên mã theo dõi và lịch sử; không tạo đơn trùng.

Giới hạn mô phỏng: dữ liệu Carrier hiện phục vụ kiểm thử cục bộ; không có đối soát với hãng thật, không tạo nhãn giao hàng thật và khoảng cách chỉ là ước tính theo snapshot địa điểm đã đóng gói.

Khi cần quay lui, dừng API trước, tắt profile Carrier, giữ nguyên database marketplace và chỉ gỡ phần migration Carrier sau khi đã sao lưu và xác nhận không còn vận đơn demo đang xử lý.
