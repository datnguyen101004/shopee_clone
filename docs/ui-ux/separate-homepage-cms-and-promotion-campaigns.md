# Đặc tả UI/UX — Tách Homepage/CMS và chiến dịch khuyến mãi

## 1. Mục tiêu trải nghiệm

- Trang chủ do **CMS/Homepage** quyết định: hero, carousel, section, ảnh, lịch hiển thị và thứ tự ưu tiên.
- **Chiến dịch khuyến mãi** chỉ lo giảm giá, voucher, flash sale, sản phẩm đủ điều kiện, thời gian và luật khuyến mãi.
- Một banner **có thể** trỏ tới chiến dịch, nhưng không bắt buộc. Tạo chiến dịch **không** tự tạo banner.
- Buyer bấm banner thì đi tới đúng đích còn hiệu lực: chiến dịch, sản phẩm, shop, danh mục, tìm kiếm hoặc đường dẫn nội bộ.
- Admin quản lý banner ở khu vực trang chủ, quản lý chiến dịch ở khu vực khuyến mãi — hai chỗ, hai vòng đời.

## 2. Nguyên tắc nhận biết

| Khái niệm | Người dùng hiểu là | Không hiểu là |
| --- | --- | --- |
| Banner trang chủ | Tấm ảnh/thẻ quảng bá trên home | Trang chiến dịch hay đợt giảm giá |
| Chiến dịch | Đợt khuyến mãi có giá và thời gian | Tấm banner trên home |
| Đích của banner | Nơi hệ thống đưa buyer tới khi bấm | Bắt buộc phải là chiến dịch |

Nhãn đích trên admin dùng chữ, không chỉ màu:

- Chiến dịch
- Sản phẩm
- Cửa hàng
- Danh mục
- Tìm kiếm
- Đường dẫn

Khi đích chiến dịch hết, bị xóa hoặc tải thất bại, admin thấy nhãn **Đích không khả dụng** và nhận thông báo. Buyer vẫn thấy banner; không bị đưa vào chiến dịch đó.

## 3. Buyer — trang chủ

### 3.1. Carousel / hero banner

Module banner trên homepage chỉ hiện banner mà:

- Admin đang bật,
- nằm trong lịch hiển thị của **chính banner đó**,
- có ảnh và tiêu đề đọc được,
- nếu đích là chiến dịch đang diễn ra thì banner **có thể bấm** vào trang chiến dịch; nếu chiến dịch hết, bị xóa hoặc tải thất bại thì **vẫn hiện banner**, không hiện phần chiến dịch và không đưa buyer vào chiến dịch đó.

Thứ tự theo độ ưu tiên admin đặt, rồi tới thời điểm tạo. Không tự chèn mọi chiến dịch đang chạy.

### 3.2. Tương tác

- Hover/focus: viền focus rõ, không phóng layout; autoplay vẫn tiếp tục khi banner đang nằm trong viewport.
- Bấm/Enter: đi tới đích đã kiểm tra. Nếu đích chiến dịch không tải được, banner không phải liên kết tới chiến dịch (ảnh và tiêu đề vẫn xem được).
- Vuốt carousel trên mobile; nút prev/next và chỉ báo vị trí nằm trong khung banner, đích chạm tối thiểu 44px. Banner tự chuyển sau 3 giây và chỉ tạm dừng khi khung banner bị cuộn hoàn toàn ra khỏi viewport.
- Ảnh có alt lấy từ admin; nếu thiếu thì dùng tiêu đề banner.

### 3.3. Trạng thái

| Trạng thái | Buyer thấy |
| --- | --- |
| Đang tải | Skeleton cùng kích thước carousel, không bấm được |
| Không có banner hợp lệ | Ẩn cả module, không để ô trống hay chữ “không có chiến dịch” |
| Ảnh lỗi | Nền trung tính + tiêu đề, vẫn bấm được nếu đích còn hiệu lực |
| Đích chiến dịch hết / xóa / tải lỗi | Banner vẫn hiện (ảnh, tiêu đề). Không hiện nội dung chiến dịch, không đưa tới trang chiến dịch. Admin nhận thông báo. |

Bấm banner **không** mở trang nội dung CMS riêng. Banner là lối tắt, không phải bài viết.

Trang chi tiết chiến dịch (nếu buyer vào từ banner đích Chiến dịch, từ sản phẩm, hoặc URL) vẫn thuộc domain khuyến mãi: tiêu đề, nội dung, sản phẩm, giá. CMS không soạn trang đó.

## 4. Admin — CMS trang chủ (`/admin/homepage`)

### 4.1. Danh sách banner

Nằm trong khu vực Homepage hiện có. Đầu trang: tiêu đề “Banner trang chủ”, mô tả ngắn “Ảnh và vị trí trên home, độc lập với chiến dịch khuyến mãi”, nút chính **Tạo banner**.

Mỗi hàng/card:

- Ảnh thu nhỏ, tiêu đề, loại đích bằng chữ.
- Lịch hiển thị (bắt đầu — kết thúc) theo giờ Việt Nam.
- Độ ưu tiên.
- Trạng thái: Nháp / Lên lịch / Đang hiện / Hết hạn / Tắt / Đích không khả dụng.

Hành động: Sửa, bật/tắt, xóa (xác nhận). Kéo thả hoặc nhập số để đổi ưu tiên.

Mobile: card; hành động phụ trong menu “Thêm”.

### 4.2. Tạo / sửa banner

Form một trang, nhóm rõ:

1. **Hiển thị:** tiêu đề, mô tả ngắn tùy chọn, ảnh, alt, theme.
2. **Đích khi bấm:** chọn loại, rồi chọn/nhập giá trị tương ứng.
3. **Lịch và thứ tự:** bật/tắt, thời điểm hiện, thời điểm ẩn, độ ưu tiên.

Đích:

| Loại | Admin làm gì | Buyer đi tới |
| --- | --- | --- |
| Chiến dịch | Chọn chiến dịch từ danh sách | Trang chiến dịch khi đang diễn ra; hết/xóa thì banner vẫn hiện, không mở campaign |
| Sản phẩm | Tìm và chọn sản phẩm | Trang sản phẩm |
| Cửa hàng | Tìm và chọn shop | Trang shop |
| Danh mục | Chọn danh mục | Trang/danh sách danh mục |
| Tìm kiếm | Nhập từ khóa | Trang tìm kiếm với từ khóa đó |
| Đường dẫn | Nhập path nội bộ, ví dụ `/account/orders` | Đúng path đó |

Không bắt buộc chọn chiến dịch. Lưu được banner chỉ có ảnh + tiêu đề + lịch, đích là sản phẩm hoặc path.

Khi chọn Chiến dịch:

- Gợi ý các chiến dịch đã công bố.
- Nếu chiến dịch chưa chạy, đã hết hoặc đã hủy: cảnh báo vàng “Banner vẫn hiện trên home nhưng sẽ không đưa buyer tới chiến dịch này.” Vẫn cho lưu.
- Nếu chiến dịch không tồn tại: cảnh báo đích không khả dụng; vẫn cho lưu ảnh/tiêu đề, không gắn link campaign.

Xóa chiến dịch không xóa banner; banner chuyển **Đích không khả dụng**, vẫn hiện trên home, admin nhận thông báo.

### 4.3. Preview

Nút **Xem trước** cho thấy tấm banner như trên home, có nhãn “Bản xem trước — chưa công bố”. Preview không ghi dữ liệu. Nếu đích chiến dịch không khả dụng, preview vẫn hiện ảnh nhưng ghi rõ “Không đưa buyer tới chiến dịch này.”

### 4.4. Trạng thái form

| Trạng thái | Hành vi |
| --- | --- |
| Đang tải | Skeleton form, nút lưu khóa |
| Thiếu tiêu đề/ảnh | Lỗi dưới field, giữ dữ liệu đã nhập |
| Path bên ngoài / javascript | Từ chối, không echo payload độc |
| Lưu thành công | Thông báo ngắn, quay danh sách hoặc ở lại bản ghi với trạng thái đã lưu |
| Lưu thất bại | Banner lỗi + Thử lại, không nói đã lưu |
| Có sửa chưa lưu | Cảnh báo khi rời trang |

Xóa: hộp xác nhận “Banner sẽ biến khỏi trang chủ. Chiến dịch khuyến mãi (nếu có) không bị xóa.”

## 5. Admin — chiến dịch (`/admin/campaigns`)

Form chiến dịch **không** còn bước “tạo banner homepage”.

- Không bắt buộc ảnh banner homepage, CTA homepage, hay “gắn lên home”.
- Có thể ghi chú tùy chọn: “Muốn hiện trên home, tạo banner tại Homepage và chọn đích Chiến dịch.”
- Tạo / công bố / hủy chiến dịch không thêm, không xóa, không ẩn banner CMS. Khi chiến dịch hết hoặc bị xóa, banner vẫn hiện trên home, không còn link/nội dung chiến dịch, và admin nhận thông báo.

Danh sách chiến dịch không dùng ảnh homepage CMS làm bắt buộc. Ảnh chiến dịch trên trang chiến dịch (nếu có) thuộc nội dung chiến dịch, không phải banner home.

## 6. Liên kết lỏng

```
Admin Homepage/CMS          Admin Chiến dịch
     │                            │
     │  tùy chọn targetType       │
     │  = CAMPAIGN + campaignId   │
     ▼                            ▼
Banner lịch riêng            Chiến dịch lịch riêng
     │                            │
     └──── homepage luôn hiện banner
           nếu banner trong lịch HIỆN.
           Chỉ gắn link/nội dung chiến dịch
           khi chiến dịch ĐANG CHẠY.
           Hết / xóa / fetch lỗi: báo admin,
           banner vẫn hiện, không mở campaign.
```

Buyer không thấy cảnh báo kỹ thuật. Banner trong lịch vẫn hiện; phần chiến dịch chỉ có khi đích còn chạy.

Admin nhận thông báo in-app khi đích chiến dịch hết, bị xóa hoặc tải lỗi. Cùng một banner + cùng một lỗi không gửi trùng. Mở thông báo đi tới `/admin/homepage`.

## 7. Truy cập và lỗi

- `/admin/homepage` và `/admin/campaigns` vẫn cần đăng nhập admin.
- 401/403: màn hình truy cập bị từ chối hiện có, không lộ form.
- API homepage public lỗi: module banner ẩn hoặc hiện trạng thái lỗi an toàn của trang chủ hiện có, không bịa banner.

## 8. Responsive và a11y

- Viewport 360×800, 768×1024, 1440×900: không tràn ngang.
- Carousel và nút admin ≥ 44px.
- Focus nhìn thấy được, thứ tự tab theo thứ tự nhìn.
- Không dùng chỉ màu để phân loại đích hay trạng thái.

## 9. Ngoài phạm vi UI này

- Soạn bài Markdown/CMS dài cho từng banner.
- Banner do seller tự đăng.
- Quảng cáo trả phí, đấu giá vị trí.
- Tự động tạo banner mỗi khi có chiến dịch mới.
