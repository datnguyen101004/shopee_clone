# Luồng sử dụng chat sau khi gia cố

Tài liệu này mô tả những gì người dùng nhìn thấy và thực hiện trong floating chat. Các bước bên dưới không phụ thuộc vào cách hệ thống lưu dữ liệu hay tổ chức máy chủ.

## 1. Mở cuộc trò chuyện và tới tin mới nhất

Người dùng mở widget Chat rồi chọn một liên hệ. Trong lúc lịch sử đang tải, cột liên hệ và vùng tin nhắn hiển thị trạng thái chờ nhưng nút đóng vẫn dùng được. Khi tải xong, màn hình tự đứng ở tin nhắn cuối cùng và ô nhập luôn nằm trong tầm nhìn.

Ví dụ: cuộc trò chuyện có 200 tin. Người dùng mở lại cuộc trò chuyện thì không phải kéo qua 200 tin; tin mới nhất và ô nhập xuất hiện ngay.

## 2. Đọc lịch sử dài

Khi người dùng cuộn gần đầu danh sách, ứng dụng tải thêm các tin cũ hơn. Các tin đang nhìn không bị nhảy khỏi vị trí. Nếu trang tin cũ bị lỗi, lịch sử hiện tại và ô nhập vẫn giữ nguyên, phía trên danh sách có thông báo cùng nút “Thử lại”. Khi đã tới đầu cuộc trò chuyện, hiển thị nhãn nhẹ “Bắt đầu cuộc trò chuyện” và không tải lặp lại.

Ví dụ: người dùng đang đọc tin thứ 80, cuộn lên để xem tin thứ 60. Sau khi tải thêm, tin thứ 80 vẫn nằm ở đúng vị trí trên màn hình chứ không bị đẩy xuống cuối.

## 3. Tin mới khi đang ở cuối hoặc đang đọc tin cũ

Nếu người dùng đang ở cuối, tin mới của mình hoặc đối phương được đưa vào vùng nhìn thấy ngay. Nếu người dùng đang đọc lịch sử cũ, tin mới vẫn được thêm vào nhưng màn hình không tự kéo xuống. Một nút “Tin nhắn mới” cho phép đi tới cuối khi người dùng sẵn sàng.

Ví dụ: người dùng đang xem phần trao đổi hôm qua, đối phương gửi tin hôm nay. Màn hình vẫn ở hôm qua và xuất hiện nút “Tin nhắn mới”; nhấn nút sẽ đưa tới tin hôm nay.

## 4. Gửi tin và xử lý gửi thất bại

Khi nhấn “Gửi”, tin xuất hiện ngay với trạng thái đang gửi. Nếu quá thời gian chờ hoặc máy chủ từ chối, tin vẫn nằm trong cuộc trò chuyện với nhãn “Gửi thất bại”. Khi ô nhập đang trống, nội dung cũ được đưa lại vào ô nhập để người dùng chủ động nhấn “Gửi” lần nữa; không có nút gửi lại riêng và hệ thống không tự gửi lại.

Nếu người dùng đã nhập bản nháp khác trước khi lỗi xảy ra, bản nháp mới được giữ nguyên. Tin thất bại không biến thành tin đã gửi chỉ vì một phản hồi đến muộn; lần nhấn “Gửi” tiếp theo luôn là một lần gửi mới.

## 5. Đánh dấu đã xem

Chỉ thao tác rõ ràng trong cuộc trò chuyện mới cập nhật đã xem: nhấn vào vùng tin nhắn, đưa focus bằng bàn phím, nhấn avatar tiêu đề, chọn liên hệ hoặc focus vào ô nhập. Chỉ mở widget, chuyển tab trình duyệt hoặc đưa cửa sổ ra trước không làm mất số chưa đọc.

Nhãn “Đã xem” chỉ hiện cho tin mới nhất của người dùng. Người dùng có thể nhấn một tin cũ để xem nhãn của riêng tin đó; thời gian gửi mặc định chỉ hiện ở tin mới nhất.

## 6. Cuộc trò chuyện chỉ đọc

Lịch sử vẫn được hiển thị nếu người dùng còn quyền xem nhưng đối phương hoặc shop không còn nhận tin. Khu vực nhập được thay bằng dòng “Bạn không thể tiếp tục cuộc trò chuyện này”. Không hiển thị lý do nội bộ hoặc thông tin trạng thái nhạy cảm.

Nếu chính cuộc trò chuyện không còn được phép xem, ứng dụng hiển thị lỗi tải hoặc thông báo từ chối phù hợp, thay vì tạo một màn hình trống như thể chưa từng có tin.

## 7. Mất kết nối và kết nối lại

Trong lúc mạng hoặc Socket.IO gián đoạn, widget giữ lại lịch sử đã tải và hiện “Đang kết nối lại…”. Nếu kết nối quay lại nhanh, trạng thái hoạt động không chớp sang không hoạt động. Sau khi kết nối lại, tin bị bỏ lỡ được tải bổ sung và gộp với tin đang có, không tạo bản sao.

Ví dụ: người dùng tải lại trang trong vài giây. Cả hai bên vẫn thấy đối phương đang hoạt động; khi mạng ổn định, tin mới nhất xuất hiện một lần duy nhất.

## 8. Mở chat từ trang sản phẩm hoặc shop

Nhấn “Chat ngay” sẽ tìm cuộc trò chuyện đã có giữa người mua và chủ shop, kể cả khi liên hệ đó chưa nằm trong danh sách đầu tiên. Nếu chưa từng có tin được chấp nhận, chỉ mở một ô soạn tạm; chưa tạo cuộc trò chuyện cho tới khi tin đầu tiên gửi thành công. Nếu shop là của chính người dùng, nút chat bị vô hiệu hóa.

Nếu khách chưa đăng nhập, ý định chat được giữ cùng trang đang xem. Sau khi đăng nhập thành công, ứng dụng chỉ quay về đường dẫn nội bộ hợp lệ và mở lại đúng shop; ý định sai, quá cũ, trỏ ra ngoài hoặc trỏ tới chính mình bị bỏ qua.

## 9. Đóng bản nháp tạm

Đóng widget khi ô soạn tạm còn trống sẽ loại bỏ mục tạm; mở lại không thấy liên hệ rỗng. Nếu còn nội dung nháp, nội dung được giữ trong phiên cho đúng người dùng và đúng shop, nhưng chưa tạo conversation.

## 10. Ví dụ thực tế tổng hợp

Chị Lan mở sản phẩm của shop Điện Thoại Hay và nhấn “Chat ngay”. Hệ thống nhận ra chị đã từng trao đổi với shop dù liên hệ đó không nằm ở trang đầu, nên mở đúng lịch sử và đứng ở tin cuối. Chị cuộn lên đọc tin cũ; khi shop gửi thêm tin, màn hình giữ nguyên vị trí và hiện “Tin nhắn mới”. Chị nhấn vào nút này, đọc tin và focus vào ô nhập để đánh dấu đã xem. Một lần gửi bị mất mạng: tin hiện “Gửi thất bại”, nội dung trở lại ô nhập, chị sửa lại rồi nhấn “Gửi” chủ động. Trong suốt quá trình, một lần tải lại nhanh không làm shop bị báo không hoạt động sai và không tạo tin trùng.
