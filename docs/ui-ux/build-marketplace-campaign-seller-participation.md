# Đặc tả UI/UX — Chiến dịch sàn, seller tự nguyện tham gia và ưu tiên khám phá sản phẩm

## 1. Mục tiêu trải nghiệm

- Mỗi banner đại diện cho đúng một chiến dịch và có trang nội dung riêng tại `/banner/:bannerId`.
- Admin có thể tạo nội dung, đặt lịch công bố, mở đăng ký, bắt đầu và kết thúc chiến dịch từ một nơi quản lý thống nhất.
- Seller được thông báo trước, hiểu rõ điều kiện và chủ động chọn tham gia, từ chối hoặc rút trước hạn.
- Seller chỉ đăng ký những sản phẩm hợp lệ của shop và nhìn thấy rõ mức giảm, thời gian áp dụng, xung đột khuyến mãi và trạng thái tham gia.
- Trang quản lý sản phẩm của seller hiển thị đủ thông tin vận hành và các chiến dịch mà từng sản phẩm đang hoặc sắp tham gia.
- Buyer nhận biết sản phẩm đang thuộc chiến dịch, thấy giá giảm trung thực và có thể mở chiến dịch từ banner.
- Giao diện không hứa rằng sản phẩm chiến dịch luôn đứng đầu; chỉ diễn đạt là được ưu tiên hợp lý khi còn liên quan tới nhu cầu tìm kiếm.

## 2. Ngôn ngữ trạng thái chung

Trạng thái chiến dịch hiển thị thống nhất:

| Trạng thái | Nhãn tiếng Việt | Ý nghĩa nhìn thấy được |
| --- | --- | --- |
| DRAFT | Bản nháp | Chỉ admin thấy, seller chưa nhận thông báo |
| ANNOUNCED | Sắp mở đăng ký | Seller đã được báo trước nhưng chưa thể đăng ký |
| ENROLLMENT_OPEN | Đang mở đăng ký | Seller có thể tham gia, chọn sản phẩm hoặc từ chối |
| SCHEDULED | Chờ diễn ra | Đã đóng đăng ký và khóa danh sách sản phẩm |
| ACTIVE | Đang diễn ra | Giá chiến dịch và nhãn ưu tiên đang có hiệu lực |
| ENDED | Đã kết thúc | Chỉ còn xem lịch sử |
| CANCELLED | Đã hủy | Không áp dụng giá hoặc ưu tiên |

Trạng thái tham gia của seller:

- **Chưa phản hồi**: seller chưa chọn tham gia hoặc từ chối.
- **Đang chuẩn bị**: seller đã bắt đầu chọn sản phẩm nhưng chưa gửi.
- **Đã tham gia**: đăng ký hợp lệ và đã lưu.
- **Không tham gia**: seller chủ động từ chối.
- **Đã rút**: seller rút trước hạn.
- **Đã khóa**: hết hạn đăng ký; không thể thay đổi danh sách.

Mỗi trạng thái luôn có nhãn chữ; màu sắc chỉ hỗ trợ nhận biết.

## 3. Khu vực quản lý chiến dịch của admin

### 3.1. Danh sách chiến dịch

Trang `/admin/campaigns` sử dụng layout Admin Console hiện có. Phần đầu gồm tiêu đề “Chiến dịch”, mô tả ngắn và nút chính “Tạo chiến dịch”.

Thanh lọc gồm tìm theo tên, trạng thái và khoảng thời gian. Mỗi hàng hoặc card hiển thị:

- Ảnh banner thu nhỏ, tên chiến dịch và mã rút gọn.
- Trạng thái hiện tại.
- Thời gian mở đăng ký và thời gian diễn ra.
- Số seller đã tham gia, số seller từ chối và số sản phẩm hợp lệ.
- Hành động “Xem chi tiết”, “Chỉnh sửa” hoặc “Hủy” tùy trạng thái.

Trên mobile, thông tin được xếp thành card; hành động chính luôn nhìn thấy, hành động phụ nằm trong menu “Thêm”.

### 3.2. Tạo và chỉnh sửa chiến dịch

Form chia thành bốn bước có chỉ báo tiến trình:

1. **Thông tin chung**: tên, eyebrow, mô tả ngắn, ảnh banner, alt text và theme.
2. **Nội dung trang chiến dịch**: nội dung định dạng, CTA và preview trang `/banner/:bannerId`.
3. **Thời gian và điều kiện**: thời điểm công bố, mở/đóng đăng ký, bắt đầu/kết thúc, danh mục được tham gia và mức giảm tối thiểu.
4. **Kiểm tra và công bố**: tóm tắt toàn bộ dữ liệu, cảnh báo thiếu và nút “Lưu bản nháp” hoặc “Công bố”.

Các mốc thời gian được trình bày thành timeline theo múi giờ Việt Nam. Khi một mốc không hợp lệ, lỗi nằm ngay dưới trường và timeline đánh dấu đoạn có vấn đề.

Preview có nhãn “Bản xem trước — chưa công bố”. Preview không làm thay đổi trạng thái chiến dịch.

### 3.3. Chi tiết chiến dịch và mức tham gia

Trang chi tiết có các tab:

- **Tổng quan**: nội dung, timeline và trạng thái.
- **Seller tham gia**: danh sách seller, trạng thái phản hồi và số sản phẩm.
- **Sản phẩm**: sản phẩm hợp lệ, mức giảm và trạng thái bán.
- **Hiệu quả**: vùng chuẩn bị cho số liệu hiển thị/click/chuyển đổi; khi chưa có dữ liệu phải nói rõ.

Admin có thể hủy một chiến dịch chưa kết thúc qua hộp xác nhận nêu rõ giá giảm và ưu tiên khám phá sẽ dừng. Không hiển thị thành công trước khi hệ thống xác nhận.

## 4. Thông báo chiến dịch cho seller

Khi chiến dịch được công bố, seller đủ điều kiện nhận thông báo thuộc nhóm “Khuyến mãi”. Thông báo gồm:

- Tên chiến dịch và ảnh thu nhỏ.
- Thời gian mở và đóng đăng ký.
- Thời gian diễn ra.
- Điều kiện chính, ví dụ danh mục và mức giảm tối thiểu.
- Hành động “Xem chiến dịch” dẫn tới `/seller/campaigns/:campaignId`.

Seller nhận một thông báo khi công bố và một nhắc nhở trước khi đóng đăng ký nếu vẫn chưa phản hồi. Không tạo nhiều thông báo trùng cho cùng một mốc.

Nếu seller tắt email khuyến mãi, thông báo trong ứng dụng vẫn tuân theo cài đặt kênh hiện có. Nội dung không dùng ngôn ngữ gây áp lực hoặc ngụ ý seller bắt buộc phải tham gia.

## 5. Khu vực chiến dịch của seller

### 5.1. Danh sách chiến dịch

Trang `/seller/campaigns` có các tab:

- **Có thể tham gia**.
- **Đã tham gia**.
- **Sắp diễn ra**.
- **Đang diễn ra**.
- **Đã kết thúc**.

Mỗi card hiển thị banner, tên, timeline, đếm ngược có nhãn rõ ràng, điều kiện, số sản phẩm seller đã chọn và trạng thái phản hồi.

Các hành động theo trạng thái:

- “Tham gia ngay” khi đang mở đăng ký.
- “Tiếp tục đăng ký” khi seller có bản chọn sản phẩm chưa gửi.
- “Chỉnh sửa sản phẩm” khi đã tham gia nhưng chưa hết hạn.
- “Không tham gia” khi chưa phản hồi.
- “Xem kết quả đăng ký” khi danh sách đã khóa.

### 5.2. Chi tiết và đăng ký tham gia

Trang `/seller/campaigns/:campaignId` mở đầu bằng banner, mô tả, timeline và khối “Điều kiện tham gia”. Phần chọn sản phẩm nằm bên dưới và hỗ trợ tìm kiếm, lọc danh mục, trạng thái bán và trạng thái xung đột.

Mỗi sản phẩm có checkbox, ảnh, tên, giá hiện tại, tồn kho khả dụng, chương trình giảm giá đang có và trường nhập phần trăm giảm cho chiến dịch. Ngay khi nhập, giao diện hiển thị:

- Giá dự kiến trong chiến dịch.
- Số tiền giảm.
- Mức giảm tối thiểu cần đạt.
- Cảnh báo nếu trùng lịch với khuyến mãi khác.
- Cảnh báo nếu sản phẩm ẩn, lưu trữ, hết hàng hoặc không thuộc danh mục hợp lệ.

Sản phẩm không hợp lệ vẫn có thể được nhìn thấy để seller hiểu lý do, nhưng checkbox bị khóa và có hướng dẫn xử lý.

Nút “Gửi đăng ký” hiển thị số sản phẩm được chọn. Sau khi lưu thành công, giao diện chuyển sang trạng thái “Đã tham gia” và hiển thị thời điểm có thể chỉnh sửa cuối cùng.

“Không tham gia” và “Rút khỏi chiến dịch” đều cần hộp xác nhận. Rút chỉ khả dụng trước khi đóng đăng ký; sau thời điểm đó giao diện giải thích rằng danh sách đã khóa.

## 6. Nâng cấp trang quản lý sản phẩm của seller

### 6.1. Danh sách `/seller/products`

Danh sách sản phẩm bổ sung chế độ bảng trên desktop và card trên mobile. Mỗi sản phẩm hiển thị:

- Ảnh, tên, SKU đại diện và danh mục.
- Trạng thái sản phẩm và trạng thái kiểm duyệt.
- Số biến thể, khoảng giá gốc và giá đang áp dụng.
- Tồn kho tổng, đang giữ và khả dụng.
- Số đã bán, đánh giá và lần cập nhật gần nhất.
- Khuyến mãi riêng của shop đang/sắp áp dụng.
- Các chiến dịch sàn đang tham gia hoặc sắp diễn ra.

Cột “Chiến dịch” hiển thị tối đa hai chip và liên kết “+N chiến dịch” nếu còn thêm. Chip chứa tên rút gọn và trạng thái “Sắp diễn ra”, “Đang diễn ra” hoặc “Đã khóa”. Hover/focus mở tooltip có thời gian và mức giảm; trên mobile nhấn chip mở vùng thông tin bên dưới card.

Bộ lọc bổ sung:

- Có/không tham gia chiến dịch.
- Chiến dịch cụ thể.
- Sắp diễn ra/đang diễn ra/đã kết thúc.
- Có xung đột khuyến mãi.

### 6.2. Chi tiết `/seller/products/:productId`

Trang chi tiết giữ thông tin sản phẩm hiện có và bổ sung khối “Chiến dịch tham gia” gồm ba nhóm:

- **Đang diễn ra**.
- **Sắp diễn ra**.
- **Lịch sử**.

Mỗi hàng chiến dịch hiển thị tên, khoảng thời gian, mức giảm đã đăng ký, giá chiến dịch, trạng thái tham gia và liên kết “Xem chiến dịch”. Khi đang hoạt động, hiển thị nhãn “Được ưu tiên trong kết quả phù hợp” và giải thích ngắn rằng mức liên quan, chất lượng và tồn kho vẫn được xét.

Nếu sản phẩm chưa tham gia chiến dịch nào, empty state hiển thị “Sản phẩm chưa tham gia chiến dịch sàn” và liên kết “Xem chiến dịch có thể tham gia”.

## 7. Trải nghiệm phía buyer

Banner trên homepage dẫn tới `/banner/:bannerId`. Trang gồm banner lớn, tiêu đề, nội dung chiến dịch, thời gian còn lại, CTA và khu vực sản phẩm đang tham gia.

Sản phẩm chiến dịch hiển thị nhãn chiến dịch, giá trước/sau giảm và thời điểm kết thúc. Sản phẩm hết hàng hoặc không còn bán không xuất hiện trong danh sách public.

Trong search và gợi ý, nhãn “Thuộc chiến dịch” chỉ xuất hiện khi chiến dịch đang diễn ra và giá giảm thực sự đang áp dụng. Không hiển thị nội dung cho rằng vị trí xếp hạng đã được mua hoặc được đảm bảo tuyệt đối.

## 8. Loading, empty, success và error states

- Danh sách dùng skeleton giữ đúng cấu trúc bảng/card; không dùng dữ liệu giả như dữ liệu thật.
- Không có chiến dịch hiển thị thông điệp theo vai trò và CTA phù hợp.
- Sau khi save/join/decline/withdraw, dùng thông báo `aria-live` và cập nhật trạng thái tại chỗ.
- Lỗi field hiển thị gần input; lỗi hệ thống hiển thị banner cùng nút “Thử lại”.
- Khi dữ liệu đã thay đổi ở nơi khác, giao diện yêu cầu tải lại thông tin mới và giữ bản nhập để seller đối chiếu.
- Khi chiến dịch vừa đóng đăng ký hoặc bắt đầu trong lúc form đang mở, thao tác bị từ chối an toàn và giao diện tải lại timeline/trạng thái authoritative.

## 9. Responsive, accessibility và chuyển động

- Các breakpoint kiểm tra: 360×800, 768×1024 và 1440×900.
- Toàn bộ checkbox, nút, tab và menu có vùng tương tác tối thiểu 44 px.
- Bảng có tiêu đề cột rõ ràng; mobile chuyển thành card có nhãn cho từng giá trị.
- Modal giữ focus, đóng bằng Escape và trả focus về nút mở.
- Timeline, badge và cảnh báo không phụ thuộc chỉ vào màu sắc.
- Focus ring luôn nhìn thấy; thứ tự tab theo đúng thứ tự thị giác.
- Transition màu, viền và opacity trong khoảng 150–200 ms; hỗ trợ `prefers-reduced-motion`.
- Đếm ngược không cập nhật dày gây nhiễu trình đọc màn hình; thông báo mốc thời gian dùng văn bản ổn định.

## 10. Tiêu chí nghiệm thu UX

- Admin tạo được một chiến dịch đầy đủ, preview và công bố mà không nhập lại dữ liệu.
- Seller nhận đúng deep link, hiểu việc tham gia là tự nguyện và thấy rõ hạn đăng ký.
- Seller không thể chọn sản phẩm không hợp lệ và luôn thấy lý do.
- Seller xem được chiến dịch của từng sản phẩm từ cả danh sách lẫn trang chi tiết.
- Buyer chỉ thấy banner, sản phẩm, giá giảm và nhãn ưu tiên khi chiến dịch thực sự đang hoạt động.
- Loading, empty, lỗi, dữ liệu cũ và thay đổi trạng thái theo thời gian đều có phản hồi rõ ràng.
