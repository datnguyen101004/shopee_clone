# Kế hoạch triển khai cho agent nhận bàn giao

Checklist được cập nhật sau bàn giao. Dấu [x] ở hạng mục triển khai chỉ ghi nhận code đã thay đổi, không thay thế nghiệm thu thị giác. User muốn cả hai frame; không kết thúc ở danh sách mà bỏ editor. Khi mở rộng Seller, đối chiếu [FORMAT.md](../seller-workspace/FORMAT.md).

## 1. Đối chiếu code và ranh giới

- [x] Đọc README, UI-SPEC, IMPLEMENTATION, PROJECT-ADAPTATION và asset-resolution.json; mở hai screenshot và đọc AGENTS.md áp dụng.
- [x] Kiểm tra routes list/view/edit/new, shell cha và các contracts hiện tại.
- [x] Đối chiếu các khoảng cách nghiệp vụ trong IMPLEMENTATION; xác định phần có thể nối API ngay, phần chỉ là dữ liệu minh họa.
- [x] Dùng theme xanh/radius mới làm Seller workspace shell cho toàn bộ route `/seller/**`, giữ Storefront ngoài phạm vi.

## 2. Shell dùng chung

- [x] Áp dụng sidebar 260, header 80, body gutters 32, typography và profile theo Figma.
- [x] Dùng navigation/session thật, giữ role/shop gate; không thêm sidebar thứ hai trong layout đã bọc.
- [ ] Tái sử dụng primitives; thêm variants/tokens có scope nếu thiếu, không override global brand.

## 3. Danh sách sản phẩm — 2:5

- [x] Toolbar, CTA thêm sản phẩm, bảng 7 cột, thumbnail, tên/metadata, giá, tồn, badge, action.
- [x] Nối filter và pagination với contract thật; không fake search toàn kho, SKU, tổng số hay page cuối.
- [x] Giữ đủ lifecycle/moderation và các thông tin cần thiết hiện có; giữ confirmation và quyền xóa.
- [ ] Kiểm tra desktop, lỗi tải/empty, thao tác pending và list → edit/new.

## 4. Chi tiết / chỉnh sửa — 2:192

- [x] Breadcrumb, cancel/save, gallery 420, card form 664 và vùng tabs.
- [x] Giữ media upload/retry/remove, draft và trạng thái đang tải.
- [x] Nối fields với model thật; giữ SKU chỉ đọc khi API chưa hỗ trợ, attribute brand hợp lệ, đơn vị và nhiều variants.
- [x] Giữ category/lifecycle/moderation và phần nghiệp vụ chưa có trong frame; bố trí theo cùng ngôn ngữ thị giác.
- [x] Chốt mô tả textarea, thông số theo category.attributes, đánh giá tổng quan + link đánh giá shop theo PROJECT-ADAPTATION.
- [ ] Kiểm tra lưu thành công/lỗi/validation và không hồi quy route xem chi tiết/tạo mới dùng chung component.

## 5. CSS và kiểm chứng tổng hợp

- [ ] Gỡ CSS/markup không còn consumer trong phạm vi đã refactor; kiểm tra selector động và thứ tự import.
- [x] Chạy typecheck, lint phạm vi Seller Products và tests liên quan theo scripts thực tế.
- [ ] Đối chiếu cả hai trang desktop; kiểm tra adaptation 768 × 1024 và 360 × 800, không overflow toàn trang.
- [x] Giữ accessible labels, focus, refs, semantics table/form/tabs/switch, data-testid và navigation.
- [ ] Báo kết quả thật, các chênh lệch thiết kế/nghiệp vụ và assets còn thiếu.

Không bắt buộc chạy toàn bộ suite sau mỗi file. Không sửa backend, mua thêm lượt MCP, đổi framework hoặc cài thư viện chỉ để hoàn thành hình thức của mẫu.

## 6. Áp dụng phần bổ sung theo project

- [x] Tái sử dụng icon Lucide/assets đã đóng gói; media API và avatar initials; không cần tải SVG gốc.
- [x] Hoàn thiện loaded-only filters + footer cursor theo nhãn đã chốt, async race protection và lỗi tải thêm.
- [x] Giữ xóa mềm published/hidden/archived qua confirmation; không hạn chế sai vì tên hàm deleteDraft.
- [x] Migrate dashboard, shop, inventory, orders, reviews, promotions, returns và campaigns vào shell mới; loại bỏ `Container.operational-page` khỏi route.
- [x] Đã sửa code/style orders, inventory, reviews, promotions, returns và campaigns; bỏ mục moderation khỏi sidebar và đặt NotificationBell trong header.
- [ ] Nghiệm thu thị giác từng màn theo FORMAT.md; phản hồi ngày 05/09/2026 cho biết việc đồng bộ còn chưa đạt. Các test chức năng đã chạy không đóng hạng mục này.
- [ ] Triển khai states/modal/focus/responsive theo PROJECT-ADAPTATION và đối chiếu STATE-PREVIEW.
