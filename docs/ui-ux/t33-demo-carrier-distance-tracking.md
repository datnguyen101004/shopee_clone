# UI/UX Spec — T33: Demo Carrier, phí theo khoảng cách và đồng bộ theo dõi đơn

## 1. Mục tiêu

T33 tạo một hành trình giao hàng mô phỏng hoàn chỉnh cho project demo:

- Người mua thấy phí vận chuyển được ước tính theo khoảng cách giữa địa chỉ lấy hàng và địa chỉ nhận hàng.
- Người bán bàn giao kiện hàng cho một hãng vận chuyển duy nhất mang tên **Demo Carrier**.
- Người trình diễn có thể cho kiện hàng tiến qua từng trạng thái mà không phát sinh giao hàng thật.
- Người mua và người bán cùng nhìn thấy trạng thái theo dõi mới nhất, lịch sử rõ ràng và nhất quán.

Trải nghiệm phải luôn nói rõ đây là mô phỏng. Không dùng câu chữ khiến người dùng tin rằng đã có tài xế thật, đã thu tiền vận chuyển thật hoặc có cam kết giao hàng ngoài đời.

## 2. Phạm vi trải nghiệm

Bao gồm:

- Ước tính khoảng cách và phí vận chuyển trong giỏ hàng/checkout.
- Một Demo Carrier với ba gói dịch vụ: Tiết kiệm, Tiêu chuẩn và Hỏa tốc.
- Hiển thị chi tiết cách hình thành phí khi người dùng muốn xem.
- Tạo và hiển thị mã vận đơn mô phỏng sau khi người bán bàn giao.
- Theo dõi trạng thái trên chi tiết đơn của buyer và seller.
- Cổng quản lý riêng tại `/carrier`, dùng chung tài khoản đăng nhập nhưng chỉ dành cho nhân viên Demo Carrier.
- Tổng quan và danh sách toàn bộ vận đơn Demo Carrier để tìm kiếm, lọc, mở chi tiết và xử lý hành trình giao thành công hoặc thất bại.
- Phản hồi rõ ràng khi trạng thái trùng, sai thứ tự, bị chậm hoặc chưa thể cập nhật.
- Giao diện responsive, dùng được bằng bàn phím và trình đọc màn hình.

Không thuộc phạm vi:

- Đặt tài xế, in nhãn của hãng vận chuyển thật hoặc giao kiện hàng ngoài đời.
- Thanh toán cước cho hãng vận chuyển.
- Bản đồ đường đi thời gian thực hoặc vị trí GPS của tài xế.
- Cho buyer tự thay đổi trạng thái vận chuyển.
- Cho seller trực tiếp chọn tùy ý trạng thái “Đã giao” trong trang quản lý đơn.
- Cho tài khoản không có quyền nhân viên vận chuyển truy cập khu vực `/carrier`.
- Cam kết khoảng cách, thời gian giao hoặc mức phí chính xác như dịch vụ thực tế.

## 3. Nguyên tắc trải nghiệm

- Mọi nơi có thông tin Demo Carrier đều kèm nhãn **Mô phỏng**.
- Phí vận chuyển phải được làm mới khi địa chỉ, gói dịch vụ, sản phẩm hoặc số lượng thay đổi.
- Trong lúc đang tính lại, không được trình bày mức phí cũ như mức phí đã xác nhận.
- Khoảng cách được gọi là **Khoảng cách ước tính**, không gọi là quãng đường chính xác.
- Người dùng luôn biết vì sao chưa thể tính phí và cần làm gì tiếp theo.
- Một kiện hàng chỉ có một trạng thái hiện tại; lịch sử không lặp lại cùng một cập nhật.
- Seller thực hiện hành động “Bàn giao”, còn trạng thái sau bàn giao thuộc hành trình của Demo Carrier.
- Trạng thái quan trọng phải có nhãn chữ và biểu tượng, không chỉ phân biệt bằng màu.
- Trạng thái cuối như “Đã giao” hoặc “Đã hoàn hàng” phải nổi bật nhưng không dùng hiệu ứng gây hiểu nhầm đây là giao dịch thật.
- Thay đổi đang chờ xác nhận không được làm timeline nhảy lùi hoặc hiển thị thành công trước khi có kết quả.

## 4. Ngôn ngữ và nhận diện Demo Carrier

Tên hiển thị thống nhất: **Demo Carrier**.

Nhãn phụ thống nhất: **Vận chuyển mô phỏng — không phát sinh giao hàng thật**.

Nhận diện sử dụng:

- Màu cam thương hiệu cho hành động chính và trạng thái đang thực hiện.
- Màu xanh lá cho trạng thái hoàn tất thành công.
- Màu vàng hổ phách cho trạng thái cần chú ý hoặc giao chưa thành công.
- Màu đỏ chỉ dành cho lỗi không thể tiếp tục hoặc hành trình đã bị hủy.
- Nền tím/xám nhạt cho nhãn “Mô phỏng” để phân biệt với cảnh báo nguy hiểm.
- Biểu tượng xe giao hàng kèm chữ “Demo”, không sử dụng logo của hãng vận chuyển thật.

## 5. Trải nghiệm tại giỏ hàng và checkout

### 5.1. Thẻ phương thức vận chuyển của từng shop

Mỗi shop có một khu vực “Phương thức vận chuyển” nằm sau danh sách sản phẩm và trước tổng tiền của shop.

Phần đầu thẻ gồm:

- Tên **Demo Carrier** và nhãn “Mô phỏng”.
- Gói dịch vụ đang chọn.
- Khoảng cách ước tính.
- Khoảng thời gian dự kiến nhận hàng.
- Phí vận chuyển của shop.
- Nút hoặc liên kết “Xem cách tính”.

Ví dụ hiển thị:

> Demo Carrier · Tiêu chuẩn
> Khoảng cách ước tính 10 km · Nhận sau 2–4 ngày
> 36.000₫ · Xem cách tính

Nếu đơn có nhiều shop, mỗi shop được tính và hiển thị riêng. Phần tổng kết đơn cộng các mức phí đã xác nhận của từng shop.

### 5.2. Chọn gói dịch vụ

Người dùng có thể chọn một trong ba gói:

| Gói | Mô tả ngắn | Cách nhấn mạnh |
| --- | --- | --- |
| Tiết kiệm | Phí thấp hơn, thời gian dự kiến dài hơn | Trung tính |
| Tiêu chuẩn | Cân bằng giữa phí và thời gian | Gắn nhãn “Phổ biến” |
| Hỏa tốc | Thời gian dự kiến ngắn hơn, phí cao hơn | Nhấn nhẹ bằng biểu tượng tia chớp |

Toàn bộ hàng của gói dịch vụ đều có thể nhấn. Gói đang chọn có viền cam, nền cam rất nhạt và dấu chọn rõ ràng.

Khi đổi gói:

- Phí của đúng shop đó chuyển sang trạng thái đang tính lại.
- Tổng phí toàn đơn tạm hiển thị “Đang cập nhật”.
- Nút đặt hàng tạm khóa cho đến khi mọi shop có mức phí mới hợp lệ.
- Lựa chọn cũ vẫn được nhìn thấy nhưng không còn được xem là mức phí đã xác nhận.

### 5.3. Chi tiết cách tính phí

Nhấn “Xem cách tính” mở vùng chi tiết ngay dưới thẻ trên desktop và một bảng trượt từ dưới lên trên mobile.

Nội dung gồm:

- Phí mở đơn.
- Khoảng cách ước tính và phần phí theo khoảng cách.
- Khối lượng kiện hàng và phụ phí khối lượng nếu có.
- Tổng phí vận chuyển.
- Chú thích: “Khoảng cách được ước tính từ khu vực lấy và nhận hàng; không phải quãng đường GPS thực tế.”

Không hiển thị công thức kỹ thuật dài. Sử dụng cách diễn đạt dễ đọc, ví dụ:

> 15.000₫ phí mở đơn + 18.000₫ theo khoảng cách + 3.000₫ theo khối lượng = 36.000₫.

Nếu đơn không có phụ phí khối lượng, dòng đó vẫn có thể hiển thị “0₫” để tổng phí dễ đối chiếu.

### 5.4. Khi thay đổi địa chỉ nhận hàng

Sau khi chọn địa chỉ khác:

- Tất cả thẻ Demo Carrier chuyển sang skeleton ngắn.
- Hiển thị dòng “Đang ước tính lại khoảng cách và phí vận chuyển…”.
- Không giữ mức phí cũ ở phần tổng thanh toán.
- Khi hoàn tất, số mới thay thế bằng chuyển động fade nhẹ và có thông báo cho trình đọc màn hình.
- Gói dịch vụ đang chọn được giữ nếu vẫn khả dụng.

### 5.5. Địa chỉ chưa đủ thông tin

Nếu chưa có địa chỉ nhận hàng, thẻ hiển thị:

> Thêm địa chỉ nhận hàng để xem khoảng cách và phí vận chuyển.

Kèm nút “Thêm địa chỉ”. Không hiển thị một mức phí tạm đoán và không cho đặt hàng.

Nếu địa chỉ shop hoặc địa chỉ nhận chưa thể dùng để ước tính khoảng cách:

> Chưa thể ước tính phí cho địa chỉ này. Vui lòng kiểm tra lại tỉnh/thành, quận/huyện và phường/xã.

Buyer có nút “Đổi địa chỉ”. Nếu vấn đề thuộc địa chỉ lấy hàng của shop, hiển thị “Shop chưa hoàn tất địa chỉ lấy hàng” và không yêu cầu buyer sửa dữ liệu của shop.

### 5.6. Loading, lỗi và thử lại

- Loading dùng skeleton đúng chiều cao của dòng khoảng cách, ETA và phí để bố cục không nhảy.
- Lỗi của một shop chỉ thay thẻ của shop đó, không xóa phí đã xác nhận của các shop khác.
- Thông báo lỗi: “Chưa thể tính phí vận chuyển cho shop này.”
- Có nút “Thử lại”.
- Nếu thử lại vẫn thất bại, giữ sản phẩm trong checkout và hướng dẫn người dùng quay lại sau; không tự bỏ sản phẩm.

## 6. Xác nhận đặt hàng và trang đặt hàng thành công

Trước khi người dùng xác nhận đặt hàng, phần tổng kết hiển thị với từng shop:

- Demo Carrier và gói dịch vụ.
- Khoảng cách ước tính.
- Phí vận chuyển.
- Thời gian nhận dự kiến.

Sau khi đặt hàng thành công:

- Hiển thị badge “Vận chuyển mô phỏng”.
- Trạng thái ban đầu là “Shop đang chuẩn bị hàng”.
- Chưa hiển thị mã vận đơn nếu seller chưa bàn giao.
- Hiển thị câu “Mã vận đơn Demo Carrier sẽ xuất hiện sau khi shop bàn giao kiện hàng.”
- Nút “Xem chi tiết đơn hàng” đưa buyer đến đúng đơn.

Nếu mức phí thay đổi trước lúc xác nhận, không hoàn tất âm thầm. Giao diện giữ người dùng tại checkout, làm nổi phần phí vừa thay đổi và yêu cầu xem lại tổng tiền trước khi tiếp tục.

## 7. Seller Center — bàn giao cho Demo Carrier

### 7.1. Trước khi bàn giao

Trong chi tiết đơn seller, thẻ “Vận chuyển” hiển thị:

- Demo Carrier · Mô phỏng.
- Gói dịch vụ buyer đã chọn.
- Khoảng cách ước tính và phí đã xác nhận khi đặt hàng.
- Địa chỉ lấy hàng và địa chỉ giao hàng ở mức phù hợp với việc xử lý đơn.
- Trạng thái chuẩn bị hiện tại.

Khi đơn đã sẵn sàng, seller thấy nút chính “Bàn giao cho Demo Carrier”.

Nhấn nút mở hộp thoại xác nhận:

- Tiêu đề: “Bàn giao kiện hàng mô phỏng?”
- Nội dung: “Hành động này tạo mã vận đơn Demo Carrier và bắt đầu hành trình theo dõi. Không có tài xế thật đến nhận hàng.”
- Tóm tắt số kiện, khối lượng và địa chỉ lấy hàng.
- Hai nút “Quay lại” và “Xác nhận bàn giao”.

Nút xác nhận chỉ hoạt động khi đơn đang ở đúng bước sẵn sàng bàn giao.

### 7.2. Sau khi bàn giao

Hộp thoại đóng và thẻ vận chuyển cập nhật tại chỗ:

- Mã vận đơn có nút sao chép.
- Trạng thái “Đã bàn giao cho Demo Carrier”.
- Thời điểm cập nhật gần nhất.
- Nút “Xem hành trình”.
- Nút phụ “Mở cổng Demo Carrier” chỉ xuất hiện khi tài khoản hiện tại đồng thời có quyền nhân viên vận chuyển. Seller thông thường không nhìn thấy nút này.

Nút bàn giao biến mất sau khi thành công. Nhấn lặp hoặc tải lại trang không tạo thêm mã vận đơn.

### 7.3. Lỗi bàn giao

- Hộp thoại giữ nguyên và hiển thị lỗi gần nút xác nhận.
- Không hiển thị mã vận đơn giả khi kết quả chưa được xác nhận.
- Seller có thể “Thử lại” mà không phải đóng hộp thoại.
- Nếu trạng thái đơn đã thay đổi ở nơi khác, hộp thoại đóng, trang làm mới thông tin và giải thích “Đơn hàng vừa được cập nhật. Vui lòng kiểm tra trạng thái mới.”

## 8. Cổng quản lý Demo Carrier tại `/carrier`

### 8.1. Truy cập và phân quyền

Cổng Demo Carrier nằm trong cùng website và dùng cùng màn hình đăng nhập với buyer, seller và admin, nhưng có layout và quyền truy cập riêng.

- Người chưa đăng nhập khi mở `/carrier` được đưa tới màn hình đăng nhập; sau khi thành công quay lại đúng trang carrier trước đó.
- Tài khoản có quyền nhân viên vận chuyển được mở cổng quản lý.
- Tài khoản buyer, seller hoặc admin nhưng không có quyền nhân viên vận chuyển thấy trang “Bạn không có quyền truy cập cổng vận chuyển”, kèm nút “Về trang chủ”.
- Một tài khoản có nhiều quyền vẫn chỉ vào cổng carrier khi chủ động mở `/carrier`; đăng nhập không tự động đổi khu vực đang sử dụng.
- Menu tài khoản có mục “Cổng vận chuyển” khi người dùng có quyền phù hợp.

Phần đầu mọi trang carrier luôn có banner:

> Môi trường mô phỏng
> Các thao tác tại đây chỉ thay đổi dữ liệu demo và không tạo giao hàng thật.

### 8.2. Layout riêng của cổng vận chuyển

Cổng carrier không dùng header mua sắm hoặc sidebar Seller Center. Layout gồm:

- Logo và tên **Demo Carrier** ở góc trên trái.
- Thanh điều hướng với “Tổng quan” và “Vận đơn”.
- Khu vực tài khoản ở góc phải, có tên người dùng, “Chuyển sang mua sắm” và “Đăng xuất”.
- Sidebar cố định trên desktop, thu gọn thành menu mở/đóng trên tablet và mobile.
- Nội dung chính có chiều rộng thoáng, ưu tiên trạng thái vận đơn và thao tác xử lý.

Mục đang mở có nền cam nhạt, viền trái màu cam và nhãn chữ rõ ràng.

### 8.3. Trang tổng quan

Mở `/carrier` hiển thị tổng quan công việc trong ngày với các thẻ:

- Chờ tiếp nhận.
- Đang vận chuyển.
- Đang giao hàng.
- Giao không thành công.
- Hoàn tất hôm nay.

Nhấn vào một thẻ đưa tới danh sách vận đơn với bộ lọc tương ứng. Bên dưới là “Vận đơn cần xử lý”, ưu tiên đăng ký lỗi, giao không thành công và kiện đang hoàn hàng. Nếu không có việc cần chú ý, hiển thị “Không có vận đơn cần xử lý lúc này”.

### 8.4. Danh sách vận đơn

Danh sách có:

- Ô tìm kiếm theo mã vận đơn hoặc mã đơn hàng.
- Các tab “Tất cả”, “Chờ tiếp nhận”, “Đang vận chuyển”, “Đang giao”, “Giao thất bại”, “Đang hoàn” và “Hoàn tất”.
- Bộ lọc gói dịch vụ và khoảng ngày cập nhật.
- Mỗi hàng gồm mã vận đơn, shop, khu vực nhận–giao, gói dịch vụ, trạng thái hiện tại và lần cập nhật gần nhất.
- Badge “Mô phỏng” trên mọi vận đơn.
- Nút “Mở” để vào chi tiết.

Danh sách mặc định sắp xếp theo hoạt động mới nhất. Bộ lọc và từ khóa được giữ trên địa chỉ trang để tải lại hoặc quay lại từ chi tiết không làm mất ngữ cảnh. Trên mobile, mỗi vận đơn là một card và toàn bộ card có thể mở chi tiết.

Không cần hiển thị toàn bộ tên, số điện thoại và địa chỉ chi tiết trong danh sách.

Empty state:

> Chưa có vận đơn mô phỏng. Hãy bàn giao một đơn đã sẵn sàng từ Seller Center.

### 8.5. Chi tiết vận đơn

Phần đầu gồm:

- Mã vận đơn và nút sao chép.
- Mã đơn hàng liên quan.
- Trạng thái hiện tại.
- Demo Carrier và gói dịch vụ.
- Khoảng cách ước tính, khối lượng và phí vận chuyển.

Phần giữa hiển thị timeline từ cũ đến mới. Bước hiện tại nổi bật; bước tương lai hiển thị mờ; trạng thái lỗi dùng biểu tượng cảnh báo kèm chữ.

Phần điều khiển đặt bên phải trên desktop và phía dưới timeline trên mobile.

Đầu trang có breadcrumb “Vận đơn / [Mã vận đơn]” và nút quay lại danh sách, giữ nguyên bộ lọc trước đó. Nhân viên chỉ thấy thông tin cần cho mô phỏng: khu vực lấy/giao, shop, khoảng cách, khối lượng và dịch vụ; không hiển thị số điện thoại hoặc thông tin riêng tư không cần thiết.

### 8.6. Mô phỏng hành trình thành công

Nút chính “Chuyển sang bước tiếp theo” chỉ đưa kiện hàng tiến đúng một bước:

1. Đã tạo vận đơn.
2. Đã nhận kiện hàng.
3. Đang vận chuyển.
4. Đang giao hàng.
5. Đã giao.

Trước khi chuyển bước, giao diện cho xem trạng thái sắp tới. Với bước cuối “Đã giao”, mở xác nhận ngắn để tránh nhấn nhầm.

Sau khi thành công:

- Timeline thêm sự kiện mới và tự cuộn đến cuối.
- Trạng thái đầu trang đổi cùng lúc.
- Hiển thị toast “Đã cập nhật hành trình mô phỏng”.
- Nút tiếp theo đổi sang bước kế tiếp hoặc biến mất khi hành trình kết thúc.

### 8.7. Mô phỏng giao không thành công

Tại trạng thái “Đang giao hàng”, có hành động phụ “Mô phỏng giao không thành công”. Hộp thoại yêu cầu chọn một lý do dễ hiểu:

- Không liên hệ được người nhận.
- Người nhận hẹn giao lại.
- Địa chỉ chưa rõ.
- Người nhận từ chối nhận hàng.
- Lý do mô phỏng khác.

Sau khi xác nhận, trạng thái chuyển sang “Giao không thành công”. Tùy lý do, màn hình cho phép:

- “Thử giao lại” để quay về bước đang giao hàng; hoặc
- “Bắt đầu hoàn hàng” để tiếp tục qua “Đang hoàn hàng” và “Đã hoàn hàng”.

Không cho chuyển thẳng từ một bước đầu sang “Đã giao” hoặc “Đã hoàn hàng”.

### 8.8. Chạy nhanh cho buổi demo

Có hành động phụ “Chạy nhanh hành trình thành công”. Khi chọn, hộp thoại giải thích các trạng thái sẽ lần lượt được mô phỏng và cho phép bắt đầu hoặc hủy.

Trong lúc chạy:

- Hiển thị bước hiện tại và bước kế tiếp.
- Có nút “Tạm dừng”.
- Timeline cập nhật từng bước, không nhảy thẳng tới “Đã giao”.
- Đóng trang không được hiển thị giả rằng hành trình vẫn đang chạy nếu chưa có cập nhật mới.

Hành động này chỉ phục vụ trình diễn; không đặt ở vị trí nổi bật hơn nút chuyển từng bước.

### 8.9. Cập nhật trùng hoặc sai thứ tự

- Nếu cùng một cập nhật được gửi lại, không thêm dòng timeline thứ hai. Hiển thị “Cập nhật này đã được ghi nhận trước đó.”
- Nếu cố chuyển lùi về trạng thái không hợp lệ, giữ nguyên timeline và hiển thị “Không thể quay lại bước này. Hãy tiếp tục từ trạng thái hiện tại.”
- Nếu cùng lúc có nơi khác vừa cập nhật, làm mới chi tiết và đưa focus tới trạng thái mới nhất.

## 9. Buyer — theo dõi đơn hàng

### 9.1. Thẻ theo dõi trong chi tiết đơn

Thẻ “Theo dõi vận chuyển” hiển thị:

- Demo Carrier · Mô phỏng.
- Mã vận đơn và nút sao chép.
- Trạng thái mới nhất.
- Thời điểm cập nhật gần nhất.
- Khoảng thời gian nhận dự kiến.
- Timeline trạng thái.

Nếu seller chưa bàn giao, thay mã vận đơn bằng thông điệp “Shop đang chuẩn bị kiện hàng”.

Buyer không nhìn thấy nút điều khiển trạng thái hoặc liên kết tới bảng điều khiển Demo Carrier.

### 9.2. Timeline buyer

Timeline dùng câu chữ hướng tới người mua:

| Trạng thái | Nội dung hiển thị |
| --- | --- |
| Đã tạo vận đơn | Shop đã tạo vận đơn mô phỏng |
| Đã nhận kiện hàng | Demo Carrier đã nhận kiện hàng |
| Đang vận chuyển | Kiện hàng đang được vận chuyển |
| Đang giao hàng | Kiện hàng đang được giao đến bạn |
| Đã giao | Kiện hàng đã được giao |
| Giao không thành công | Lần giao này chưa thành công |
| Đang hoàn hàng | Kiện hàng đang được hoàn về shop |
| Đã hoàn hàng | Kiện hàng đã được hoàn về shop |

Mỗi sự kiện có ngày giờ. Chỉ sự kiện mới nhất được mở chi tiết mặc định; sự kiện cũ có thể rút gọn nhưng vẫn đọc được.

### 9.3. Trạng thái mới đến khi đang mở trang

Khi có trạng thái mới:

- Timeline thêm sự kiện mới mà không làm mất vị trí đọc hiện tại.
- Nếu người dùng đang ở gần cuối timeline, tự cuộn nhẹ đến sự kiện mới.
- Nếu đang xem sự kiện cũ, hiển thị nút nổi nhỏ “Có cập nhật mới” để người dùng chủ động nhảy xuống.
- Trạng thái đầu thẻ và lần cập nhật gần nhất đổi đồng thời.

### 9.4. Lỗi tải theo dõi

Giữ lại thông tin đơn hàng khác và chỉ thay thẻ theo dõi bằng:

> Chưa thể tải hành trình vận chuyển. Thông tin đơn hàng của bạn vẫn an toàn.

Kèm nút “Thử lại”. Không thay lỗi theo dõi bằng trạng thái “Đã giao” hoặc một timeline rỗng khó hiểu.

## 10. Seller — theo dõi sau bàn giao

Seller thấy cùng trạng thái và timeline với buyer nhưng nội dung có thêm ngữ cảnh vận hành:

- Khu vực lấy và giao hàng.
- Khối lượng kiện.
- Gói dịch vụ.
- Lần cập nhật gần nhất.
- Cảnh báo giao không thành công hoặc hoàn hàng.

Seller không được chỉnh trực tiếp timeline từ chi tiết đơn. Liên kết “Mở cổng Demo Carrier” chỉ xuất hiện nếu tài khoản hiện tại đồng thời có quyền nhân viên vận chuyển và đưa tới đúng vận đơn trong `/carrier`.

Khi trạng thái “Đã giao”, phần tiến trình đơn hoàn tất và các hành động chuẩn bị/bàn giao không còn xuất hiện. Khi “Giao không thành công” hoặc “Đang hoàn hàng”, thẻ dùng cảnh báo màu hổ phách và hướng dẫn seller theo dõi bước tiếp theo, không tự kết luận đơn đã hủy.

## 11. Các trạng thái giao diện chung

### Loading

- Skeleton giữ nguyên kích thước thẻ và timeline.
- Không quay spinner toàn trang nếu chỉ phần vận chuyển đang tải.
- Nút hành động đang xử lý có nhãn động từ rõ ràng như “Đang bàn giao…” hoặc “Đang cập nhật…”.

### Empty

- Checkout: hướng dẫn thêm/đổi địa chỉ.
- Seller: hướng dẫn hoàn tất chuẩn bị trước khi bàn giao.
- Demo Carrier: hướng dẫn tạo vận đơn từ Seller Center.
- Buyer: giải thích shop chưa bàn giao, không hiển thị timeline rỗng.

### Success

- Cập nhật trực tiếp vùng liên quan và dùng toast ngắn.
- Không dùng modal chúc mừng cho mỗi bước tracking.
- Sao chép mã vận đơn hiển thị “Đã sao chép mã vận đơn”.

### Error

- Giữ dữ liệu vừa được xác nhận gần nhất.
- Không tự đoán trạng thái tiếp theo.
- Luôn có hành động “Thử lại” khi lỗi có thể phục hồi.
- Nội dung lỗi tránh thuật ngữ kỹ thuật và không để lộ thông tin nội bộ.

### Mất kết nối tạm thời

Hiển thị banner nhỏ trong thẻ:

> Kết nối tạm thời gián đoạn. Trạng thái sẽ được làm mới khi kết nối trở lại.

Không xóa timeline hiện có. Khi kết nối lại, làm mới trạng thái và thông báo nếu có cập nhật mới.

## 12. Responsive

### Desktop từ 1024 px

- Checkout giữ danh sách shop bên trái và tổng thanh toán bên phải.
- Chi tiết Demo Carrier dùng timeline bên trái, điều khiển bên phải.
- Cổng `/carrier` dùng sidebar riêng; trang tổng quan hiển thị thẻ chỉ số theo hàng và danh sách vận đơn dạng bảng.
- Chi tiết đơn dùng thẻ vận chuyển toàn chiều rộng trong cột nội dung chính.

### Tablet 768–1023 px

- Tổng thanh toán nằm sau danh sách shop.
- Điều khiển Demo Carrier chuyển xuống dưới phần tóm tắt nhưng vẫn trước timeline dài.
- Sidebar carrier thu gọn; bảng vận đơn chuyển thành card nếu không đủ chiều rộng.

### Mobile dưới 768 px

- Gói dịch vụ hiển thị thành danh sách dọc.
- “Xem cách tính” mở bottom sheet có nút đóng rõ ràng.
- Timeline dùng một cột, không đặt chữ quá sát đường nối trạng thái.
- Nút hành động chính có chiều rộng đầy đủ và nằm trong luồng nội dung; không che timeline bằng thanh cố định quá cao.
- Mã vận đơn được rút gọn thị giác nhưng thao tác sao chép luôn lấy toàn bộ mã.
- Điều hướng carrier dùng menu mở/đóng; thẻ tổng quan xếp hai cột hoặc một cột tùy chiều rộng.

## 13. Accessibility

- Mọi biểu tượng có nhãn đọc được; không dùng riêng biểu tượng xe, cảnh báo hoặc dấu chọn.
- Gói dịch vụ dùng nhóm lựa chọn có tên “Chọn phương thức vận chuyển”.
- Khi phí hoặc trạng thái thay đổi, thông báo ngắn qua vùng cập nhật lịch sự; không đọc lại toàn bộ trang.
- Focus trở về nút đã mở sau khi đóng dialog hoặc bottom sheet.
- Dialog giữ focus bên trong và đóng được bằng Escape, trừ lúc đang xác nhận một thao tác không thể ngắt giữa chừng.
- Timeline có thứ tự đọc từ cũ đến mới và trạng thái hiện tại được diễn đạt bằng chữ.
- Màu chữ, viền, badge và nút đạt độ tương phản; trạng thái lỗi/thành công luôn có thêm nhãn hoặc biểu tượng.
- Vùng nhấn tối thiểu 44 × 44 px trên thiết bị cảm ứng.

## 14. Animation và transition

- Đổi phí: fade 150–200 ms sau khi mức phí mới đã sẵn sàng.
- Mở chi tiết cách tính: expand 180–220 ms trên desktop, slide-up 220–280 ms trên mobile.
- Thêm sự kiện timeline: fade và dịch lên nhẹ 180–220 ms.
- Toast: xuất hiện 180 ms, tự đóng sau khoảng 3–5 giây nhưng vẫn có thể đóng thủ công.
- Làm nổi cập nhật mới trong timeline tối đa 1,5 giây rồi trở về nền bình thường.
- Tôn trọng tùy chọn giảm chuyển động của thiết bị; khi bật, thay chuyển động bằng đổi trạng thái tức thời.

## 15. Tình huống minh họa

Buyer chọn địa chỉ nhận tại Quận 3, shop lấy hàng tại Quận 1. Demo Carrier ước tính khoảng cách tính phí là 6 km. Với gói Tiêu chuẩn, checkout hiển thị:

> Khoảng cách ước tính 6 km · Nhận sau 2–4 ngày · 28.000₫.

Buyer đặt hàng. Seller chuẩn bị xong và chọn “Bàn giao cho Demo Carrier”. Mã vận đơn mô phỏng xuất hiện ở cả chi tiết đơn seller và buyer.

Người trình diễn mở bảng điều khiển Demo Carrier, lần lượt chuyển kiện hàng qua “Đã nhận kiện hàng”, “Đang vận chuyển”, “Đang giao hàng” và “Đã giao”. Mỗi lần cập nhật, timeline của buyer và seller phản ánh đúng bước mới. Toàn bộ hành trình luôn mang nhãn “Mô phỏng — không phát sinh giao hàng thật”.

## 16. Tiêu chí nghiệm thu UI/UX

- Buyer nhận biết rõ Demo Carrier không phải hãng vận chuyển thật.
- Checkout không cho đặt hàng khi phí của bất kỳ shop nào đang tính lại hoặc chưa hợp lệ.
- Thay đổi địa chỉ, sản phẩm, số lượng hoặc gói dịch vụ làm mới đúng phí và khoảng cách.
- Chi tiết cách tính đối chiếu được với tổng phí hiển thị.
- Seller chỉ có thể bàn giao khi đơn đã sẵn sàng và không tạo hai mã vận đơn do nhấn lặp.
- Buyer không có quyền điều khiển trạng thái vận chuyển.
- Seller không thể tự chọn “Đã giao” trực tiếp trong chi tiết đơn.
- `/carrier` dùng chung đăng nhập nhưng chỉ tài khoản có quyền nhân viên vận chuyển mới truy cập được.
- Cổng carrier có layout riêng, trang tổng quan, danh sách có tìm kiếm/lọc và chi tiết vận đơn.
- Demo Carrier chỉ cho tiến qua các bước hợp lệ và phản hồi rõ khi cập nhật trùng hoặc sai thứ tự.
- Buyer và seller thấy cùng trạng thái mới nhất và cùng thứ tự timeline.
- Trạng thái giao thất bại, giao lại, hoàn hàng và hoàn tất đều có nội dung dễ hiểu.
- Loading, empty, error, mất kết nối và retry không làm mất dữ liệu đã xác nhận gần nhất.
- Giao diện dùng được ở mobile, tablet, desktop, bàn phím và trình đọc màn hình.
