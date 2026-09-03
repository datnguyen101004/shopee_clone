## Why

Biểu mẫu địa chỉ hiện đã có popup tra cứu tỉnh/thành và quận/huyện nhưng phường/xã vẫn là ô nhập tự do, khiến trải nghiệm không nhất quán và dễ lưu sai chính tả hoặc địa chỉ không thuộc quận/huyện đã chọn. Cần bổ sung dữ liệu phường/xã theo bộ đơn vị hành chính cũ để hoàn thiện luồng chọn địa chỉ phụ thuộc.

## What Changes

- Bổ sung snapshot phường/xã cũ có mã định danh và quan hệ với quận/huyện tương ứng, kèm kiểm tra tính toàn vẹn và thông tin nguồn dữ liệu.
- Thay ô nhập tự do Phường/Xã bằng popup có tìm kiếm không phân biệt dấu và chữ hoa/thường.
- Chỉ hiển thị phường/xã thuộc quận/huyện đang chọn; tự xóa phường/xã khi đổi tỉnh/thành hoặc quận/huyện làm lựa chọn hiện tại không còn hợp lệ.
- Với 5 huyện đặc thù không tổ chức cấp xã trong snapshot, hiển thị và lưu sentinel `Không có đơn vị hành chính cấp xã` để form vẫn hợp lệ mà không tạo tên phường/xã giả.
- Nhận diện dữ liệu địa chỉ cũ đã lưu ở dạng không dấu hoặc viết tắt, đồng thời không làm mất giá trị chưa nhận diện nếu người dùng chưa thay đổi cấp cha.
- Giữ nguyên hợp đồng API và database: tỉnh/thành, quận/huyện và phường/xã tiếp tục được lưu dưới dạng chuỗi dễ đọc.
- Bổ sung test, tài liệu hướng dẫn kiểm tra màn hình và cập nhật sơ đồ luồng địa chỉ.

## Capabilities

### New Capabilities

- `legacy-address-selector`: Cung cấp luồng chọn tỉnh/thành → quận/huyện → phường/xã theo snapshot đơn vị hành chính cũ, có tìm kiếm, quan hệ phụ thuộc và tương thích dữ liệu địa chỉ đã lưu.

### Modified Capabilities

Không có.

## Impact

- Frontend Next.js: dữ liệu hành chính cũ, hàm tra cứu, component popup địa chỉ và màn hình quản lý địa chỉ tài khoản.
- Test frontend/data: tính toàn vẹn snapshot, tra cứu không dấu, reset lựa chọn phụ thuộc và payload lưu địa chỉ.
- Tài liệu: `docs/account-management.md` và `flow.md`.
- Không thay đổi endpoint, DTO, Prisma schema hoặc migration; backend tiếp tục nhận và lưu trường `ward` dạng chuỗi.
