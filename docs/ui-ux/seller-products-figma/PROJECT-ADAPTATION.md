# Phần bổ sung đã chốt theo project

Tài liệu này hoàn thiện các khoảng trống để agent triển khai **không cần Figma MCP và không đổi backend**. Đây là thiết kế bổ sung theo yêu cầu người dùng, không phải dữ liệu mới lấy từ Figma. UI-SPEC và screenshots giữ nguyên để truy vết thiết kế gốc.

Khi có khác biệt: dùng **quyết định cụ thể ở đây** cho chức năng, assets và responsive; dùng UI-SPEC cho bố cục/màu/kích thước còn lại; API và quyền thực tế vẫn phải được bảo toàn. Các quyết định này mới ở mức bàn giao, chưa được áp dụng vào app.

Thông số bổ sung dạng máy đọc: [project-tokens.json](project-tokens.json). Bảng mẫu trạng thái: [STATE-PREVIEW.html](STATE-PREVIEW.html), đã kiểm tra không tràn ngang/ảnh hỏng tại 1440×1024, 768×1024 và 360×800; đây là kiểm tra tài liệu preview, không phải kiểm thử ứng dụng Seller.

## 1. Assets đã có phương án thay thế

- Đã đóng gói 35 SVG từ **lucide-react đang cài trong repository**, kèm phiên bản, nguồn và license tại [icons-manifest.json](adapted-assets/icons-manifest.json). Không phải SVG gốc Figma, không cam kết glyph khớp từng pixel.
- Dùng component Lucide từ UI package khi triển khai để điều khiển currentColor. Các tên chưa được export phải bổ sung export trong `packages/ui/src/index.ts`; không giả định app được import dependency gián tiếp. Hoặc copy SVG đã cung cấp vào public assets và dùng URL ứng dụng.
- SVG tĩnh đóng gói có stroke trung tính #4b5563. Button primary dùng component icon currentColor trắng; destructive đỏ; menu active xanh. Không dùng SVG tĩnh trung tính trên nền xanh rồi coi là đúng contrast.
- Ảnh thật: list dùng `primaryMediaUrl`, detail dùng `media`, chuẩn hóa qua `marketplaceMediaUrl` hiện có. Trên lỗi/missing image dùng nền trung tính + ImageOff, alt mô tả sản phẩm; không làm hỏng layout hoặc lặp retry vô hạn.
- AuthUser hiện chỉ có id/email/displayName/status/roles, **không có avatar URL**. Avatar mặc định là hai chữ cái đầu của displayName trên nền #eff6ff, chữ #2563eb; nếu tên trống dùng CircleUserRound. Không lấy ảnh người khác từ dữ liệu mẫu.
- [Bốn ảnh fixture](adapted-assets/fixtures-manifest.json) được sao chép từ `apps/web/public/media/products/`, chỉ phục vụ demo/snapshot offline; giữ tên sản phẩm đúng với ảnh. Không dùng chúng thay dữ liệu thật hoặc gắn vào sản phẩm Keychron của screenshot.
- Logo dùng Store thay circle-x của mẫu; chữ “Kênh Người Bán”, phụ đề tên shop nếu có hoặc “Quản lý sản phẩm”. Menu/profile dùng danh tính và quyền Seller thật.
- Font mặc định cho bản tích hợp là **Be Vietnam Pro đã được app tải**; không tải thêm Inter chỉ cho hai trang. Giữ size/weight trong Figma, kiểm tra lại text wrap. Đây là thay đổi có chủ đích so với Inter gốc; chữ có thể khác độ rộng.
- Toolbar rich text và toggle ảnh tĩnh không được dùng: xem quyết định về mô tả và lifecycle bên dưới.

Các tham chiếu Figma thiếu đều có resolution trong [asset-resolution.json](asset-resolution.json). Không còn asset gốc nào bắt buộc phải tải trước khi bắt đầu bản tích hợp đã điều chỉnh.

## 2. Shell và thông báo

Giữ các route Seller hiện có: Tổng quan, Hồ sơ shop, Sản phẩm, Tồn kho, Đơn hàng, Đánh giá, Khuyến mãi, Trả hàng/Hoàn tiền. Giữ thêm navigation hợp lệ nếu code hiện tại đã bổ sung; không thêm Khách hàng/Báo cáo/Cài đặt giả. Vùng main vẫn có header và gutters theo Figma, sidebar được phép cao hơn vì số mục nhiều hơn mẫu.

Chỉ áp theme xanh/radius mới trong nhánh Seller Products. Header phụ và sidebar thuộc một owner; không lồng thêm sidebar/main trong shell cũ. Kiểm tra landmark main để tránh main lồng nhau.

Giữ một NotificationBell đang hoạt động tại owner hiện có. Component này phụ thuộc useChat và session: nếu dời vị trí phải giữ provider scope; không tạo provider chat/session thứ hai để dựng thêm một chuông. Trong màn hình độc lập không có provider phù hợp, giữ chuông ở shell cha, bỏ nút chuông trang trí tại header phụ.

## 3. Danh sách: filter và footer thực sự hoạt động

### Lifecycle lấy từ API

Dropdown mặc định “Trạng thái: Tất cả”; options gồm Tất cả, Bản nháp, Đang bán, Đã ẩn, Đã lưu trữ. Giá trị lần lượt undefined/draft/published/hidden/archived. Đổi lifecycle: hủy hiệu lực kết quả request cũ, tải lại từ cursor đầu, reset danh sách và lỗi; không để request cũ ghi đè filter mới.

### Search/category chỉ trong dữ liệu đã tải

Search label hiển thị **“Tìm trong sản phẩm đã tải”**, placeholder “Tên hoặc mã sản phẩm”; lọc case-insensitive theo name và slug trong items đã tải, normalize Unicode; không tìm SKU vì summary không có SKU.

Category label **“Danh mục đã tải”**, options distinct từ categoryName của items đã tải; giá trị đặc biệt Tất cả không dùng chung với tên category. Dưới toolbar ghi “Bộ lọc tên và danh mục chỉ áp dụng cho sản phẩm đã tải.” Không gọi nó là tìm toàn kho hoặc tìm phía server.

Đổi lifecycle reset category về Tất cả và có thể giữ chuỗi search; thể hiện phạm vi mới rõ ràng. “Xóa bộ lọc cục bộ” chỉ xóa search/category, không thay lifecycle. Nếu tải thêm, áp lại filter trên mảng gộp, dedupe theo id.

Không tự tải toàn bộ kho trong vòng lặp để giả lập search. Khi không có match mà còn nextCursor, hiển thị “Chưa tìm thấy trong N sản phẩm đã tải” và giữ nút Tải thêm để tiếp tục.

### Footer cursor

- Footer “Hiển thị M trong N sản phẩm đã tải”; M = số match sau lọc cục bộ, N = số id duy nhất đã tải cho lifecycle hiện tại.
- Bên phải nút **Tải thêm** khi nextCursor có giá trị. Pending: “Đang tải…”, disabled; xong không còn cursor: “Đã tải hết danh sách theo trạng thái đã chọn”.
- Lỗi tải thêm giữ các dòng đã có, hiện “Không thể tải thêm sản phẩm” + Thử lại tại footer. Lỗi tải đầu dùng error state toàn vùng bảng.
- Không hiển thị 120, 24 trang, nút đến trang cuối hoặc tổng toàn kho nếu chưa có contract tương ứng.

### Dữ liệu hàng

Giữ 7 cột như Figma ở desktop. Dòng metadata dưới tên đổi thành **“Mã sản phẩm: {slug}”**; không gọi slug là SKU. Giá lấy operationalPriceRange nếu có: bằng nhau hiển thị một giá, khác nhau hiển thị khoảng; không có giá hiển thị “Chưa có giá”. Không gọi detail từng dòng.

Stock 0 là 0 màu đỏ, không được thay bằng dash qua kiểm tra truthy. Hiển thị moderation “Bị hạn chế” riêng với lifecycle, giữ campaign/promotion summaries ở vùng metadata phụ nếu chúng đang có trên UI. Dòng nhiều metadata được phép cao hơn 80px, không cắt mất thông tin để giữ số đo mẫu.

## 4. Lifecycle và xóa: hiệu chỉnh theo code thật

**Đính chính bàn giao trước:** tên `deleteSellerProductDraft`/`deleteDraft` không phản ánh giới hạn thực. UI hiện có xóa draft/published/hidden/archived; service `deleteDraft` kiểm tra shop sở hữu và deletedAt, không giới hạn lifecycle; test có trường hợp soft-delete published. Giữ các nút xóa được hỗ trợ, không thu hẹp thành chỉ xóa nháp.

| Trạng thái | Badge | Hành động ngoài xem/sửa |
| --- | --- | --- |
| draft | Bản nháp, nền trung tính | Đăng bán nếu moderation cho phép; Xóa |
| published | Đang bán, nền xanh lá | Ẩn có xác nhận; Xóa có xác nhận |
| hidden | Đã ẩn, nền trung tính | Đăng bán nếu moderation cho phép; Xóa |
| archived | Đã lưu trữ, nền trung tính | Xem và Xóa; không lưu chỉnh sửa hoặc mở bán |
| moderation suspended | Badge bổ sung Bị hạn chế, nền đỏ | Không đăng bán; giữ quyền đọc/xóa/ẩn mà code cho phép; server là nguồn quyết định cuối |

Nút xem Eye, sửa SquarePen, ẩn EyeOff, xóa Trash2 đều có accessible name chứa tên sản phẩm. Tác vụ publish/hide/delete giữ khóa xung đột hiện tại; không tự đổi sang thao tác đồng thời chỉ vì chia component.

Trong editor dùng **badge lifecycle và các action riêng**, thay toggle on/off bằng thông tin không nhập nhằng. “Lưu thay đổi” gọi update, không tự publish. Create giữ Lưu nháp/Đăng bán như hiện tại. Publish lỗi sau create thành công phải báo đã lưu nháp, giữ id đã tạo và không tạo bản nháp trùng khi thử lại.

## 5. Form, tabs và field mapping đã chốt

- Route 2:192 áp dụng vào `/seller/products/[productId]/edit`; giữ route xem và new. Header dùng tên thật; cancel quay về danh sách như hành vi hiện tại, không tự thêm dialog unsaved vào mọi navigation.
- Card Thông tin chung thêm **Danh mục** là SelectField ở dưới tên sản phẩm; chỉ chọn category phù hợp validation hiện có. Thay category xử lý attributes theo định nghĩa đang chọn, không tạo brand field độc lập.
- SKU một variant hiển thị readOnly từ response; nhiều variants chuyển SKU về từng dòng variant. Create hiện “Tự sinh sau khi lưu”, không có ô SKU editable.
- Thương hiệu chỉ hiển thị khi category có attribute thương hiệu đã xác định theo metadata/code thật; nếu không có, bỏ field và bố trí category/thuộc tính còn lại, không thêm payload brand.
- Tên field giá: **Giá bán** → priceMinor, **Giá so sánh** → compareAtPriceMinor; label “Giá khuyến mãi” mẫu được thay để không nhập nhằng với promotion server. Giữ parser/formatter tiền hiện có, không đổi đơn vị hoặc tự chia/nhân 100.
- Với một variant không có options: card gọn gồm giá bán/so sánh, tồn và gram. Với nhiều variants: card chỉ thông tin chung; section Biến thể giữ toàn bộ combinations, SKU, giá, tồn, gram, active, giới hạn mua và option-value media theo khả năng hiện có.
- Dimensions dùng **ba input số riêng với nhãn cm** (Dài/Rộng/Cao), đổi sang integer mm khi tạo payload; rỗng → null, không đổi thành 0; chặn NaN/âm/độ chính xác không biểu diễn được bằng mm. Ví dụ 31.3cm → 313mm. Không parse một chuỗi tự do mơ hồ “D x R x C”.
- Gallery giữ upload tối đa theo SELLER_PRODUCT_MAX_MEDIA hiện là 9; 3 ảnh nhìn thấy trong Figma không phải giới hạn. Thumbnail strip cho cuộn khi nhiều ảnh, vùng add còn hiển thị nếu chưa đủ giới hạn. Giữ ảnh gắn option value, sortOrder, retry và remove; chỉ revoke blob URL khi đúng vòng đời.
- Tab **Mô tả** là TextareaField lưu chuỗi description, giới hạn theo contract hiện là 8000 ký tự; bỏ toàn bộ toolbar bold/align/image/link không có backend rich text. Hiển thị số ký tự và lỗi rõ, không lưu HTML rồi render raw.
- Tab **Thông số** hiển thị fields từ category.attributes; select cho allowedValues, text input cho giá trị tự do, required từ metadata. Đóng gói và variants là section độc lập luôn truy cập được để không giấu lỗi validation trong tab khác.
- Tab **Đánh giá** dùng operationalSummary.ratingCount/ratingAverageBasisPoints của detail nếu có; dữ liệu thiếu khác với count=0. Chỉ hiển thị tổng quan và link thật `/seller/reviews` với nhãn “Xem đánh giá của shop”; trang đó quản lý cả shop, không giả định đã lọc productId. Không tải cả shop rồi dựng như đánh giá đầy đủ của một sản phẩm. Form create bỏ tab Đánh giá.
- Khi validation liên quan field trong tab đang ẩn, mở tab chứa field, focus field hoặc summary lỗi; giữ draft trên mọi lỗi lưu.

## 6. Trạng thái UI bổ sung

| Trạng thái | Nội dung và hành vi |
| --- | --- |
| Auth đang tải | Giữ shell/skeleton; chưa hiện CTA đăng nhập sớm |
| Chưa đăng nhập / thiếu quyền / shop gate | Dùng trạng thái và CTA hiện có; không render form riêng tư phía sau |
| Tải list đầu | Giữ header/toolbar; 5 skeleton rows, aria-busy trên vùng bảng; không hiện empty trước response |
| List thật sự rỗng | “Chưa có sản phẩm”, mô tả tạo sản phẩm; CTA Thêm sản phẩm tới /seller/products/new nếu có quyền |
| Lọc không match | “Không có sản phẩm phù hợp trong dữ liệu đã tải”; Xóa bộ lọc cục bộ; vẫn cho Tải thêm nếu có cursor |
| Lỗi tải list/detail | “Không thể tải sản phẩm”, Thử lại; detail 404 có Quay lại danh sách, 403 dùng gate phù hợp |
| Load editor | Gallery/card skeleton; không nhập hoặc lưu khi chưa có dữ liệu/metadata cần thiết |
| Upload đang chạy/lỗi | Pending trên thumbnail tương ứng, “Đang tải ảnh…”; lỗi “Tải ảnh thất bại” + Thử lại/Xóa ảnh theo flow hiện có |
| Lưu đang chạy | Button loading, chống gửi lặp, aria-busy; giữ thứ tự upload → validate → update/create → publish nếu có |
| Lưu lỗi | Message từ error adapter, field error nếu có ánh xạ; giữ draft; không đóng form hoặc báo thành công |
| Lưu thành công | “Đã cập nhật sản phẩm.”; giữ editor hiện tại, hydrate response thật |
| Archived | Thông tin đọc được, nút lưu disabled với giải thích “Sản phẩm đã lưu trữ không thể cập nhật” |

### Confirmation xóa/ẩn

Modal max-width 480px, margin tối thiểu 16 trên màn nhỏ, padding 24, radius 12; tên và thumbnail sản phẩm, mô tả tác động theo thông điệp hiện có. Overlay rgba(17,24,39,.4). Nút Hủy outline, Xóa destructive/Ẩn primary.

Giữ behavior đang có: alertdialog, khóa scroll, focus trap và trả focus trigger; Escape hủy khi chưa pending. Hiện code focus nút confirm lúc mở, giữ để tránh thay hành vi âm thầm. Pending khóa cancel/confirm/escape/outside dismiss và mọi nút close; lỗi giữ modal + lỗi inline. Nếu thay bằng DialogContent của UI package, kiểm tra nút close tích hợp vì preventOutsideClose riêng nó chưa khóa mọi cách đóng.

### Tương tác bổ sung

Primary hover #1d4ed8, active #1e40af; secondary hover #f3f4f6; focus-visible outline 2px #2563eb offset 2; disabled opacity .55 và native disabled; transition màu 120ms. Các giá trị là quyết định bổ sung, không phải hover đã xuất từ Figma. Không thêm translate/shadow khi hover.

Tabs dùng tablist/tab/tabpanel, aria-selected và liên kết id; mũi tên/Home/End điều hướng theo component hiện có hoặc triển khai đúng semantics. Icon-only control có tên; loading/error announcements không lặp liên tục.

## 7. Responsive đã chốt

| Chiều rộng | Bố cục |
| --- | --- |
| ≥1200px | Sidebar 260; header 80; padding body 32; gallery 420 + gap 32 + form flex min-width 0. Tại 1440, form rộng 664 như Figma. |
| 768–1199px | Sidebar dạng drawer mở bằng Menu; header min-height 72; padding 24; toolbar wrap; gallery và form xếp dọc; nhóm field đôi giữ 2 cột nếu đủ rộng. |
| <768px | Drawer rộng min(280px, calc(100vw - 32px)); padding 16; header co giãn; search và filter xuống hàng; gallery/form full width; fields một cột; actions wrap. |

Ảnh chính giữ tỉ lệ 420/320, width 100%; thumbnails 96×72 cuộn trong strip. Bảng giữ đầy đủ cột trong vùng overflow-x riêng, min-width 1068px cho nội dung hữu dụng; không để body overflow. Trên touch, action có hit area ít nhất 44×44 dù icon vẫn 16–20; tăng row height khi cần. Footer wrap; tabs cuộn ngang, panel width 100%. Không cắt tên/giá/lỗi validation để ép layout.

Drawer là dialog có label, focus trap, Escape/overlay đóng, trả focus nút menu; chọn route đóng drawer. Không khóa chiều cao form theo artboard và không để sticky che field đang focus.

## 8. Checklist nghiệm thu bổ sung

- Cả 43 tham chiếu asset thiếu có resolution: icon thay thế, media runtime, avatar chữ cái hoặc control được loại/thay bằng semantics thật.
- Search/category có nhãn giới hạn dữ liệu đã tải, footer không bịa tổng, load-more không mất filter và kết quả cũ không ghi đè lifecycle mới.
- Published vẫn xóa mềm qua xác nhận như tests hiện có; archived không lưu/publish; moderation không bị biến thành lifecycle.
- Các form giữ đúng SKU/giá/đơn vị/variants/attributes và không làm mất chức năng ngoài Figma.
- Kiểm tra desktop 1440×1024, tablet 768×1024, mobile 360×800; states và bàn phím; báo riêng độ lệch font/icon so với screenshot Figma.
- Bộ tài liệu có SVG/fixture thay thế thật, nhưng ứng dụng chỉ được coi là hoàn thành sau khi agent triển khai và chạy kiểm tra liên quan.
