## Why

Hệ thống hiện chỉ hỗ trợ COD nên chưa thể xác nhận thanh toán online một cách an toàn, đối soát được và độc lập với trình duyệt. Issue #33 yêu cầu bổ sung adapter MoMo sandbox có thể thay thế, bảo vệ bí mật và xử lý đúng callback trùng, sai thứ tự, timeout cũng như giao dịch về muộn trước khi mở rộng sang môi trường thật.

## What Changes

- Bổ sung lựa chọn MoMo bên cạnh COD tại checkout, tạo một giao dịch thanh toán cho toàn bộ `Purchase` nhiều shop và hiển thị URL/deep link/QR do MoMo trả về.
- Bổ sung lifecycle thanh toán server-authoritative: giữ tồn kho và voucher khi chờ thanh toán, chỉ ghi nhận đã thanh toán và tiêu thụ tài nguyên sau IPN hoặc truy vấn server-to-server hợp lệ.
- Tách cổng `PaymentProvider` khỏi adapter `MomoSandboxAdapter` để có thể kiểm thử bằng fake adapter và thay nhà cung cấp mà không làm rò rỉ quy tắc MoMo vào domain checkout/order.
- Xác thực HMAC, đối chiếu merchant/order/request/amount/currency, lưu sự kiện idempotent và ngăn callback trùng hoặc sai thứ tự làm thoái lui trạng thái.
- Bổ sung hết hạn, đối soát giao dịch pending/unknown và xử lý giao dịch thành công về muộn bằng luồng hoàn tiền thay vì tự phục hồi đơn đã giải phóng tài nguyên.
- Bổ sung trang chờ/kết quả thanh toán chỉ đọc trạng thái từ backend; redirect từ trình duyệt không được phép đánh dấu đơn đã thanh toán.
- Bổ sung chiến lược kiểm thử nhiều tầng và luồng UAT MoMo sandbox qua public HTTPS tunnel; kiểm thử tự động thông thường dùng fake adapter, còn sandbox thật chạy thủ công hoặc opt-in.
- Giữ nguyên COD và các API COD tương thích hiện tại; không có thay đổi breaking trong phạm vi change này.

## Capabilities

### New Capabilities

- `online-payment-orchestration`: Điều phối thanh toán online cấp Purchase, vòng đời trạng thái, giữ/tiêu thụ/giải phóng tồn kho và voucher, quyền xử lý đơn, idempotency và đối soát.
- `momo-sandbox-payment`: Hợp đồng adapter MoMo One-Time Wallet sandbox, tạo payment URL/QR, ký và xác thực thông điệp, IPN/query/refund, cấu hình an toàn và luồng kiểm thử sandbox.

### Modified Capabilities

Không có. Các capability checkout/order trước đây chưa có main spec trong `openspec/specs`; yêu cầu mới được mô tả đầy đủ trong hai capability mới và COD tiếp tục hoạt động như hiện tại.

## Impact

- Backend NestJS: checkout/order, inventory reservation, voucher usage, notifications và module thanh toán mới dưới `/api/v1`.
- PostgreSQL/Prisma: mở rộng phương thức/trạng thái thanh toán và thêm payment attempt, event, refund cùng các ràng buộc idempotency.
- Frontend Next.js: bộ chọn COD/MoMo, bước chuyển sang MoMo, trang chờ/kết quả và trạng thái lỗi/hết hạn/hoàn tiền.
- Cấu hình vận hành: thông tin M4B sandbox, URL redirect/IPN HTTPS công khai, job đối soát và logging/metrics không chứa bí mật.
- Kiểm thử: unit, adapter contract, integration PostgreSQL, HTTP/Supertest, Playwright với fake adapter và checklist UAT sandbox opt-in.
