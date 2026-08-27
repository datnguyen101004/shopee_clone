## Bối cảnh

Xem `proposal.md` để biết động cơ và `specs/floating-core-chat/spec.md` để biết hành vi có thể quan sát được.

Storefront là ứng dụng Next.js App Router, trong đó `StorefrontShell` dùng chung đã nằm bên trong `AuthSessionProvider`, vì vậy đây là điểm gắn ổn định cho widget không phụ thuộc route. Contract của trang chi tiết sản phẩm và shop công khai đã cung cấp user ID của chủ shop; các nhóm shop trong checkout chỉ cung cấp shop ID nên cần một boundary phân giải đích chat thay vì để client tự suy luận quyền sở hữu. Access token được giữ trong bộ nhớ trình duyệt và làm mới qua `AuthSessionProvider`.

NestJS API hiện chỉ có REST và chưa có dependency realtime. Migration lịch sử `20260824170000_chat_foundation` tạo các bảng chat theo mô hình buyer/shop cùng các cấu trúc attachment, block và report dành cho tương lai, nhưng Prisma schema hiện tại không có model chat và chưa có module chat nào sử dụng các bảng đó. Vì sản phẩm hiện bảo đảm mỗi shop có một tài khoản chủ sở hữu và chat được xác định rõ là user-to-user, danh tính buyer/shop cùng các enum side cũ không thể được dùng nguyên trạng làm mô hình công khai của Change 1. `NotificationType.CHAT_MESSAGE` đã tồn tại, nhưng việc gửi thông báo tổng hợp vào notification center nằm ngoài mốc này.

## Mục tiêu / Không phải mục tiêu

**Mục tiêu:**

- Giữ boundary modular monolith bằng một capability chat riêng và các contract không phụ thuộc framework.
- Bảo đảm việc tạo hội thoại bằng tin đầu tiên, đánh sequence, idempotency, read watermark và tổng chưa đọc đúng về mặt transaction khi có nhiều tab và hai người gửi đồng thời.
- Thêm cập nhật server-to-client độ trễ thấp nhưng vẫn dùng snapshot REST làm nguồn sự thật khi khôi phục.
- Hòa giải chat foundation hiện có một cách an toàn bằng forward migration thay vì sửa lịch sử migration.
- Gắn một nơi quản lý state chat duy nhất xuyên suốt các route storefront và chỉ giữ draft tạm cùng navigation intent trong phạm vi phiên trình duyệt.
- Giữ authentication, authorization, validation, privacy, OpenAPI và Problem Details nhất quán với convention hiện có của repository.

**Không phải mục tiêu:**

- Kiến trúc realtime scale ngang, Redis pub/sub hoặc một chat service triển khai riêng.
- Draft bền vững hoặc đồng bộ draft giữa nhiều thiết bị.
- Fanout vào notification center/email cho tin đến khi widget đóng.
- Attachment, rich card, block, report, moderation, sửa, xóa hoặc danh tính chat riêng cho shop.
- Dùng các field buyer/shop lịch sử làm danh tính chat hiển thị ra ngoài.

## Quyết định

### 1. Mô hình hóa hội thoại thành một cặp user không thứ tự đã chuẩn hóa

`ChatConversation` sẽ lưu `participantLowUserId` và `participantHighUserId`, sắp xếp theo thứ tự từ điển, với unique constraint trên cặp này. Cặp tự chat bị từ chối trước khi ghi và bằng database check. Hai bản ghi `ChatMembership` giữ state theo từng người tham gia: `lastReadSequence`, `unreadCount` và thời điểm đọc. `ChatMessage` lưu sequence tăng đơn điệu trong hội thoại, user ID người gửi, client message ID, nội dung text có giới hạn và thời gian UTC.

Lần gửi đầu tiên được chấp nhận chạy trong một transaction cơ sở dữ liệu ngắn, thực hiện:

1. chuẩn hóa và kiểm tra cặp user;
2. tạo hoặc khóa hội thoại duy nhất;
3. bảo đảm có đúng hai membership;
4. cấp sequence tiếp theo;
5. chèn message kèm idempotency constraint;
6. đưa membership của người gửi đến sequence mới và tăng unread của người nhận;
7. cập nhật conversation summary; và
8. chèn các bản ghi transactional outbox cho realtime projection.

Unique key của cặp user là lớp bảo vệ cuối cùng trước race. Nếu nhiều lần gửi đầu tiên va chạm khi tạo hội thoại, transaction thua sẽ lấy cặp đã tồn tại và thử lại việc cấp sequence; không bao giờ tạo hội thoại thứ hai. Idempotency của message dùng unique key `(conversationId, senderUserId, clientMessageId)` và lưu request digest để replay giống hệt trả về message ban đầu, còn tái sử dụng ID với payload khác trả HTTP 409.

Cách này được chọn thay vì giữ `(buyerId, shopId)` vì cả hai user đều có thể sở hữu shop, role có thể thay đổi và UX đã duyệt không có danh tính chat buyer/seller. Cách này cũng được chọn thay vì tạo hội thoại khi nhấn “Chat ngay” vì việc đó vi phạm quy tắc không tạo hội thoại rỗng.

### 2. Forward migrate chat foundation lịch sử, không sửa tại chỗ

Một migration mới sẽ thêm biểu diễn cặp user chuẩn hóa và Prisma model cho conversation, membership, message và realtime outbox. Nếu có dữ liệu hội thoại cũ, preflight sẽ phân giải từng `shop_id` cũ thành `shops.owner_id`, từ chối self-pair hoặc cặp trùng/xung đột không thể hòa giải an toàn, và chuyển đổi các dòng hợp lệ mà không làm mất message hoặc state sequence/read. Các cột sender-side và membership-role cũ không còn là nguồn sự thật và chỉ được xóa sau khi invariant mới được xác nhận.

Các bảng attachment, block và report từ foundation không được sử dụng hay expose trong Change 1. Chúng có thể tiếp tục tồn tại vật lý để tương thích tương lai, nhưng không contract, controller hoặc UI nào phụ thuộc vào chúng. Enum thông báo `CHAT_MESSAGE` hiện tại cũng được giữ tương thích nhưng change này không tạo notification-center record mới.

Cách này được chọn thay vì sửa migration lịch sử vì database local hoặc dùng chung có thể đã ghi nhận migration đó là applied. Nó cũng được chọn thay vì xóa toàn bộ bảng chat vì dữ liệu local hiện có có thể chứa message cần được review rõ ràng thay vì bị mất âm thầm.

### 3. Giữ mutation và recovery trên boundary REST có authentication

Public REST surface dùng `/api/v1/chat` và DTO validation nghiêm ngặt:

- `GET /api/v1/chat/targets/shops/:shopId` phân giải shop công khai thành danh tính chat của tài khoản chủ sở hữu và cho biết tài khoản hiện tại có phải chính user đó hay không.
- `GET /api/v1/chat/conversations?limit=&cursor=&query=` trả danh sách contact đã materialize bằng keyset pagination, sắp xếp theo `(lastMessageAt DESC, id DESC)`, cùng tổng unread chính xác.
- `GET /api/v1/chat/conversations/unread-count` trả tổng nhẹ dùng cho global badge.
- `GET /api/v1/chat/conversations/:conversationId/messages?limit=&beforeSequence=` tải lịch sử cũ hơn theo thứ tự ổn định.
- `GET /api/v1/chat/conversations/:conversationId/messages?afterSequence=` backfill message đã chấp nhận sau khi reconnect; `beforeSequence` và `afterSequence` loại trừ lẫn nhau.
- `POST /api/v1/chat/messages` nhận `{ recipientUserId, clientMessageId, content }` và trả conversation summary đã materialize cùng message được chấp nhận. Server tự phân giải cặp chuẩn hóa nên cùng một shape dùng được cho lần gửi đầu và các lần sau.
- `PUT /api/v1/chat/conversations/:conversationId/read` nhận `{ throughSequence }` và chỉ đẩy participant watermark tiến lên.
- `POST /api/v1/chat/realtime-ticket` phát ticket ngắn hạn, giới hạn audience cho một session đang active và đã authenticated.

Mọi endpoint đều dùng `AuthGuard`, repository predicate giới hạn theo participant, cache no-store, OpenAPI annotation và Problem Details riêng cho validation, self-chat, target unavailable, membership unavailable, idempotency conflict, rate limit và lỗi dịch vụ tạm thời. Giới hạn collection và message content được chặn rõ; Change 1 dùng giới hạn server 2.000 ký tự, khớp constraint của foundation hiện có.

Server-resolved shop target được chọn thay vì tin checkout tự suy luận hoặc expose ownership. REST tiếp tục là nguồn có thẩm quyền cho write và recovery vì phù hợp convention validation, refresh, Problem Details, test và OpenAPI hiện có hơn socket acknowledgement.

### 4. Chỉ dùng Socket.IO cho projection server-to-client có authentication

Thêm NestJS WebSocket support bằng Socket.IO platform adapter và `socket.io-client` ở web app. Client lấy realtime ticket ngắn hạn qua `authenticatedFetch` rồi gửi ticket trong Socket.IO authentication payload. Gateway kiểm tra audience, session ID, trạng thái active của tài khoản, origin và hạn ticket trước khi cho kết nối vào private room theo user ID. Access token hoặc refresh token gốc không bao giờ được đặt trong URL hay lưu bởi chat client.

Chat mutation từ client vẫn đi qua REST. Gateway phát các projection event có version như:

- `chat.message.accepted`;
- `chat.conversation.updated`;
- `chat.read.updated`;
- `chat.unread.updated`; và
- `chat.presence.updated`.

Event chỉ chứa field contract mà tài khoản nhận được phép xem và có sequence của conversation/message để merge xác định. Event version không biết sẽ fail closed và kích hoạt REST refresh. Khi reconnect, client refresh conversation snapshot và tải lịch sử đã chọn sau sequence cao nhất đã xác nhận; bản thân Socket.IO delivery không được coi là durable storage.

Socket.IO được chọn thay vì polling thuần vì hành vi đã duyệt cần message, presence, unread và đồng bộ nhiều tab với độ trễ thấp. Nó được chọn thay vì socket mutation hai chiều vì REST giữ write có idempotency, tài liệu và bảo vệ đồng nhất. SSE đã được cân nhắc nhưng không chọn ở mốc này vì authenticated reconnect, nhiều loại event, connection liveness và presence sẽ đòi hỏi tự xây protocol mà Socket.IO đã cung cấp.

### 5. Project thay đổi đã commit thông qua transactional outbox

Transaction chấp nhận message và cập nhật read watermark sẽ thêm `ChatOutbox` record có deduplication. Scheduled dispatcher có batch giới hạn claim các dòng bằng `FOR UPDATE SKIP LOCKED`, phát projection tương ứng vào user room đang kết nối rồi đánh dấu delivered. Lỗi dùng retry/backoff có giới hạn và structured log không chứa nội dung message. REST backfill khi reconnect vẫn là đường bảo đảm đúng nếu event bị trễ hoặc được phát khi không có client kết nối.

Cách này được chọn thay vì emit trực tiếp bên trong database transaction vì process crash sau commit có thể làm client đang kết nối bị stale mà không có tín hiệu retry. Nó tái sử dụng PostgreSQL và scheduled-worker pattern sẵn có của repository mà không đưa Redis hoặc dịch vụ khác vào Change 1.

### 6. Xem quy tắc ba giây là một client attempt có giới hạn, không phải hàng đợi vô hạn

Mỗi lần nhấn Send tạo một UUID `clientMessageId` mới, một pending bubble và deadline sau ba giây. Nếu trình duyệt offline hoặc reconnecting, nó có thể gửi đúng request đó khi kết nối trở lại trong thời gian này. Khi hết hạn, client dừng mọi truyền tự động tiếp theo và đánh dấu attempt thất bại. Reconnection code không queue hoặc replay attempt đã hết hạn.

Nếu server đã chấp nhận request được truyền trước khi trình duyệt quan sát timeout, REST response, realtime event hoặc reconnect backfill xuất hiện sau đó với cùng `clientMessageId` sẽ hòa giải bubble gốc thành accepted; đây là phục hồi acknowledgement, không phải tự động gửi lại. Lần nhấn Send bình thường về sau luôn dùng client message ID mới và không thể thay đổi attempt thất bại trước đó.

Cách hiểu này tránh lời hứa bất khả thi rằng hủy request ở trình duyệt có thể rollback server commit, đồng thời giữ đúng hành vi quan sát được rằng ứng dụng không tự khởi tạo lần gửi nào sau cửa sổ ba giây.

### 7. Dùng read watermark đơn điệu và unread counter theo transaction

Cập nhật `throughSequence` khóa membership của người gọi và đặt `lastReadSequence = max(current, boundedRequestedSequence)`. Unread count được tính lại hoặc giảm trong cùng transaction dựa trên các message sau watermark mới, ngăn tab stale đẩy state lùi lại. Việc gửi từ conversation đang mở đưa watermark của người gửi qua message vừa chấp nhận; chỉ người còn lại tăng unread.

Global badge bằng tổng membership unread count của tài khoản hiện tại. REST response cung cấp tổng chính xác và realtime event cung cấp đồng bộ độ trễ thấp. Client tách biệt trạng thái “read watermark đã tiến” với “đã đi đến new-message marker”, nhờ đó badge có thể xóa trong khi điểm điều hướng vẫn còn cho người đang đọc lịch sử cũ.

Sequence watermark được chọn thay vì một read row cho từng message vì Change 1 định nghĩa trạng thái đọc theo kiểu tích lũy và cần update/tính tổng hiệu quả.

### 8. Giữ presence gần đúng và trong phạm vi process

Gateway theo dõi số connection đã authenticated của mỗi user và làm mới một activity lease ngắn từ socket liveness cùng tương tác chat. User được xem là gần đúng đang active khi có ít nhất một connection hợp lệ với lease còn mới. Event chỉ expose `ACTIVE` hoặc `INACTIVE`, không bao giờ expose timestamp chính xác hoặc metadata connection. Disconnect dùng một khoảng grace nhỏ để tránh nhấp nháy khi reload tab hoặc đổi transport.

Mô hình process-local này phù hợp với triển khai modular monolith một instance hiện tại. Nó cố ý không hứa presence chính xác toàn cục khi có nhiều API replica; việc thêm Redis-backed presence và socket fanout cần một scaling change sau này.

### 9. Quản lý browser chat state trong provider được StorefrontShell gắn một lần

Thêm `ChatProvider` bên dưới `AuthSessionProvider` và bao quanh nội dung `StorefrontShell`. Provider quản lý trạng thái mở widget, conversation đã materialize đang chọn, target tạm, các trang contact, các trang message, draft theo recipient, attempt pending/failed, tổng unread, vòng đời realtime và reconciliation khi reconnect. Floating widget và global trigger render một lần từ `StorefrontShell`, nên điều hướng route không làm remount chat.

Các nút theo ngữ cảnh dispatch shop target vào provider thay vì chuyển đến route chat. Draft tạm và widget state có thể dùng `sessionStorage` với versioned key theo authenticated user; logout, đổi tài khoản, dữ liệu sai hoặc kết thúc phiên sẽ xóa chúng. Message bền vững và unread state luôn đến từ API.

Cách này được chọn thay vì state cục bộ theo trang vì entry point tại product, shop và checkout phải hội tụ vào một widget và giữ state khi điều hướng.

### 10. Tiếp tục guest intent bằng internal continuation đã kiểm tra

Thao tác “Chat ngay” của guest chỉ lưu `{ shopId, returnPath, source }` trong session storage và gọi luồng đăng nhập hiện có với safe internal return path. Sau authentication, `ChatProvider` consume intent đúng một lần, phân giải shop target qua authenticated API, từ chối target stale/self/unavailable và mở composer tạm. Không user profile, message text, access token hoặc private conversation ID đã phân giải nào được lưu trong continuation.

Cách này được chọn thay vì lưu owner user ID trước authentication vì quyền sở hữu có thể thay đổi và checkout hiện chưa expose dữ liệu này đồng nhất.

### 11. Áp dụng privacy, validation và abuse control tại mọi boundary

Repository query luôn giới hạn quyền truy cập conversation theo membership trước khi trả participant identity, history, read state hoặc event. Gateway room chỉ được join sau khi xác minh active session. DTO từ chối field lạ, content chỉ có khoảng trắng, message type không hỗ trợ, cursor/sequence không hợp lệ và text quá dài. Message submission có rate limit theo tài khoản và nguồn với retry metadata; log chứa trace, account, conversation, client-message và event identifier nhưng không chứa message content hoặc auth credential.

Khi việc gửi bị cấm nhưng lịch sử được phép giữ lại, API trả capability state chung thay vì chi tiết moderation hoặc account riêng tư. Điều này đáp ứng UI mà không đưa hành vi block/report vào Change 1.

## Rủi ro / Đánh đổi

- **[Migration chat lịch sử và trạng thái database thực tế có thể khác Prisma schema hiện tại]** → Thêm preflight query và forward-only reconciliation migration; dừng khi gặp duplicate/self pair mơ hồ thay vì xóa dữ liệu.
- **[Các lần gửi đầu đồng thời hoặc retry có thể tạo trùng conversation/message]** → Cặp user chuẩn hóa duy nhất, row lock, sequence constraint, request digest và PostgreSQL concurrency test tạo nhiều lớp bảo vệ.
- **[Browser timeout có thể race với server commit]** → Hòa giải theo `clientMessageId`; không tự truyền sau deadline nhưng chấp nhận bằng chứng có thẩm quyền rằng request gốc đã commit.
- **[Socket event có thể trễ, trùng hoặc mất]** → Projection có version và idempotent kết hợp REST snapshot/history backfill chính xác khi reconnect.
- **[Outbox backlog làm tăng realtime latency]** → Dùng polling interval ngắn, index cho pending row, batch limit, metric và reconnect recovery; REST acceptance không phụ thuộc projection latency.
- **[Presence process-local không chính xác khi có nhiều API replica]** → Gắn nhãn gần đúng, không hiển thị timestamp chính xác và ghi rõ single-process scope cho đến khi có Redis-backed scaling change.
- **[Floating widget có thể cản checkout hoặc bàn phím mobile]** → Gắn một lần tại shell, dùng safe-area và kích thước theo viewport, xác minh ba breakpoint bắt buộc bằng Playwright.
- **[Chat chưa có block/report có abuse control hạn chế]** → Bắt buộc authentication, rate limit, giới hạn nội dung, session suspension và authorization ngay; công cụ an toàn cho người dùng được lên change riêng sau này.
- **[Draft tạm có thể lộ giữa nhiều tài khoản trên trình duyệt dùng chung]** → Namespace theo authenticated user, xóa khi logout/đổi tài khoản, không dùng persistent storage và không lưu server message trong draft storage.

## Kế hoạch migration

1. Thêm contract type và coverage cho migration preflight mà chưa expose UI hoặc endpoint.
2. Kiểm tra các bảng chat hiện có để tìm cặp user chuẩn hóa trùng, self-pair, chủ shop bị thiếu, membership sai, client ID trùng và vi phạm sequence/read.
3. Thêm forward migration chuyển các dòng buyer/shop cũ hợp lệ thành cặp user chuẩn hóa, thiết lập constraint membership/message/outbox và thêm Prisma model tương ứng; dừng để reconciliation được review nếu preflight gặp trường hợp mơ hồ.
4. Triển khai chat module, REST endpoint, realtime ticket validation, gateway và outbox dispatcher cùng các giới hạn runtime đã kiểm tra; chat luôn khả dụng khi dependency hoạt động bình thường.
5. Triển khai shared contract cùng `ChatProvider`, widget và các contextual entry point ở web sau khi API health, migration và multi-client smoke test đạt.
6. Xác minh race của first-message, idempotent replay, hội tụ unread/read, reconnect backfill, thu hồi active session và ba hành trình trình duyệt responsive.
7. Theo dõi tỷ lệ Problem Details, send latency, lỗi socket connection và tuổi outbox sau khi phát hành; dùng quy trình rollback ứng dụng thông thường nếu sức khỏe hệ thống giảm.

Rollback ở cấp ứng dụng và không phá hủy dữ liệu: phiên bản ứng dụng cũ phải tiếp tục tương thích với các bảng đã migrate và giữ nguyên chat row đã commit. Rollback schema mang tính phá hủy hoặc xóa message không được thực hiện tự động và cần một data operation được review riêng.
