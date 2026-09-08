# T35 — Flash Sale theo SKU: đặc tả UI/UX

## Phạm vi và người dùng

Seller đăng ký biến thể sản phẩm, giá Flash Sale và số lượng suất bán vào chiến dịch. Buyer mua tối đa một đơn vị của một biến thể tham gia cho mỗi sản phẩm trong một chiến dịch, chỉ bằng COD. Các biến thể không tham gia vẫn mua theo giá thường. Người mua đã hủy đơn không được nhận lại quyền mua Flash Sale trong cùng chiến dịch.

## Bố cục và phong cách

- Màn Chiến dịch Seller dùng mẫu [Seller Workspace](seller-workspace/UI-SPEC.md) và [các hiệu chỉnh](seller-workspace/CORRECTIONS.md): sidebar/header chung, nền xám nhạt, card trắng, màu chính xanh dương #2563eb, font Be Vietnam Pro, chữ nội dung 14px, tiêu đề 20px/700, label 12px/600. Control cao 40px, bo góc 8px; card bo 12px; khoảng cách 8/12/16/24px.
- Không lặp tiêu đề trang. Toolbar nằm trên nền trang, label ở trên bộ lọc, các control căn đáy. Bảng nối liền footer tải thêm; thao tác ở cột cuối.
- Buyer giữ ngôn ngữ thị giác storefront hiện có, nhấn giá và nhãn Flash Sale bằng màu thương hiệu. Không thay theme toàn ứng dụng.

## Seller — Danh sách và đăng ký

Trong Chiến dịch, Seller chọn chiến dịch Flash Sale để xem thời gian bắt đầu/kết thúc, điều kiện và danh sách sản phẩm tham gia. Danh sách phân nhóm theo sản phẩm, mỗi dòng con là một SKU, có ảnh 48px, tên biến thể, mã SKU, giá thường, giá Flash Sale, số lượng còn có thể phân bổ, quota đã cấp, quota còn lại, trạng thái và thao tác.

Form đăng ký dùng bộ chọn sản phẩm/biến thể có tìm kiếm, tên và ảnh; không yêu cầu nhập mã định danh kỹ thuật. Seller chọn SKU, nhập giá Flash Sale và số lượng nguyên dương. Cho phép quota bằng lượng hàng khả dụng. Hiển thị lỗi ngay dưới trường nếu số lượng không hợp lệ hoặc vượt lượng khả dụng; giữ dữ liệu để sửa. Nút Hủy đứng trước Lưu đăng ký.

Trước khi chương trình bắt đầu, Seller được tăng/giảm quota của SKU đã đăng ký, miễn vẫn thỏa lượng hàng khả dụng. Các quy tắc đăng ký/rút và giá khác tiếp tục theo chiến dịch; quyền sửa quota trước giờ bắt đầu không mở lại việc đăng ký sản phẩm mới sau hạn đăng ký.

## Seller — Điều khiển khi đang chạy

| Trạng thái | Thao tác |
| --- | --- |
| Chưa bắt đầu | Chỉnh quota; đăng ký/rút theo hạn của chiến dịch |
| Đang diễn ra, còn suất | Giá và quota chỉ đọc; không có thao tác tăng/giảm quota |
| Đang diễn ra, hết suất | Hai lựa chọn: Thêm số lượng hoặc Kết thúc tham gia cho SKU này |
| Đã kết thúc | Chỉ đọc lịch sử; không mở lại SKU trong cùng chiến dịch |

“Thêm số lượng” mở popup tại dòng SKU. Hiển thị tên, biến thể, giá sale cố định, lượng hàng có thể bổ sung và ô số lượng thêm. Thành công cập nhật dòng sang đang diễn ra; giá giữ nguyên. Nếu một đơn bị hủy làm quota tăng trước khi Seller lưu, báo trạng thái đã thay đổi và tải lại dòng; không tự cộng thêm số lượng.

“Kết thúc tham gia” mở hộp xác nhận nêu rõ SKU sẽ bán lại theo giá và lượng hàng thường, các đơn đã đặt giữ giá đã chốt, và không thể mở lại trong cùng chiến dịch. Thao tác chỉ dành cho SKU hết suất; không kết thúc các SKU còn lại hoặc toàn bộ chiến dịch của sàn.

Khi chiến dịch hết giờ hoặc bị quản trị viên hủy, SKU trở về cách bán thông thường. Seller không phải kết thúc thủ công từng SKU ở thời điểm này.

## Buyer — Danh sách, trang sản phẩm và giỏ hàng

- Chỉ gắn nhãn Flash Sale ở cấp sản phẩm nếu ít nhất một SKU tham gia đang còn suất và có thể bán. Giá “từ” phải tương ứng một SKU thực sự mua được.
- Chọn SKU còn suất: hiện giá Flash Sale, nhãn COD và thông điệp “Mỗi người chỉ mua 1 sản phẩm trong chiến dịch”; số lượng mua cố định là 1.
- Chọn SKU hết suất nhưng chưa kết thúc tham gia: hiện “Hết hàng”, bỏ nhãn Flash Sale ở SKU, vô hiệu hóa mua. Không chuyển SKU sang giá thường để cho mua; không dùng tồn kho thường làm trạng thái còn hàng. Không giới thiệu giá sale hết hiệu lực như giá có thể mua.
- Nếu SKU khác của cùng sản phẩm còn suất, nhãn ở cấp sản phẩm vẫn giữ; các SKU không đăng ký vẫn hiện giá và tình trạng hàng thường.
- Khi Seller bổ sung quota hoặc có đơn được hủy trả suất, SKU lại có giá và nhãn Flash Sale, được mua với giới hạn cũ. Việc bổ sung không đặt lại quyền mua của Buyer.
- Sau kết thúc SKU/chiến dịch: hiển thị giá và tình trạng tồn kho thường. Nếu giỏ chứa giá cũ, thông báo thay đổi và yêu cầu kiểm tra lại trước khi đặt hàng.
- Không hiển thị số lượng còn lại, thanh tiến độ đã bán, phần trăm bán hoặc số liệu tạo cảm giác khan hiếm. Quy tắc này áp dụng cho Buyer; Seller vẫn cần số liệu quản lý.
- Giỏ hàng không giữ suất. Buyer đã mua hoặc hủy suất của sản phẩm đó vẫn được mua các SKU không tham gia theo quy tắc bình thường.

## Buyer — Checkout COD và voucher

Checkout có ít nhất một dòng Flash Sale chỉ cho chọn COD cho lần đặt hàng đó. Nếu muốn thanh toán online cho hàng thường, Buyer bỏ chọn dòng Flash Sale rồi đặt riêng; không tự chia hoặc đổi phương thức ngầm. Nội dung giải thích ngắn: “Đơn có sản phẩm Flash Sale chỉ hỗ trợ thanh toán khi nhận hàng”.

Voucher được xét trên giá hàng sau Flash Sale và điều kiện của voucher. Hiển thị giá sale, giảm voucher và tổng tiền thành các dòng dễ hiểu. Nút “Đặt hàng” hiện trạng thái đang xử lý, ngăn bấm lặp. Chỉ thành công khi có xác nhận tạo đơn; không hiển thị COD là đã thanh toán.

Nếu hết suất, hết giờ, vượt giới hạn mua, thiếu hàng hoặc giá/voucher thay đổi, giữ giỏ, chỉ rõ dòng liên quan và cung cấp cập nhật báo giá/bỏ chọn. Không tự đặt hàng với giá thường hoặc tự đổi SKU. Người không đăng nhập được xem hàng nhưng phải đăng nhập để đặt.

## Loading, empty, success và error

- Lần tải đầu dùng skeleton theo đúng dòng/card; cập nhật tại chỗ dùng spinner ở nút, giữ bố cục và dữ liệu đang đọc.
- Danh sách chưa đăng ký hiển thị “Chưa có SKU tham gia”; có nút đăng ký nếu còn hạn. Không có deal hoạt động thì ẩn kệ Flash Sale; trang chi tiết vẫn có trạng thái và cách quay lại.
- Thành công dùng thông báo ngắn và cập nhật dòng/card. Không thêm hiệu ứng chúc mừng hoặc số liệu bán giả.
- Lỗi tải có nút Thử lại. Lỗi form nằm tại trường; xung đột trạng thái có thông báo tải lại; không xóa bản nháp vì lỗi mạng.
- Đếm ngược hết giờ thì cập nhật trạng thái, không giữ nút mua giá sale chỉ vì trang chưa tải lại. Khi quay lại tab/trang, làm mới tình trạng SKU.

## Responsive, bàn phím và chuyển động

Desktop dùng bảng nhóm SKU; tablet/mobile dùng thẻ hoặc vùng bảng cuộn cục bộ, không tràn cả trang. Mã, biến thể, giá và thao tác luôn đọc được. Form hai cột chuyển một cột khi hẹp; popup nằm trong viewport và nội dung cuộn được.

Mọi trường có label, trạng thái có chữ, nút có focus-visible và tên truy cập. Popup đưa focus vào tiêu đề/trường phù hợp, giữ focus bên trong, đóng trả focus về nút mở. Lỗi không chỉ biểu đạt bằng màu. Hover/focus không dịch chuyển bố cục. Chuyển cảnh nhẹ 120–180ms; tắt chuyển động không cần thiết theo reduced-motion. Không đọc lại countdown mỗi giây cho trình đọc màn hình.

## Tình huống nghiệm thu trải nghiệm

1. Đăng ký hai SKU cùng sản phẩm, Buyer mua một SKU rồi không mua thêm SKU sale còn lại; vẫn mua SKU thường.
2. Quota hết: hết hàng, bỏ nhãn đúng cấp, không lộ lượng tồn kho thường hoặc nút mua thường.
3. Seller thêm quota lúc hết suất: giá/nhãn sale trở lại, người đã mua/hủy vẫn không được mua lại.
4. Seller kết thúc SKU: trở về giá thường; SKU khác cùng sản phẩm không bị kết thúc theo.
5. Hủy đơn trước khi kết thúc: trả suất và có thể đưa SKU hết suất trở lại; sau kết thúc: chỉ trả hàng thường.
6. Giỏ hỗn hợp chỉ đặt bằng COD; voucher đúng điều kiện giá sau sale; hết giờ trước khi đặt phải xem lại báo giá.

## Trải nghiệm theo ba phase traffic

| Phase | Hành vi người mua |
| --- | --- |
| Trước giờ Flash Sale | Hiển thị countdown theo giờ server và tự kiểm tra trạng thái mỗi khoảng 10–15 giây khi trang đang mở. Đến giờ mở, tải trạng thái mới để bật cách mua tương ứng; người mua không cần bấm refresh liên tục. |
| Đang bán cao điểm | Tự kiểm tra mỗi khoảng 3–5 giây khi trang đang hiển thị. Khi đặt đơn, khóa nút trong lúc xử lý. Nếu hệ thống bận, giữ giỏ và dữ liệu, báo “Có nhiều người đang đặt hàng. Vui lòng thử lại sau ít giây”, cho thử lại sau thời gian được hướng dẫn. |
| Hết suất nhưng chưa kết thúc | Giữ “Hết hàng”, bỏ nhãn sale đúng cấp; tiếp tục tự kiểm tra mỗi khoảng 3–5 giây. Khi có suất bổ sung/hoàn lại, giá và nhãn sale xuất hiện trở lại; không tự đặt đơn. |

Nhịp kiểm tra lệch ngẫu nhiên giữa người dùng để không cùng gửi một thời điểm. Dừng kiểm tra khi tab ẩn, tải mới khi quay lại và dừng theo dõi sale khi SKU/chiến dịch kết thúc. Cập nhật tại chỗ không làm mất lựa chọn SKU, giỏ hay dữ liệu đang nhập. Lỗi tải dùng nhịp thử lại thưa hơn, không chớp thông báo mỗi lần kiểm tra.

Seller thấy kết quả thao tác đã thành công ngay trong màn quản lý. Trang Buyer đang hiển thị và mạng tốt có mục tiêu cập nhật trong 8 giây sau bổ sung/hoàn suất/kết thúc; không hiển thị số quota còn. Countdown hoặc trạng thái còn hàng không bảo đảm giữ được suất; chỉ xác nhận đặt đơn thành công mới có đơn hàng.

Nghiệm thu bổ sung: kiểm tra countdown không phát request mỗi giây; tab ẩn không tiếp tục polling; hết suất rồi được bổ sung/hoàn lại tự cập nhật; quá tải giữ nguyên giỏ và cho thử lại có kiểm soát; kết thúc dừng polling và trở về bán thường.

## Waiting room trước checkout

Chỉ giỏ có sản phẩm Flash Sale, gồm giỏ hỗn hợp, phải vào phòng chờ khi bật bảo vệ. Giỏ toàn hàng thường thanh toán như cũ; xem sản phẩm vẫn bình thường.

- Đang chờ: “Bạn đang chờ lượt vào thanh toán.” Khi hết lượt truy cập khả dụng, tiếp tục ở phòng chờ; không gọi tải báo giá hoặc tự đặt đơn. Giữ giỏ, refresh không tạo thêm lượt. Có thể rời hàng khi chưa được cấp lượt. Không hứa thứ tự trước/sau hoặc vị trí chờ chính xác.
- Đến lượt: cho tiếp tục checkout và hiển thị thời gian truy cập còn lại trong 5 phút kể từ khi cấp. Giải thích “Đến lượt thanh toán không có nghĩa sản phẩm đã được giữ”. Không tự bấm Đặt hàng.
- Xem báo giá, đặt đơn lỗi hoặc đóng trang không trả lượt sớm. Lượt kết thúc khi đặt đơn thành công hoặc hết 5 phút, không tự gia hạn.
- Xác nhận đang quá tải: giữ giỏ và thời hạn truy cập, báo “Hệ thống đang xử lý nhiều đơn. Vui lòng thử lại sau.” Cho chủ động thử lại khi được hướng dẫn; không bắt xếp lại khi lượt còn hạn.
- Hết thời gian: giữ dữ liệu và cho xin lượt mới. Nếu đơn trước chưa rõ kết quả, tra kết quả trước khi tiếp tục để tránh mua trùng.
- Hết hàng rồi Seller bổ sung: cập nhật trạng thái sản phẩm, không reset lượt chờ hoặc thời gian truy cập, không tự đặt đơn.
- Chiến dịch kết thúc: yêu cầu xem lại giá thường; không tự đổi giá rồi đặt đơn.

Tự kiểm tra trạng thái khoảng 5–10 giây theo hướng dẫn, có độ lệch giữa người dùng. Dừng khi tab ẩn, làm mới khi quay lại. Không hiển thị token hoặc yêu cầu sao chép tay. Giữ focus và thông báo trạng thái dễ đọc, không đọc lại mỗi lần kiểm tra.
