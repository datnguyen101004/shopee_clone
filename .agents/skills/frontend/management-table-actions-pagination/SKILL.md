---
name: management-table-actions-pagination
description: "Chuẩn hóa bảng quản lý trong Shopee Clone: thao tác bằng icon có accessibility, phân trang theo số thay cho cursor/load-more, typography đồng nhất và nội dung không tràn khi resize cột. Dùng khi người dùng yêu cầu áp dụng một hoặc nhiều quy tắc này cho các trang Admin/Seller khác."
---

# Management Table Actions & Pagination

Áp dụng thay đổi đồng bộ từ contract đến UI trong đúng route/endpoint được giao. Đọc `AGENTS.md` và UI spec của workspace tương ứng trước khi sửa. Không chuyển các endpoint khác chỉ vì chúng dùng chung file hoặc type; cursor vẫn được giữ cho feed/infinite scroll ngoài phạm vi yêu cầu.

## Thao tác dùng icon

- Thay nút chữ trong cột thao tác bằng icon biểu đạt đúng hành động và tái sử dụng icon/button primitive hiện có.
- Mỗi nút phải có `type="button"`, `aria-label` chứa hành động và tên đối tượng, cùng `title` ngắn. Không dựa riêng vào màu hoặc hình icon để truyền đạt ý nghĩa.
- Giữ màu theo ngữ nghĩa hiện có: primary cho xem/xử lý, danger cho khóa/xóa, success cho khôi phục. Giữ focus-visible và vùng bấm đủ lớn.
- Cột thao tác căn phải và nằm trong flow tự nhiên của bảng. Không tự thêm sticky/neo, shadow hoặc phủ lên cột khác.
- Giữ nguyên modal xác nhận, quyền, validation, audit và payload nghiệp vụ phía sau icon.

## Chuyển cursor sang page

Mặc định của chuẩn này là **10 đối tượng mỗi trang** và client không được tự đổi page size.

1. Contract request dùng `page?: number`; bỏ `cursor` và `limit` riêng của endpoint. Response trả `items`, `page`, `pageSize`, `totalItems`, `totalPages`.
2. DTO chuyển `page` sang số nguyên và kiểm tra `page >= 1`; mặc định là trang 1.
3. Repository dùng thứ tự ổn định có khóa phụ duy nhất, ví dụ `createdAt DESC, id DESC`; truy vấn trang bằng `skip: (page - 1) * 10`, `take: 10`.
4. Chạy truy vấn `count` và `findMany` song song khi tầng dữ liệu cho phép. Chỉ select các field cần cho response và thêm index phù hợp với filter phổ biến cùng thứ tự sort. Tạo migration khi schema index thay đổi.
5. Service giữ nguyên metadata từ repository và chỉ serialize dữ liệu cần thiết. Controller/OpenAPI phải mô tả phân trang theo page và 10 đối tượng mỗi trang.
6. Client gửi `page`; bỏ hoàn toàn query `cursor`. Khi search hoặc filter đổi, đặt lại `page = 1`. Sau mutation/refetch, đưa page về trang cuối hợp lệ nếu tổng trang giảm.

## UI phân trang

- Hiển thị tổng số đối tượng và khoảng hiện tại, ví dụ `Hiển thị 11–20 trong 46 người dùng`.
- Có nút `Trước` và `Sau`, disable đúng ở biên; mỗi số trang có `aria-label="Trang N"`, trang hiện tại có `aria-current="page"`.
- Số trang không có border hoặc background. Trang hiện tại và trạng thái hover/focus đổi sang màu primary và chữ đậm; số thường dùng màu muted và font-weight thường.
- Tối đa hiển thị một cửa sổ nhỏ. Ở đầu danh sách 20 trang dùng `1 2 3 4 5 … 20`; ở giữa dùng `1 … n-1 n n+1 … 20`; gần cuối dùng `1 … 16 17 18 19 20`.
- Giữ thanh cuộn ngang và khả năng resize cột nếu màn đã có; không gắn trạng thái phân trang vào vị trí cuộn ngang.

## Typography bảng quản lý

- Dùng một class chung được scope trong workspace cho các bảng cần đồng bộ; không lặp các giá trị font bằng inline style ở từng route.
- Header cột dùng `12px/500`; ô dữ liệu dùng `13px/400`; tên đối tượng chính dùng `13px/500`; badge trạng thái, vai trò và chữ phụ dùng `11px/500`.
- Các giá trị thường như số điện thoại, ngày, giá và ghi chú không in đậm. Tên đối tượng chỉ nhấn vừa đủ ở weight 500, kể cả khi markup dùng `strong`.
- Badge trạng thái phải có `max-width: 100%`, cho phép xuống dòng và ngắt từ khi cột bị resize hẹp; không để chữ hoặc nền badge tràn qua divider. Badge vai trò có thể giữ một dòng khi danh sách badge đã tự wrap.
- Giữ màu, icon, kích thước vùng bấm và ý nghĩa trạng thái hiện có. Không áp typography của bảng sang toolbar, dialog hoặc trang chi tiết nếu người dùng không yêu cầu.
- Với nhóm bảng được yêu cầu đồng bộ, dùng cùng primitive/class để chỉnh một lần có hiệu lực nhất quán; giới hạn selector trong `.admin-workspace` hoặc `.seller-workspace` tương ứng.

## Chống tràn nội dung khi resize cột

Trước khi sửa, kiểm tra cả computed style và thứ tự selector. Lỗi thường đến từ quy tắc `white-space: nowrap` dùng chung, inline style có độ ưu tiên cao, flex/grid child thiếu `min-width: 0`, hoặc padding của `td` làm content box còn quá hẹp sau khi resize.

Phân loại nội dung trước khi chọn cách xử lý:

- **Trạng thái và nhãn dài:** gắn class semantic riêng như `admin-table-status`; cho phép wrap bên trong badge và giới hạn toàn bộ border/background trong content box.
- **Tên, email, slug và mô tả:** đặt `min-width: 0`, `max-width: 100%`; dùng wrap hoặc ellipsis theo yêu cầu của màn. Với chuỗi không có khoảng trắng, dùng `overflow-wrap: anywhere`.
- **Danh sách badge ngắn:** container dùng `display: flex; flex-wrap: wrap`; từng badge có thể giữ một dòng nếu bản thân badge luôn ngắn hơn chiều rộng tối thiểu của cột.
- **Icon thao tác:** giữ `white-space: nowrap`, kích thước vùng bấm cố định và để cột trong flow tự nhiên; không giải quyết overflow bằng sticky hoặc phủ lên dữ liệu.

Primitive cho badge trạng thái có thể triển khai theo mẫu sau, đổi selector theo workspace:

```css
.admin-workspace .admin-management-table .admin-table-status {
  box-sizing: border-box;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  height: auto;
  overflow-wrap: anywhere;
  text-align: center;
  white-space: normal;
  word-break: normal;
}
```

- Đặt selector đủ cụ thể hoặc sau quy tắc atomic `nowrap` để override đúng phần tử; không bỏ `nowrap` toàn cục khỏi badge khi các màn khác vẫn cần nó.
- `max-width: 100%` phải đi cùng `box-sizing: border-box`, nếu không padding và border vẫn có thể làm badge rộng hơn content box.
- Nếu chiều rộng sử dụng được của ô nhỏ hơn cả một badge sau khi trừ padding, giảm padding riêng tại breakpoint phù hợp hoặc đặt min-width riêng cho cột. Không giảm min-width toàn bộ bảng chỉ để sửa một cột.
- Tránh dùng `overflow: hidden` trên cả bảng hoặc hàng như cách sửa chính vì có thể cắt focus ring, tooltip và menu. Chỉ dùng clipping cục bộ như lớp bảo vệ cuối cùng sau khi nội dung đã wrap đúng.
- Giữ divider thuộc `th/td`; badge không được vẽ chữ, nền hoặc border qua divider khi ở chiều rộng nhỏ nhất mà bộ resize cho phép.

## Kiểm tra

- Contract/typecheck chứng minh không còn consumer nào của endpoint vẫn truyền `cursor` hoặc đọc `nextCursor`.
- Repository test xác minh page 3 dùng `skip: 20`, `take: 10`, thứ tự ổn định và metadata tổng trang.
- API boundary test xác minh URL có `page` và không có `cursor`.
- Component test xác minh icon, accessible name, trang hiện tại, chuyển trang, reset trang khi filter/search đổi và dãy rút gọn `1 2 3 4 5 … 20`.
- Kiểm tra cả ba cấp chữ của bảng trong stylesheet dùng chung: header, nội dung/tên chính và badge/chữ phụ. Typecheck hoặc component test không thay thế việc xem typography đã render.
- Với bảng resize được, kéo từng loại cột về chiều rộng nhỏ nhất và kiểm tra badge, chuỗi dài, divider, focus ring và thanh cuộn ngang. Kiểm tra cả resize bằng chuột và phím mũi tên nếu handle hỗ trợ bàn phím.
- Xác minh nội dung wrap làm chiều cao hàng tăng tự nhiên, không bị cắt và không tràn sang ô liền kề. Kiểm tra ít nhất một trạng thái dài và một chuỗi không có khoảng trắng.
- Chạy lint, typecheck và test tập trung của package bị ảnh hưởng. Chỉ chạy E2E khi người dùng yêu cầu; phân biệt kết quả test hành vi với xác minh hình ảnh thực tế.
- Nếu phản hồi này thay đổi quy tắc UI lâu dài, cập nhật UI spec/corrections của workspace tương ứng.
