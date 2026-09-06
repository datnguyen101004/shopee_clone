# Seller Workspace UI — Dashboard quản lý xanh dương và trắng

## Mục đích và phạm vi

Đây là đặc tả dùng chung cho giao diện Kênh Người Bán của Shopee Clone. Kiểu UI này là **dashboard quản lý với sidebar cố định theo trang, header ngữ cảnh và vùng làm việc chứa bảng/card/form**. Màn Sản phẩm là mẫu nền; Voucher và Chat là biến thể nghiệp vụ. Tên gọi trong project: **Seller Workspace UI**. Skill áp dụng: `$seller-workspace-ui`.

Tài liệu giúp agent khác triển khai mà không cần lịch sử hội thoại hoặc Figma MCP. Mặc định áp dụng cho `/seller/**`. Khi người dùng yêu cầu áp dụng cho Admin hoặc phân hệ khác, tái sử dụng ngôn ngữ thiết kế trong phạm vi đó nhưng giữ menu, quyền và nghiệp vụ riêng. Không tự đổi giao diện Buyer theo Seller.

## Nguồn và thứ tự ưu tiên

1. Yêu cầu mới nhất của người dùng trong công việc đang thực hiện.
2. Quy tắc trong tài liệu này và [CORRECTIONS.md](CORRECTIONS.md).
3. [Bộ bàn giao Sản phẩm Figma](../seller-products-figma/README.md) và [quyết định thích ứng project](../seller-products-figma/PROJECT-ADAPTATION.md), khi cần chi tiết hai frame gốc.
4. Code hiện tại dùng để xác định component, dữ liệu và hành vi, không tự được coi là mẫu đã nghiệm thu.

[Ảnh Sản phẩm ngày 05/09/2026](references/products-user-reference-2026-09-05.png) là tham chiếu bố cục do người dùng gửi khi phản ánh sai mẫu. Ảnh không chứng minh UI đã được chấp thuận; viewport CSS và zoom chưa biết. Không suy ra CSS px trực tiếp từ ảnh. Thông số dưới đây là chuẩn triển khai, không phải kết quả đo mọi màn.

## Nền tảng thị giác

| Thành phần | Quy định |
| --- | --- |
| Màu chính | `--sp-primary: #2563eb`; hover `#1d4ed8`; active `#1e40af`; nền xanh nhạt `#eff6ff` |
| Bề mặt | Canvas `#f9fafb`, card/header/sidebar trắng `#ffffff`, viền `#e5e7eb` |
| Chữ | Chính `#111827`, phụ `#4b5563`, muted `#9ca3af`; nội dung cần đọc phải đủ tương phản, không dùng muted cho mọi label |
| Font | Kế thừa Be Vietnam Pro từ app layout; input/select/button cũng kế thừa font, hỗ trợ dấu tiếng Việt |
| Phân cấp | H1 shell 20px/700; nội dung và giá trị field 14px; label/header bảng 12px/600; không in đậm mọi nội dung |
| Khoảng cách | Nhịp 4/8px, ưu tiên 8, 12, 16, 24, 32px; giữ cùng gutters giữa header và nội dung |
| Bo góc | Card 12px, control 8px, badge/thumbnail 6px; avatar tròn |
| Icon | Icon nét đồng bộ từ UI package; nav icon khoảng 18px trong vùng 20px; icon trang trí có `aria-hidden`, nút chỉ icon có tên truy cập |
| Trạng thái | Xanh lá cho đang hoạt động, trung tính cho nháp, vàng cho cảnh báo, đỏ cho lỗi/hủy/hết hạn theo domain; có nhãn chữ đi kèm |

Dùng semantic tokens `--sp-*` tại stylesheet Seller. Không lấy mặc định brand cam và radius phẳng của storefront để ghi đè UI này. Màu badge biểu thị trạng thái nghiệp vụ, không suy diễn lifecycle của Voucher từ lifecycle Sản phẩm.

## Shell, sidebar và navbar

- Desktop: sidebar trắng khoảng 260px, vùng nội dung `minmax(0, 1fr)`. Sidebar có brand, danh sách điều hướng, trạng thái active theo route và route con.
- Thứ tự menu: Tổng quan → Thông báo → Chat → Hồ sơ shop → Sản phẩm → Tồn kho → Đơn hàng → Đánh giá → Khuyến mãi → Trả hàng / Hoàn tiền → Chiến dịch.
- Không có mục Kiểm duyệt trong sidebar Seller. Không vì bỏ menu mà tự xóa chức năng kiểm duyệt ở backend/Admin.
- Header: tiêu đề và mô tả bên trái; chuông thông báo, avatar, tên và vai trò bên phải. Trang con không lặp H1 hoặc thêm một lớp gutters ngoài shell. Tiêu đề bản ghi/breadcrumb trong màn chi tiết vẫn hợp lệ.
- Nav item cao tối thiểu 44px; label 14px/500; active nền xanh nhạt, chữ/icon xanh, `aria-current="page"`.
- Khi chiều ngang không đủ, chuyển menu theo responsive của shell; tất cả mục vẫn truy cập được, không đè lên nội dung hoặc gây tràn ngang cả trang.

## Màn danh sách chuẩn

```text
Shell header: Tiêu đề + mô tả                         Chuông + tài khoản
Tab trạng thái nghiệp vụ (nếu có)
                         Label bộ lọc    Label sắp xếp
Tìm kiếm                 [Tất cả]        [Mới nhất]      CTA chính
Ghi chú phạm vi tìm kiếm/lọc (chỉ khi cần)
┌ Bảng hoặc card danh sách ────────────────────────────────────────────┐
│ Header cột → các dòng dữ liệu → trạng thái rỗng/tải/lỗi phù hợp        │
├ Footer nối liền bảng ────────────────────────────────────────────────┤
│ Hiển thị X trong Y bản ghi đã tải                     Tải thêm / hết  │
└─────────────────────────────────────────────────────────────────────┘
```

| Vùng | Quy định |
| --- | --- |
| Toolbar | Nằm trực tiếp trên nền trang; search/bộ lọc bên trái, CTA bên phải. Không tự bọc một card trắng lớn quanh filter |
| Control | Cao 40 CSS px; radius 8px; chữ 14px. Gap filter 12px, gap cụm filter–CTA 16px |
| Label dropdown | Nằm trên ô, 12px/600, line-height 16px, gap 4px, liên kết label/for |
| Giá trị dropdown | `Danh mục` → `Tất cả`; `Trạng thái` → `Tất cả`; `Sắp xếp` → `Mới nhất`. Không lặp tên trường trong option |
| Căn hàng | Căn đáy cả toolbar và cụm filters để mép control search/select/CTA trùng nhau; icon mũi tên căn giữa riêng ô select |
| Bảng | Viền 1px, radius 12px; header nền canvas, sentence case, 12px/600, cao tham chiếu 47px, padding ngang 24px |
| Dòng | Nền trắng, chữ 14px, cell padding 16px 24px, căn giữa dọc; cột thao tác căn phải |
| Ảnh | Thumbnail 48×48px, radius 6px, ảnh giữ tỷ lệ; có placeholder thật khi thiếu ảnh |
| Footer | Nối liền bảng, không double border; X là số đang hiển thị, Y là số đã tải; giữ nút tải thêm ngay cả khi lọc cục bộ ra rỗng |

Không trình bày tìm kiếm/sort trên dữ liệu đã tải như tìm toàn hệ thống. Chỉ dùng pagination, tổng đếm và KPI mà API có thể cung cấp; không tạo trang số, tỷ lệ tăng trưởng hoặc biểu đồ giả.

## Biến thể theo nghiệp vụ

| Màn | Nội dung và yêu cầu riêng |
| --- | --- |
| Sản phẩm | Search tên/mã, danh mục, trạng thái, CTA thêm; ảnh, thông tin, danh mục, giá, kho, badge, thao tác. Ba nút của form tạo sản phẩm ở cuối form |
| Tồn kho | Search tên/biến thể/SKU; sort mới nhất, cũ nhất theo `updatedAt`, số lượng theo khả dụng giảm dần trong mapping hiện có. Không có checkbox “Chỉ hiện sắp hết hàng” |
| Đơn hàng | Tab trạng thái trải đều chiều ngang desktop; search, trạng thái chuẩn bị và sort cùng toolbar. Sort thời gian và giá. Footer hiện số đơn như Sản phẩm; không có label “Không đơn” dư thừa |
| Đánh giá | Search tên sản phẩm/nội dung, sort thời gian hoặc số sao; giữ phản hồi và báo cáo. Dropdown lý do nằm trong dialog báo cáo |
| Khuyến mãi | Quản lý Voucher; bỏ mục giảm giá sản phẩm trong màn này. Có search, trạng thái, thời gian và sort theo khả năng hiện có; form/modal theo phần dưới |
| Trả hàng / Hoàn tiền | Một workflow Seller, giữ trạng thái, mã yêu cầu/đơn, thời hạn và hành động xử lý; chỉ bật variant Seller tại consumer Seller |
| Chiến dịch | Bộ lọc loại/trạng thái, đăng ký/rút, sản phẩm tham gia và mức giảm; giữ điều kiện tham gia từ API |
| Thông báo | Chuông trên navbar và mục trong sidebar, giữ trạng thái đọc/chưa đọc và đích điều hướng |
| Chat | Một trang làm việc trong shell tại `/seller/chat`, xem phần Chat bên dưới |

## Form, button và popup

- Chia form thành section có heading, field grid hai cột khi đủ rộng và một cột trên mobile. Field dài có thể chiếm toàn hàng.
- Primary nền xanh/chữ trắng; secondary nền trắng/viền trung tính; danger đỏ. Dùng Button/primitive đã có khi API phù hợp; không tạo variant giả hoặc thêm thư viện chỉ để đổi màu.
- Button kế thừa font, hover/active không làm xê dịch bố cục; có focus-visible, disabled/loading và chặn gửi lặp. Nút hành động dùng `button`, điều hướng dùng `Link`.
- Nhóm hành động form đặt cuối nội dung; khi sửa, **Hủy sửa đứng trước Lưu thay đổi** cả trong DOM và trên mobile. Không dùng `column-reverse` làm đảo thứ tự.
- Popup mở tại ngữ cảnh đang thao tác, tiêu đề rõ, nút đóng dễ thấy, nội dung cuộn trong viewport. Quản lý focus khi mở/đóng, cho phép thao tác bàn phím. Không để calendar/product picker bị cắt hoặc nằm sau overlay.
- Calendar của voucher chỉ chọn ngày; không có giờ/phút. Giữ mapping ngày bắt đầu/kết thúc theo hợp đồng hiện có; thay UI không tự thay quy tắc thời gian backend.

## Voucher

### Danh sách và chi tiết

- Danh sách có các card tổng quan khi có số liệu thật: tổng voucher, đang hoạt động, hết hạn, đã sử dụng. Bảng gồm mã, tên, loại giảm, giá trị, đã dùng/tổng, hạn, trạng thái và hành động.
- Màn chi tiết có cấu hình bên trái; tiến độ sử dụng, khu vực thống kê/lịch sử bên phải khi dữ liệu hỗ trợ. Không gọi donut lượt dùng là ngân sách; dữ liệu chưa có phải hiển thị trạng thái chưa có dữ liệu.
- Nhóm chỉnh sửa, tạm dừng/tiếp tục, xóa ở cuối nội dung. Số nút khả dụng theo trạng thái từ API; không bật xóa khi nghiệp vụ chưa cho phép. Bỏ button “Quản lý voucher”; breadcrumb/quay lại danh sách vẫn dùng cho điều hướng.
- “Chỉnh sửa thông tin” mở popup ngay tại màn chi tiết, không redirect sang màn khác rồi mới mở popup. Lưu thành công cập nhật dữ liệu tại chỗ; lỗi giữ form để sửa/thử lại.

### Form tạo/cập nhật

- Nhóm thông tin: tên, loại ưu đãi, mức giảm, mức giảm tối đa khi giảm phần trăm. Backend tự sinh mã khi tạo; sửa hiển thị mã chỉ đọc, không tự sinh bằng frontend.
- Nhãn “Mức giảm” có `(đ)` hoặc `(%)` ngay cạnh theo loại ưu đãi. Không có dòng chú thích nằm dưới mức giảm.
- Nhóm điều kiện: đơn tối thiểu, giới hạn dùng, giới hạn mỗi người, **Sản phẩm áp dụng**. Không dùng nhãn `Product IDs`.
- Chọn sản phẩm qua popup có search, ảnh, tên, giá và checkbox nhỏ khoảng 16px nằm cùng một hàng. Cho phép chọn nhiều; không chọn = mọi sản phẩm của shop. ID chỉ dùng trong payload, tên dùng trong phần hiển thị; tải tên sản phẩm đã chọn cả khi mở form sửa.
- Nhóm ngày hiệu lực: bắt đầu/kết thúc, date-only. Button tạo voucher gọn: khoảng 32px, chữ 13px/500, không dùng bold nặng.

## Chat trong Seller

- Mục **Chat** ở sidebar mở `/seller/chat`. Không dùng nút chat nổi trên các route Seller.
- Nội dung chat nhúng vào vùng làm việc: danh sách hội thoại và tìm liên hệ bên trái, lịch sử và ô soạn tin bên phải. Mobile chuyển bố cục phù hợp, giữ cả liên hệ và composer truy cập được.
- Tái sử dụng ChatProvider và luồng chat hiện có: realtime, đọc/chưa đọc, gửi/thử lại, bản nháp, tải lịch sử, trả lời/chặn/báo cáo. Không tạo provider thứ hai dẫn đến hai phiên hội thoại trên cùng trang.
- Không có nút đóng toàn bộ cửa sổ như floating widget trong trang Chat. Khi rời trang, đồng bộ trạng thái hiển thị/attention; không tự coi tin là đã đọc khi người dùng đang ở màn khác. Thông báo chat phải đưa người dùng đến hội thoại nhìn thấy được.
- Dùng màu xanh/trắng trong variant Seller, bao gồm selected contact, focus, message bubble và nút gửi. Buyer vẫn dùng variant riêng.
- Implementation nhúng hiện tại mới tái sử dụng widget; chưa có nghiệm thu trực quan toàn bộ màu, responsive và luồng thông báo. Đây là các điểm cần kiểm tra khi sửa Chat, không phải bằng chứng đã đạt.

## Điểm sở hữu trong code

Đường dẫn sau tính từ gốc repository; kiểm tra lại consumer trước khi di chuyển/tách file:

| Phần | Điểm bắt đầu |
| --- | --- |
| Shell/menu/header/shop gate | `apps/web/components/seller-center-layout.tsx` |
| Token/CSS Seller | `apps/web/app/styles/seller-products.css` |
| Toolbar/bảng/footer mẫu | `apps/web/components/seller-products/` |
| Voucher list/form | `apps/web/components/seller-promotions-management.tsx` (`SellerVoucherFormDialog` hiện được export ở đây) |
| Voucher detail | `apps/web/components/seller-voucher-detail.tsx` |
| Chat Seller | `apps/web/components/seller-chat-page.tsx`, `apps/web/app/(storefront)/seller/chat/page.tsx` |
| Chat dùng chung | `apps/web/components/chat/floating-chat.tsx`, `chat-provider.tsx`, `apps/web/app/styles/storefront/chat.css` |
| Bật/tắt floating chat | `apps/web/components/storefront-shell.tsx` |
| Primitive dùng chung | `packages/ui/src/` |

Giữ API, auth/session, role/shop gate, validation, draft và lifecycle hiện tại trừ khi người dùng yêu cầu đổi. Tái sử dụng component thật cho cấu trúc lặp; không chỉ chép class. Xem cascade của `globals.css`, layer CSS, thứ tự import và media query. Sửa tại nơi sở hữu, tránh tích lũy override từng trang hoặc đổi brand token toàn ứng dụng. Không đặt chỉ tiêu giảm dòng CSS.

## Kiểm chứng và cập nhật chuẩn

- Khi được yêu cầu migration **layout** sang phân hệ khác, chuyển cả cấu trúc shell/toolbar/bảng/form và thông số thị giác có liên quan, không chỉ theme. Giữ menu, quyền và biến thể nghiệp vụ của phân hệ đích. Đọc [hướng dẫn migration của skill](../../../.agents/skills/frontend/seller-workspace-ui/references/layout-migration.md); giải quyết khác biệt giữa spec đích và mẫu theo yêu cầu mới nhất, không tự coi thông số đang khác nhau là đã đồng bộ.

- Với mỗi route trong phạm vi: kiểm tra shell, toolbar, dữ liệu, footer, dialog và responsive bị ảnh hưởng; không lấy một màn đại diện làm nghiệm thu toàn bộ.
- Chạy typecheck/lint và kiểm tra hành vi liên quan sau một nhóm sửa. Chỉ chạy E2E khi người dùng yêu cầu; không tự chạy quick E2E dưới tên visual test.
- Xác minh thị giác bằng render/ảnh ở viewport, zoom và trạng thái đã ghi nhận, kiểm tra computed styles nếu có xung đột. Nếu không có render, báo **đã sửa code, chưa xác minh thị giác**; unit test không chứng minh độ giống UI.
- Báo riêng triển khai, kiểm tra hành vi và thị giác. Skill không lưu số test pass hoặc tiến độ của từng lần sửa.
- Sau phản hồi thực: cập nhật đúng quy tắc trong file này và bài học có bằng chứng tại CORRECTIONS; không biến lỗi đang bị phản ánh thành chuẩn mới. Yêu cầu sửa tài liệu/skill không tự cho phép refactor ứng dụng.

## Prompt sử dụng

```text
$seller-workspace-ui Đồng bộ UI màn tồn kho và đơn hàng theo chuẩn Seller Workspace.
```

```text
$seller-workspace-ui Chỉnh UI Chat Seller theo chuẩn xanh dương trắng, giữ luồng chat hiện có.
```

Agent đọc đặc tả, khảo sát component, sửa từng màn, kiểm tra và báo kết quả trong cùng công việc; không cần gọi nhiều skill hoặc yêu cầu người dùng chạy từng lệnh.
