## Purpose

Cung cấp bộ chọn địa chỉ ba cấp theo đơn vị hành chính Việt Nam cũ, giúp người mua chọn đúng tỉnh/thành, quận/huyện và phường/xã trong một luồng phụ thuộc, có thể tìm kiếm và tương thích với dữ liệu đã lưu.

## ADDED Requirements

### Requirement: Snapshot địa chỉ cũ có đủ quan hệ ba cấp

Hệ thống SHALL cung cấp snapshot có nguồn và ngày chốt dữ liệu, trong đó mỗi phường/xã có mã định danh, tên hiển thị và thuộc đúng một quận/huyện trong cấu trúc tỉnh/thành → quận/huyện → phường/xã.

#### Scenario: Tải danh sách phường/xã của quận/huyện

- **WHEN** người dùng đã chọn một tỉnh/thành và một quận/huyện hợp lệ trong snapshot
- **THEN** hệ thống cung cấp toàn bộ phường/xã thuộc quận/huyện đó và không trộn phường/xã của quận/huyện khác

#### Scenario: Huyện không tổ chức cấp xã

- **WHEN** người dùng chọn một trong các huyện được snapshot xác định không tổ chức đơn vị hành chính cấp xã
- **THEN** hệ thống hiển thị và tự chọn sentinel `Không có đơn vị hành chính cấp xã` thay vì tạo một phường/xã giả

#### Scenario: Kiểm tra tính toàn vẹn snapshot

- **WHEN** bộ kiểm tra dữ liệu snapshot được chạy
- **THEN** mọi mã đơn vị đều hợp lệ theo cấp, không bị trùng trong phạm vi định danh và mọi quan hệ cha-con đều tham chiếu tới đơn vị tồn tại

### Requirement: Người dùng chọn phường/xã bằng popup phụ thuộc

Hệ thống SHALL hiển thị trường Phường/Xã dưới dạng popup chọn lựa và SHALL chỉ cho phép mở lựa chọn khi đã nhận diện được quận/huyện cha.

#### Scenario: Chọn phường/xã hợp lệ

- **WHEN** người dùng mở popup Phường/Xã sau khi chọn quận/huyện và chọn một mục trong danh sách
- **THEN** popup đóng, tên phường/xã được hiển thị trong trường và tên đó được đưa vào payload lưu địa chỉ

#### Scenario: Chưa chọn quận/huyện

- **WHEN** chưa có quận/huyện hợp lệ
- **THEN** trường Phường/Xã bị vô hiệu hóa và hướng dẫn người dùng chọn quận/huyện trước

#### Scenario: Không có kết quả tìm kiếm

- **WHEN** truy vấn không khớp phường/xã nào trong quận/huyện đang chọn
- **THEN** popup hiển thị trạng thái không tìm thấy thay vì hiển thị danh sách trống không có giải thích

### Requirement: Tìm kiếm đơn vị hành chính không phụ thuộc dấu và chữ hoa thường

Hệ thống SHALL so khớp tên tỉnh/thành, quận/huyện và phường/xã mà không phân biệt dấu tiếng Việt, chữ hoa/chữ thường và khoảng trắng thừa.

#### Scenario: Tìm phường/xã bằng tên không dấu

- **WHEN** người dùng nhập tên phường/xã không dấu với kiểu chữ bất kỳ
- **THEN** kết quả vẫn bao gồm phường/xã có tên tiếng Việt tương ứng trong quận/huyện đang chọn

### Requirement: Lựa chọn cấp con luôn nhất quán với cấp cha

Hệ thống SHALL xóa các lựa chọn cấp con khi người dùng chủ động thay đổi cấp cha khiến chúng không còn thuộc nhánh địa chỉ đang chọn.

#### Scenario: Đổi tỉnh/thành

- **WHEN** người dùng chọn tỉnh/thành khác với tỉnh/thành hiện tại
- **THEN** hệ thống xóa cả quận/huyện và phường/xã đã chọn

#### Scenario: Đổi quận/huyện

- **WHEN** người dùng chọn quận/huyện khác với quận/huyện hiện tại
- **THEN** hệ thống giữ tỉnh/thành và xóa phường/xã đã chọn

#### Scenario: Chọn lại cùng cấp cha

- **WHEN** người dùng chọn lại đúng tỉnh/thành hoặc quận/huyện hiện tại
- **THEN** hệ thống không xóa lựa chọn cấp con đang hợp lệ

### Requirement: Dữ liệu địa chỉ đã lưu được bảo toàn khi chỉnh sửa

Hệ thống MUST nhận diện tên đơn vị đã lưu bằng phép so khớp chuẩn hóa, bao gồm giá trị không dấu hoặc viết tắt được hỗ trợ, và MUST không tự ý xóa giá trị chưa nhận diện nếu người dùng chưa chủ động thay đổi trường đó hoặc cấp cha của nó.

#### Scenario: Mở địa chỉ có phường/xã không dấu

- **WHEN** địa chỉ đã lưu chứa tỉnh/thành, quận/huyện và phường/xã có thể nhận diện sau khi chuẩn hóa
- **THEN** hệ thống tải đúng nhánh lựa chọn tương ứng và cho phép người dùng lưu lại địa chỉ

#### Scenario: Mở địa chỉ có phường/xã ngoài snapshot

- **WHEN** giá trị phường/xã đã lưu không thể nhận diện trong snapshot nhưng tỉnh/thành và quận/huyện không bị người dùng thay đổi
- **THEN** hệ thống vẫn hiển thị và giữ nguyên giá trị đó trong payload lưu địa chỉ

#### Scenario: Đổi cấp cha của giá trị ngoài snapshot

- **WHEN** người dùng thay đổi tỉnh/thành hoặc quận/huyện của địa chỉ có phường/xã chưa nhận diện
- **THEN** hệ thống xóa phường/xã cũ để ngăn lưu tổ hợp địa chỉ không nhất quán

### Requirement: Hợp đồng lưu địa chỉ không thay đổi

Hệ thống SHALL tiếp tục gửi và lưu `province`, `district` và `ward` dưới dạng tên đơn vị hành chính là chuỗi, không yêu cầu mã đơn vị mới trong API.

#### Scenario: Lưu địa chỉ sau khi chọn đủ ba cấp

- **WHEN** người dùng gửi biểu mẫu địa chỉ hợp lệ sau khi chọn tỉnh/thành, quận/huyện và phường/xã
- **THEN** API hiện có nhận các tên hiển thị dạng chuỗi và địa chỉ có thể được đọc lại mà không cần migration dữ liệu

#### Scenario: Lưu địa chỉ tại huyện không tổ chức cấp xã

- **WHEN** người dùng gửi địa chỉ thuộc huyện không tổ chức cấp xã
- **THEN** API hiện có nhận sentinel `Không có đơn vị hành chính cấp xã` trong trường `ward` và không cần thay đổi contract hoặc database

### Requirement: Popup phường/xã sử dụng được bằng bàn phím và trình đọc màn hình

Hệ thống SHALL cung cấp nhãn, trạng thái mở/đóng, thông báo lỗi và điều hướng bàn phím phù hợp cho popup Phường/Xã tương đương các popup cấp trên.

#### Scenario: Mở và chọn bằng bàn phím

- **WHEN** người dùng tập trung trường Phường/Xã, mở popup và điều hướng bằng bàn phím
- **THEN** ô tìm kiếm nhận focus, các lựa chọn có vai trò truy cập phù hợp và lựa chọn được áp dụng mà không cần chuột
