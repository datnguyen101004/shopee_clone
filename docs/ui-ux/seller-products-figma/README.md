# Bàn giao UI Seller Products từ Figma — đọc offline

Bộ tài liệu này cho agent triển khai **cả hai màn hình** mà không cần tài khoản Figma hay MCP. Đây là bản chụp thiết kế ngày 05/09/2026, không tự cập nhật khi Figma thay đổi.

## Phạm vi và nguồn

File: [Untitled trên Figma](https://www.figma.com/design/kkjtMBgWrOGGP0HrmEPy9W/Untitled?node-id=0-1).

| Màn hình | Node | Canvas gốc | Ảnh local |
| --- | --- | --- | --- |
| product-list-page — danh sách sản phẩm | 2:5 | 1440 × 1024 | [Danh sách](screenshots/product-list.png) |
| product-detail-page — chi tiết có form chỉnh sửa | 2:192 | 1440 × 1024 | [Chi tiết / chỉnh sửa](screenshots/product-detail.png) |

Cả hai đã được đọc bằng **get_design_context**, không chỉ suy đoán từ ảnh. Ảnh MCP được trả ở **1024 × 729**; thông số trong tài liệu/XML là kích thước canvas gốc, không lấy kích thước ảnh thu nhỏ làm CSS px.

## Thứ tự đọc

Khi tiếp tục tùy chỉnh hoặc mở rộng format Sản phẩm sang các màn Seller khác, đọc [chuẩn Seller cập nhật sau Figma](../seller-workspace/FORMAT.md) trước. File này ghi các yêu cầu mới về label, alignment, checkbox và cách kiểm chứng; các ảnh Figma gốc vẫn là nguồn thiết kế ban đầu.

1. Mở hai ảnh local ở trên để nắm toàn cảnh.
2. Đọc [UI-SPEC.md](UI-SPEC.md): bố cục, kích thước, màu, chữ, nội dung từng vùng.
3. Đọc [IMPLEMENTATION.md](IMPLEMENTATION.md): ánh xạ vào code, khác biệt giữa Figma và nghiệp vụ Seller hiện có.
4. Đọc [PROJECT-ADAPTATION.md](PROJECT-ADAPTATION.md): các phần thiếu đã được chốt theo project, assets thay thế và trạng thái/responsive.
5. Xem [bảng minh họa trạng thái](STATE-PREVIEW.html), rồi làm theo [TASKS.md](TASKS.md); kiểm chứng cả hai màn hình.
6. Tra [design-tokens.json](design-tokens.json), [node-inventory.json](source/node-inventory.json) hoặc hai reference bên dưới khi cần chi tiết.

Nguồn tham chiếu:
- [Cây node và tọa độ từ Figma](source/page-structure.xml).
- [Reference danh sách](source/product-list.reference.tsx.txt).
- [Reference chi tiết](source/product-detail.reference.tsx.txt).
- [Tình trạng ảnh/assets](assets-manifest.json).

Reference React/Tailwind chỉ diễn đạt thiết kế, không phải implementation: nhiều nút/input xuất thành div và text tĩnh, chưa có sự kiện, accessibility hoặc API. Không cài Tailwind hay dán nguyên vào app.

## Điều đã biết và giới hạn

- **Đã xác minh:** hai frame desktop, text/markup tham chiếu, geometry và styling trong design context, hai ảnh đã lưu local.
- **Chưa được thiết kế/xác minh trong dữ liệu đã lấy:** mobile/tablet, hover/focus, loading/error/empty, modal xóa, dropdown mở, nội dung hai tab chưa chọn, liên kết prototype và quy tắc lưu dữ liệu.
- **Assets riêng lẻ chưa có:** 43 tham chiếu ảnh/icon trong reference không tải được; endpoint trả HTTP 202 với body rỗng, sau đó Figma MCP báo hết lượt Starter. Manifest đánh dấu unavailable; chuỗi `UNAVAILABLE_ASSET:` cố ý không trỏ đến file giả.
- Hai ảnh toàn màn hình đủ để đọc hình thức và đối chiếu bố cục, nhưng không thay cho bộ SVG/ảnh gốc chất lượng đầy đủ. Dùng media sản phẩm/avatar từ API khi triển khai; dùng icon thư viện có glyph khớp sau đối chiếu. Đã bổ sung bộ Lucide thay thế có nguồn và license; xem asset-resolution.json và PROJECT-ADAPTATION.md, không coi là SVG gốc khớp từng pixel.
- Font gốc là **Inter**; bản tích hợp theo project đã chốt **Be Vietnam Pro** hiện có, không thêm font dependency. Sai khác typography có chủ đích được ghi trong PROJECT-ADAPTATION.md.

## Câu lệnh giao cho agent khác

> Đọc toàn bộ docs/ui-ux/seller-products-figma/README.md, UI-SPEC.md, IMPLEMENTATION.md, PROJECT-ADAPTATION.md và TASKS.md; mở hai ảnh screenshots/product-list.png và screenshots/product-detail.png. Đây là design context đã xuất từ Figma; không cần gọi MCP để đọc thiết kế. Dùng $seller-workspace-ui và đọc docs/ui-ux/seller-workspace/UI-SPEC.md để triển khai cả danh sách và màn hình chỉnh sửa sản phẩm Seller. Lấy thông số được xác minh trong bộ tài liệu làm chuẩn thị giác, giữ API, session, validation, lifecycle và các tính năng hiện có. Áp dụng các quyết định và assets thay thế trong PROJECT-ADAPTATION.md; không cần tải lại assets Figma gốc. Tuân thủ mapping, không giả tạo dữ liệu hay chức năng thiếu backend. Thực hiện theo từng phần, dọn CSS liên quan và kiểm chứng cả hai màn hình. Báo rõ các chênh lệch do thiếu asset hoặc thiết kế trạng thái/responsive.

Nếu agent ở workspace khác, chuyển **nguyên thư mục này** cùng code repository. ZIP đi kèm chứa toàn bộ bộ tài liệu; các link nội bộ dùng đường dẫn tương đối.
