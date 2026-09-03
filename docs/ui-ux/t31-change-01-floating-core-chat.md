# UI/UX Spec — T31 Change 1: Floating Core Chat

## 1. Mục tiêu

Change 1 đưa trải nghiệm chat đến **Mốc B — Usable core chat**: hai người dùng có thể bắt đầu, tiếp tục và theo dõi hội thoại chữ ngay trong một floating widget dùng chung trên marketplace.

Chat chỉ xuất hiện dưới dạng floating widget. Không có trang chat toàn màn hình, buyer inbox riêng hoặc seller workstation riêng.

## 2. Các quyết định sản phẩm đã chốt

- Floating widget là nơi duy nhất để sử dụng chat.
- Widget luôn có hai cột:
  - Cột trái hiển thị danh sách người dùng đã thực sự trao đổi.
  - Cột phải hiển thị nội dung cuộc trò chuyện đang chọn.
- Nhấn “Chat ngay” nhưng chưa gửi tin đầu tiên không được coi là đã bắt đầu trò chuyện.
- Một liên hệ chỉ xuất hiện trong danh sách hai bên sau khi tin đầu tiên được gửi thành công.
- Mọi cuộc trò chuyện đều là giữa hai tài khoản người dùng; không tồn tại danh tính chat riêng cho shop.
- Chủ shop sử dụng chính tài khoản người dùng của mình và chat với tài khoản khác như người dùng thông thường.
- Khi chủ shop đang xem chính shop của mình, đích chat chính là tài khoản hiện tại nên hành động chat bị vô hiệu hóa.
- Change 1 chỉ hỗ trợ tin nhắn chữ, lịch sử, trạng thái gửi, đã đọc, chưa đọc, kết nối lại và trạng thái hoạt động gần đúng.
- Khi mất mạng, một tin chỉ được chờ gửi lại tự động trong tối đa 3 giây; hết thời gian này tin chuyển thành “Gửi thất bại” và không tự gửi lại về sau.
- Tin gửi thất bại không có nút “Thử lại”; người dùng chủ động gửi lại bằng nút “Gửi” thông thường.
- Trạng thái đã đọc được tính theo mốc: khi tin mới nhất tại một mốc đã được đọc, mọi tin đứng trước nó cũng được coi là đã đọc.

## 3. Danh tính người dùng duy nhất

- Widget không có bộ chọn danh tính “Cá nhân / Shop”.
- Mỗi tài khoản chỉ có một danh tính chat, dùng cùng tên và ảnh đại diện người dùng trong mọi cuộc trò chuyện.
- Mỗi tài khoản chỉ có thể đại diện cho tối đa một shop; tài khoản có vai trò seller chính là tài khoản đại diện cho shop đó.
- Việc sở hữu hoặc quản lý shop không tạo thêm danh tính, danh sách liên hệ hoặc không gian chat khác.
- Khi người dùng nhấn “Chat ngay” cạnh một shop, họ mở cuộc trò chuyện với tài khoản người dùng đại diện cho shop đó.
- Chủ shop trả lời bằng chính tài khoản người dùng của mình, không cần chuyển sang chế độ shop.
- Chủ shop muốn liên hệ shop khác chỉ cần nhấn “Chat ngay” như mọi người dùng thông thường.
- Nếu nhiều vị trí “Chat ngay” cùng dẫn tới một tài khoản, tất cả mở lại cùng một cuộc trò chuyện giữa hai người; không tạo mục trùng.
- Người dùng không thể tự chat với chính tài khoản của mình.

## 4. Nút mở floating widget

### Nút chat toàn cục

- Một nút tròn có biểu tượng bong bóng chat nằm cố định ở góc dưới bên phải màn hình.
- Nút có kích thước tối thiểu 48 × 48 px, màu thương hiệu và bóng đổ vừa phải.
- Khi có tin chưa đọc, hiển thị badge đỏ:
  - Từ 1 đến 99 hiển thị số chính xác.
  - Trên 99 hiển thị “99+”.
- Nhấn nút sẽ mở widget tại trạng thái gần nhất.
- Khi widget đang mở, nút đổi thành biểu tượng thu gọn; nhấn lại sẽ đóng widget nhưng không làm mất nội dung đã gửi.
- Nút có nhãn hỗ trợ “Mở trò chuyện” hoặc “Đóng trò chuyện”.

### Vị trí

- Desktop: cách mép phải và mép dưới 24 px.
- Tablet: cách mép phải và mép dưới 16 px.
- Mobile: cách mép phải 12 px và nằm trên vùng an toàn phía dưới.
- Widget được phép nổi trên nội dung checkout; không tự di chuyển sang vị trí khó dự đoán khi người dùng cuộn trang.

## 5. Các nút “Chat ngay” theo ngữ cảnh

### Trang chi tiết sản phẩm

- Nút “Chat ngay” nằm cạnh tên shop trong khối thông tin shop phía dưới nội dung sản phẩm.
- Nút dùng biểu tượng chat kèm chữ “Chat ngay”.
- Khi nhấn:
  - Widget mở.
  - Cột phải chuyển đến tài khoản người dùng đại diện cho shop của sản phẩm.
  - Sản phẩm không tự động được gửi vào hội thoại trong Change 1.

### Trang chi tiết shop

- Nút “Chat ngay” nằm trong nhóm hành động của shop, cạnh “Theo dõi” và “Tố cáo Shop”.
- Nút được ưu tiên thị giác sau hành động theo dõi, không lấn át tên và thông tin shop.
- Khi nhấn, widget mở trực tiếp shop đang xem.

### Checkout

- Mỗi khối shop có một nút “Chat ngay” đặt cạnh tên shop trong phần đầu khối.
- Mỗi nút mở tài khoản người dùng đại diện cho shop tương ứng.
- Mỗi shop trong checkout dẫn tới tài khoản duy nhất sở hữu shop đó; không tồn tại trường hợp một tài khoản đại diện cho nhiều shop.
- Việc mở chat không thay đổi lựa chọn vận chuyển, lời nhắn đơn hàng hoặc nội dung thanh toán đang nhập.

### Trường hợp đang xem shop của chính mình

- Nếu tài khoản đăng nhập là chủ của shop đang hiển thị, biểu tượng và nút “Chat ngay” bị vô hiệu hóa tại cả ba vị trí.
- Nút giữ nguyên vị trí để bố cục không bị nhảy.
- Màu chuyển sang trung tính, con trỏ thể hiện không khả dụng.
- Hover hoặc focus hiển thị lời giải thích: “Bạn không thể chat với shop của mình.”
- Nhấn hoặc chạm không mở widget và không tạo bất kỳ trạng thái hội thoại tạm nào.

## 6. Quy tắc không tạo hội thoại rỗng

Đây là quy tắc bắt buộc của Change 1.

### Khi chỉ nhấn “Chat ngay”

- Widget mở và cột phải hiển thị một màn hình soạn tạm với người dùng đại diện cho shop được chọn.
- Người nhận chưa xuất hiện trong cột trái của người gửi.
- Người gửi chưa xuất hiện trong cột trái của người nhận.
- Không tăng số hội thoại, không tạo badge chưa đọc và không phát thông báo.
- Nếu người dùng đóng widget khi ô soạn trống, màn hình tạm được bỏ đi ngay.
- Nếu ô soạn có chữ nhưng chưa gửi, đóng widget sẽ giữ bản nháp trong phiên hiện tại; đăng xuất hoặc kết thúc phiên có thể bỏ bản nháp này.

### Khi gửi tin đầu tiên

- Tin đầu tiên hiển thị trạng thái “Đang gửi” trong cột phải.
- Trong thời gian đang gửi, hai danh sách liên hệ vẫn chưa thêm cuộc trò chuyện mới.
- Nếu mất mạng, trạng thái “Đang gửi” được giữ tối đa 3 giây trong lúc hệ thống tự chờ cơ hội gửi lại.
- Chỉ sau khi trạng thái chuyển thành “Đã gửi”:
  - Người nhận được thêm vào đầu cột trái của người gửi.
  - Người gửi được thêm vào đầu cột trái của người nhận.
  - Người nhận thấy badge một tin chưa đọc nếu chưa mở hội thoại.
- Nếu gửi thất bại:
  - Sau tối đa 3 giây, tin chuyển sang trạng thái “Gửi thất bại”.
  - Không hiển thị nút “Thử lại” và không tự gửi lại khi mạng trở lại sau thời điểm đó.
  - Nếu ô soạn đang trống, nội dung thất bại được đưa lại vào ô soạn để người dùng có thể chỉnh sửa rồi nhấn “Gửi” như một lần gửi mới.
  - Nếu người dùng đang soạn nội dung khác, không ghi đè nội dung đó; tin thất bại vẫn có thể được chọn và sao chép.
  - Không thêm liên hệ vào cột trái của bất kỳ bên nào.

### Khi đã có hội thoại trước đó

- Nhấn “Chat ngay” mở lại đúng hội thoại đã có.
- Không tạo thêm một mục liên hệ mới.
- Cột phải cuộn đến vùng tin mới nhất, trừ khi người dùng đang xem một vị trí cũ trong chính hội thoại đó.

## 7. Bố cục floating widget

### Kích thước desktop

- Widget rộng khoảng 760 px và cao khoảng 560 px, không vượt quá vùng nhìn còn lại.
- Cột trái rộng 280 px.
- Cột phải chiếm phần còn lại.
- Góc bo 12–16 px, nền trắng, viền trung tính và bóng đổ rõ hơn nút mở chat.

```text
┌──────────────────────────┬────────────────────────────────────────┐
│ CHAT                     │ Người đang trò chuyện            ─  × │
│ [Tìm trong hội thoại]    ├────────────────────────────────────────┤
│                          │                                        │
│                          │       Nội dung cuộc trò chuyện         │
│ [Ảnh] ● Người dùng B     │                                        │
│   Tin nhắn mới...        │                                        │
│                          │                                        │
│ [Ảnh] Người dùng A       ├────────────────────────────────────────┤
│   Đã gửi...              │ [Nhập tin nhắn…]                 [Gửi] │
└──────────────────────────┴────────────────────────────────────────┘
```

### Tablet

- Widget cách bốn cạnh tối thiểu 16 px và sử dụng phần lớn chiều rộng màn hình.
- Cột trái chiếm khoảng 34–38%, nhưng không rộng hơn 280 px.
- Nội dung cột phải vẫn giữ vùng soạn tin đủ rộng và nút gửi tối thiểu 44 px.

### Mobile

- Widget mở gần toàn màn hình nhưng vẫn giữ cấu trúc hai cột.
- Cột trái thu gọn thành contact rail rộng khoảng 88–104 px:
  - Hiển thị ảnh đại diện.
  - Tên rút gọn tối đa hai dòng.
  - Badge chưa đọc.
- Cột phải chiếm phần còn lại.
- Ô soạn bám đáy vùng chat, không bị bàn phím che.
- Không xuất hiện thanh cuộn ngang cho toàn bộ trang.

```text
┌──────────┬───────────────────────────┐
│ Danh sách│ Người dùng A          ×  │
│──────────├───────────────────────────┤
│ [Ảnh] ●  │                           │
│ User B   │       Nội dung chat       │
│          │                           │
│ [Ảnh]    ├───────────────────────────┤
│ User A   │ [Nhập tin…]        [Gửi] │
└──────────┴───────────────────────────┘
```

## 8. Cột trái — Danh sách liên hệ

### Nội dung mỗi mục

- Ảnh đại diện của người dùng.
- Tên hiển thị.
- Một dòng xem trước tin nhắn gần nhất.
- Thời gian hoạt động gần nhất của hội thoại.
- Chấm đỏ nằm cạnh ảnh đại diện khi liên hệ có tin chưa đọc; chấm đỏ không cần hiển thị số lượng.
- Trạng thái hoạt động gần đúng bằng một chấm nhỏ; màu sắc không phải dấu hiệu duy nhất.

### Sắp xếp và lựa chọn

- Hội thoại có tin mới nhất nằm trên cùng.
- Khi tin mới đến, mục liên hệ di chuyển lên đầu bằng chuyển động nhẹ.
- Mục đang chọn có nền màu thương hiệu rất nhạt và viền trái rõ ràng.
- Nhấn một mục sẽ thay nội dung cột phải mà không đóng widget.
- Nhấn vào ảnh đại diện hoặc toàn bộ mục liên hệ sẽ mở hội thoại và đánh dấu các tin mới nhất hiện có là đã đọc.
- Nếu đang có bản nháp ở màn hình tạm chưa từng gửi, chuyển liên hệ phải hỏi xác nhận trước khi bỏ bản nháp.

### Trạng thái rỗng

- Nếu tài khoản hiện tại chưa từng gửi hoặc nhận tin thành công, cột trái hiển thị:
  - Biểu tượng chat trung tính.
  - “Chưa có cuộc trò chuyện”.
  - “Hãy chọn Chat ngay tại một shop để bắt đầu.”
- Màn hình soạn tạm do nút “Chat ngay” mở không làm mất trạng thái rỗng này.

### Tìm kiếm

- Ô tìm kiếm chỉ lọc những liên hệ đã có trong cột trái.
- Không dùng ô này để tìm và tạo cuộc trò chuyện với một shop chưa từng nhắn.
- Khi không có kết quả, hiển thị “Không tìm thấy cuộc trò chuyện phù hợp”.

## 9. Cột phải — Nội dung chat

### Phần đầu

- Ảnh đại diện và tên người dùng đang trò chuyện.
- Trạng thái “Đang hoạt động” hoặc “Không hoạt động”.
- Nút thu gọn và đóng có nhãn hỗ trợ rõ ràng.
- Không hiển thị thời điểm hoạt động cuối chính xác.

### Vùng tin nhắn

- Tin của người dùng hiện tại nằm bên phải, màu thương hiệu nhạt.
- Tin của đối phương nằm bên trái, nền trung tính.
- Các tin liên tiếp cùng người và gần nhau được gom nhóm.
- Hiển thị mốc ngày khi lịch sử đi qua ngày khác.
- Khi một tin được đánh dấu đã đọc, tất cả tin đứng trước nó trong cùng hội thoại cũng tự động được coi là đã đọc.
- Để tránh lặp thông tin, chỉ tin mới nhất nằm trong mốc đã đọc hiển thị dòng “Đã đọc”.
- Khi người dùng đang đọc tin cũ và có tin mới đến:
  - Không tự kéo vùng chat xuống cuối.
  - Hiển thị chấm đỏ cạnh ảnh đại diện của liên hệ ở cột trái.
  - Hiển thị thông báo nổi “Tin nhắn mới” trong cột chat.
  - Thông báo có thể được nhấn để đi đến tin mới nhất.
- Tin mới được đánh dấu đã đọc khi người dùng thực hiện một trong hai hành động:
  - Đưa focus vào cột chat bằng chuột, chạm hoặc bàn phím khi hội thoại đó đang mở.
  - Nhấn vào ảnh đại diện hoặc mục liên hệ tương ứng ở cột trái.
- Chỉ việc đưa cửa sổ trình duyệt ra phía trước không đủ để đánh dấu đã đọc nếu người dùng chưa tương tác với cột chat.
- Sau khi đánh dấu đã đọc, chấm đỏ ở cột trái được xóa. Thông báo “Tin nhắn mới” chỉ biến mất khi người dùng đã đi đến vùng chứa tin mới, để không làm mất điểm điều hướng khi họ vẫn đang ở phần lịch sử cũ.

### Vùng soạn tin

- Ô nhập hỗ trợ nhiều dòng, tối đa bốn dòng hiển thị trước khi cuộn bên trong.
- Enter gửi; Shift + Enter xuống dòng.
- Nút gửi bị vô hiệu hóa khi nội dung chỉ có khoảng trắng.
- Nội dung đang nhập được giữ riêng cho từng liên hệ trong phiên hiện tại.
- Change 1 chưa hiển thị nút ảnh, sản phẩm, đơn hàng, voucher hoặc ghi chú nội bộ.

## 10. Luồng đăng nhập

- Khách chưa đăng nhập vẫn nhìn thấy nút “Chat ngay”.
- Nhấn nút mở yêu cầu đăng nhập, đồng thời ghi nhớ:
  - Shop cần chat.
  - Trang đang xem.
  - Vị trí nút đã được sử dụng.
- Sau khi đăng nhập thành công, người dùng quay lại trang trước và widget tự mở màn hình soạn tạm với đúng tài khoản đại diện cho shop đã chọn.
- Nếu đăng nhập không thành công hoặc người dùng hủy, không có liên hệ nào được thêm vào cột trái.

## 11. Trạng thái tải, kết nối và lỗi

### Đang tải danh sách

- Cột trái hiển thị 4–6 skeleton theo hình dạng mục liên hệ.
- Cột phải hiển thị skeleton tiêu đề và bong bóng tin nhắn nếu đã biết hội thoại cần mở.
- Không khóa nút đóng widget.

### Đang kết nối lại

- Hiển thị dải nhỏ “Đang kết nối lại…” phía trên vùng tin nhắn.
- Người dùng vẫn đọc được nội dung đang có và tiếp tục soạn.
- Tin mới gửi trong lúc này hiển thị “Đang gửi” và chỉ chờ tối đa 3 giây.
- Nếu kết nối trở lại và tin được gửi thành công trong 3 giây, trạng thái chuyển thành “Đã gửi”.
- Nếu sau 3 giây vẫn chưa gửi thành công, trạng thái chuyển thành “Gửi thất bại”; tin không được tự động gửi lại khi kết nối trở lại muộn hơn.
- Khi kết nối trở lại, phần tin bị thiếu được thêm đúng vị trí và không xuất hiện bản sao.

### Không tải được danh sách

- Cột trái hiển thị “Chưa thể tải cuộc trò chuyện” và nút “Thử lại”.
- Nếu cột phải đang có nội dung đã xem, giữ nguyên nội dung đó.

### Không gửi được tin

- Tin lỗi có biểu tượng cảnh báo và dòng “Gửi thất bại”.
- Không hiển thị nút “Thử lại” hoặc hành động gửi lại tự động.
- Nội dung không bị mất: nếu ô soạn đang trống, nội dung được đưa lại vào ô soạn; nếu ô soạn đang có nội dung khác, không ghi đè nội dung đó.
- Người dùng chỉnh sửa hoặc giữ nguyên nội dung rồi nhấn nút “Gửi” thông thường để tạo một lần gửi mới.
- Bong bóng thất bại vẫn giữ trạng thái thất bại và không được đổi thành đã gửi bởi lần gửi mới.

### Không còn quyền trò chuyện

- Giữ lịch sử mà người dùng vẫn được phép xem.
- Thay vùng soạn bằng thông báo “Bạn không thể tiếp tục cuộc trò chuyện này”.
- Không hiển thị lý do riêng tư hoặc thông tin nội bộ.

## 12. Đã đọc, chưa đọc và trạng thái hoạt động

- Khi widget đóng, đang mở ở hội thoại khác hoặc người dùng đang đọc phần lịch sử cũ, tin mới tăng badge ở nút chat và tạo chấm đỏ cạnh liên hệ ở cột trái.
- Việc hội thoại đang hiển thị chưa đủ để tự đánh dấu đã đọc; người dùng phải focus vào cột chat hoặc nhấn avatar/mục liên hệ.
- Khi focus vào cột chat, mọi tin đến trước hoặc tại tin mới nhất hiện có được đánh dấu đã đọc theo cùng một mốc.
- Khi nhấn avatar hoặc mục liên hệ ở cột trái, hội thoại được mở và mọi tin đến trước hoặc tại tin mới nhất hiện có được đánh dấu đã đọc.
- Nếu tin cuối cùng của mốc được đánh dấu đã đọc thì tất cả tin phía trước cũng tự động chuyển sang đã đọc.
- Chấm đỏ của liên hệ biến mất ngay sau khi mốc đọc được cập nhật; badge tổng trên nút chat giảm tương ứng.
- Nếu người dùng vẫn đang ở đoạn lịch sử cũ, thông báo “Tin nhắn mới” tiếp tục xuất hiện như điểm điều hướng cho đến khi họ đi đến tin mới.
- Tổng badge trên nút chat bằng tổng tin chưa đọc trong tất cả cuộc trò chuyện của tài khoản hiện tại.
- Trạng thái hoạt động chỉ mang tính gần đúng; không dùng các câu như “hoạt động lúc 14:32”.

## 13. Animation và phản hồi tương tác

- Mở widget: fade kết hợp trượt lên nhẹ trong 180–220 ms.
- Đóng widget: fade và thu nhẹ trong 140–180 ms.
- Chuyển hội thoại: nội dung cột phải fade 120–160 ms; không làm cột trái nhấp nháy.
- Tin mới: fade và dịch lên 4–8 px trong 120–160 ms.
- Mục liên hệ mới chỉ xuất hiện sau tin đầu tiên gửi thành công, dùng fade 160 ms.
- Hover nút/mục liên hệ: đổi nền nhẹ, không phóng to gây xê dịch bố cục.
- Tôn trọng lựa chọn giảm chuyển động của thiết bị.

## 14. Khả năng tiếp cận

- Mọi nút chỉ có biểu tượng đều phải có tên hỗ trợ.
- Vùng widget có tiêu đề được công bố rõ là “Trò chuyện”.
- Khi mở bằng bàn phím, focus chuyển vào widget; khi đóng, focus quay về nút đã mở widget.
- Escape đóng widget, trừ khi đang có hộp xác nhận bỏ bản nháp.
- Thứ tự focus: tìm kiếm → danh sách liên hệ → tiêu đề hội thoại → vùng tin → ô soạn → gửi → đóng.
- Badge, lỗi và trạng thái hoạt động không chỉ dựa vào màu sắc.
- Vùng chạm tối thiểu 44 × 44 px.
- Nội dung mới và lỗi gửi được thông báo vừa đủ, không đọc lại toàn bộ lịch sử.

## 15. Tiêu chí hoàn thành Mốc B

Change 1 chỉ được coi là hoàn thành khi toàn bộ các điều kiện sau đạt được:

- Chat chỉ hoạt động trong floating widget; không cần chuyển sang trang chat khác.
- Widget hai cột sử dụng được tại các mốc 360 × 800, 768 × 1024 và 1440 × 900.
- Nút “Chat ngay” xuất hiện cạnh shop tại trang sản phẩm, trang shop và từng shop trong checkout.
- Chủ shop nhìn thấy nút chat của chính shop ở trạng thái vô hiệu hóa với lời giải thích rõ ràng.
- Mọi cuộc trò chuyện dùng một danh tính tài khoản duy nhất; chủ shop chat với tài khoản khác như người dùng thông thường.
- Chỉ mở widget hoặc nhập rồi không gửi không tạo mục liên hệ ở bất kỳ bên nào.
- Tin đầu tiên gửi thành công mới thêm hai bên vào danh sách liên hệ tương ứng.
- Khi mất mạng, tin chỉ chờ gửi lại tự động tối đa 3 giây; sau đó chuyển thành “Gửi thất bại”, không có nút retry và không tự gửi lại muộn.
- Người dùng có thể chủ động gửi lại bằng nút “Gửi” thông thường mà không làm thay đổi trạng thái của bong bóng đã thất bại.
- Khi đang đọc lịch sử cũ, tin mới tạo chấm đỏ ở liên hệ và thông báo “Tin nhắn mới” nhưng không tự kéo màn hình.
- Focus vào cột chat hoặc nhấn avatar/mục liên hệ sẽ đánh dấu tin mới nhất hiện có và toàn bộ tin phía trước là đã đọc.
- Lịch sử có thứ tự ổn định và có thể tải thêm mà không làm nhảy vị trí đang đọc.
- Trạng thái đã đọc, chưa đọc, badge và trạng thái hoạt động gần đúng nhất quán khi dùng nhiều tab.
- Loading, empty, offline, forbidden và send-failure states đều có phản hồi cùng hành động khôi phục phù hợp.
- Luồng chính dùng được bằng bàn phím và không có lỗi tiếp cận nghiêm trọng.

## 16. Ngoài phạm vi Change 1

- Trang chat toàn màn hình.
- Ảnh hoặc tệp đính kèm.
- Thẻ sản phẩm, đơn hàng hoặc voucher bên trong tin nhắn.
- Chặn, báo cáo và kiểm duyệt.
- Thông báo được gom khi người dùng không mở chat.
- Quick replies, auto-replies, internal notes, starred/unreplied filters và response metrics.
- Sửa, thu hồi hoặc xóa tin nhắn.
