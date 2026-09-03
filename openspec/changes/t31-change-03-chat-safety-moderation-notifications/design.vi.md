## Bối cảnh

Xem `proposal.md` để biết động lực của change và `docs/ui-ux/t31-change-03-chat-safety-moderation-notifications.md` để biết hành vi giao diện đã được duyệt.

Change 1 và Change 2 đã cung cấp conversation theo cặp user không phân thứ tự, tin nhắn text có thứ tự, read watermark/unread counter theo membership, mutation qua REST, projection qua Socket.IO, transactional chat outbox, presence gần đúng, `ChatProvider` toàn cục và release gate PostgreSQL/realtime thực. Send limiter hiện tại là một `Map` trong process, vì vậy đổi tab không vượt được giới hạn nhưng request đi tới API process khác thì có thể. Schema cũng còn các bảng chat attachment/block/report lịch sử chưa dùng, nhưng các model canonical đang chạy chủ ý không tiêu thụ chúng.

Repository đã có notification inbox theo hướng production với `CHAT_MESSAGE` được giữ sẵn, preference theo category, các dòng `Notification` có deduplication, email attempt và UI header/account. Chat hiện chưa project vào hệ thống này. Reporting product/shop đã có durable report-rate event, receipt idempotent, moderation case được gom nhóm, optimistic case version, event/decision bất biến và privileged audit. Các capability đó hiện giả định target/outcome là product/shop và phải giữ tương thích ngược.

Không có dependency Redis hoặc shared cache trong topology local/CI. PostgreSQL là dịch vụ shared có tính authoritative mà mọi API instance đều truy cập được, và release workflow hiện có đã provision một PostgreSQL database cô lập.

## Mục tiêu / Ngoài phạm vi

**Mục tiêu:**

- Giữ một nơi sở hữu state floating chat trong khi bổ sung contact/message action có accessibility và quoted reply.
- Làm cho quyết định block, report, rate limit, notification, moderation và audit có tính server-authoritative và an toàn trước race condition.
- Tái sử dụng convention notification, moderation, outbox, Problem Details, OpenAPI và privileged-audit hiện có thay vì tạo các product stack song song.
- Giữ notification aggregation và read synchronization có kết quả xác định trước retry, reconnect, nhiều tab và nhiều API process.
- Giới hạn evidence admin đúng phần ngữ cảnh conversation bị báo cáo và ngăn lộ reporter/private note.
- Dùng forward-only migration và contract mở rộng theo hướng additive để Change 1/2 cùng client moderation/notification ngoài chat tiếp tục hoạt động.

**Ngoài phạm vi:**

- Browser push, mobile push hoặc email cho từng chat message.
- Chỉnh sửa/xóa message, moderation attachment, tự động phân loại nội dung hoặc export toàn bộ conversation.
- Đưa Redis vào hệ thống, distributed Socket.IO fanout hoặc moderation service triển khai riêng.
- Full-page chat inbox hoặc frontend chat store thứ hai.
- Tự động suspend toàn bộ account ngoài workflow quản trị user hiện có.
- Dùng lại các bảng buyer/shop chat block/report lịch sử làm canonical public model.

## Quyết định

### 1. Giữ `ChatProvider` làm browser authority và kết nối hành động notification qua provider này

`ChatProvider` tiếp tục bao quanh `MarketplaceHeader`, nội dung trang và `FloatingChat`. Nó sẽ sở hữu state menu contact, action message, reply composition, projection mute/block, vòng đời attention lease, mở chính xác conversation và merge realtime. `NotificationBell` cùng account notification inbox sẽ gọi một hành động của provider như `openConversationFromNotification` đối với item `CHAT_MESSAGE` thay vì gán một chat URL.

Mỗi contact row luôn render một trigger 44 × 44 px ở mép phải. Menu của nó suy ra đúng hai toggle từ các field authoritative trong summary: `notificationsMuted` và `blockedByMe`. Message menu được định danh bằng message ID; khi chọn reply, provider lưu reply reference đã normalize tách biệt với draft text, còn report mở report dialog cùng message anchor được chọn.

Phương án đã cân nhắc: một notification/chat bridge store thứ hai. Phương án này bị loại vì provider hiện có đã sở hữu conversation loading xuyên route, auth refresh, realtime, draft và read engagement. Store thứ hai sẽ tạo ra hai authority cạnh tranh nhau cho unread và selection.

### 2. Mô hình hóa block dưới dạng quan hệ account có hướng và mute dưới dạng membership state

Thêm quan hệ canonical `ChatUserBlock` với unique `(blockerUserId, blockedUserId)`, database check ngăn self-block, UTC timestamp và index cho cả hai hướng. Block có hướng để xác định chủ sở hữu và giới hạn thông tin được tiết lộ, nhưng block ở bất kỳ hướng nào cũng ngăn gửi và notification projection cho cặp user. Chỉ blocker nhận `blockedByMe=true`; participant còn lại chỉ nhận `canMessage=false` và capability state chung. Block API là các thao tác PUT/DELETE idempotent.

Thêm `notificationsMutedAt` vào `ChatMembership`; `null` nghĩa là đang bật. Mute thuộc về một user trong một materialized conversation, tồn tại qua reload/thiết bị, không thay đổi unread state và không xóa notification history hiện có. Mute/unmute cũng dùng semantics PUT/DELETE idempotent.

Cả block mutation và send acceptance đều lấy cùng canonical pair transaction advisory lock. Điều này tạo kết quả tuần tự cho race block/send: send commit trước block vẫn hợp lệ; sau khi block commit, không send, unread increment, notification aggregate hay message outbox side effect nào xảy ra sau đó được phép commit.

Phương án đã cân nhắc: kích hoạt lại `chat_blocks` legacy. Bảng đó dùng identity thời buyer/shop và không có trong canonical Prisma model, nên sẽ đưa trở lại sự mơ hồ identity đã được Change 1 loại bỏ.

### 3. Lưu identity của reply, không sao chép message body

Thêm `replyToMessageId` tùy chọn vào `ChatMessage` với self-relation và index. Send request nhận UUID tùy chọn và đưa nó vào request digest. Bên trong message transaction đã khóa, server xác minh target tồn tại trong cùng conversation trước khi chấp nhận message mới.

Message projection bổ sung reply object tùy chọn, có giới hạn, gồm original message ID, sequence, sender user ID, safe sender label và preview do server cắt ngắn. Preview được suy ra lúc đọc/project thay vì lưu thêm một bản sao nội dung message vĩnh viễn. History query `beforeSequence` hiện có có thể tải original còn thiếu vì reply projection mang sequence; không cần endpoint message-by-ID riêng.

Nếu một change retention/moderation tương lai xóa original, reply relation trở nên unavailable và UI render placeholder trung tính. Change này không tự bổ sung chức năng xóa message.

Phương án đã cân nhắc: lưu quoted-content snapshot bất biến. Phương án này bị loại vì nếu nội dung bị xóa sau đó, body nhạy cảm vẫn bị nhân bản trong từng reply.

### 4. Thay process-local send throttling bằng PostgreSQL event ledger

Thêm `ChatRateLimitEvent` với scope (`ACCOUNT` hoặc `SOURCE`), subject hash không trong suốt, accepted flag, thời gian attempt UTC và index `(scope, subjectHash, attemptedAt DESC)`. Account subject dùng phép biến đổi một chiều ổn định từ user ID. Network-source subject dùng HMAC-SHA256 với application secret; địa chỉ thô không bao giờ được lưu hoặc trả ra.

Đối với message mới, transaction giải quyết exact idempotent replay trước. Replay trả message ban đầu mà không tiêu tốn allowance. Attempt thực sự mới lấy account và source advisory lock theo thứ tự xác định, đếm accepted event trong active window, tính `Retry-After` từ event liên quan cũ nhất và ghi attempt trong cùng transaction với message acceptance. Vì vậy canonical pair lock, rate lock, eligibility check, cấp message sequence, unread counter, chat outbox và notification aggregate cùng commit hoặc rollback.

Attempt bị từ chối có thể được ghi với `accepted=false` để chẩn đoán abuse nhưng không kéo dài accepted allowance. Một lịch cleanup có giới hạn xóa event cũ hơn mọi configured window, và release verification xác minh cleanup không chạm active window.

Chat report tiếp tục dùng `ReportRateLimitEvent` dựa trên PostgreSQL cùng advisory locking hiện có, được mở rộng để nhận diện chat report receipt. Nhờ đó cả send và report limit đều shared mà không thêm Redis.

Phương án đã cân nhắc: Redis token bucket. Redis sẽ phù hợp khi hệ thống vốn đã cần nó cho multi-replica Socket.IO/presence, nhưng đưa thêm operational dependency chỉ cho change này sẽ mở rộng phạm vi local, CI, deployment, failure và observability. PostgreSQL cung cấp shared correctness cần thiết ở hiện tại.

Phương án đã cân nhắc: fixed counter trên `User`. Nó không biểu diễn được source dimension hoặc retry timing chính xác và tạo hot update không cần thiết trên account row.

### 5. Mở rộng report/case pipeline hiện có bằng chat target có phân biệt kiểu

Mở rộng report target contract và persistence bằng `CHAT_CONVERSATION` và `CHAT_MESSAGE`. `UserReport` có thêm `chatConversationId`, `chatMessageId` và `reportedUserId` tùy chọn; `ModerationCase` có thêm `chatConversationId` và `reportedUserId` tùy chọn. Database check đảm bảo hình dạng target-column hợp lệ cho từng target type. Report giữ target kind ban đầu, còn active chat case được gom theo `(chatConversationId, reportedUserId)` để nhiều message anchor từ cùng harmful participant hội tụ mà không làm mất receipt riêng.

`POST /api/v1/chat/reports` nhận `{ conversationId, messageId?, reasonCode, details? }` cùng `Idempotency-Key`. Server authorize membership, xác minh optional message thuộc conversation, suy ra participant còn lại là reported account, normalize nội dung, tính request digest, enforce durable report limit và tạo/gắn report trong một transaction. Client không gửi hoặc biết moderation case ID hay enforcement state của reported account.

`GET /api/v1/chat/reports` chỉ trả receipt/status có giới hạn của reporter hiện tại để render `Already reported`; không bao giờ lộ reporter được gom nhóm, private note hay decision.

Phương án đã cân nhắc: bảng chat report/case riêng và admin workflow thứ hai. Phương án này bị loại vì assignment, optimistic version, note, idempotent decision, case event và audit hiện có chính là semantics chat cần. Target adapter có phân biệt kiểu giúp giữ một moderation center.

### 6. Bổ sung state machine kiểm duyệt riêng theo target chat

Mở rộng target-specific decision contract bằng:

- `NO_ACTION`;
- `WARN_USER`;
- `RESTRICT_CHAT_TEMPORARY` cùng future UTC expiry bắt buộc;
- `RESTRICT_CHAT_INDEFINITE`;
- `RESTORE_CHAT`.

Outcome product/shop hiện có chỉ còn hợp lệ cho target type hiện tại của chúng. DTO validation và service guard từ chối cross-target outcome trước mutation.

Thêm một current `UserChatRestriction` row cho mỗi user gồm `restrictedAt`, `restrictedUntil` tùy chọn, originating decision ID, version và các field restore. Decision tiếp tục là lịch sử bất biến trong `ModerationDecision`; current row là projection kiểm tra send eligibility hiệu quả. Temporary restriction active khi database time authoritative còn trước `restrictedUntil`; cleanup không cần cho correctness, dù row hết hạn có thể được compact sau. `WARN_USER` tạo public account notification nhưng không thay đổi eligibility.

Một effective decision transaction khóa case và current restriction, kiểm tra `expectedVersion`, kiểm tra idempotency command digest, append decision/event, cập nhật case và restriction, ghi user-safe notification và append privileged audit. Exact replay trả stored response; concurrent stale version không thay đổi gì.

Phương án đã cân nhắc: suspend toàn bộ `User` vì vi phạm chat. Phương án này bị loại vì outcome được duyệt chỉ giới hạn chat, còn account suspension sẽ vô tình vô hiệu hóa mua hàng, bán hàng, login session và capability không liên quan.

### 7. Giữ evidence moderation chat có tham chiếu và có giới hạn

Chat report lưu conversation/message reference và target snapshot có giới hạn gồm safe label/identifier cần thiết nếu account label đổi sau đó. Nó không sao chép toàn bộ conversation. Admin detail tải reported message cùng số lượng message lân cận đã cấu hình sau khi xác minh admin role và target case. Reporter identity được ánh xạ thành case-local opaque ID.

Generic case list không bao gồm message body. Detail projection loại token, address, presence/attention lease, raw network source hash, notification preview, conversation khác và full-history export. Private note chỉ nằm trong admin detail và không bao giờ đi vào privileged audit summary hoặc user notification.

Phương án đã cân nhắc: lưu toàn bộ transcript tại thời điểm report. Phương án này bị loại để giảm dữ liệu, tránh nhân bản storage và tránh rủi ro lộ nội dung riêng tư không liên quan.

### 8. Tái sử dụng một `Notification` aggregate ổn định cho mỗi recipient/conversation

Thêm notification category `CHAT` trong khi giữ type `CHAT_MESSAGE` đã được reserved. Một chat aggregate dùng stable deduplication key suy ra từ recipient và conversation, vì vậy một row đại diện conversation qua nhiều chu kỳ unread. Thêm `activityAt` cho thứ tự/cursor inbox; các non-chat row hiện có khởi tạo từ `createdAt`. Chat metadata gồm version, conversation ID, safe display/avatar, current conversation unread count, newest incoming sequence, bounded preview và latest activity time.

Khi có message mới hợp lệ, message transaction upsert stable notification row: đặt `isRead=false`, xóa `readAt`, cập nhật body/metadata/activity và đặt count từ authoritative unread value của recipient membership. Projection bị replay/outbox-deliver nhiều lần không thể increment dư vì count được replace, không increment heuristic.

Change này chỉ tạo in-app chat notification. Nó không enqueue `NotificationDeliveryAttempt` email row cho `CHAT_MESSAGE`. Per-conversation mute có ưu tiên cao hơn global CHAT in-app preference; global CHAT preference bị tắt cũng suppress aggregate.

Phương án đã cân nhắc: một notification row cho mỗi message rồi group phía client lúc đọc. Phương án này bị loại vì vẫn tạo spam, làm badge count phức tạp và cho phép retry tạo item trùng.

Phương án đã cân nhắc: một active aggregate cộng các historical episode đã archive. Stable row được chọn cho milestone này vì UX đã duyệt hướng conversation-centric và không yêu cầu episode history.

### 9. Dùng PostgreSQL attention lease ngắn để suppress xuyên process

Thêm `ChatAttentionLease` với key gồm authenticated user, session và browser `clientInstanceId`, cùng conversation ID, `atNewestRegion`, `engagedAt` và `expiresAt`. `clientInstanceId` là UUID ngẫu nhiên lưu trong session storage và không bao giờ được chấp nhận làm account identity. Endpoint có xác thực chỉ có thể tạo/refresh hoặc clear lease của chính caller.

`ChatProvider` refresh lease ngắn chỉ khi widget đang mở đúng selected conversation, page visible, user đã focus/click rõ ràng vào conversation và viewport ở newest region. Provider clear theo best effort khi đóng, đổi selection, di chuyển sang lịch sử cũ và logout; expiry là correctness fallback. Message transaction suppress notification aggregation khi tồn tại bất kỳ newest-region lease còn fresh cho recipient/conversation. Nhiều passive tab không tạo lease, còn một engaged tab có thể suppress notification noise dư cho account.

Endpoint là `PUT /api/v1/chat/conversations/:conversationId/attention` với `{ clientInstanceId, engagedAtNewestRegion }`; `false` clear lease của instance đó. Lease không xuất hiện trong participant, presence, notification hay moderation projection.

Phương án đã cân nhắc: selected-conversation state process-local trong Socket.IO. Nó không suppress chính xác khi send và recipient socket được xử lý bởi các process khác nhau và sẽ lặp lại lỗi multi-instance giống rate limiter hiện tại.

Phương án đã cân nhắc: coi socket presence hoặc page visibility là attention. Cả hai đều quá rộng và sẽ suppress notification khi user ở conversation khác hoặc chỉ để page ở foreground.

### 10. Đồng bộ chat read và notification aggregate trong chat transaction

`PUT /api/v1/chat/conversations/:conversationId/read` tiếp tục tăng monotonic watermark. Trong cùng transaction, nó recompute membership unread count và replace metadata count của chat notification aggregate. Khi count về 0, aggregate được mark read; watermark cũ thấp hơn không thể reactivate hoặc làm state lùi.

Các thao tác notification `markRead`/`read-all` chung tiếp tục chỉ tác động notification row. Chúng không giả mạo explicit chat engagement hoặc tăng chat watermark. Vì vậy một notification item đã read vẫn có thể giữ metadata nói rằng conversation còn unread chat message. Mở chat notification đi qua `ChatProvider`, tải conversation, thực hiện explicit read engagement và chỉ sau đó dựa vào chat read transaction để đồng bộ aggregate. Nếu mở thất bại, item vẫn unread.

Realtime outbox projection bổ sung versioned chat safety/notification event chỉ mang authorized changed summary và aggregate notification unread total. Event version không biết hoặc reconnect sẽ kích hoạt authoritative chat/notification refresh. Client không decrement hai badge theo heuristic khi đã có authoritative value.

Phương án đã cân nhắc: mark notification read trước khi mở rồi navigate. Phương án này bị loại vì lỗi load/authorization sẽ làm mất notification mà chưa hiển thị conversation.

### 11. Giữ mọi thao tác thay đổi state authoritative qua REST và project qua outbox

State change mới tiếp tục nằm trên authenticated REST boundary với DTO validation nghiêm ngặt, OpenAPI documentation, no-store response và Problem Details. Socket.IO tiếp tục là channel hội tụ từ server tới client. Attention lease là REST mutation vì nó ảnh hưởng notification eligibility và cần cùng boundary có xác thực, shared, kiểm thử được.

Block, mute, moderation decision, read và notification change append deduplicated chat outbox projection trong transaction commit của chúng khi tab/participant khác cần hội tụ. Bounded dispatcher hiện có và reconnect REST recovery tiếp tục là durability model.

Phương án đã cân nhắc: thực hiện block/mute/attention mutation qua custom socket acknowledgement. Phương án này bị loại vì sẽ chia validation, auth refresh, idempotency, OpenAPI và failure behavior qua hai protocol.

### 12. Mở rộng contract theo hướng additive và phân loại failure bằng stable problem type

Conversation summary thêm `notificationsMuted`, `blockedByMe`, còn `canMessage` chung hiện có tiếp tục là disclosure duy nhất về eligibility của participant còn lại. Message thêm `replyTo` tùy chọn; send thêm `replyToMessageId` tùy chọn. Notification metadata trở thành variant `CHAT_MESSAGE` có discriminator. Moderation target/outcome union được mở rộng, với target-specific validator ngăn tổ hợp không hợp lệ.

Problem Details mới gồm invalid reply, block/mute target unavailable, already-reported receipt, report validation, report/send rate limit với `retryAfterSeconds`, stale moderation version, invalid chat moderation transition và temporary unavailability. Forbidden response không bao giờ lộ block direction, restriction cause, report existence của user khác hoặc private moderation state.

Mọi additive parser tiếp tục strict về exact key trong versioned variant của nó. Payload notification và product/shop moderation hiện có không thay đổi.

### 13. Ma trận xác minh API

- `GET /api/v1/chat/conversations`: projection mute/block/canMessage, pagination/search ổn định, privacy và tương thích summary hiện có.
- `GET /api/v1/chat/conversations/:conversationId/messages`: reply projection, page overlap, original nằm ngoài history đã tải, unavailable reference và participant authorization.
- `POST /api/v1/chat/messages`: optional reply target, same-conversation validation, request-digest conflict, block/restriction enforcement, shared account/source limit, first-send race, notification aggregation và outbox atomicity.
- `PUT|DELETE /api/v1/chat/conversations/:conversationId/mute`: participant authorization, idempotent toggle, multi-tab convergence, không mutate unread và notification suppression.
- `PUT|DELETE /api/v1/chat/users/:userId/block`: directed disclosure, từ chối self/unrelated, idempotent toggle, block hướng ngược lại, concurrent send serialization và retained history.
- `PUT /api/v1/chat/conversations/:conversationId/attention`: caller/session/client-instance binding, explicit engagement, newest-region state, expiry, clear, session revocation và non-participant denial.
- `POST /api/v1/chat/reports`: conversation/message authorization, reason/detail validation, suy ra reported-user không trong suốt, exact replay/conflict, duplicate target behavior, shared report limit và atomic case attachment.
- `GET /api/v1/chat/reports`: receipt chỉ của caller, filter/pagination, already-reported state và không lộ case/private-note.
- `GET /api/v1/account/notifications` và `/unread-count`: CHAT filter, stable activity cursor, bounded metadata, aggregate ordering/count, muted behavior và non-chat regression.
- `POST /api/v1/account/notifications/:notificationId/read` và `/read-all`: semantics chỉ notification, giữ chat metadata và không mutate chat watermark.
- `GET /api/v1/admin/moderation/cases` và `/:caseId`: chat filter, bounded evidence, opaque reporter, target-specific projection, admin authorization và product/shop regression.
- Các endpoint moderation assign/note/decision hiện có: chat outcome validation, expiry/private note bắt buộc, optimistic version conflict, idempotency, reversal, restriction/notice/event/audit atomicity và cross-target rejection.
- `GET /api/v1/admin/audit`: lọc chat moderation, exactly-once entry và loại content/private-note/source-hash.
- Socket.IO projection: block/mute/eligibility, accepted reply, grouped notification total, read synchronization, reconnect recovery, unknown-version fallback và nhiều tab.

### 14. Hành vi frontend theo các state machine UI/UX đã duyệt

Contact và message menu dùng state chỉ một menu được mở, đóng khi click ngoài/Escape, phục hồi focus, target 44 × 44 px, anchored popover/action sheet responsive và không reflow list/message. Reply composition lưu `{ messageId, sequence, senderLabel, preview }` tách khỏi draft text; cancel chỉ xóa reference. Report/block dialog giữ input khi lỗi có thể khôi phục và ngăn submit trùng.

Admin page bổ sung tab Chat trong khi giữ hành vi Cases/Reviews hiện có. Chat list card không chứa message body; chọn case mới tải detail và bounded context. Decision chỉ hiển thị action hợp lệ cho target, yêu cầu confirm rõ ràng cùng note/expiry khi quy định và refresh khi optimistic conflict.

Notification bell/inbox nhận diện metadata `CHAT_MESSAGE` và gọi provider thay vì `window.location.assign`. Notification type khác giữ navigation hiện tại. CHAT category filter và muted marker dùng text/icon ngoài tín hiệu màu.

### 15. Xác minh theo nhiều lớp và giữ gate môi trường thật tách biệt mock

- Contract test bao phủ exact-key parser, discriminated variant, state reply/report/restriction, metadata privacy và backward-compatible fixture hiện có.
- API unit/Jest test bao phủ validation, transaction composition, target-specific moderation guard, notification projection và Problem Details.
- PostgreSQL opt-in test bao phủ block/send race, shared allowance qua các service instance độc lập, reply constraint/idempotency, report/case convergence, aggregate upsert race, read synchronization, attention expiry, decision conflict, restriction enforcement, audit exactly-once và migration check.
- Component test bao phủ contact/message menu, focus restoration, giữ reply draft, dialog, muted badge behavior, notification-to-provider handoff, admin queue/detail, error state, reduced motion và không horizontal overflow.
- Real Playwright dùng fixture account xác định, ít nhất hai browser context và nhiều tab để kiểm tra block/unblock, mute/unmute, reply navigation, report submission, notification suppression/aggregation/opening, admin resolution, restriction propagation, reconnect và accessibility tại 360 × 800, 768 × 1024 và 1440 × 900.
- CI giữ mocked UI test có nhãn riêng và mở rộng PostgreSQL/Socket.IO chat gate chuyên biệt để database test bị skip làm job fail.

## Rủi ro / Đánh đổi

Các ví dụ dưới đây giải thích hậu quả bằng ngôn ngữ đời thường; các biện pháp kỹ thuật ở mỗi dòng vẫn được giữ nguyên.

- [PostgreSQL rate event và attention lease làm tăng write volume] → Giữ window/lease ngắn, index expiry query, cleanup theo batch, không refresh khi widget passive và chỉ expose aggregate operational metric không có subject.
  - Ví dụ dễ hiểu: Khi rất nhiều người cùng gửi tin liên tục, việc ghi nhớ từng lần có thể làm hệ thống nặng hơn. Vì vậy chỉ ghi nhớ trong khoảng ngắn và dọn các dấu vết cũ theo từng đợt.
- [Notification aggregation một row làm mất inbox history theo từng episode] → UX đã duyệt theo conversation; giữ latest activity và unread metadata, chỉ xem lại episode nếu yêu cầu product phát sinh.
  - Ví dụ dễ hiểu: Nếu một người gửi 5 tin liền, chuông chỉ hiện một mục “5 tin mới từ Lan” thay vì 5 mục. Người dùng vẫn xem được tin mới nhất và tổng số tin chưa đọc.
- [Mở rộng generic moderation union có thể gây regression case product/shop] → Dùng validation/projection phân biệt theo target, additive migration, exhaustive contract test và chạy toàn bộ moderation regression suite hiện có.
  - Ví dụ dễ hiểu: Thêm nút Chặn trong chat không được làm hỏng nút Ẩn sản phẩm hoặc xử lý shop. Mỗi nút chỉ tác động đúng phần mình phụ trách.
- [Race block/send và notification/read trải qua nhiều row] → Dùng thứ tự advisory/row lock xác định và giữ message, membership, rate event, notification aggregate, outbox cùng audit trong transaction có giới hạn.
  - Ví dụ dễ hiểu: Nếu một người bấm Chặn đúng lúc người kia bấm Gửi, tin đã đi trước khi chặn vẫn còn; tin gửi sau đó không tới. Số tin chưa đọc cũng không được tự nhiên tăng lại sau khi đã đọc.
- [Attention lease cũ có thể suppress quá mức] → Bind với authenticated session và client instance, bắt buộc explicit newest-region engagement, expiry ngắn, clear best effort và xác minh expiry/session revocation.
  - Ví dụ dễ hiểu: Một người mở chat rồi rời máy. Nếu vẫn coi là đang xem, tin mới sẽ không hiện báo. Vì vậy trạng thái xem chỉ giữ trong thời gian ngắn; hết thời gian thì tin mới lại báo bình thường.
- [Admin evidence làm lộ private message] → Chỉ tải authorized bounded window, dùng opaque reporter, loại content khỏi list/audit/log và kiểm thử response serialize không có field bị cấm.
  - Ví dụ dễ hiểu: Khi có báo cáo một tin, quản trị viên chỉ xem tin bị báo và một ít tin ngay trước hoặc sau để hiểu tình huống; không mở toàn bộ cuộc trò chuyện và không thấy danh tính người báo.
- [Stable notification row được reactivate sau khi read] → Sắp xếp bằng `activityAt`, replace authoritative unread metadata và kiểm thử cursor stability khi conversation cũ hoạt động lại.
  - Ví dụ dễ hiểu: Bạn đã đọc hết tin của shop A nên chuông về 0. Shop A gửi tin mới, mục của shop A trở lại đầu danh sách và hiện số mới; không tạo thêm mục thứ hai cho cùng shop.
- [Temporary restriction expiry có thể được client quan sát lệch thời gian] → Suy ra eligibility từ server/database UTC và trả authoritative expiry; client chỉ hiển thị và refresh tại/sau thời điểm đó.
  - Ví dụ dễ hiểu: Nếu quản trị viên hạn chế gửi tin đến 15:00, dù đồng hồ trên máy người dùng chạy nhanh hay chậm, họ chỉ gửi lại được khi giờ chung đã qua 15:00.

## Kế hoạch migration

1. Xác minh migration status/checksum hiện tại và chạy toàn bộ baseline Change 1/2, notification, moderation và audit.
2. Apply forward-only Prisma migration thêm block, reply, mute, shared rate, attention, chat report/case, restriction, notification activity, enum, index và check constraint. Backfill `Notification.activityAt = createdAt` và giữ nguyên chat membership/message hiện có.
3. Deploy additive contract và API read compatibility trước khi bật web control mới; client hiện tại bỏ qua field mới.
4. Bật shared send throttling và xóa process-local map chỉ sau khi PostgreSQL concurrency cùng cleanup test pass.
5. Bật block/mute/reply/report và chat moderation endpoint, sau đó bật notification aggregation/attention lease cùng realtime projection.
6. Chạy release theo thứ tự mở rộng: migration/checksum → contract/unit → PostgreSQL shared-state/concurrency → real Socket.IO multi-client → Playwright breakpoint/accessibility → full regression/build/lint.
7. Rollback application code bằng cách để additive table/column không được dùng. Không reverse enum value hoặc drop safety/audit data đã có trong application rollback. Một forward migration được review sau này mới được xóa cấu trúc không dùng sau khi xem xét retention/export.

Database rollback trước khi có production data có thể restore snapshot trước change. Sau khi report, block, restriction hoặc audit record tồn tại, rollback chỉ dành cho code vì xóa các record đó sẽ phá hủy lịch sử an toàn.
