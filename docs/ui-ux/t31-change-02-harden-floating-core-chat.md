# UI/UX Spec — T31 Change 2: Gia cố floating core chat

## 1. Mục tiêu

Change 2 hoàn thiện những hành vi còn thiếu của floating chat sau Change 1 để người dùng có thể đọc lịch sử dài, nhận biết trạng thái gửi, xử lý lỗi và tiếp tục cuộc trò chuyện mà không bị mất ngữ cảnh.

Change này không thêm một loại chat mới và không thay đổi mô hình hai cột đã được chốt. Người dùng vẫn trò chuyện bằng floating widget dùng chung trên marketplace.

## 2. Phạm vi trải nghiệm

Change 2 tập trung vào:

- Tải lịch sử cũ mà không làm vùng đọc bị nhảy.
- Luôn mở cuộc trò chuyện tại tin mới nhất trong các trường hợp phù hợp.
- Giữ vị trí đọc khi người dùng chủ động xem tin cũ.
- Khôi phục nội dung gửi thất bại mà không tạo hành động gửi lại gây nhầm lẫn.
- Phân biệt rõ lỗi tải dữ liệu, mất quyền gửi và mất kết nối tạm thời.
- Đánh dấu đã xem khi người dùng thực sự tương tác bằng chuột, chạm hoặc bàn phím.
- Giảm hiện tượng trạng thái hoạt động chớp sai khi tải lại trang hoặc kết nối lại nhanh.
- Mở đúng cuộc trò chuyện đã tồn tại ngay cả khi liên hệ đó chưa nằm trong phần danh sách vừa tải.
- Hiển thị trạng thái tải bằng skeleton và phản hồi có thể khôi phục.
- Giữ an toàn cho luồng tiếp tục chat sau đăng nhập.

Không thuộc phạm vi:

- Gửi ảnh, tệp, sản phẩm, đơn hàng hoặc voucher.
- Chỉnh sửa hoặc thu hồi tin nhắn.
- Chặn, báo cáo hoặc kiểm duyệt chat.
- Trang chat toàn màn hình.
- Thông báo ngoài widget.
- Giao diện dành cho thao tác dọn dữ liệu vận hành.

## 3. Nguyên tắc trải nghiệm

- Không làm mất nội dung người dùng đã nhập khi lỗi còn có thể khôi phục.
- Không tự kéo xuống cuối nếu người dùng đang chủ động đọc lịch sử cũ.
- Không tạo conversation mới nếu giữa hai người đã có conversation.
- Không dùng việc cửa sổ trình duyệt được đưa ra trước làm bằng chứng rằng tin đã được đọc.
- Không hiển thị chi tiết nội bộ khi người dùng mất quyền gửi.
- Mọi trạng thái quan trọng phải có chữ hoặc nhãn hỗ trợ, không chỉ dựa vào màu sắc.
- Việc dọn dữ liệu lỗi là hoạt động vận hành và hoàn toàn không xuất hiện trong giao diện người dùng.

## 4. Bố cục được giữ nguyên

Widget tiếp tục có:

- Header chung ở phía trên.
- Cột liên hệ bên trái.
- Vùng hội thoại bên phải.
- Composer bám đáy vùng hội thoại.
- Nút chat toàn cục ở góc dưới bên phải.

Change 2 không làm thay đổi đáng kể kích thước hoặc vị trí đã được xác định trong Change 1. Màu cam của header chỉ xuất hiện khi có tin chưa đọc; khi không có tin mới, header dùng màu trung tính. Nền cột liên hệ dùng màu trắng xám nhẹ để phân biệt với vùng hội thoại nhưng không làm giảm độ tương phản.

## 5. Mở một cuộc trò chuyện

### Mở từ danh sách liên hệ

- Khi người dùng chọn một liên hệ, vùng hội thoại hiển thị skeleton trong lúc tải.
- Khi tải thành công, màn hình đặt tại tin mới nhất.
- Nếu conversation không có tin hợp lệ, hiển thị trạng thái rỗng thay vì một vùng trắng không giải thích.
- Việc chọn liên hệ là một tương tác rõ ràng nên các tin chưa đọc hiện có được đánh dấu đã xem đến mốc mới nhất đã tải.

### Mở từ nút “Chat ngay”

- Hệ thống phải mở đúng conversation đã có giữa hai tài khoản, kể cả khi conversation đó chưa xuất hiện trong trang đầu của cột liên hệ.
- Nếu hai người chưa từng nhắn thành công, hiển thị màn hình soạn tạm như Change 1.
- Không được hiển thị hai mục liên hệ cho cùng một người.
- Không được làm thay đổi trạng thái trên trang sản phẩm, shop hoặc checkout đang mở.

### Đóng màn hình soạn tạm

- Nếu chưa gửi tin đầu tiên và ô nhập trống, đóng widget sẽ loại bỏ ngay màn hình soạn tạm.
- Khi mở widget lần sau, người dùng quay lại trạng thái gần nhất hợp lệ chứ không thấy một conversation rỗng.
- Nếu đang có bản nháp, bản nháp tiếp tục được giữ trong phiên theo quy tắc của Change 1.

## 6. Lịch sử dài và tải tin cũ

### Trạng thái ban đầu

- Khi vào conversation, vùng chat luôn đặt tại tin mới nhất.
- Composer luôn nhìn thấy và không bị đẩy khỏi widget dù lịch sử rất dài.
- Không có thanh cuộn ngang cho widget hoặc toàn trang.

### Tải thêm lịch sử

- Khi người dùng cuộn lên gần đầu phần lịch sử đang có, widget bắt đầu tải trang cũ hơn.
- Một spinner nhỏ hoặc skeleton bong bóng xuất hiện phía trên các tin đang hiển thị.
- Những tin đang đọc không bị che hoặc đổi vị trí đột ngột.
- Sau khi các tin cũ được thêm vào phía trên, tin đang nằm tại vị trí đọc trước đó vẫn giữ nguyên vị trí nhìn thấy.
- Không hiển thị trùng một tin nếu dữ liệu tải thêm trùng với dữ liệu đã nhận realtime.

### Đã đến đầu conversation

- Khi không còn tin cũ hơn, vùng đầu lịch sử hiển thị nhãn nhẹ “Đây là đầu cuộc trò chuyện”.
- Nhãn không chiếm nhiều chiều cao và không lặp lại khi người dùng tiếp tục cuộn.

### Lỗi tải trang cũ

- Giữ nguyên toàn bộ lịch sử đang xem.
- Hiển thị thông báo nhỏ ở đầu vùng chat: “Chưa thể tải tin nhắn cũ.”
- Có nút “Thử lại” dành riêng cho việc tải lịch sử cũ.
- Thử lại không làm mất vị trí đọc và không khóa composer.

## 7. Tin mới và hành vi cuộn

### Người dùng đang ở cuối conversation

- Tin do chính người dùng gửi hoặc do đối phương gửi tới được thêm vào cuối.
- Vùng chat tự cuộn vừa đủ để thấy trọn tin mới nhất.
- Composer tiếp tục nằm đúng vị trí và không bị che.

### Người dùng đang đọc lịch sử cũ

- Tin mới vẫn được thêm đúng thứ tự nhưng màn hình không tự kéo xuống cuối.
- Cột liên hệ hiển thị dấu hiệu chưa đọc.
- Vùng chat hiển thị nút nổi “Tin nhắn mới”.
- Nhấn nút sẽ cuộn đến cuối và đưa tin mới nhất vào vùng nhìn thấy.
- Nút chỉ biến mất khi người dùng đã đi tới vùng tin mới, không biến mất chỉ vì mốc đã xem được cập nhật.

### Ngày và thời gian

- Khi lịch sử đi qua một ngày khác, hiển thị mốc ngày ở giữa vùng chat.
- Chỉ tin mới nhất của conversation hiển thị thời gian gửi mặc định.
- Tin cũ không hiển thị giờ liên tục để tránh làm giao diện rối.
- Khi người dùng chọn một tin cũ, widget có thể mở phần thông tin phụ của tin đó theo hành vi đã có, nhưng không làm thay đổi thứ tự hoặc vị trí cuộn.

## 8. Trạng thái gửi tin

### Đang gửi

- Tin vừa gửi xuất hiện ngay ở phía người dùng hiện tại với nhãn “Đang gửi…”.
- Nút gửi bị vô hiệu hóa trong lúc cùng lần gửi đang được xử lý.
- Nếu được xác nhận trong giới hạn chờ, nhãn chuyển thành “Đã gửi” hoặc “Đã xem”.

### Gửi thất bại

- Bong bóng lỗi giữ nguyên nội dung, có biểu tượng cảnh báo và nhãn “Gửi thất bại”.
- Không hiển thị nút “Gửi lại” riêng dưới bong bóng.
- Không tự gửi lại sau khi thời gian chờ đã hết.
- Nếu composer đang trống, nội dung thất bại được đưa trở lại composer để người dùng chỉnh sửa hoặc nhấn nút “Gửi” thông thường.
- Nếu composer đã có nội dung mới, không ghi đè nội dung mới. Bong bóng thất bại vẫn có thể được chọn để sao chép.
- Một lần nhấn “Gửi” mới tạo thành một lần gửi mới; bong bóng lỗi cũ không tự chuyển thành thành công.

### Phản hồi lỗi

- Lỗi ngắn hạn hiển thị ở gần composer, không che lịch sử.
- Thông báo giải thích rằng nội dung vẫn được giữ.
- Khi người dùng bắt đầu chỉnh sửa hoặc gửi lại thành công, thông báo lỗi cũ được dọn đi.

## 9. Đã xem và chưa đọc

### Hành động đánh dấu đã xem

Tin mới của conversation đang mở được đánh dấu đã xem khi người dùng:

- Nhấn hoặc chạm vào vùng hội thoại.
- Dùng bàn phím đưa focus vào vùng hội thoại hoặc composer của conversation đó.
- Nhấn vào avatar hoặc toàn bộ mục liên hệ tương ứng ở cột trái.

### Hành động không đánh dấu đã xem

- Chỉ mở widget nhưng chưa chọn hoặc tương tác với conversation.
- Chỉ đưa cửa sổ trình duyệt ra phía trước.
- Đang xem conversation khác.
- Conversation đang hiển thị nhưng widget bị che hoặc chưa nhận focus của người dùng.

### Nhãn trạng thái

- Chỉ tin cuối cùng do người dùng hiện tại gửi hiển thị “Đã xem” hoặc “Đã gửi” mặc định.
- Các tin cũ không lặp lại nhãn trạng thái.
- Khi người dùng chọn một tin cũ do mình gửi, nhãn trạng thái của tin đó được mở bên dưới; chọn lại sẽ thu gọn.
- Badge toàn cục và dấu hiệu chưa đọc của liên hệ phải giảm theo cùng một mốc, không hiển thị số đếm mâu thuẫn.

## 10. Trạng thái hoạt động

- Header và mục liên hệ phải hiển thị cùng một trạng thái cho cùng một người tại cùng thời điểm.
- Khi đối phương đang kết nối, hiển thị “Đang hoạt động” kèm dấu hiệu trực quan.
- Khi đối phương thực sự ngắt kết nối, trạng thái chuyển thành “Không hoạt động”.
- Khi đối phương tải lại trang hoặc kết nối bị gián đoạn rất ngắn, giao diện giữ trạng thái hiện tại trong một khoảng đệm ngắn thay vì chớp sang “Không hoạt động”.
- Trạng thái hoạt động chỉ mang tính gần đúng; không hiển thị thời điểm hoạt động cuối cùng chính xác.

## 11. Đang tải và lỗi tải dữ liệu

### Tải danh sách liên hệ

- Cột trái hiển thị 4–6 skeleton theo hình dạng avatar, tên và dòng xem trước.
- Nếu đã có dữ liệu cũ còn hợp lệ, giữ dữ liệu đó và chỉ hiển thị dấu hiệu đang làm mới nhẹ.
- Nút đóng widget luôn sử dụng được.

### Tải conversation

- Header hiển thị skeleton avatar và hai dòng chữ.
- Vùng nội dung hiển thị một số skeleton bong bóng hai phía.
- Composer chỉ hiện khi đã xác định người dùng còn quyền gửi.

### Không tải được danh sách

- Cột trái hiển thị “Chưa thể tải cuộc trò chuyện” cùng nút “Thử lại”.
- Conversation đã tải trước đó ở cột phải vẫn được giữ nếu còn phù hợp với phiên đăng nhập.

### Không tải được conversation

- Vùng phải hiển thị “Chưa thể tải tin nhắn. Vui lòng thử lại.”
- Có nút “Thử lại”.
- Không thay lỗi này bằng trạng thái conversation rỗng.

## 12. Không còn quyền gửi

- Lịch sử mà người dùng vẫn được phép xem tiếp tục hiển thị.
- Composer được thay bằng một dải trung tính: “Bạn không thể tiếp tục cuộc trò chuyện này”.
- Không hiển thị nguyên nhân nội bộ, trạng thái tài khoản của đối phương hoặc thông tin kiểm duyệt.
- Không hiển thị nút gửi.
- Người dùng vẫn có thể cuộn, xem tin cũ và đóng widget.

## 13. Tiếp tục chat sau đăng nhập

- Khách nhấn “Chat ngay” vẫn được chuyển tới đăng nhập và quay lại đúng trang nội bộ ban đầu.
- Sau đăng nhập thành công, widget chỉ mở nếu thông tin tiếp tục còn hợp lệ và shop vẫn có thể chat.
- Nếu thông tin bị sửa, thiếu, hết hiệu lực hoặc dẫn ra ngoài website, hệ thống bỏ qua an toàn.
- Khi bỏ qua, không tạo conversation, không hiển thị lỗi kỹ thuật và không tự chuyển sang một trang ngoài website.

## 14. Chuyển động

- Skeleton dùng hiệu ứng sáng nhẹ, không nhấp nháy mạnh.
- Tin cũ tải thêm xuất hiện không gây hiệu ứng đẩy giật.
- Nút “Tin nhắn mới” dùng fade và dịch chuyển ngắn trong khoảng 150–200 ms.
- Thay đổi trạng thái gửi dùng chuyển màu nhẹ trong khoảng 120–180 ms.
- Khi thiết bị bật giảm chuyển động, bỏ hiệu ứng trượt hoặc scale; mọi thay đổi vẫn hiểu được bằng nội dung chữ.

## 15. Khả năng tiếp cận

- Vùng hội thoại có thể nhận focus bằng bàn phím và có tên hỗ trợ rõ ràng.
- Spinner hoặc skeleton có mô tả trạng thái tải dành cho công nghệ hỗ trợ nhưng không đọc lặp lại từng phần tử skeleton.
- Lỗi gửi, lỗi tải và trạng thái kết nối được thông báo lịch sự, không ngắt ngang liên tục.
- Nút “Tin nhắn mới”, “Thử lại”, đóng widget và gửi tin có vùng tương tác tối thiểu 44 × 44 px.
- Focus nhìn thấy rõ trên cột liên hệ, composer, tin có thể mở thông tin phụ và mọi nút hành động.
- Mốc ngày, đã xem và trạng thái hoạt động đều có nội dung chữ; màu chỉ là tín hiệu bổ sung.

## 16. Responsive

### Desktop — 1440 × 900

- Giữ bố cục hai cột đầy đủ.
- Cột liên hệ đủ rộng để hiển thị tên và preview.
- Vùng lịch sử có thanh cuộn riêng; composer luôn cố định trong widget.

### Tablet — 768 × 1024

- Hai cột vẫn hiển thị đồng thời.
- Nút tải lại và “Tin nhắn mới” không che nội dung chính.
- Không xuất hiện thanh cuộn ngang.

### Mobile — 360 × 800

- Contact rail thu gọn như Change 1.
- Vùng hội thoại vẫn cuộn độc lập.
- Composer nằm trên bàn phím và vùng an toàn phía dưới.
- Thông báo lỗi dài được xuống dòng, không đẩy nút gửi ra khỏi màn hình.

## 17. Tiêu chí nghiệm thu UI/UX

- Cuộn lên tải được nhiều trang lịch sử mà không nhảy mất vị trí đang đọc.
- Mở hoặc mở lại conversation trong trường hợp bình thường luôn thấy tin mới nhất.
- Tin đến khi người dùng ở cuối tự xuất hiện trong vùng nhìn thấy.
- Tin đến khi người dùng đang đọc tin cũ không kéo màn hình xuống và có nút “Tin nhắn mới”.
- Không có nút “Gửi lại” riêng; nội dung lỗi được khôi phục an toàn vào composer khi có thể.
- Đóng composer tạm đang trống không để lại target rỗng.
- Focus bằng bàn phím vào đúng vùng chat đánh dấu đã xem.
- Trạng thái bị cấm gửi vẫn giữ lịch sử và thay composer bằng thông báo trung tính.
- Skeleton xuất hiện trong lúc tải danh sách và conversation.
- Header và cột liên hệ không hiển thị hai trạng thái hoạt động trái ngược cho cùng một người.
- Mở chat từ shop luôn tái sử dụng conversation đã có, kể cả khi liên hệ chưa nằm trong trang đầu.
- Các hành vi trên hoạt động tại 360 × 800, 768 × 1024 và 1440 × 900.
