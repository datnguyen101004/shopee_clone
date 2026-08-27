# Luồng sử dụng chat nổi

## Mục đích

Người mua có thể hỏi shop ngay tại nơi họ đang xem sản phẩm, trong trang shop hoặc lúc thanh toán. Cuộc trò chuyện chỉ được tạo khi có tin nhắn đầu tiên, vì vậy việc mở cửa sổ chat không làm xuất hiện các cuộc trò chuyện rỗng.

## Luồng chính

1. Người dùng nhìn thấy nút chat nổi ở góc màn hình. Huy hiệu hiển thị số tin chưa đọc; từ 100 tin trở lên hiển thị `99+`.
2. Người dùng chọn “Chat ngay” trên sản phẩm, trang shop hoặc tiêu đề shop ở trang thanh toán. Nếu chưa đăng nhập, hệ thống ghi nhớ shop và trang hiện tại rồi đưa người dùng tới đăng nhập.
3. Sau khi đăng nhập thành công, người dùng được đưa về đúng trang cũ và cửa sổ chat mở sẵn với shop đã chọn. Nếu shop không còn hoạt động, người dùng thấy thông báo chung và có thể thử lại.
4. Cửa sổ chat gồm danh sách liên hệ và khu vực tin nhắn. Danh sách được sắp theo tin mới nhất, có tìm kiếm và số chưa đọc.
5. Người dùng nhập tin nhắn nhiều dòng. Nhấn Enter để gửi; nhấn Shift+Enter để xuống dòng. Tin chỉ gồm khoảng trắng không được gửi.
6. Tin vừa gửi hiện ngay với trạng thái “Đang gửi…”. Nếu quá khoảng 3 giây chưa được xác nhận, trạng thái chuyển thành “Gửi thất bại”; nội dung vẫn còn để người dùng bấm “Gửi lại”.
7. Khi shop nhận được tin, tin hiển thị là “Đã gửi”. Khi shop đã mở tới tin đó, người gửi thấy “Đã xem”. Tin đến trong lúc người dùng đang đọc đoạn cũ không tự kéo màn hình xuống; người dùng có thể bấm liên hệ hoặc nút tin mới để xem.
8. Khi rời trang rồi quay lại, danh sách, tin nhắn và bản nháp của từng shop vẫn được giữ trong phiên đăng nhập. Đăng xuất hoặc đổi tài khoản sẽ xóa dữ liệu tạm của tài khoản trước.

## Các tình huống đặc biệt

- **Shop của chính người bán:** nút “Chat ngay” bị vô hiệu hóa và có giải thích “Bạn không thể chat với chính shop của mình”.
- **Mất mạng hoặc dịch vụ tạm dừng:** tin chưa xác nhận được giữ lại, cửa sổ hiển thị thông báo dễ hiểu và nút “Thử lại”. Người dùng không bị mất nội dung đã nhập.
- **Không còn quyền xem cuộc trò chuyện:** thay vì hiển thị dữ liệu của người khác, khu vực tin nhắn hiển thị trạng thái không thể truy cập và cho phép quay lại danh sách.
- **Đã đọc trên một tab:** các tab khác của cùng tài khoản cập nhật số chưa đọc khi nhận được đồng bộ; thao tác đọc lại không làm số đọc tăng ngược.
- **Không có cuộc trò chuyện:** danh sách hiển thị “Chưa có cuộc trò chuyện.”; chỉ sau khi gửi tin đầu tiên mới xuất hiện một liên hệ.

## Ví dụ thực tế

Mai đang xem sản phẩm “Tai nghe Bluetooth” của shop Minh Anh và bấm “Chat ngay”. Mai chưa đăng nhập nên đăng nhập trước; sau khi quay lại, chat mở đúng shop Minh Anh. Mai gõ “Shop còn màu đen không?” và nhấn Enter. Bong bóng tin nhắn hiện “Đang gửi…”, sau đó chuyển thành “Đã gửi”. Minh Anh trả lời “Còn ạ”, tin mới xuất hiện kèm huy hiệu chưa đọc. Mai đang xem lại tin cũ nên màn hình không tự nhảy; khi bấm “Tin mới”, Mai thấy câu trả lời và hệ thống cập nhật tin đã đọc.

Nếu Mai đang đăng nhập bằng tài khoản chủ shop Minh Anh, nút “Chat ngay” trên shop bị khóa. Nếu mạng bị ngắt lúc gửi, tin vẫn nằm trong khung chat với trạng thái “Gửi thất bại”; Mai bấm “Gửi lại” để tạo một lần gửi mới mà không phải gõ lại.
