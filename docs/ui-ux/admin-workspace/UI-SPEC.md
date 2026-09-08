# Admin Workspace UI — quy chuẩn xanh dương và trắng

## Phạm vi

Tài liệu này ghi lại biến thể Admin của Seller Workspace UI. Admin dùng cùng ngôn ngữ thị giác xanh dương–trắng, nhưng giữ menu, quyền, dữ liệu và workflow quản trị riêng. Các route trong phạm vi hiện tại:

- `/admin` — Tổng quan sàn
- `/admin/users` — Người dùng
- `/admin/shops` — Cửa hàng và duyệt onboarding
- `/admin/products` — Danh sách và kiểm soát toàn bộ sản phẩm
- `/admin/categories` — Cây danh mục
- `/admin/homepage` — Module trang chủ và banner
- `/admin/campaigns` — Chiến dịch sàn
- `/admin/moderation` và `/admin/moderation/[caseId]` — Kiểm duyệt và tố cáo
- `/admin/returns` và `/admin/returns/[returnReference]` — Tranh chấp trả hàng/hoàn tiền
- `/admin/audit` — Nhật ký kiểm toán

## Ma trận route và checklist migration

| Route | Component sở hữu | Shell/header | Toolbar/bảng hoặc form | Dialog/chi tiết | Responsive/đối chiếu |
| --- | --- | --- | --- | --- | --- |
| `/admin` | `admin/page.tsx` | Seller shell, title 20px, account cluster | Metric cards dùng dữ liệu API, link đúng Admin | Không có dialog | Desktop/mobile đã render và đo overflow |
| `/admin/users` | `admin/users/page.tsx` | Header theo route, không lặp H1 | Search/filter 40px, bảng + action | Dialog khóa/mở khóa | Desktop/mobile; dialog đã kiểm tra |
| `/admin/shops` | `admin/shops/page.tsx` | Header theo route, không lặp H1 | Search/filter 40px, bảng + action | Dialog duyệt/từ chối/khóa | Desktop/mobile; dialog đã kiểm tra |
| `/admin/products` | `admin/products/page.tsx` | Header theo route, không lặp H1 | Search không có nút submit, chỉ list sản phẩm lifecycle `ACTIVE`; filter kiểm duyệt áp dụng ngay; bảng nối footer | Dialog khóa/mở khóa từng sản phẩm; link storefront | Desktop/mobile; list thật + filter tức thời + action dialog |
| `/admin/categories` | `admin/categories/page.tsx` | Header theo route | Cây danh mục, giữ indentation nghiệp vụ | Dialog tạo/sửa danh mục | Desktop/mobile; dialog đã kiểm tra |
| `/admin/homepage` | `admin/homepage/page.tsx` | Header theo route | Tabs, bảng banner/module | Dialog banner/module | Desktop/mobile; dialog banner đã kiểm tra |
| `/admin/campaigns` | `admin-campaigns-page.tsx` | Header theo route | Filter, campaign cards/editor; danh sách page 10 chiến dịch | Publish/hủy/xem dùng icon có nhãn truy cập; preview/editor theo API | Desktop/mobile; không tạo dữ liệu KPI |
| `/admin/moderation` | `admin/moderation/page.tsx` | Header theo route | Một report workspace: search theo nội dung nhập tức thời, loại report (tin nhắn/shop/sản phẩm/đánh giá), trạng thái, đối tượng, thời gian; bảng quản lý nối footer như Sản phẩm, không hiển thị mã kỹ thuật trong hàng | Nút thao tác dùng icon có nhãn truy cập; Chi tiết đi tới route case; Xử lý report mở popup dùng chung | Desktop/mobile; bảng, divider cột, search và popup đã kiểm tra |
| `/admin/moderation/[caseId]` | `admin/moderation/[caseId]/page.tsx` + `admin-moderation-case-detail.tsx` | Giữ Admin shell, có link quay lại danh sách | Chi tiết evidence, activity và outcome theo API | Nút Xử lý report ở header và cuối detail mở cùng popup; xác nhận quyết định giữ nguyên | Desktop/mobile; URL riêng và popup đã kiểm tra |
| `/admin/returns` | `components/returns/return-workflows.tsx` | Variant Admin trong shell | Toolbar và list nối footer; cột Yêu cầu, Hoàn tiền, Cập nhật, Hạn xử lý, Hành động dùng chung một grid; hành động là icon Xử lý/Xem chi tiết | Giữ action theo status API; icon Xử lý mở detail tại vùng quyết định | Desktop/mobile; header-row alignment, icon action và overflow đã kiểm tra |
| `/admin/returns/[returnReference]` | `components/returns/return-workflows.tsx` | Breadcrumb + header shell | Intro và các section chi tiết theo card Admin | Variant quyết định Admin theo status; giữ confirmation, validation và API action | Desktop/mobile; fixture đã hoàn tiền và flow action qua test cô lập |
| `/admin/audit` | `admin/audit/page.tsx` | Header theo route | Filter + bảng before/after | Chi tiết inline trong bảng | Desktop/mobile, không tràn ngang |

Quy ước trạng thái checklist: “đã kiểm tra” nghĩa là đã render bằng app cục bộ, đối chiếu cùng viewport Seller `/seller/products` và kiểm tra computed styles/overflow; không đồng nghĩa với việc mọi trạng thái nghiệp vụ đều có fixture để thao tác.

## Chuẩn dùng chung

- `/admin/**` là một Admin app độc lập về giao diện: không render `MarketplaceHeader`, category navigation, storefront footer, floating chat hoặc wrapper `PageShell`. Route có thể vẫn nằm cạnh nhóm storefront để giữ cấu trúc URL/provider hiện có, nhưng `StorefrontShell` phải bypass toàn bộ phần hiển thị khi pathname là Admin.
- Canvas `#f9fafb`, bề mặt `#fff`, viền `#e5e7eb`, chữ chính `#111827`, chữ phụ `#4b5563`.
- Primary `#2563eb`, hover `#1d4ed8`, nền active `#eff6ff`; màu trạng thái vẫn mang ý nghĩa nghiệp vụ (xanh lá, vàng, đỏ, trung tính).
- Sidebar cố định rộng 260px trên desktop, navbar đầu vùng làm việc, nav item cao tối thiểu 44px và trạng thái active dùng nền xanh nhạt.
- Tiêu đề shell dùng 20px/700; tiêu đề nội dung dùng phân cấp theo Seller; label và header bảng 12px/600; control cao 40px, chữ 14px, radius 8px; card/bảng radius 12px.
- Header và content dùng gutter 32px ở desktop; dưới 1200px giảm còn 24px, dưới 768px còn 16px.
- Toolbar đặt trực tiếp trên canvas, search/bộ lọc dùng control 40px; search lọc tức thời theo nội dung người dùng nhập và đặt icon ở cuối input; filter tức thời không thêm nút tìm kiếm giả. Dropdown có label nằm trên control, không lặp tên trường trong option.
- Bảng có header nền canvas, padding ngang khoảng 20–24px, hàng dữ liệu nền trắng, thao tác căn phải; mọi bảng danh sách mang `admin-management-table` dùng chung header 12px/500, nội dung 13px/400, tên chính 13px/500 và badge 11px/500. Badge trong bảng phải co trong ô và cho phép xuống dòng khi người dùng thu hẹp cột, không được vẽ chữ tràn qua divider. Danh sách nối với footer hiển thị số bản ghi đang tải khi API có tổng đếm.
- Form chia section, ưu tiên grid hai cột ở desktop và một cột ở mobile; hành động đặt cuối form. Dialog giữ focus, nội dung cuộn trong viewport và nút hủy đứng trước nút xác nhận/lưu.
- Không tạo KPI, biểu đồ, pagination hoặc trạng thái không có trong response API. Không đổi API, role gate, validation hay audit trail.

## Khác biệt riêng của Admin

| Vùng | Admin giữ lại | Quy tắc trình bày |
| --- | --- | --- |
| Điều hướng | Kiểm duyệt, người dùng, cửa hàng, sản phẩm, trang chủ, chiến dịch, nhật ký, trả hàng | Không dùng menu Seller; label thể hiện quyền quản trị |
| Header | Tài khoản quản trị và chuông thông báo | Không hiển thị shop owner hoặc CTA bán hàng |
| Tổng quan | Các số liệu thật từ `AdminDashboardResponse` | Card KPI chỉ dùng field API hiện có; liên kết đi đúng route Admin |
| Người dùng | Lọc trạng thái/vai trò, khóa/mở khóa và lý do | Thao tác dùng icon khóa/mở khóa có `aria-label`/tooltip. Cột thao tác nằm trong flow của bảng, không neo khi cuộn ngang. Danh sách phân trang theo số, cố định 10 người dùng mỗi trang; số trang không có khung, trang hiện tại và hover dùng màu primary/chữ đậm, danh sách dài rút gọn theo dạng `1 2 3 4 5 … 20`. Dialog xác nhận; không tự suy diễn quyền mới |
| Cửa hàng | Trạng thái shop và onboarding approval | Duyệt/từ chối/khóa/mở khóa dùng icon có nhãn truy cập, giữ nguyên workflow và lý do. Danh sách dùng page, cố định 10 cửa hàng mỗi trang. Cột tên chỉ hiển thị tên shop, không có dòng slug phụ |
| Sản phẩm | Chỉ hiển thị sản phẩm lifecycle `ACTIVE`, tìm theo tên/slug/shop/danh mục, lọc trạng thái kiểm duyệt và khóa/mở khóa | API list ép `status=ACTIVE`, dùng page cố định 10 sản phẩm; filter kiểm duyệt áp dụng ngay. Xem/khóa/mở khóa dùng icon có nhãn truy cập. Các ô chỉ hiển thị giá trị chính, không có dòng phụ cho slug, tồn kho, phân loại, vòng đời hoặc số đã bán. Không tạo dữ liệu giả. Lookup slug/UUID cũ vẫn được giữ ở API cho consumer tương thích |
| Danh mục, Homepage | Cây danh mục, module và banner | Chỉnh sửa trong dialog, field có label, thao tác giữ nguyên payload |
| Kiểm duyệt | Report tin nhắn, shop, sản phẩm, đánh giá; evidence và quyết định | Bỏ hai tab legacy “Hồ sơ vi phạm”/“Kiểm duyệt đánh giá”; dùng report type + filter trạng thái/đối tượng/thời gian. Hàng đợi case và review bị báo cáo đều page 10 bản ghi. Detail case có URL `/admin/moderation/[caseId]`; popup xử lý dùng chung từ bảng và detail, nhưng giữ nguyên outcome, validation, confirmation và audit trail |
| Trả hàng | Quyết định tranh chấp của Admin | Dùng variant Admin của workflow dùng chung, không lan style sang Buyer |
| Chiến dịch | Publish/cancel/preview theo API | Giữ các mốc thời gian và điều kiện tham gia hiện có; danh sách dùng page 10 bản ghi và icon thao tác |
| Kiểm toán | Bộ lọc đối tượng/hành động, chi tiết before/after | Dữ liệu bất biến, không chỉnh sửa/xóa; màu chỉ hỗ trợ quét nhanh |

## Responsive và kiểm chứng

- Ở dưới 1200px thu sidebar còn khoảng 220px và giảm gutters; dưới 1024px các layout đặc thù như moderation chuyển một cột; dưới 768px sidebar chuyển thành vùng điều hướng ngang cuộn được, content một cột và bảng cho phép cuộn ngang trong vùng của nó.
- Kiểm tra từng route ở loading, error, empty, dữ liệu thật và dialog; kiểm tra focus-visible, keyboard và không tràn ngang toàn trang.
- Typecheck/lint và test component chỉ chứng minh hành vi/render cơ bản. Chỉ kết luận giao diện khớp sau khi đã xem render desktop/mobile; E2E chỉ chạy khi người dùng yêu cầu.

## Checklist triển khai

- [x] Shell Admin, sidebar, navbar, active route và footer dùng chuẩn blue/white.
- [x] Typography, surface, button, input/select/textarea và table được giới hạn trong `.admin-workspace`.
- [x] Dashboard và các màn list/form/dialog dùng chung hierarchy mới mà không thay API.
- [x] Workflow moderation, campaign và return giữ variant nghiệp vụ riêng.
- [x] Đối chiếu ảnh render các route Admin ở desktop/mobile; xác nhận shell, typography, control, dialog và các biến thể workflow bằng phiên chạy UI cục bộ.
- [x] Đối chiếu riêng route chi tiết trả hàng, dialog banner/người dùng/cửa hàng/danh mục và panel chi tiết moderation.
- [x] Xác minh danh sách sản phẩm thật chỉ gồm lifecycle `ACTIVE`, filter kiểm duyệt áp dụng ngay, page 10 bản ghi và dialog khóa/mở khóa; lookup slug/UUID vẫn được giữ ở API cho tương thích.
- [x] Xóa 4 category seed tiếng Anh khỏi local DB sau khi kiểm tra product/FK references; seed đã chuyển sang category tiếng Việt.
