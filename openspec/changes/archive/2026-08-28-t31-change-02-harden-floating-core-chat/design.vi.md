## Bối cảnh

Xem `proposal.md` để biết lý do và `docs/ui-ux/t31-change-02-harden-floating-core-chat.md` để biết hành vi người dùng nhìn thấy. Change 1 đã cung cấp mô hình lưu trữ cặp người dùng chuẩn hóa, REST API có xác thực, truyền tin Socket.IO, transactional outbox và floating widget. Thiết kế này sửa các hành vi còn thiếu mà không tạo thêm bề mặt chat thứ hai và không đưa lại công tắc `CHAT_ENABLED`.

Client hiện chỉ tải một trang tin nhắn, chỉ tìm conversation theo ngữ cảnh trong trang liên hệ đầu tiên, đánh dấu đã đọc chủ yếu từ thao tác chọn bằng chuột, vẫn giữ target tạm rỗng khi đóng và hiển thị lối tắt gửi lại cho bong bóng thất bại. Presence realtime loại bỏ kết nối cuối cùng ngay lập tức. Kiểm thử chat với PostgreSQL là tùy chọn, còn Playwright chat cố tình làm realtime không khả dụng. Preflight dữ liệu cũ cũng báo conversation `2f6dd7f3-7982-47af-b230-442b54ba5e57` chỉ có một membership phân biệt.

Việc sửa dữ liệu và kiểm chứng trong tài liệu này mặc định chỉ nhắm tới môi trường local. Không bao gồm thao tác production nếu chưa có một yêu cầu rõ ràng riêng.

## Mục tiêu / Ngoài phạm vi

**Mục tiêu:**

- Hoàn thiện hành vi đã duyệt về lịch sử dài, cuộn, lỗi gửi, trạng thái cấm gửi, loading, tương tác đã đọc, tiếp tục sau đăng nhập và presence.
- Giữ nguyên bề mặt `/api/v1/chat`, đồng thời bổ sung các trường response cần thiết để UI dùng trạng thái có thẩm quyền.
- Xóa vĩnh viễn đúng conversation lỗi đã biết cùng mọi dòng thuộc đúng định danh đó trong một transaction có bảo vệ.
- Biến kiểm thử PostgreSQL và Socket.IO thật thành cổng phát hành chat bắt buộc, không được âm thầm bỏ qua.
- Hoàn thiện OpenAPI và cung cấp readiness outbox dạng tổng hợp, không làm lộ dữ liệu riêng tư.

**Ngoài phạm vi:**

- Tệp đính kèm, thẻ thương mại, sửa/xóa tin nhắn, chặn/báo cáo/kiểm duyệt, thông báo ngoài widget hoặc trang chat toàn màn hình.
- Realtime nhiều replica bằng Redis, shared presence hoặc rate limit phân tán.
- Tự động dọn bất kỳ conversation nào ngoài `2f6dd7f3-7982-47af-b230-442b54ba5e57`.
- Khôi phục conversation đã xóa cứng bằng logic ứng dụng.
- Thay đổi dữ liệu production trong phạm vi thực thi mặc định của change này.

## Các quyết định

### 1. Mở rộng state của provider hiện có thay vì tạo chat store khác

`ChatProvider` tiếp tục là nguồn trạng thái duy nhất ở client. State của conversation đang chọn được bổ sung:

- `hasMoreBefore`, `loadingOlder` và lỗi riêng cho tải lịch sử cũ;
- trạng thái đang tải, xem được nhưng cấm gửi, hoặc được phép gửi;
- sequence cũ nhất và mới nhất đang được giữ;
- các lần gửi local theo `clientMessageId`;
- trạng thái vùng tin mới nhất/ý định đọc riêng cho conversation đang chọn.

Lịch sử, REST response, Socket.IO event và optimistic attempt đều đi qua một hàm chuẩn hóa chung: ưu tiên ID tin đã được chấp nhận, sau đó là vị trí `(conversationId, sequence)` đã được server chấp nhận. Tin pending dùng `clientMessageId` đến khi có kết quả có thẩm quyền.

Phương án đã cân nhắc: thêm một thư viện cache client tổng quát. Không chọn vì repository đã tập trung vòng đời chat và đối soát realtime trong `ChatProvider`; một cache thứ hai làm tăng số nguồn sở hữu trạng thái mà chưa giải quyết nhu cầu rộng hơn.

### 2. Tải tin cũ bằng sequence cursor và neo vị trí cuộn trong DOM

Contract hiện có `GET /api/v1/chat/conversations/:conversationId/messages?beforeSequence=<n>&limit=<n>` tiếp tục là nguồn có thẩm quyền. Client yêu cầu trang kế tiếp bằng sequence nhỏ nhất đã được chấp nhận đang hiển thị.

Trước khi chèn dữ liệu lên đầu, widget ghi lại chiều cao vùng cuộn và scroll top, hoặc phần tử tin đầu tiên đang nhìn thấy cùng độ lệch của nó. Sau khi React hoàn tất chèn trang cũ, scroll top được bù theo chênh lệch chiều cao để điểm neo cũ đứng yên. Cơ chế single-flight ngăn nhiều yêu cầu trang cũ chồng nhau. `hasMoreBefore=false` dừng yêu cầu tiếp theo cho snapshot hiện tại đến khi conversation được tải lại.

Tin realtime và reconnect dùng cùng hàm merge. Viewport chỉ tự tiến khi đang nằm trong ngưỡng vùng mới nhất. Nếu không, nút `Tin nhắn mới` được giữ đến khi người dùng chủ động đi tới cuối.

Mốc ngày chỉ phục vụ hiển thị, được suy ra từ thời gian UTC đã được chấp nhận và locale của trình duyệt. Mặc định chỉ tin mới nhất hiển thị giờ, giữ hành vi metadata gọn đã được duyệt.

Phương án đã cân nhắc: đảo thứ tự bằng reverse flex. Không chọn vì làm phức tạp thứ tự bàn phím, suy luận sequence, mốc ngày và việc neo khi chèn lịch sử cũ.

### 3. Phân giải target theo ngữ cảnh tại biên API

`GET /api/v1/chat/targets/shops/:shopId` bổ sung trường `existingConversation`, chứa `ChatConversationSummary` đã kiểm tra quyền hoặc `null`. Server tìm trực tiếp cặp người dùng không thứ tự chuẩn hóa; trình duyệt không còn suy luận sự tồn tại từ trang liên hệ đang tải.

Đây là trường bổ sung; các kiểm tra target, tự chat, shop hoạt động và tài khoản chủ shop giữ nguyên. Có summary thì provider chọn và tải conversation đó. Là `null` thì provider tạo một target tạm chỉ tồn tại trong phiên.

Conversation summary và trang tin nhắn cũng bổ sung boolean tổng quát `canMessage`. Giá trị lấy từ điều kiện có thẩm quyền ở server và không chứa lý do thực thi riêng tư. Conversation xem được nhưng `canMessage=false` vẫn giữ lịch sử và chuyển composer sang chỉ đọc.

Phương án đã cân nhắc: phân trang toàn bộ liên hệ cho đến khi tìm thấy participant. Không chọn vì tăng độ trễ và lưu lượng, đồng thời vẫn khiến tính đúng phụ thuộc vào việc client duyệt danh sách.

### 4. Xem việc khôi phục nội dung gửi lỗi là merge draft, không phải thao tác retry

Mỗi lần gửi ghi lại nội dung và revision của composer. UI xóa composer theo optimistic behavior. Khi hết ba giây hoặc lỗi tức thời:

- attempt chuyển thành thất bại cục bộ;
- không render nút retry riêng;
- nội dung chỉ được đưa lại nếu composer vẫn trống và chưa chuyển sang revision mới có nội dung;
- nếu không, draft mới được ưu tiên và bong bóng lỗi vẫn có thể sao chép.

Nút Gửi thông thường luôn tạo `clientMessageId` mới. Attempt lỗi cũ không bao giờ được tự động gửi lại. Nếu response hoặc event realtime có thẩm quyền của `clientMessageId` cũ chứng minh server đã chấp nhận, kết quả đã chấp nhận thắng khi đối soát; đây là xác nhận kết quả server đã tồn tại, không phải tự gửi lại.

Đóng target tạm rỗng và chưa materialize sẽ xóa selection, transient messages và shop đang chọn. Draft khác rỗng tiếp tục nằm trong namespace của user đăng nhập và người nhận.

Phương án đã cân nhắc: giữ nút `Gửi lại`. Không chọn vì nó che giấu việc có tạo idempotency key mới hay không và mâu thuẫn với flow khôi phục bằng nút Gửi thông thường đã duyệt.

### 5. Biến tương tác đọc thành ngữ nghĩa rõ ràng và đơn điệu

Vùng conversation có thể nhận focus bàn phím và xử lý `focus`/`focusin` cùng với kích hoạt bằng pointer. Chọn contact/avatar và focus composer là các tín hiệu tương tác rõ ràng tương đương nhau. Mỗi tín hiệu chụp sequence cao nhất đã chấp nhận đang biết và chỉ gọi endpoint watermark hiện có khi mốc đó lớn hơn mốc hiện tại.

Việc trình duyệt trở nên visible hoặc widget chỉ vừa mở không đánh dấu đã đọc. Response và realtime read event merge bằng `Math.max`; kết quả cũ không thể kéo watermark lùi. Tổng unread toàn cục được thay bằng giá trị server khi có, thay vì tự giảm phỏng đoán.

Phương án đã cân nhắc: đánh dấu đã đọc mỗi khi conversation đang chọn render. Không chọn vì nó coi việc hiển thị thụ động là sự chú ý của người dùng và đã gây sai lệch trong Change 1.

### 6. Tách riêng loading và forbidden state

Loading liên hệ, loading lịch sử đang chọn, loading trang cũ, lỗi danh sách, lỗi lịch sử và xem được nhưng cấm gửi là các state riêng. Widget chỉ render skeleton cho đúng phạm vi và giữ dữ liệu cache đã được phép xem khi refresh lỗi.

Problem Details được phân loại bằng problem type/status ổn định. Hạn chế quyền gửi không xóa lịch sử. Lỗi quyền participant thực sự vẫn bảo vệ riêng tư và không làm lộ một conversation khác đang tồn tại.

Phương án đã cân nhắc: một biến `loading` và một chuỗi lỗi chung. Không chọn vì nó làm trắng các vùng UI không liên quan và không biểu diễn được lịch sử có thể khôi phục cùng composer bị vô hiệu hóa.

### 7. Xác thực tiếp tục chat của khách bằng contract dùng chung

Handoff lưu trữ được parse theo shape rõ ràng `{ shopId, returnPath, source }`. `shopId` phải là UUID, `returnPath` phải qua `isSafeAuthReturnTo`, và `source` phải thuộc tập nguồn chat theo ngữ cảnh được hỗ trợ. Dữ liệu được tiêu thụ một lần trước khi phân giải target. JSON lỗi, thiếu trường, đường dẫn không an toàn, shop cũ không còn hợp lệ và self-target đều bị bỏ qua mà không tạo side effect chat.

Phương án đã cân nhắc: tiếp tục dùng `returnPath.startsWith('/')`. Không chọn vì giá trị protocol-relative hoặc sai định dạng cần cùng validation tập trung mà authentication đã dùng.

### 8. Thêm khoảng đệm ngắt kết nối năm giây cho process-local presence

`ChatPresenceService` giữ số kết nối và một timer chờ inactive cho mỗi user. Khi socket cuối cùng ngắt, service lên lịch phát inactive sau năm giây. Reconnect sẽ hủy timer, khôi phục/chạm lease và chỉ phát active khi consumer thực sự cần hội tụ. Ngắt một trong nhiều tab không khởi động timer.

Lease vẫn bảo vệ trường hợp socket kết nối nhưng cũ. Timer là process-local, phù hợp ranh giới triển khai một instance của Change 1. Không tạo cờ `CHAT_ENABLED`.

Phương án đã cân nhắc: dùng toàn bộ lease 45 giây làm grace. Không chọn vì trạng thái offline thật sẽ chậm thấy rõ. Phát inactive ngay cũng không chọn vì reload bình thường sẽ làm UI chớp trạng thái.

### 9. Thực hiện xóa cứng đã duyệt bằng command sửa dữ liệu có bảo vệ

Một command thuộc repository chứa ID đã duyệt dưới dạng hằng số và yêu cầu tham số xác nhận phải khớp tuyệt đối. Command không chấp nhận ID tùy ý. Nó mở một transaction PostgreSQL, lấy advisory lock trong transaction, báo cáo số dòng theo bảng, xóa dòng phụ thuộc, xóa conversation, xác minh còn zero dòng rồi mới commit.

Thao tác bao phủ mọi bảng đang tồn tại của cả hai dạng:

- canonical: `chat_user_outbox`, `chat_user_messages`, `chat_user_memberships`, `chat_user_conversations`;
- legacy: `chat_outbox`, `chat_report_references`, `chat_blocks`, `chat_attachments`, `chat_messages`, `chat_memberships`, `chat_conversations`.

Dòng dữ liệu chỉ được chọn bởi `conversation_id = '2f6dd7f3-7982-47af-b230-442b54ba5e57'`, hoặc cột `id` của bảng conversation. Bảng phụ thuộc được xóa trước bảng cha kể cả nơi đã có cascade, giúp số đếm và hành vi rõ ràng. Bảng legacy tùy chọn không tồn tại được tính là zero dòng. Output chỉ chứa tên bảng và số lượng, không chứa nội dung tin hoặc dữ liệu participant.

Command có tính idempotent: chạy lần hai báo zero dòng và thành công. Bất kỳ lỗi preflight nào khác vẫn là hard stop. Đây là xóa cứng không thể đảo ngược ở cấp dòng; rollback code không thể dựng lại dữ liệu, nên backup/restore database của môi trường là cơ chế rollback dữ liệu duy nhất.

Phương án đã cân nhắc: sửa rộng theo mọi conversation có membership sai. Không chọn vì người dùng chỉ cho phép xóa đúng một conversation. Soft delete không được chọn vì vẫn để lại invariant legacy bị lỗi và trái yêu cầu xóa cứng.

### 10. Bổ sung contract OpenAPI và outbox readiness theo hướng cộng thêm

Tất cả operation của chat controller được bổ sung `@ApiTags`, bearer auth, operation, parameter/query/body, success và metadata lỗi ổn định. Schema DTO và contract tiếp tục là nguồn của các trường tài liệu.

`GET /api/v1/health/chat-outbox` trả về contract tổng hợp dùng chung gồm:

- `ready`;
- số lượng `pending`, `processing`, `failed`;
- `oldestPendingAgeSeconds`;
- counter theo process (`claimed`, `sent`, `failedAttempts`, `polls`);
- `lastPollAt` và `lastErrorAt`.

Readiness là false khi polling đã cũ hoặc event pending hợp lệ cũ nhất vượt ngưỡng cấu hình. Endpoint theo mẫu health vận hành public hiện có của repository và không chứa ID, nội dung, ticket/session hay exception thô. ChatModule chỉ export readiness provider mà HealthModule cần.

Phương án đã cân nhắc: chỉ trả object metrics in-memory hiện có. Không chọn vì thiếu backlog bền vững và tuổi bản ghi cũ nhất, hai giá trị cần để phát hiện delivery bị kẹt.

### 11. Tách mocked UI test khỏi kiểm thử phát hành chat thật

Component test tiếp tục mock transport để kiểm tra rendering và state machine ổn định. Chúng bao phủ scroll anchoring, deduplication, skeleton, đóng target tạm rỗng, khôi phục draft an toàn, keyboard read, composer forbidden, validation continuation và presence grace.

Integration test database chạy với `RUN_CHAT_DATABASE_TESTS=1` trên PostgreSQL cô lập và thất bại nếu suite bị skip. Chúng bao phủ concurrency của canonical pair, xung đột idempotency, sequence/read watermark đơn điệu, authorization, outbox aggregate và tính cô lập của repair theo exact ID.

Một Playwright project chat riêng khởi động API và web thật, đồng thời tạo hai tài khoản đã đăng nhập và một shop chỉ có một owner. Fixture tạo dữ liệu có namespace duy nhất và sau đó chỉ xóa các dòng của chính fixture. Socket.IO không bị abort và realtime-ticket không bị mock. Ngắt kết nối có kiểm soát dùng khả năng network/browser context thay vì hook nội bộ của server.

Suite bao phủ entry point sản phẩm, shop, checkout; race tin đầu; giới hạn gửi và late acknowledgement; prepend lịch sử dài; hành vi vùng mới nhất; hành động đọc rõ ràng; reconnect backfill; presence grace; và hội tụ nhiều tab ở 360 × 800, 768 × 1024, 1440 × 900.

Phương án đã cân nhắc: mở rộng Playwright mock hiện có rồi tiếp tục gọi đó là realtime coverage. Không chọn vì nó không kiểm tra transport, ticket xác thực, outbox delivery hoặc hội tụ nhiều client.

## Ma trận kiểm thử API

- `GET /api/v1/chat/targets/shops/:shopId`: xác thực, UUID, shop thiếu/không hoạt động, self-target, không có conversation, conversation nằm ngoài trang liên hệ đầu và contract `existingConversation` bổ sung.
- `GET /api/v1/chat/conversations`: thứ tự cursor ổn định, tìm kiếm, tổng unread, projection điều kiện gửi và riêng tư participant.
- `GET /api/v1/chat/conversations/unread-count`: tổng có xác thực và hội tụ sau khi đọc.
- `GET /api/v1/chat/conversations/:conversationId/messages`: `beforeSequence`, `afterSequence`, loại trừ lẫn nhau, thứ tự ổn định, overlap, hết trang, quyền participant và projection `canMessage`.
- `POST /api/v1/chat/messages`: validation, self-target, recipient không khả dụng, giới hạn ba giây ở client, late acknowledgement được chấp nhận, replay chính xác, replay xung đột, gửi tin đầu đồng thời, rate limit và tạo outbox.
- `PUT /api/v1/chat/conversations/:conversationId/read`: tiến đơn điệu, replay cũ, response tổng unread, hội tụ nhiều tab và từ chối non-participant.
- `POST /api/v1/chat/realtime-ticket`: session đã xác thực, ticket dùng một lần, hết hạn, kiểm tra origin, session inactive và lỗi an toàn.
- `GET /api/v1/health/chat-outbox`: healthy, poll cũ, ngưỡng tuổi pending, failed backlog, lỗi database và response bảo vệ riêng tư.
- Socket.IO projection: accepted message, conversation summary, tổng unread, read watermark, reconnect backfill, presence grace và nhiều tab đã xác thực.

## Các luồng nhất quán và bảo mật quan trọng

- **Đường xóa dữ liệu:** xác nhận exact ID, advisory lock, transaction xuyên bảng, assertion sau xóa và không tự xử lý ID lỗi thứ hai.
- **Concurrency tin đầu:** unique cặp người dùng không thứ tự, row lock, cấp sequence, idempotency key và outbox row vẫn atomic.
- **Kết quả gửi đến muộn:** cutoff local không gây tự replay; acceptance có thẩm quyền của cùng `clientMessageId` vẫn được deduplicate.
- **Read state:** mọi đường pointer/bàn phím tiến cùng một watermark đơn điệu và dùng tổng unread có thẩm quyền.
- **Authorization:** phân giải target và `canMessage` do server quyết định; lịch sử được giữ và chi tiết enforcement riêng tư được tách biệt.
- **Hội tụ realtime:** history, reconnect và Socket.IO overlap merge theo cùng quy tắc định danh/thứ tự có thẩm quyền.

## Rủi ro / Đánh đổi

- [Xóa cứng không thể đảo ngược] → Giới hạn command vào exact ID đã duyệt, yêu cầu xác nhận khớp, đếm trước/sau, dùng một transaction và dựa vào backup môi trường để rollback dữ liệu.
- [Bản ghi lỗi có thể tồn tại ở cả bảng legacy lẫn canonical] → Xóa và xác minh cả hai họ bảng theo thứ tự phụ thuộc trong cùng transaction.
- [Neo cuộn có thể thay đổi do layout tải muộn] → Neo vào phần tử tin cụ thể và test bong bóng cao biến đổi cùng các breakpoint.
- [Server có thể accept sau cutoff local] → Đối soát theo `clientMessageId` như acknowledgement có thẩm quyền mà không tự gửi lại attempt.
- [Health public có thể làm lộ dữ liệu vận hành] → Chỉ trả số tổng hợp/timestamp và test payload serialize không chứa trường bị cấm.
- [E2E chat thật chậm và dễ lỗi hạ tầng hơn] → Tách job release riêng, fixture xác định, cleanup có phạm vi, chỉ retry khi khởi động hạ tầng và giữ trace khi lỗi.
- [Grace năm giây làm chậm trạng thái offline thật] → Giữ thời gian ngắn, duy trì lease hiện có, cấu hình tập trung và unit test.
- [Change 1 hoàn thành nhưng chưa archive] → Giữ change này dạng cộng thêm và phụ thuộc Change 1; verify rồi sync/archive đúng thứ tự sau khi cả hai được chấp nhận.

## Kế hoạch migration

1. Chạy test hiện có và ghi nhận output chat preflight hiện tại.
2. So sánh migration trong repository với `_prisma_migrations`; dừng nếu checksum lệch hoặc có migration bất ngờ chưa áp dụng.
3. Tạo backup hoặc snapshot database phù hợp với môi trường trước khi sửa phá hủy.
4. Chạy command repair có bảo vệ ở local với đúng confirmation ID và lưu báo cáo chỉ gồm số đếm.
5. Chạy command lần hai để chứng minh idempotent với zero dòng.
6. Chạy `chat:preflight`; dừng nếu còn bất kỳ ID lỗi không liên quan nào.
7. Implement và chạy integration PostgreSQL, component, realtime multi-client, Playwright theo breakpoint, accessibility, typecheck, lint và production build.
8. Kiểm tra `/api/v1/health/chat-outbox` ở trạng thái healthy và stale/backlog, đồng thời kiểm tra độ phủ OpenAPI.
9. Chỉ rollout code sau khi mọi gate đạt. Không chạy repair phá hủy trên production nếu chưa có yêu cầu rõ ràng riêng và quy trình backup production.

Rollback code sẽ hoàn nguyên thay đổi provider/API/presence/readiness. Nó không tái tạo được dòng chat đã xóa cứng; khôi phục database từ snapshot trước repair là rollback dữ liệu duy nhất.
