# Đăng ký người bán và vòng đời tài khoản/shop độc lập

## Phạm vi và nguyên tắc

Người dùng điền hồ sơ mở shop, gửi quản trị viên xét duyệt và chỉ trở thành người bán khi được duyệt. Mỗi người dùng có tối đa một shop. Tài khoản chủ shop và shop có trạng thái độc lập: khóa shop không khóa tài khoản; khóa chủ shop khiến shop và sản phẩm của shop không xuất hiện công khai và không nhận giao dịch mua mới.

Giữ giao diện, bố cục, typography và bộ thành phần hiện có; chưa áp dụng hai màn hình Figma Seller Products. Thay đổi tập trung vào nội dung trạng thái, quyền thao tác và phản hồi.

## Người dùng đăng ký mở shop

- Điểm vào “Đăng ký trở thành người bán” mở form hồ sơ hiện có. Người chưa đăng nhập được dẫn đến đăng nhập rồi quay lại; chưa cần có quyền người bán để điền form.
- Form giữ các nhóm thông tin tên/mã shop, mô tả, địa điểm, liên hệ, địa chỉ lấy hàng và trả hàng; logo/banner là tùy chọn. Giữ các quy tắc nhập liệu hiện hành.
- Chưa có hồ sơ: hiển thị form và nút “Gửi hồ sơ”. Đang gửi: nút có trạng thái tải, ngăn gửi trùng, giữ nội dung đã nhập khi lỗi.
- Chờ duyệt: hiển thị “Hồ sơ đang chờ xét duyệt”; cho sửa thông tin theo luồng hiện có. Người dùng vẫn dùng chức năng mua hàng, chưa truy cập công cụ bán hàng.
- Bị từ chối: hiển thị lý do bằng văn bản, cho sửa và “Gửi lại hồ sơ”; gửi lại thành công chuyển về chờ duyệt, không tạo shop thứ hai.
- Được duyệt: hiển thị “Hồ sơ đã được duyệt. Shop của bạn đã hoạt động” và nút “Vào Kênh Người Bán”. Làm mới quyền khi quay lại trang, không bắt đăng ký shop thêm lần nữa.

## Chủ shop và người mua

| Tình trạng | Trải nghiệm chủ shop | Trải nghiệm người mua |
| --- | --- | --- |
| Tài khoản hoạt động, shop hoạt động và đã duyệt | Sử dụng Kênh Người Bán theo quyền hiện có | Tìm và truy cập shop/sản phẩm nếu sản phẩm cũng đủ điều kiện |
| Tài khoản hoạt động, shop tạm ngưng | Vẫn đăng nhập, mua hàng, xem trạng thái/lý do tạm ngưng và thông báo kiểm duyệt; thao tác bán hàng bị chặn | Không thấy shop/sản phẩm trong danh sách công khai; đường dẫn trực tiếp báo không khả dụng |
| Tài khoản bị khóa | Không dùng được phiên đăng nhập; hiển thị thông báo khóa tài khoản theo luồng xác thực hiện có | Không thấy shop/sản phẩm và không thể tạo giao dịch mua mới, dù shop trước đó đang hoạt động |
| Tài khoản được mở khóa, shop vẫn tạm ngưng | Đăng nhập lại được nhưng vẫn thấy shop tạm ngưng | Shop vẫn không khả dụng |
| Shop được khôi phục, chủ shop vẫn bị khóa | Tài khoản vẫn bị khóa | Shop vẫn không khả dụng cho đến khi tài khoản được mở khóa |

Shop tự nghỉ bán tiếp tục giữ trạng thái nghỉ bán sau khi chủ shop được mở khóa. Đơn hàng và lịch sử giao dịch đã có vẫn được giữ; không tự hủy đơn, hoàn tiền hoặc xóa lịch sử. Mục lịch sử có thể giữ tên/ảnh đã lưu tại thời điểm mua; đây không phải trang bán hàng công khai. Sản phẩm đã nằm trong giỏ chuyển sang không khả dụng khi shop/chủ shop không đủ điều kiện.

## Quản trị viên

- Giữ danh sách hồ sơ chờ duyệt và màn hình xem hồ sơ hiện có. Hiển thị riêng trạng thái xét duyệt, trạng thái shop và trạng thái chủ shop.
- Duyệt hồ sơ thành công cấp quyền người bán và kích hoạt shop cùng lúc. Nếu chủ hồ sơ đã bị khóa, thông báo không thể duyệt và yêu cầu tải lại trạng thái; không mở khóa tài khoản từ thao tác duyệt hồ sơ.
- Hộp thoại tạm ngưng shop: “Shop sẽ ngừng hiển thị và bán hàng. Tài khoản chủ shop vẫn sử dụng được.”
- Hộp thoại khóa tài khoản: “Tài khoản sẽ bị khóa và các phiên đăng nhập bị thu hồi. Shop của tài khoản sẽ ngừng hiển thị và nhận giao dịch mới.”
- Hộp thoại khôi phục shop khi chủ shop bị khóa phải giải thích shop vẫn bị ẩn do tài khoản; mở khóa tài khoản không tự bỏ quyết định tạm ngưng shop.
- Giữ yêu cầu nhập lý do và lịch sử quản trị hiện có. Người quản trị thấy được cả hai trạng thái; người mua không thấy lý do kiểm duyệt nội bộ.

## Phản hồi, tương tác và responsive

- Dùng màu, khoảng cách và trạng thái nút hiện hành; nhãn chữ đi cùng màu trạng thái. Không dùng một toggle chung đại diện tài khoản và shop.
- Đang tải: giữ skeleton/spinner hiện có. Danh sách trống có giải thích phù hợp bộ lọc. Lỗi tải có nút “Thử lại”; lỗi nhập hiện cạnh trường và liên kết với trường đó.
- Lỗi do trạng thái đã thay đổi: giữ nội dung đang xem, thông báo ngắn gọn và tải lại dữ liệu; không hiển thị thành công trước khi thao tác hoàn tất.
- Nút xác nhận có trạng thái loading/disabled; giữ điều hướng bàn phím, focus rõ, focus trở về nút mở sau khi đóng hộp thoại. Hover/focus dùng trạng thái bộ UI hiện hành.
- Mobile xếp các nhãn trạng thái theo chiều dọc; bảng cuộn trong vùng bảng. Hộp thoại nằm trong chiều rộng màn hình, thông báo lỗi không gây tràn ngang.
- Giữ chuyển động hiện hành, không thêm animation mới; tôn trọng tùy chọn giảm chuyển động.

## Kiểm chứng theo yêu cầu

Quick test E2E chỉ chạy khi người dùng yêu cầu rõ ràng cho change này. Không tự chạy E2E đầy đủ hoặc tự cập nhật ảnh chuẩn thay thế. Việc chưa chạy E2E phải được ghi rõ, không ghi là đã đạt.
