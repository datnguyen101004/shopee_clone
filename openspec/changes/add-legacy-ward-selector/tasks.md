## 1. Chuẩn bị snapshot phường/xã cũ

- [x] 1.1 Trích xuất snapshot phường/xã tại ngày 2025-06-30 từ cùng nguồn DMDVHC đang dùng, ghi lại source/date/count và tạo artifact TypeScript xác định `districtCode -> wards`.
- [x] 1.2 Bổ sung type `LegacyWard`, export metadata cần thiết và loader tải lười ward artifact mà không phát sinh request mạng ngoài ở runtime.
- [x] 1.3 Mở rộng data test để pin 10.035 phường/xã, kiểm tra mã duy nhất, tên không rỗng, quận cha tồn tại, 691 quận có danh sách hợp lệ và đúng 5 mã huyện không tổ chức cấp xã.

## 2. Tra cứu địa chỉ ba cấp

- [x] 2.1 Bổ sung resolver phường/xã theo quận/huyện, dùng chung chuẩn hóa dấu, chữ hoa/thường, khoảng trắng và alias được hỗ trợ.
- [x] 2.2 Bổ sung lookup test cho tên canonical, tên không dấu, phạm vi theo quận/huyện, tên trùng ở nhánh khác và giá trị không nhận diện.

## 3. Tích hợp popup Phường/Xã

- [x] 3.1 Tổng quát hóa popup hiện có để hỗ trợ field `ward`, trạng thái loading/error/retry và accessibility tương đương tỉnh/quận.
- [x] 3.2 Mở rộng `LegacyAdministrativeDivisionFields` với `initialWard`, `wardError`, tải danh sách theo quận đã resolve và hidden input `ward`.
- [x] 3.3 Áp dụng quy tắc state: đổi tỉnh xóa quận + phường, đổi quận xóa phường, chọn lại cùng cấp cha giữ cấp con, và bảo toàn giá trị cũ chưa nhận diện khi cấp cha không đổi.
- [x] 3.3a Tự chọn sentinel `Không có đơn vị hành chính cấp xã` và hiển thị ward chỉ đọc khi người dùng chọn một trong 5 huyện đặc thù.
- [x] 3.4 Thay ô nhập Phường/Xã trong `AddressManagement` bằng popup ba cấp, giữ nguyên validation và payload create/update dạng chuỗi.
- [x] 3.5 Điều chỉnh CSS responsive để popup/danh sách phường/xã hiển thị và cuộn đúng trên desktop lẫn mobile.

## 4. Kiểm thử hành vi form

- [x] 4.1 Bổ sung component test cho disabled trước khi chọn quận, loading, retry, tìm kiếm không dấu, empty state, chọn ward và thao tác bàn phím.
- [x] 4.2 Bổ sung test reset phụ thuộc khi đổi tỉnh/quận, giữ ward khi chọn lại cùng cha, bảo toàn ward cũ ngoài snapshot và xử lý sentinel cho 5 huyện không có cấp xã.
- [x] 4.3 Bổ sung test tích hợp AddressManagement xác nhận create/update gửi tên `ward`, hiển thị validation và tải lại địa chỉ đã lưu đúng.

## 5. Tài liệu và xác minh

- [x] 5.1 Cập nhật `docs/account-management.md` với nguồn/count snapshot ba cấp và hướng dẫn kiểm tra màn hình Tài khoản → Địa chỉ.
- [x] 5.2 Cập nhật `flow.md` với luồng popup tỉnh → quận → phường, các nhánh reset và endpoint lưu địa chỉ hiện có.
- [x] 5.3 Chạy format/lint, typecheck, các test frontend/data liên quan, build web và `pnpm test:e2e:homepage:quick`; ghi nhận kết quả trước khi hoàn tất change.
