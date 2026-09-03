# UI/UX Spec — T31 Change 3: An toàn, kiểm duyệt và thông báo chat

## 1. Mục tiêu

Change này gộp phạm vi an toàn chat, kiểm duyệt và thông báo thành một trải nghiệm thống nhất. Người dùng có thể tự bảo vệ mình trước spam hoặc quấy rối, gửi báo cáo có ngữ cảnh rõ ràng, nhận thông báo chat vừa đủ và quay lại đúng cuộc trò chuyện. Quản trị viên có một nơi để xem, đánh giá và xử lý báo cáo chat với lịch sử hành động minh bạch.

Change tiếp tục sử dụng floating chat và hệ thống thông báo hiện có. Không tạo trang chat toàn màn hình hoặc một trung tâm thông báo riêng chỉ dành cho chat.

## 2. Phạm vi trải nghiệm

Change bao gồm:

- Chặn và bỏ chặn người đang trò chuyện.
- Tắt và bật lại thông báo cho từng người trong cột liên hệ.
- Trả lời một tin nhắn cụ thể với phần trích dẫn rõ ràng.
- Báo cáo toàn bộ cuộc trò chuyện hoặc một tin nhắn cụ thể.
- Chọn lý do báo cáo và bổ sung mô tả khi cần.
- Theo dõi trạng thái báo cáo ở mức phù hợp với người gửi.
- Admin xem hàng đợi báo cáo chat, ngữ cảnh cần thiết và đưa ra quyết định.
- Hiển thị lịch sử xử lý để các hành động kiểm duyệt có thể được đối chiếu.
- Phản hồi chống spam nhất quán khi người dùng gửi tin hoặc gửi báo cáo quá nhanh.
- Tạo thông báo trong ứng dụng khi có tin nhắn chưa được người nhận chú ý.
- Gom nhiều tin mới của cùng một conversation thành một thông báo.
- Mở đúng conversation khi người dùng chọn thông báo.
- Đồng bộ trạng thái chưa đọc giữa notification và chat.

Không thuộc phạm vi:

- Thông báo đẩy của trình duyệt hoặc thiết bị di động.
- Email cho từng tin nhắn chat.
- Tự động đọc nội dung để kết luận vi phạm mà không có người kiểm duyệt.
- Chỉnh sửa, thu hồi hoặc xóa tin nhắn bởi người dùng.
- Gửi ảnh, tệp hoặc nội dung đa phương tiện trong chat.
- Hiển thị danh tính người báo cáo cho người bị báo cáo.
- Công khai ghi chú nội bộ hoặc lý do kiểm duyệt chi tiết cho các bên không có quyền.

## 3. Nguyên tắc trải nghiệm

- Hành động an toàn luôn dễ tìm nhưng không lấn át việc trò chuyện bình thường.
- Chặn là hành động có thể đảo ngược; báo cáo là hành động riêng biệt và không tự động chặn.
- Người dùng phải biết mình đang báo cáo một tin nhắn hay toàn bộ conversation.
- Không làm mất bản nháp khi mở hoặc đóng hộp thoại báo cáo.
- Không gửi báo cáo chỉ bằng một lần chạm nhầm; luôn có bước xác nhận rõ ràng.
- Mở menu tùy chọn của user hoặc tin nhắn không được tự đánh dấu conversation là đã xem.
- Tắt thông báo chỉ làm im lặng notification của conversation, không che tin mới hoặc thay đổi badge chat.
- Không tiết lộ cho người bị báo cáo ai đã báo cáo hoặc nội dung ghi chú của người báo cáo.
- Thông báo chat phải hữu ích nhưng không tạo một dòng mới cho từng tin nhắn liên tiếp.
- Trạng thái đã đọc của notification và trạng thái chưa đọc của chat không được hiển thị mâu thuẫn.
- Khi người nhận đang thực sự mở đúng conversation, tin đến được thể hiện trong widget và không tạo notification dư.
- Mọi giới hạn chống spam phải giữ nội dung người dùng đã nhập và hướng dẫn thời điểm có thể thử lại.
- Trạng thái quan trọng luôn có chữ hoặc biểu tượng kèm nhãn, không chỉ dựa vào màu sắc.

## 4. Bề mặt giao diện chính

### Floating chat của người dùng

Giữ bố cục hai cột của Change 1 và Change 2.

Mỗi user trong cột liên hệ bên trái có một nút tùy chọn đặt chính giữa theo chiều dọc ở mép phải của hàng. Nút dùng biểu tượng ba chấm, luôn nhìn thấy, không chỉ xuất hiện khi hover và không che tên, preview hoặc badge chưa đọc. Khi nhấn, một popover nhỏ mở sát nút với đúng hai hành động:

- “Tắt thông báo” hoặc “Bật thông báo” tùy trạng thái hiện tại.
- “Chặn” hoặc “Bỏ chặn” tùy trạng thái hiện tại.

Nhấn ra ngoài, nhấn Escape hoặc chọn xong một hành động sẽ đóng popover. Mỗi thời điểm chỉ có một popover user được mở. Nút của user đang chọn vẫn nằm cố định tại cùng vị trí khi danh sách cuộn.

Header conversation vẫn cung cấp hành động “Báo cáo cuộc trò chuyện”, nhưng không lặp lại “Tắt thông báo” hoặc “Chặn” vì hai hành động này thuộc menu của user ở cột trái.

Khi một tin nhắn được hover, focus bằng bàn phím hoặc chạm chọn, một nút tùy chọn xuất hiện cạnh bong bóng. Nhấn nút mở popover có đúng hai hành động:

- “Trả lời”.
- “Báo cáo”.

Popover không làm bong bóng thay đổi chiều rộng hoặc khiến lịch sử bị nhảy vị trí. Cả hai hành động giữ cùng vị trí trong menu để người dùng không phải học lại bố cục giữa các bong bóng.

### Chuông và hộp thư thông báo

Thông báo chat xuất hiện trong popover chuông hiện có và trang “Thông báo” của tài khoản. Chat là một nhóm nội dung có biểu tượng bong bóng thoại và avatar hoặc ký tự đại diện của liên hệ.

### Trung tâm Kiểm duyệt của admin

Trang “Kiểm duyệt & Tố cáo” bổ sung tab “Chat”. Tab dùng bố cục danh sách báo cáo bên trái và chi tiết xử lý bên phải trên desktop. Trên mobile và tablet hẹp, danh sách và chi tiết chuyển thành hai màn hình nối tiếp với nút quay lại rõ ràng.

## 5. Chặn người dùng

### Menu tùy chọn trên từng user

- Nút tùy chọn nằm ở chính giữa bên phải của hàng user trong cột liên hệ.
- Badge chưa đọc nằm trước nút tùy chọn và không bị menu che khuất.
- Popover hiển thị tên user ở phần đầu để tránh thao tác nhầm khi danh sách có nhiều tên gần giống nhau.
- “Tắt thông báo” là hành động trung tính; “Chặn” dùng màu cảnh báo nhẹ.
- Khi user đã bị chặn, mục thứ hai đổi thành “Bỏ chặn” và không tiếp tục dùng màu nguy hiểm.
- Nếu user đang được chọn, mở menu không làm đánh dấu conversation đã xem và không tự chuyển vùng cuộn tin nhắn.

### Tắt và bật lại thông báo

- Chọn “Tắt thông báo” áp dụng ngay cho conversation với user đó và hiển thị toast “Đã tắt thông báo từ [Tên hiển thị]”.
- Hàng user hiển thị biểu tượng chuông bị gạch nhỏ cạnh tên hoặc trạng thái để người dùng nhận biết conversation đang tắt thông báo.
- Tin nhắn mới vẫn xuất hiện trong chat, vẫn tăng badge chưa đọc của contact và badge chat, nhưng không tạo item mới trong chuông notification hoặc trang thông báo.
- Tắt thông báo không đánh dấu các tin hiện có là đã đọc và không làm mất notification lịch sử đã tạo trước đó.
- Mở lại popover sẽ đổi hành động thành “Bật thông báo”.
- Chọn “Bật thông báo” hiển thị toast “Đã bật thông báo từ [Tên hiển thị]”. Chỉ những tin đến sau thời điểm bật lại mới tạo notification; không tạo bù notification cho các tin đã đến trong lúc tắt.
- Nếu cập nhật thất bại, trạng thái chuông giữ nguyên và hiển thị “Chưa thể cập nhật thông báo. Vui lòng thử lại.”

### Mở xác nhận chặn

Khi chọn “Chặn” trong popover của user, hiển thị hộp thoại xác nhận với:

- Tên đang hiển thị của người sẽ bị chặn.
- Giải thích ngắn: hai bên không thể gửi tin mới cho nhau trong thời gian bị chặn.
- Lưu ý rằng lịch sử cũ vẫn còn để người dùng xem.
- Hai nút “Hủy” và “Chặn người dùng”.

Nút xác nhận dùng màu cảnh báo nhưng không tạo cảm giác tương đương thao tác xóa vĩnh viễn. Focus ban đầu đặt ở nút “Hủy” để giảm thao tác nhầm.

### Sau khi chặn thành công

- Hộp thoại đóng và hiển thị toast “Đã chặn [Tên người dùng]”.
- Lịch sử conversation vẫn giữ nguyên.
- Composer được thay bằng dải trạng thái: “Bạn đã chặn người dùng này”.
- Dải trạng thái có nút “Bỏ chặn” và liên kết “Báo cáo” nếu người dùng vẫn muốn báo cáo hành vi trước đó.
- Không hiển thị nút gửi hoặc trạng thái đang hoạt động của người bị chặn.
- Các notification chat chưa đọc của conversation này được dọn khỏi trạng thái chưa đọc nhưng lịch sử notification có thể vẫn còn với trạng thái đã đọc.

### Khi người dùng bị đối phương chặn

- Lịch sử mà người dùng còn được phép xem vẫn hiển thị.
- Composer được thay bằng thông báo trung tính: “Bạn không thể tiếp tục cuộc trò chuyện này”.
- Không cho biết đối phương đã chặn, bị khóa hay đang chịu một hạn chế khác.
- Không hiển thị nút bỏ chặn vì người dùng hiện tại không sở hữu trạng thái đó.

### Bỏ chặn

- Chọn “Bỏ chặn” trong popover của user mở xác nhận ngắn.
- Sau khi thành công, composer trở lại nếu conversation vẫn đủ điều kiện chat.
- Toast hiển thị “Đã bỏ chặn [Tên người dùng]”.
- Bỏ chặn không tự gửi lại bản nháp hoặc tin thất bại trước đó.
- Trạng thái hoạt động chỉ xuất hiện lại sau khi giao diện nhận được trạng thái hiện tại, không dùng lại trạng thái cũ trước khi chặn.

### Lỗi chặn hoặc bỏ chặn

- Giữ nguyên trạng thái hiện tại của conversation.
- Hiển thị lỗi trong hộp thoại hoặc toast: “Chưa thể cập nhật trạng thái chặn. Vui lòng thử lại.”
- Không đóng hộp thoại khi chưa xác nhận được kết quả.
- Nút hành động trở lại trạng thái có thể nhấn sau khi lỗi kết thúc.

## 6. Trả lời và báo cáo tin nhắn

### Mở menu của tin nhắn

- Khi một tin nhắn nhận focus, nút tùy chọn xuất hiện ở cạnh ngoài của bong bóng nhưng vẫn nằm trong vùng hội thoại.
- Trên desktop, hover bong bóng cũng làm nút xuất hiện. Khi con trỏ rời đi nhưng focus vẫn nằm trên nút hoặc popover, menu không biến mất.
- Trên mobile, chạm vào bong bóng làm nút xuất hiện; nhấn nút mở bảng hành động nhỏ hoặc bảng hành động từ dưới lên.
- Popover có hai mục “Trả lời” và “Báo cáo”, kèm biểu tượng và nhãn chữ.
- Nhấn Escape, chạm ra ngoài hoặc chọn một mục sẽ đóng popover và trả focus về tin nhắn nếu hành động không mở dialog khác.

### Trả lời một tin nhắn

- Chọn “Trả lời” đưa focus vào composer và hiển thị một dải trích dẫn ngay phía trên ô nhập.
- Dải trích dẫn gồm tên người gửi, tối đa hai dòng nội dung gốc và nút “Hủy trả lời”.
- Người dùng có thể nhập nội dung mới mà không làm mất bản nháp đang có. Nếu composer đã có nội dung, nội dung đó được giữ nguyên và dải trích dẫn chỉ bổ sung ngữ cảnh trả lời.
- Nhấn gửi tạo một bong bóng mới có phần trích dẫn rút gọn phía trên nội dung trả lời.
- Nhấn vào phần trích dẫn trong bong bóng sẽ cuộn đến tin gốc và làm nổi bật tin đó trong thời gian ngắn.
- Nếu tin gốc không còn trong phần lịch sử đang tải, giao diện tải tới vị trí phù hợp và giữ trạng thái “Đang tìm tin nhắn…”.
- Nếu tin gốc không còn khả dụng, phần trích dẫn hiển thị “Tin nhắn gốc không còn khả dụng” nhưng nội dung trả lời vẫn đọc được.
- Nút “Hủy trả lời” chỉ bỏ ngữ cảnh trích dẫn, không xóa nội dung người dùng đã nhập.
- Gửi thất bại giữ cả nội dung trả lời và ngữ cảnh trích dẫn để người dùng chỉnh sửa hoặc thử gửi lại bằng nút gửi thông thường.

### Báo cáo conversation hoặc message

#### Phân biệt đối tượng báo cáo

Tiêu đề hộp thoại phải ghi rõ:

- “Báo cáo cuộc trò chuyện” khi mở từ menu header.
- “Báo cáo tin nhắn” khi chọn “Báo cáo” trong popover của một tin nhắn cụ thể.

Nếu báo cáo tin nhắn, phần đầu hộp thoại hiển thị bản xem trước rút gọn của tin được chọn, tên người gửi và thời gian gửi. Nội dung dài được giới hạn số dòng nhưng người dùng có thể mở rộng để kiểm tra trước khi gửi.

Nếu báo cáo conversation, phần đầu hiển thị tên liên hệ và giải thích rằng người kiểm duyệt sẽ chỉ xem phần ngữ cảnh cần thiết để đánh giá báo cáo.

#### Lý do báo cáo

Người dùng phải chọn một trong các lý do:

- Spam hoặc quảng cáo không mong muốn.
- Quấy rối, xúc phạm hoặc đe dọa.
- Lừa đảo hoặc giả mạo.
- Nội dung không phù hợp.
- Chia sẻ thông tin cá nhân trái phép.
- Lý do khác.

Khi chọn “Lý do khác”, trường mô tả trở thành bắt buộc. Với các lý do còn lại, mô tả là tùy chọn nhưng có gợi ý: “Hãy cho chúng tôi biết điều gì đã xảy ra”. Hiển thị số ký tự còn lại và không cho nhập vượt giới hạn.

#### Nội dung hộp thoại

Hộp thoại gồm:

1. Đối tượng đang được báo cáo.
2. Danh sách lý do dạng radio, toàn bộ dòng đều có thể chọn.
3. Trường mô tả bổ sung.
4. Lưu ý riêng tư: “Người bị báo cáo sẽ không biết ai đã gửi báo cáo này.”
5. Hai nút “Hủy” và “Gửi báo cáo”.

Nút “Gửi báo cáo” bị vô hiệu hóa cho đến khi dữ liệu bắt buộc hợp lệ.

#### Xác nhận và gửi

- Khi nhấn “Gửi báo cáo”, nút chuyển thành “Đang gửi…” và các trường tạm khóa để tránh gửi lặp.
- Sau khi thành công, hiển thị trạng thái xác nhận ngay trong hộp thoại với biểu tượng hoàn tất, mã tham chiếu và thông điệp “Báo cáo của bạn đã được ghi nhận”.
- Có hai hành động “Đóng” và “Chặn người dùng này”. Hành động chặn là tùy chọn và tiếp tục dùng hộp thoại xác nhận chặn riêng.
- Không tự động đóng widget hoặc xóa conversation sau khi báo cáo.

#### Báo cáo trùng hoặc đã gửi trước đó

- Nếu cùng người dùng đã báo cáo cùng một message, hành động trên bong bóng hiển thị “Đã báo cáo”.
- Khi báo cáo lại toàn bộ conversation trong lúc một báo cáo tương tự còn chờ xử lý, giao diện giải thích “Bạn đã gửi báo cáo cho cuộc trò chuyện này”.
- Người dùng vẫn có thể báo cáo một message khác nếu đó là hành vi mới và không bị giới hạn chống spam.

#### Lỗi gửi báo cáo

- Giữ nguyên lý do và phần mô tả đã nhập.
- Hiển thị lỗi gần nút gửi: “Chưa thể gửi báo cáo. Nội dung của bạn vẫn được giữ.”
- Có nút “Thử lại”.
- Đóng hộp thoại sau lỗi phải cảnh báo nếu phần mô tả chưa gửi có nội dung.

## 7. Phản hồi chống spam và gửi quá nhanh

### Gửi tin nhắn quá nhanh

- Tin chưa được chấp nhận không xuất hiện như một tin đã gửi thành công.
- Nội dung được giữ hoặc khôi phục trong composer.
- Hiển thị thông báo gần composer: “Bạn đang gửi tin quá nhanh. Hãy thử lại sau [thời gian còn lại].”
- Nút gửi tạm thời bị vô hiệu hóa trong thời gian chờ và tự hoạt động lại khi hết thời gian.
- Chuyển tab, tải lại trang hoặc mở cùng tài khoản ở thiết bị khác không làm thời gian chờ biến mất một cách giả tạo.

### Gửi báo cáo quá nhanh

- Hộp thoại vẫn giữ toàn bộ dữ liệu đã nhập.
- Hiển thị thời gian cần chờ trước khi có thể gửi tiếp.
- Không tạo thêm trạng thái thành công hoặc mã tham chiếu giả.

### Phản hồi không làm lộ thông tin

- Không hiển thị số lần người dùng đã bị người khác báo cáo.
- Không cho biết quy tắc nội bộ hoặc ngưỡng chính xác ngoài thời gian người dùng cần chờ.
- Không thay thông báo chống spam bằng lỗi hệ thống chung chung.

## 8. Tạo và gom notification chat

### Khi tạo notification

Một notification chat được tạo khi có tin mới và người nhận:

- Đang đóng widget chat; hoặc
- Đang mở widget nhưng xem một conversation khác; hoặc
- Chưa thực sự tương tác với conversation đang hiển thị.

Không tạo notification mới khi người nhận đang mở đúng conversation, đang ở vùng tin mới và vừa có tương tác rõ ràng với vùng chat.

Không tạo notification cho:

- Tin do chính người nhận gửi.
- Tin bị từ chối hoặc chưa được gửi thành công.
- Conversation đang bị chặn giữa hai bên.
- Conversation đã được người nhận tắt thông báo.
- Một sự kiện lặp lại của cùng tin nhắn đã được ghi nhận trước đó.

### Cách gom notification

- Mỗi conversation chỉ có tối đa một notification chat chưa đọc đang hoạt động.
- Tin tiếp theo của cùng conversation cập nhật notification hiện có thay vì tạo thêm một dòng.
- Tiêu đề giữ dạng “Tin nhắn mới từ [Tên hiển thị]”.
- Dòng mô tả dùng “Có [N] tin nhắn mới” khi có nhiều hơn một tin chưa đọc và kèm bản xem trước tin mới nhất ở mức ngắn gọn.
- Thời gian của notification phản ánh tin mới nhất trong nhóm.
- Tin từ conversation khác tạo một notification nhóm riêng.
- Tắt thông báo sau khi một nhóm đã tồn tại không xóa lịch sử nhóm đó; nhóm được giữ ở trạng thái hiện tại nhưng không nhận thêm tin mới cho tới khi bật lại.

### Quyền riêng tư trong phần xem trước

- Nội dung xem trước chỉ hiển thị một dòng và không chứa nhãn kỹ thuật.
- Khi tin nhắn không còn được phép hiển thị, dùng nội dung trung tính “Bạn có tin nhắn mới”.
- Không hiển thị nội dung của conversation bị chặn trong notification mới.

## 9. Notification Bell và trang thông báo

### Item thông báo chat

Một item gồm:

- Avatar hoặc ký tự đại diện của liên hệ.
- Biểu tượng chat nhỏ để phân biệt với đơn hàng hoặc khuyến mãi.
- Tiêu đề “Tin nhắn mới từ [Tên hiển thị]”.
- Số tin chưa đọc trong conversation.
- Bản xem trước tin mới nhất.
- Thời gian tương đối.

Item chưa đọc có nền nhấn nhẹ và dấu chấm trạng thái. Không dùng màu cam đậm cho toàn bộ item để tránh cạnh tranh với hành động chính của header.

### Badge notification và badge chat

- Badge chat biểu thị tổng số tin nhắn chat chưa đọc.
- Badge chuông biểu thị tổng số nhóm notification chưa đọc của mọi loại.
- Một notification chat đã gom chỉ đóng góp một đơn vị vào badge chuông, dù bên trong có nhiều tin nhắn.
- Khi một conversation được đọc trong widget, notification chat tương ứng chuyển sang đã đọc và badge chuông giảm theo nhóm đó.
- Khi người dùng chọn notification chat và mở thành công conversation, badge chat giảm theo số tin đã đọc của conversation và badge chuông giảm một nhóm.
- Hai badge không bắt buộc có cùng con số, nhưng không được có trường hợp notification chat đã đọc trong khi conversation vẫn được trình bày như chưa mở, hoặc ngược lại.

### Click notification

Khi người dùng chọn notification chat:

1. Popover notification đóng.
2. Floating chat mở trên trang hiện tại.
3. Đúng conversation được chọn, kể cả khi nó chưa nằm trong trang liên hệ đang hiển thị.
4. Vùng chat cuộn đến tin mới nhất thuộc nhóm notification.
5. Notification chỉ chuyển sang đã đọc sau khi conversation mở thành công.

Không điều hướng người dùng sang một trang chat riêng. Nếu conversation không thể mở, giữ notification chưa đọc và hiển thị phản hồi “Chưa thể mở cuộc trò chuyện. Vui lòng thử lại.”

### Trang “Thông báo” của tài khoản

- Tab hoặc bộ lọc “Chat” hiển thị các notification chat đã gom.
- Item đã đọc vẫn còn trong lịch sử theo cùng quy tắc lưu trữ của các notification khác.
- Chọn item thực hiện cùng hành vi mở floating chat như trên chuông.
- “Đánh dấu tất cả đã đọc” làm notification mất trạng thái chưa đọc nhưng không tự đánh dấu nội dung conversation là đã xem nếu người dùng chưa mở chat.
- Vì vậy, item có thể ở trạng thái notification đã đọc trong khi vẫn hiển thị nhãn phụ “Còn [N] tin nhắn chưa xem” để tránh hiểu nhầm.

## 10. Trạng thái notification khi widget đang mở

### Đang mở đúng conversation và ở cuối

- Tin mới xuất hiện trực tiếp trong vùng chat.
- Không tạo notification trong chuông.
- Read state tiếp tục theo quy tắc tương tác của Change 2; chỉ việc nhìn thấy thụ động không tự đánh dấu đã xem nếu chưa có tương tác phù hợp.

### Đang mở đúng conversation nhưng đọc lịch sử cũ

- Không tự kéo người dùng xuống cuối.
- Hiển thị nút “Tin nhắn mới” ở phía dưới vùng hội thoại như Change 2.
- Notification có thể được tạo vì người dùng chưa chú ý tới tin mới.
- Khi người dùng nhấn “Tin nhắn mới” và tương tác với vùng tin mới, notification tương ứng được đồng bộ thành đã đọc.

### Đang mở conversation khác

- Conversation nhận tin tăng badge ở cột liên hệ.
- Chuông nhận một notification nhóm cho conversation đó.
- Header widget chỉ đổi trạng thái chưa đọc theo quy tắc đã có, không tự chuyển conversation đang xem.

### Widget đang đóng

- Badge chat và badge chuông cập nhật mà không tự mở widget.
- Không hiển thị modal hoặc toast che nội dung trang chỉ để báo có tin mới.

## 11. Hàng đợi báo cáo chat cho admin

### Header và bộ lọc

Tab “Chat” trong Trung tâm Kiểm duyệt hiển thị:

- Tổng số báo cáo chờ xử lý.
- Số báo cáo ưu tiên cao nếu có dấu hiệu đe dọa hoặc lừa đảo.
- Bộ lọc trạng thái: “Chờ xử lý”, “Đang xem xét”, “Đã xử lý”, “Đã bỏ qua”.
- Bộ lọc lý do báo cáo.
- Bộ lọc đối tượng: “Tin nhắn” hoặc “Cuộc trò chuyện”.
- Ô tìm kiếm theo mã báo cáo hoặc mã conversation; không tìm trực tiếp theo toàn bộ nội dung riêng tư.
- Sắp xếp theo mới nhất, cũ nhất hoặc ưu tiên.

Các bộ lọc đang áp dụng hiển thị thành chip có thể xóa. Nút “Xóa bộ lọc” đưa danh sách về trạng thái mặc định.

### Danh sách báo cáo

Mỗi thẻ báo cáo hiển thị:

- Mã báo cáo rút gọn.
- Loại đối tượng được báo cáo.
- Lý do chính.
- Số báo cáo đã được gom vào cùng vụ việc nếu có.
- Thời điểm báo cáo gần nhất.
- Nhãn trạng thái và mức ưu tiên.

Không hiển thị toàn bộ nội dung tin nhắn trong danh sách để tránh lộ dữ liệu khi admin chưa mở chi tiết.

### Empty, loading và lỗi danh sách

- Khi tải, hiển thị skeleton cho bộ lọc và 5–8 thẻ báo cáo.
- Khi không có dữ liệu, hiển thị “Không có báo cáo chat phù hợp” cùng gợi ý bỏ bớt bộ lọc.
- Khi tải lỗi, giữ bộ lọc hiện tại và hiển thị nút “Thử lại”.
- Nếu đang có dữ liệu cũ, giữ danh sách cũ và dùng dấu hiệu làm mới nhẹ.

## 12. Chi tiết báo cáo dành cho admin

### Phân cấp nội dung

Chi tiết gồm các vùng theo thứ tự:

1. Tiêu đề vụ việc, trạng thái, mức ưu tiên và mã tham chiếu.
2. Lý do báo cáo, mô tả của người báo cáo và thời điểm gửi.
3. Tin nhắn bị báo cáo được làm nổi bật nếu báo cáo nhắm tới message.
4. Một lượng ngữ cảnh giới hạn trước và sau tin bị báo cáo.
5. Thông tin tài khoản cần thiết để ra quyết định, không hiển thị dữ liệu không liên quan.
6. Các báo cáo liên quan đã được gom.
7. Lịch sử xử lý.
8. Khu vực hành động kiểm duyệt.

Ngữ cảnh chat dùng bong bóng giống giao diện người dùng nhưng có nhãn “Tin bị báo cáo”. Nội dung dài có thể mở rộng. Admin không thể gửi tin nhắn từ màn hình kiểm duyệt.

### Bảo vệ nội dung riêng tư

- Chỉ hiển thị đoạn conversation cần thiết cho quyết định.
- Ghi chú của người báo cáo được đánh dấu “Chỉ quản trị viên”.
- Không cung cấp nút sao chép toàn bộ conversation hàng loạt.
- Thông tin đăng nhập, trạng thái kết nối và dữ liệu không phục vụ kiểm duyệt không xuất hiện.
- Nếu nội dung đã không còn khả dụng, hiển thị trạng thái trung tính thay vì một vùng trống khó hiểu.

## 13. Hành động xử lý của admin

Admin có thể chọn:

- “Bỏ qua báo cáo” khi không đủ căn cứ hoặc không có vi phạm.
- “Gửi cảnh cáo” cho hành vi mức nhẹ.
- “Hạn chế chat tạm thời” với thời hạn được chọn rõ ràng.
- “Hạn chế chat vô thời hạn” cho hành vi nghiêm trọng theo quyền được cấp.
- Chuyển sang quy trình xử lý tài khoản hiện có khi cần biện pháp ngoài chat.

Mỗi hành động phải mở hộp thoại xác nhận hiển thị:

- Đối tượng chịu tác động.
- Hành động và thời hạn nếu có.
- Hệ quả người dùng sẽ nhìn thấy.
- Trường ghi chú nội bộ bắt buộc với hành động hạn chế.
- Nút “Quay lại” và nút xác nhận mang tên hành động cụ thể.

Không dùng một nút chung tên “Xử lý”. Không cho admin đưa ra hai quyết định đồng thời cho cùng một vụ việc đang cập nhật.

### Sau khi xử lý thành công

- Trạng thái vụ việc cập nhật ngay trong header và danh sách.
- Hiển thị toast xác nhận có tên hành động.
- Một mục mới xuất hiện trong lịch sử xử lý.
- Các nút không còn phù hợp được ẩn hoặc vô hiệu hóa.
- Nếu hành động làm người dùng mất quyền gửi chat, giao diện của người đó chuyển sang trạng thái trung tính ở lần cập nhật kế tiếp.

### Lỗi xử lý

- Không thay đổi trạng thái vụ việc khi chưa xác nhận thành công.
- Giữ nguyên ghi chú nội bộ và lựa chọn thời hạn.
- Hiển thị lỗi trong hộp thoại cùng nút “Thử lại”.
- Nếu vụ việc đã được admin khác xử lý, đóng chế độ chỉnh sửa và tải lại quyết định mới nhất với thông báo rõ ràng.

## 14. Lịch sử và audit moderation

Mỗi vụ việc có timeline “Lịch sử xử lý” gồm:

- Hành động được thực hiện.
- Trạng thái trước và sau.
- Người thực hiện được hiển thị theo danh tính quản trị phù hợp.
- Thời gian thực hiện.
- Thời hạn của biện pháp nếu có.
- Ghi chú nội bộ, chỉ admin có quyền mới nhìn thấy.

Timeline sắp xếp mới nhất trước và không cho chỉnh sửa hoặc xóa trực tiếp. Khi chưa có hành động, hiển thị “Vụ việc chưa được xử lý”.

Trang nhật ký quản trị hiện có cũng phải nhận biết hành động kiểm duyệt chat bằng nhãn dễ hiểu như “Cảnh cáo chat”, “Hạn chế chat” hoặc “Bỏ qua báo cáo chat”. Chọn một mục nhật ký mở được đúng vụ việc liên quan nếu admin vẫn có quyền.

## 15. Trạng thái hạn chế chat sau moderation

### Người bị hạn chế

- Lịch sử vẫn hiển thị nếu họ còn quyền xem.
- Composer được thay bằng thông báo: “Tính năng chat của bạn đang bị hạn chế”.
- Nếu là hạn chế tạm thời, hiển thị thời điểm có thể sử dụng lại theo múi giờ người dùng.
- Có liên kết tới hướng dẫn hoặc quy trình hỗ trợ hiện có nếu được cung cấp.
- Không hiển thị ghi chú nội bộ hoặc danh tính admin xử lý.

### Người đối diện

- Thấy thông báo trung tính “Bạn không thể tiếp tục cuộc trò chuyện này”.
- Không biết đối phương bị hạn chế vì báo cáo nào hoặc do ai báo cáo.

### Khi hết hạn

- Composer trở lại sau khi trạng thái được làm mới.
- Không tự gửi bản nháp hoặc tin thất bại đã tồn tại trước khi bị hạn chế.
- Không tạo notification chỉ vì quyền gửi vừa được khôi phục.

## 16. Chuyển động và phản hồi trực quan

- Nút tùy chọn user và tin nhắn xuất hiện bằng fade ngắn trong 100–140 ms, không làm dịch chuyển nội dung.
- Popover tùy chọn mở bằng fade và dịch chuyển nhẹ trong 120–160 ms.
- Khi chọn “Trả lời”, dải trích dẫn phía trên composer mở bằng chuyển tiếp chiều cao nhẹ trong 120–180 ms.
- Khi quay tới tin gốc, tin được highlight nhẹ trong khoảng 1–1,5 giây rồi trở về màu bình thường.
- Hộp thoại báo cáo và xác nhận chặn dùng fade nền cùng scale nhẹ trong 150–200 ms.
- Item notification được cập nhật số lượng bằng chuyển màu ngắn, không rung hoặc nhấp nháy.
- Badge thay đổi bằng chuyển tiếp nhẹ; không đọc lặp liên tục cho công nghệ hỗ trợ khi nhiều tin đến liên tiếp.
- Thẻ báo cáo admin khi đổi trạng thái dùng highlight ngắn để chỉ vị trí thay đổi.
- Khi thiết bị bật giảm chuyển động, bỏ scale và dịch chuyển; trạng thái vẫn rõ bằng chữ và focus.

## 17. Khả năng tiếp cận

- Nút tùy chọn của từng user và từng tin nhắn có tên hỗ trợ chứa đúng đối tượng, ví dụ “Tùy chọn của Cửa hàng A” hoặc “Tùy chọn tin nhắn lúc 10:30”.
- Nút tùy chọn, tắt thông báo, chặn, trả lời, báo cáo, đóng modal, gửi báo cáo và hành động admin có vùng tương tác tối thiểu 44 × 44 px.
- Menu, dialog, tab và danh sách có tên hỗ trợ rõ ràng và thứ tự focus hợp lý.
- Khi dialog mở, focus nằm trong dialog; đóng dialog trả focus về đúng nút đã mở nó.
- Hover hoặc chạm giữ không phải cách duy nhất để mở tùy chọn tin nhắn; nút luôn xuất hiện khi bong bóng nhận focus bằng bàn phím.
- Dải trả lời có tên người gửi, nội dung trích dẫn và nút hủy được đọc theo đúng thứ tự trước composer.
- Lý do báo cáo dùng điều khiển có nhãn đầy đủ và đọc được trạng thái bắt buộc.
- Thành công, lỗi, thời gian chờ chống spam và thay đổi trạng thái được thông báo lịch sự qua vùng trạng thái phù hợp.
- Badge có nhãn đọc được như “3 tin nhắn chat chưa đọc” hoặc “2 nhóm thông báo chưa đọc”.
- Mức ưu tiên và trạng thái moderation luôn có chữ, không chỉ dùng màu.
- Nội dung chat trong màn hình admin giữ thứ tự đọc tự nhiên và phân biệt rõ hai phía.

## 18. Responsive

### Desktop — 1440 × 900

- Floating chat giữ bố cục hai cột.
- Nút tùy chọn user nằm chính giữa bên phải của từng hàng và không che badge chưa đọc.
- Menu user và menu tin nhắn không vượt khỏi khung widget; nếu gần cạnh dưới, popover mở lên phía trên.
- Nút tùy chọn tin nhắn nằm ở cạnh ngoài bong bóng và không làm thay đổi chiều rộng bong bóng.
- Dialog báo cáo rộng vừa đủ để đọc lý do và bản xem trước nhưng không che toàn bộ ngữ cảnh.
- Admin moderation hiển thị danh sách và chi tiết song song.

### Tablet — 768 × 1024

- Dialog báo cáo nằm giữa màn hình, có chiều cao giới hạn và cuộn nội dung độc lập.
- Notification popover không tràn cạnh màn hình.
- Menu user và tin nhắn tự đổi hướng mở để luôn nằm trong viewport.
- Admin moderation ưu tiên danh sách rộng; chi tiết có thể mở thành panel phủ phần nội dung.

### Mobile — 360 × 800

- Nút tùy chọn user vẫn nằm ở mép phải hàng liên hệ với vùng chạm tối thiểu 44 × 44 px.
- Menu user mở dạng bảng hành động từ dưới lên với đúng “Tắt/Bật thông báo” và “Chặn/Bỏ chặn”.
- Khi chọn một tin nhắn, nút tùy chọn xuất hiện; nhấn nút mở bảng hành động “Trả lời” và “Báo cáo”.
- Dải trích dẫn trả lời nằm phía trên composer và không bị bàn phím che khuất.
- Dialog báo cáo gần toàn chiều rộng, giữ nút hành động nhìn thấy phía dưới.
- Bàn phím không che trường mô tả hoặc nút gửi báo cáo.
- Notification item xuống dòng tối đa hợp lý và không tạo cuộn ngang.
- Admin xem danh sách trước; chọn báo cáo mở màn hình chi tiết với nút quay lại và tiêu đề cố định.

## 19. Empty, loading, success và error tổng quát

### Loading

- Dùng skeleton đúng hình dạng cho notification và hàng đợi moderation.
- Tắt/bật thông báo, chặn, bỏ chặn, báo cáo và xử lý admin dùng trạng thái đang thực hiện ngay trên mục hoặc nút đã nhấn.
- Không khóa toàn bộ widget khi chỉ một hành động phụ đang tải.

### Empty

- Không có notification chat: “Chưa có thông báo chat nào.”
- Không có báo cáo của người dùng: “Bạn chưa gửi báo cáo chat nào.”
- Không có báo cáo cho admin: “Không có báo cáo chat phù hợp.”

### Success

- Phản hồi thành công xuất hiện gần nơi bắt đầu hành động.
- Nội dung nêu rõ hành động đã hoàn tất, không chỉ hiển thị “Thành công”.
- Mã tham chiếu chỉ xuất hiện ở báo cáo hoặc vụ việc cần đối chiếu.

### Error

- Giữ lại dữ liệu người dùng đã nhập nếu có thể thử lại.
- Không hiển thị lỗi kỹ thuật, mã nội bộ hoặc chi tiết riêng tư.
- Lỗi có nút thử lại khi hành động có thể lặp an toàn.
- Khi dữ liệu đã thay đổi bởi một tab hoặc admin khác, ưu tiên tải lại trạng thái mới và giải thích ngắn gọn.

## 20. Tiêu chí nghiệm thu UI/UX

- Mỗi user trong cột trái có một nút tùy chọn nằm chính giữa bên phải và không che tên, preview hoặc badge.
- Popover của user có đúng hai nhóm hành động: “Tắt/Bật thông báo” và “Chặn/Bỏ chặn”.
- Tắt thông báo không làm mất tin mới hoặc badge chat, nhưng ngăn notification mới của conversation đó.
- Người dùng chặn và bỏ chặn được từ menu user với bước xác nhận rõ ràng.
- Sau khi chặn, lịch sử còn xem được nhưng composer không còn khả dụng.
- Focus vào tin nhắn làm hiện nút tùy chọn mà không khiến lịch sử bị nhảy.
- Popover tin nhắn có “Trả lời” và “Báo cáo”.
- Trả lời hiển thị trích dẫn ở composer và trong bong bóng đã gửi; hủy trả lời không làm mất bản nháp.
- Chọn trích dẫn đưa người dùng về đúng tin gốc hoặc hiển thị trạng thái tin gốc không còn khả dụng.
- Có thể báo cáo conversation hoặc một message cụ thể và luôn biết mình đang báo cáo đối tượng nào.
- Báo cáo bắt buộc có lý do; “Lý do khác” bắt buộc có mô tả.
- Nội dung báo cáo không bị mất khi gửi lỗi hoặc gặp giới hạn chống spam.
- Không gửi trùng báo cáo do nhấn nhiều lần.
- Gửi tin quá nhanh giữ nguyên nội dung và hiển thị thời gian có thể thử lại nhất quán giữa nhiều phiên đang mở.
- Nhiều tin mới trong cùng conversation chỉ tạo một notification chưa đọc được cập nhật số lượng.
- Không tạo notification dư khi người nhận đang tương tác với đúng conversation ở vùng tin mới.
- Click notification mở floating chat đúng conversation và cuộn tới tin mới liên quan.
- Đọc conversation làm notification chat tương ứng cập nhật; hai badge không hiển thị trạng thái mâu thuẫn.
- Admin lọc, mở và xử lý được báo cáo chat mà không thấy dữ liệu ngoài ngữ cảnh cần thiết.
- Hành động moderation yêu cầu xác nhận, cập nhật trạng thái và xuất hiện trong lịch sử xử lý.
- Người dùng bị hạn chế chỉ nhận thông báo trung tính, không thấy người báo cáo hoặc ghi chú nội bộ.
- Tất cả hành vi chính sử dụng được bằng bàn phím và công nghệ hỗ trợ.
- Giao diện hoạt động không tràn ngang tại 360 × 800, 768 × 1024 và 1440 × 900.
