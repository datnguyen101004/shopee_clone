# Migration layout theo Seller Workspace

Dùng cho migration hoặc chẩn đoán migration sang phân hệ người dùng chỉ định. Đây không phải yêu cầu redesign mọi màn, chạy toàn bộ E2E hay sửa backend. Với yêu cầu chẩn đoán, chỉ kiểm tra và báo nguyên nhân; các bước sửa bên dưới chỉ áp dụng khi người dùng yêu cầu triển khai.

## Chốt mẫu và phạm vi

- Liệt kê route đích từ yêu cầu và cây route thực tế, bao gồm màn chi tiết và popup liên quan. Lập ma trận: route → component sở hữu → vùng cần chuyển → kiểm tra code/hành vi/thị giác → phần chưa xác minh. Không dùng một màn đạt làm đại diện cho toàn phân hệ.
- Khi yêu cầu là “layout giống Seller”, dùng shell Seller và màn `/seller/products` làm mẫu cho cấu trúc, gutters, typography, control và bảng/footer; không chỉ sao chép màu. Đối chiếu cùng UI-SPEC và yêu cầu mới nhất, vì code Seller có thể còn lỗi chưa nghiệm thu.
- Phân biệt bất biến thị giác với biến thể nghiệp vụ: Admin giữ menu/quyền/API, cây danh mục, product lookup, moderation hai panel và quyết định tranh chấp. Không biến mọi màn thành bảng hoặc sao chép nội dung bán hàng/KPI giả.
- Nếu spec đích khác mẫu, nêu khác biệt và giải quyết theo yêu cầu mới nhất trước khi sửa. Ví dụ spec Admin từng ghi H1 24px trong khi shell Seller là 20px; không âm thầm coi cả hai là “đồng bộ”. Với yêu cầu chỉ đổi theme, không tự đổi cấu trúc.

## Đối chiếu trước khi triển khai

Thử chạy bằng scripts của repo và mở cả route mẫu lẫn route đích. Ghi viewport, zoom, trạng thái đăng nhập và dữ liệu. HTTP 200 hoặc màn “Cần đăng nhập” không chứng minh nội dung được bảo vệ đã render.

Nếu thiếu phiên đăng nhập/backend/browser, tiếp tục đối chiếu code trong phạm vi; báo rõ hạn chế. Không bỏ role/shop gate, tự tạo tài khoản, seed/reset dữ liệu hay giả phiên có quyền để tuyên bố đã xem UI thật. Chỉ dùng fixture được phép trong kiểm thử cô lập, ghi rõ đó là fixture.

So sánh những vùng có liên quan:

| Vùng | Bằng chứng cần đối chiếu |
| --- | --- |
| Root/shell | Có wrapper storefront hoặc padding ngoài thừa không; sidebar width, grid, min-width, vùng cuộn và full-height |
| Sidebar/header | Gutters, nhịp menu, active, icon; một tiêu đề ngữ cảnh, mô tả và cụm tài khoản; không tự thêm eyebrow/footer khác mẫu |
| Toolbar | Trên canvas hay trong card; label trên ô; bounds mép dưới search/select/CTA, control height và gap |
| Bảng/footer | Padding cell, cột thao tác, border/radius liên tục; không gap hoặc double border; giữ pagination thật |
| Form/dialog | Section/grid, cỡ chữ, switch/checkbox không bị rule input kéo to, nút cuối form; popup/portal và focus không kế thừa theme cam ngoài ý muốn |
| Responsive | Menu truy cập được, nội dung không bị che/cắt, bảng cuộn trong vùng riêng thay vì cả trang |

Khi có thể, lấy bounding boxes/computed styles của phần tử thật để kiểm chứng khoảng cách; không suy CSS px trực tiếp từ screenshot không rõ zoom.

## Chuyển cấu trúc và xử lý CSS

- Sửa nguồn sở hữu shell trước, rồi các consumer. Tái sử dụng primitive/component/variant khi cấu trúc thực sự chung; không import nguyên SellerCenterLayout vào Admin vì có seller navigation/shop gate. Không tạo abstraction toàn app chỉ để sửa một màn.
- Xem chuỗi DOM từ root đến control trước khi viết selector. `.admin-workspace.admin-page-frame` khớp hai class cùng phần tử; `.admin-workspace .admin-page-frame` đòi hỏi quan hệ tổ tiên–con. Khi thêm wrapper, kiểm tra lại selector dùng `>` ở mọi consumer bị ảnh hưởng.
- Với toolbar/form lặp lại, dùng class hoặc component có nghĩa thay vì dò chuỗi `[style*='flex-wrap']`, đếm cấp `div`, hoặc giấu header bằng `:has(...)`. Chuyển tiêu đề vào shell ở nguồn JSX và giữ CTA/breadcrumb cần thiết, không chỉ che khối bằng CSS.
- Đối chiếu toàn bộ cascade: inline styles, specificity, `!important`, thứ tự import, layer và media query. Khai báo tên `@layer` không tự đưa stylesheet vào layer; kiểm tra rule thực sự thuộc layer nào. Khi refactor layer/shared CSS, đánh giá consumer ngoài phạm vi trước khi đổi.
- Loại bỏ hoặc điều chỉnh rule legacy đã được thay thế trong phạm vi giao. Không nối tiếp các override mâu thuẫn chỉ để một screenshot trông đúng, cũng không xóa hàng loạt CSS dùng chung. Rà hover/focus/disabled, border/shadow, icon và popup render qua portal.
- Giữ hành vi thực: chuông tĩnh không được mô tả là tính năng thông báo đã hoạt động. Nếu API/chức năng chưa có và người dùng chỉ yêu cầu layout, nêu giới hạn thay vì tự xây backend.

## Nghiệm thu và điểm dừng

- Với triển khai migration, chạy kiểm tra code/hành vi phù hợp sau từng nhóm thay đổi, rồi đối chiếu từng route đã giao ở desktop/mobile và trạng thái liên quan. So sánh cùng viewport với mẫu, sửa sai lệch rồi kiểm tra lại; không xem typecheck/unit test là kiểm chứng thị giác.
- Yêu cầu chạy app và so sánh UI cho phép kiểm tra trình duyệt trong phạm vi đó, không mặc nhiên cho phép toàn bộ suite E2E hoặc thao tác nghiệp vụ làm thay đổi dữ liệu thật. Giữ quy tắc E2E trong SKILL.md.
- Bằng chứng đầu ra gồm route/viewport/trạng thái, ảnh hoặc số đo khi có, phần đã sửa, kết quả kiểm tra và giới hạn. Không bắt buộc tạo file báo cáo mới nếu người dùng chỉ cần kết quả trong hội thoại.
- Chỉ gọi migration hoàn chỉnh khi cấu trúc trong phạm vi và kiểm chứng thị giác cần thiết đều đã đạt. Nếu không thể mở route được bảo vệ, ghi “đã sửa/đối chiếu code, chưa xác minh thị giác” cùng route còn thiếu và điều kiện cần để tiếp tục. Không biến việc thiếu xác minh thành yêu cầu tự bỏ bảo vệ truy cập.

Các lỗi migration đã xác nhận được ghi tại [CORRECTIONS.md](../../../../../docs/ui-ux/seller-workspace/CORRECTIONS.md); kiểm tra lại code hiện tại trước khi áp dụng bài học vì lỗi có thể đã được sửa.
