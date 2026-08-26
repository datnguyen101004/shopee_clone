# UI/UX Spec — Một tài khoản, một shop và một danh tính seller

## 1. Mục tiêu

Thay đổi này thống nhất tài khoản seller và shop thành một danh tính duy nhất trong trải nghiệm người dùng:

- Mỗi tài khoản chỉ được đăng ký và sở hữu tối đa một shop.
- Khi tài khoản đã là seller, shop chính là phần đại diện bán hàng của tài khoản đó; người dùng không phải chọn giữa danh tính cá nhân và danh tính shop.
- Khi shop bị quản trị viên hoặc bộ phận kiểm duyệt vô hiệu hóa, tài khoản sở hữu shop cũng bị khóa và đăng xuất.
- Việc seller chủ động tạm ngừng bán hoặc ẩn shop không được coi là một hình thức xử phạt và không làm khóa tài khoản.

## 2. Nguyên tắc trải nghiệm

- Không hiển thị bộ chọn shop vì một tài khoản không thể có shop thứ hai.
- Không hiển thị bộ chọn danh tính “Cá nhân / Shop”.
- Tên, ảnh đại diện và thông tin shop có thể xuất hiện ở các vị trí phù hợp, nhưng mọi hành động vẫn thuộc cùng một tài khoản.
- Không để người dùng hoàn thành một hành động rồi mới báo rằng họ đã có shop.
- Mọi thông báo khóa phải nói rõ tài khoản và shop bị ảnh hưởng cùng nhau.
- Không dùng thông báo lỗi đăng nhập chung chung cho trường hợp tài khoản bị khóa.

## 3. Đăng ký seller lần đầu

### Tài khoản chưa có shop

- Hành động “Đăng ký trở thành Người bán” mở luồng đăng ký shop như hiện tại.
- Trong phần giới thiệu, người dùng được thông báo ngắn gọn: “Mỗi tài khoản chỉ có thể sở hữu một shop.”
- Sau khi gửi đăng ký thành công, người dùng được đưa đến trạng thái theo dõi hồ sơ đang chờ duyệt.
- Trong thời gian chờ duyệt, hành động đăng ký mới được thay bằng “Xem hồ sơ đăng ký”.

### Tài khoản đã có hồ sơ shop

- Không hiển thị hành động tạo shop mới ở thanh điều hướng, trang tài khoản hoặc khu vực người bán.
- Nếu hồ sơ đang chờ duyệt, hiển thị “Xem hồ sơ đăng ký”.
- Nếu hồ sơ bị từ chối và được phép bổ sung, hiển thị “Chỉnh sửa và gửi lại”.
- Nếu shop đã được duyệt, hiển thị “Vào Shop của tôi”.
- Nếu người dùng mở lại một đường dẫn đăng ký cũ, hiển thị shop duy nhất hiện có cùng hành động phù hợp; không mở biểu mẫu shop mới.

### Trường hợp gửi trùng

- Nếu hai cửa sổ cùng gửi đăng ký gần như đồng thời, chỉ một hồ sơ được chấp nhận.
- Cửa sổ còn lại chuyển sang hồ sơ shop vừa được tạo và hiển thị: “Tài khoản này đã có shop.”
- Nội dung người dùng vừa nhập không được hiển thị như một shop thứ hai đã tạo thành công.

## 4. Sau khi được duyệt thành seller

- Người dùng nhìn thấy lối vào “Shop của tôi” và đi thẳng đến shop duy nhất.
- Không có màn hình chọn shop, đổi shop hoặc thêm shop.
- Khu vực người bán dùng tên và hình ảnh của shop để tạo ngữ cảnh, nhưng không tạo một tài khoản hoặc hộp thư riêng.
- Các hành động dành cho người mua vẫn thuộc cùng tài khoản nếu sản phẩm cho phép seller sử dụng chúng.
- Khi seller xem chính shop của mình, những hành động yêu cầu tương tác với một tài khoản khác phải ở trạng thái không khả dụng và có lời giải thích phù hợp.

## 5. Seller chủ động tạm ngừng bán

- Seller có thể tạm ngừng hiển thị hoạt động bán hàng bằng hành động hiện có nếu shop đủ điều kiện.
- Trước khi xác nhận, giao diện nói rõ shop sẽ tạm dừng bán nhưng tài khoản vẫn sử dụng được.
- Sau khi hoàn thành, hiển thị trạng thái “Tạm ngừng bán”.
- Người dùng vẫn đăng nhập, xem tài khoản và quay lại khu vực người bán để mở bán trở lại.
- Trạng thái này không sử dụng câu chữ “Tài khoản bị khóa” hoặc “Shop bị đình chỉ”.

## 6. Quản trị viên vô hiệu hóa shop

### Trước khi xác nhận

- Hộp xác nhận phải nêu rõ hai hậu quả:
  - Shop không còn hoạt động công khai.
  - Tài khoản sở hữu shop bị khóa và đăng xuất trên tất cả thiết bị.
- Lý do là bắt buộc và được hiển thị trong bản ghi quản trị phù hợp.
- Nút xác nhận dùng nhãn rõ ràng như “Vô hiệu hóa shop và khóa tài khoản”.

### Sau khi xác nhận thành công

- Trang chi tiết shop hiển thị trạng thái “Đã vô hiệu hóa”.
- Trang chi tiết tài khoản chủ shop hiển thị trạng thái “Đã khóa”.
- Thông báo thành công: “Shop đã bị vô hiệu hóa và tài khoản sở hữu đã bị khóa.”
- Nếu chủ shop đang đăng nhập, lần tương tác tiếp theo đưa họ đến màn hình thông báo khóa; phiên hiện tại không tiếp tục sử dụng được.
- Trang shop công khai hiển thị trạng thái không khả dụng, không cho mua hàng hoặc bắt đầu tương tác mới với shop.

### Nếu không thể hoàn tất đầy đủ

- Không hiển thị một nửa thao tác là thành công.
- Shop và tài khoản giữ nguyên trạng thái trước đó.
- Quản trị viên thấy thông báo: “Chưa thể vô hiệu hóa shop và khóa tài khoản. Vui lòng thử lại.”

## 7. Khóa một tài khoản seller

- Khi quản trị viên khóa trực tiếp một tài khoản seller, hộp xác nhận cũng thông báo shop của tài khoản sẽ bị vô hiệu hóa.
- Nút xác nhận dùng nhãn “Khóa tài khoản và vô hiệu hóa shop”.
- Sau khi thành công, cả trang tài khoản và trang shop đều phản ánh trạng thái mới.
- Tài khoản không phải seller được khóa theo luồng tài khoản thông thường và không có nội dung liên quan đến shop.

## 8. Khôi phục seller và shop

- Seller và shop đã bị vô hiệu hóa được khôi phục bằng một hành động phối hợp; không khôi phục riêng từng bên.
- Trước khi xác nhận, quản trị viên thấy rõ tài khoản sẽ đăng nhập lại được và shop sẽ hoạt động lại.
- Chỉ shop đã được phê duyệt trước đó mới có thể được khôi phục về trạng thái hoạt động.
- Nút xác nhận dùng nhãn “Khôi phục tài khoản và shop”.
- Sau khi thành công, cả hai trang chi tiết hiển thị trạng thái hoạt động.
- Nếu không thể khôi phục đầy đủ, cả hai giữ nguyên trạng thái bị vô hiệu hóa và giao diện báo chưa thể hoàn tất.

## 9. Đăng nhập bằng tài khoản đã bị khóa

- Sau khi thông tin đăng nhập hợp lệ được xác nhận, hiển thị thông báo riêng: “Tài khoản và shop của bạn đã bị vô hiệu hóa.”
- Hiển thị hướng dẫn liên hệ hỗ trợ hoặc khiếu nại nếu sản phẩm đã có kênh tương ứng.
- Không đưa người dùng vào trang chủ ở trạng thái đăng nhập một phần.
- Không tự động mở lại shop hoặc tài khoản khi người dùng thử đăng nhập lại.
- Không tiết lộ lý do quản trị nội bộ ngoài nội dung được phép thông báo cho người dùng.

## 10. Trạng thái tải và lỗi

- Khi kiểm tra hồ sơ shop, lối vào khu vực người bán dùng trạng thái chờ ngắn, không nhấp nháy giữa “Đăng ký” và “Shop của tôi”.
- Nếu chưa thể xác định tài khoản đã có shop hay chưa, không cho mở biểu mẫu tạo shop mới; hiển thị hành động “Thử lại”.
- Khi một hành động quản trị đang xử lý, vô hiệu hóa nút xác nhận để tránh gửi lặp.
- Nếu kết quả vừa thay đổi ở cửa sổ khác, tải lại trạng thái mới và giải thích rằng thao tác đã được hoàn tất trước đó.

## 11. Khả năng tiếp cận

- Trạng thái hoạt động, tạm ngừng, bị vô hiệu hóa và bị khóa không chỉ phân biệt bằng màu sắc.
- Hộp xác nhận có tiêu đề mô tả đúng phạm vi ảnh hưởng và đưa focus vào nội dung cảnh báo.
- Sau khi đóng hộp xác nhận, focus quay lại hành động đã mở hộp.
- Thông báo thành công và thất bại được công bố cho công nghệ hỗ trợ mà không đọc lại toàn bộ trang.
- Các nút nguy hiểm có nhãn đầy đủ; không chỉ dùng biểu tượng.

## 12. Tiêu chí hoàn thành UI/UX

- Một tài khoản chưa có shop chỉ tạo được một hồ sơ shop.
- Tài khoản đã có hồ sơ luôn được đưa về hồ sơ đó thay vì thấy biểu mẫu tạo shop mới.
- Seller đi thẳng vào shop duy nhất và không thấy bộ chọn shop hay bộ chọn danh tính.
- Seller tạm ngừng bán vẫn đăng nhập và sử dụng tài khoản bình thường.
- Quản trị viên được cảnh báo rõ rằng vô hiệu hóa shop sẽ khóa tài khoản và đăng xuất chủ shop.
- Khóa trực tiếp tài khoản seller cũng vô hiệu hóa shop.
- Khôi phục seller luôn khôi phục tài khoản và shop cùng nhau, chỉ khi shop đã được phê duyệt.
- Không có trạng thái giao diện mà shop bị vô hiệu hóa nhưng tài khoản vẫn hiện hoạt động, hoặc ngược lại.
- Tài khoản bị khóa nhận thông báo rõ ràng khi đăng nhập và không vào trạng thái đăng nhập một phần.
- Các trạng thái chờ, thành công, gửi trùng, xung đột và thất bại đều có phản hồi cùng hướng xử lý rõ ràng.
