# Ánh xạ thiết kế vào Shopee Clone

Đây là hướng dẫn bàn giao, chưa phải code đã triển khai. Các phương án còn mở dưới đây đã được chốt trong [PROJECT-ADAPTATION.md](PROJECT-ADAPTATION.md); ưu tiên tài liệu đó cho bản tích hợp theo project. Các đường dẫn code bên dưới tương đối với root repository, được kiểm tra ngày 05/09/2026; agent cần đọc phiên bản hiện tại trước khi sửa.

## Phạm vi hai màn hình

| Thiết kế | Entry point / code liên quan hiện có |
| --- | --- |
| Danh sách — 2:5 | `apps/web/app/(storefront)/seller/products/page.tsx`; `SellerProductList` trong `apps/web/components/seller-product-management.tsx` |
| Form chi tiết/chỉnh sửa — 2:192 | `apps/web/app/(storefront)/seller/products/[productId]/edit/page.tsx`; `SellerProductEditor` trong cùng file management |
| Trang chi tiết đang chỉ xem | `apps/web/app/(storefront)/seller/products/[productId]/page.tsx`; `apps/web/components/seller-product-detail.tsx` |
| Tạo mới, cần giữ không hồi quy | `apps/web/app/(storefront)/seller/products/new/page.tsx`; cũng dùng editor |
| Shell Seller | `apps/web/components/seller-center-layout.tsx` |
| Gọi API | `apps/web/lib/seller-products-api.ts`, `role-api.ts`; session provider |
| Model và validation | `packages/contracts/src/seller-products.ts` |
| UI nền tảng | `packages/ui/src/button.tsx`, `forms.tsx`, `layout.tsx`, `styles.css` |
| CSS Seller hiện tại | Nhóm selector Seller trong `apps/web/app/globals.css` |
| Tests | `seller-product-management.test.tsx`, `seller-product-detail.test.tsx`, `seller-center-layout.test.tsx` trong components; `seller-products-api.test.ts` trong lib |

Frame mang tên product-detail-page nhưng có input, upload và nút lưu. **Ánh xạ đề xuất** là route edit, giữ route xem chi tiết và tạo mới đang tồn tại. Nếu muốn gộp xem/sửa thành một route, đó là quyết định sản phẩm riêng, không âm thầm đổi URL hoặc bỏ trang cũ.

## Chuẩn thị giác và nguồn sự thật

- Hai screenshot + UI-SPEC + source reference là chuẩn desktop cho yêu cầu này.
- Figma dùng **Inter, xanh #2563eb, radius 6/8/12**, khác mặc định Shopee. Ánh xạ bằng theme/variant có scope Seller Products, không thay toàn bộ brand token dùng bởi Storefront, Admin hay Carrier.
- Có thể dùng UI primitives hiện có nếu API/semantics phù hợp; thêm variant có phạm vi khi cần. Không ép Figma về cam/2px chỉ vì skill mặc định ghi vậy.
- Giữ session, quyền Seller, shop gate, contracts, tính giá, upload và validation của app. Text minh họa PM Admin/Quản trị viên/Minh Trần không đổi tài khoản hoặc phân quyền thật.
- Không dán Tailwind reference vào Next.js app: dùng cấu trúc, CSS/token và components của repository. Không dựng toàn màn hình bằng absolute positions chỉ để trùng tọa độ.
- Đọc AGENTS.md áp dụng và hướng dẫn Next.js của phiên bản cài đặt trước khi sửa framework APIs.

## Khoảng cách giữa thiết kế và nghiệp vụ hiện tại

| Điểm | Bằng chứng code / thiết kế | Hướng xử lý |
| --- | --- | --- |
| Pagination | Figma có tổng 120 và trang cuối 24. `SellerProductPage` hiện chỉ có `items`, `nextCursor`. | Chốt footer số đã tải + Tải thêm, không bịa tổng/trang cuối; xem PROJECT-ADAPTATION.md. |
| Search và category filter | Query Seller hiện có cursor/limit/lifecycle/campaign/campaignTypeCode; chưa có query tìm tên/category ở contract đã đọc. | Chốt lọc cục bộ theo name/slug và categoryName, ghi rõ trong sản phẩm đã tải; không giả lập tìm toàn kho. |
| SKU trong danh sách | Summary không có SKU; detail có `variants[].sku`. | Không gọi detail từng dòng gây N+1. Dùng dữ liệu thực đã có với nhãn đúng hoặc ghi nhu cầu projection backend riêng. |
| SKU trong editor | SKU có trên response variant, không nằm trong `SellerProductVariantInput`. | Mặc định chỉ đọc; không thêm SKU vào payload hoặc hứa lưu nếu API không hỗ trợ. |
| Thương hiệu | Upsert không có trường brand trực tiếp; có category attributes. | Chỉ ánh xạ vào attribute hợp lệ nếu category định nghĩa; không tự gửi `brand` hoặc lưu local giả. |
| Giá và tồn | App hỗ trợ nhiều variants, priceMinor, compareAtPriceMinor, stock và weightGrams theo variant. | Một variant có thể hiển thị form gọn; nhiều variants phải giữ editor/bảng variants. Không lấy variant đầu rồi ghi đè tất cả. |
| Giá khuyến mãi | Figma ghi giá gốc/khuyến mãi; code còn có campaign/promotion. | Đối chiếu semantics giá bán/giá so sánh; không tự tạo promotion hay thay giá cuối do server tính. |
| Kích thước | Figma biểu diễn cm dưới dạng chuỗi, contract dùng packageLengthMm/WidthMm/HeightMm. | Parse/format rõ đơn vị; ví dụ 31.3 × 12.9 × 3.8 cm tương ứng 313/129/38 mm; giữ null và validation. |
| Trạng thái | App có draft, published, hidden, archived, cộng moderationStatus. Figma chỉ vẽ on/off và badge hoạt động/ngưng. | Giữ đủ lifecycle; toggle nếu dùng chỉ ánh xạ transition hợp lệ. Không đánh đồng suspended, hidden và hết hàng. |
| Xóa | Tên hàm cũ deleteSellerProductDraft nhưng UI/service hỗ trợ soft-delete cả published/hidden/archived; test có published deletion. | Giữ xác nhận và xóa theo quyền thật; không thu hẹp về draft. Chi tiết và bằng chứng ở PROJECT-ADAPTATION.md. |
| Rich text | Figma có toolbar; contract description là string, chưa xác minh hỗ trợ HTML/rich text end-to-end. | Giữ representation đang hỗ trợ. Muốn rich text cần xác định lưu/render/sanitization; không thêm toolbar không hoạt động. |
| Tabs thông số/đánh giá | Figma chỉ cung cấp nội dung tab mô tả; count 15 là mẫu. | Dùng dữ liệu và route thật nếu có; không bịa review hay thông số. Ghi rõ các panel chưa có thiết kế. |
| Menu/profile | Figma có menu Khách hàng/Báo cáo/Cài đặt và profile quản trị; app là Seller có navigation khác. | Giữ các route/quyền thật, áp dụng cách trình bày Figma; không điều hướng sang Admin hoặc tạo dead links. |
| Tính năng ngoài mẫu | App có category, variants, media tới 9, option-value media, thông tin moderation/campaign. | Bố trí phần bổ sung theo cùng style, giữ chức năng; Figma không vẽ không có nghĩa là được xóa. |

Các giới hạn trên không ngăn refactor phần giao diện đã có dữ liệu. Hoàn thành phần khả thi và báo các chênh lệch chức năng cần quyết định riêng; không tự mở rộng backend theo suy đoán.

## Component và ownership đề xuất

Đọc exports thật trước khi chọn tên. Gợi ý trách nhiệm:
- Shell/header Seller Products dùng chung cho hai màn hình; tránh sidebar lồng sidebar do route đã có layout bọc ngoài.
- Toolbar bộ lọc, bảng/dòng sản phẩm, badge lifecycle và action cell.
- Header breadcrumb/actions, gallery/media editor, card thông tin chung, nhóm trường variant và vùng tabs.
- Hook/controller hiện có quản lý session, API và draft; chỉ tách thêm nếu trách nhiệm rõ.
- Dữ liệu định dạng/mapping thuần đặt theo convention feature/lib; UI package không import API hoặc session của app.
- CSS thuộc component/feature được đặt đúng scope; sửa globals bằng cách gỡ rule không còn dùng, không chồng thêm hàng loạt override ở cuối.

## Assets offline

Hai screenshot đã có thật trong `screenshots/`. Toàn bộ 43 asset riêng trong source chưa có file; manifest giữ danh sách expected path và trạng thái thiếu. Không import chuỗi `UNAVAILABLE_ASSET:` vào production.

Ảnh sản phẩm/avatar dùng dữ liệu API/session. Nếu dùng fixture để đối chiếu, không để fixture thay dữ liệu vận hành. Đã bổ sung icon Lucide có nguồn/license, media runtime và avatar initials tại PROJECT-ADAPTATION.md; đây là thay thế theo project, không phải asset Figma gốc. Font tích hợp chốt Be Vietnam Pro hiện có, Inter chỉ là reference gốc.

## Kiểm chứng và báo cáo

Desktop đối chiếu 1440 × 1024 (ảnh local là bản thu nhỏ), kiểm tra sidebar 260/header 80/gutters 32, bảng và cột, gallery/form 420/664, typo và sắc xanh. Không chạy so pixel trực tiếp giữa screenshot 1440px và ảnh 1024px mà chưa chuẩn hóa tỉ lệ.

Kiểm tra hành vi: quyền/shop gate, tải/lỗi/empty/retry, các lifecycle hợp lệ, điều hướng list/detail/edit/new, không mất draft khi thay ảnh, upload/retry/remove, nhiều variants, validation, lưu lỗi/thành công và thao tác khi pending.

Chọn kiểm tra liên quan theo [chuẩn Seller Workspace](../seller-workspace/UI-SPEC.md); đối chiếu render cho layout và state tương tác đã đổi khi có thể. Chỉ chạy E2E khi người dùng yêu cầu. Kiểm tra mobile/tablet như adaptation, không tuyên bố đã khớp frame mobile không tồn tại.

Báo cáo tách ba phần: đã khớp thiết kế; khác biệt có chủ đích để giữ nghiệp vụ; phần chưa đủ dữ liệu/assets để xác minh. Không ghi “khớp hoàn toàn Figma” khi còn thiếu asset hoặc control chưa được backend hỗ trợ.
