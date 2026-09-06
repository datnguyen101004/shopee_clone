---
name: seller-workspace-ui
description: "Xây dựng, đồng bộ và sửa UI dashboard quản lý Seller xanh dương trắng theo mẫu Sản phẩm của Shopee Clone, gồm bảng, form, popup, Voucher và Chat. Dùng khi chỉnh UI Seller hoặc khi được yêu cầu áp dụng mẫu này cho phân hệ khác."
---

# Seller Workspace UI

## Nguồn chuẩn

Đọc [UI-SPEC.md](../../../../docs/ui-ux/seller-workspace/UI-SPEC.md) và [CORRECTIONS.md](../../../../docs/ui-ux/seller-workspace/CORRECTIONS.md) trước khi sửa UI. Đây là chuẩn trong repository, dùng được khi không có MCP hoặc lịch sử hội thoại. Đường dẫn liên kết tính từ thư mục skill; đường dẫn code trong spec tính từ gốc repository.

Mẫu là dashboard xanh dương–trắng: sidebar/header dùng chung, toolbar căn đáy, label trên dropdown, bảng/card nối footer, form theo section và hành động ở cuối. Voucher dùng popup sửa tại chỗ; Chat là trang trong sidebar. Đọc phần biến thể tương ứng trong spec, không ép mọi màn thành bảng Sản phẩm.

Khi người dùng yêu cầu migration layout sang Admin/phân hệ khác, hoặc kiểm tra vì sao migration chưa giống Seller, đọc [references/layout-migration.md](references/layout-migration.md). Với Admin, đọc thêm [đặc tả Admin](../../../../docs/ui-ux/admin-workspace/UI-SPEC.md). Phân biệt đổi theme với chuyển cấu trúc layout; không lấy việc đã gắn class xanh/trắng làm bằng chứng migration hoàn chỉnh. Yêu cầu chỉ cập nhật skill hoặc cung cấp prompt không cho phép bắt đầu migration ứng dụng.

## Thực hiện qua một yêu cầu

1. Xác định các route/vùng người dùng giao từ prompt và ngữ cảnh; đọc AGENTS.md áp dụng, diff và component/CSS/API liên quan. Nếu chỉ hỏi tài liệu, review hay prompt thì trả đúng phạm vi đó. Refactor code thuần giữ UI; chỉ redesign khi được yêu cầu.
2. Lập checklist ngắn theo từng màn: shell, toolbar, bảng/card, footer, form/modal và responsive. Với yêu cầu triển khai, tiếp tục sửa đến hết phạm vi, không dừng ở kế hoạch hoặc đòi gọi skill khác.
3. Ưu tiên component/variant và `--sp-*` sẵn có. Sửa nguồn dùng chung trước các consumer phụ thuộc; tách component/hook khi có trách nhiệm thực cần tách. Giữ API, quyền/shop gate, lifecycle, validation, draft và pagination. Không tạo số liệu hay tính năng backend giả để lấp thiết kế.
4. Kiểm tra cascade/layer/media query trước khi thêm CSS. Giới hạn variant Seller ở consumer Seller, đặc biệt Chat và Trả hàng dùng chung với Buyer/Admin. Không tự đổi token brand toàn ứng dụng; không quét/refactor phần không được giao.
5. Sau mỗi nhóm sửa, dùng scripts thực tế của package để kiểm tra code và hành vi bị ảnh hưởng; đối chiếu render desktop/mobile khi có thể. Chỉ chạy E2E khi người dùng yêu cầu. Sửa sai lệch trong phạm vi rồi mới chuyển nhóm tiếp theo; không chạy lại kiểm tra đã đạt nếu không có thay đổi/nghi vấn mới.
6. Báo riêng kết quả triển khai, kiểm tra hành vi và thị giác. Không dùng số unit tests pass để khẳng định UI giống mẫu. Nếu chưa xem render, ghi rõ chưa xác minh thị giác và những route/trạng thái còn thiếu bằng chứng.

Yêu cầu mới nhất của người dùng ưu tiên hơn spec. Khi phản hồi cho thấy quy tắc thiếu/sai, cập nhật đúng mục trong UI-SPEC và ghi bài học có bằng chứng tại CORRECTIONS. Không tự tạo change OpenSpec hay cổng xác nhận từ skill này; công việc thuộc change đã có thì tuân theo workflow của change đó.

## Thiết kế offline

Khi cần triển khai chi tiết hai frame Sản phẩm gốc, đọc [bộ bàn giao Figma](../../../../docs/ui-ux/seller-products-figma/README.md) và mở ảnh trong bộ đó. Không cần giải nén khi thư mục đã có, không bắt buộc MCP để đọc tài liệu offline. Các chỉnh sửa mới về Voucher/Chat lấy UI-SPEC làm chuẩn, không lấy mặc định cam của storefront hoặc screenshot cũ thay thế yêu cầu mới.
