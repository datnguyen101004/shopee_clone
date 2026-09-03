## Bối cảnh

Xem `proposal.md` để biết động cơ và bốn delta spec để biết hành vi có thể quan sát. T17 hiện sở hữu ranh giới tính giá thuần `mock-v1`, tính phí theo vùng tỉnh và khối lượng. T19 lưu snapshot vận chuyển và tổng tiền bất biến cho từng shop order. T20 sở hữu vòng đời tổng quát của đơn buyer và timeline đơn bất biến. T25 sở hữu quá trình seller chuẩn bị hàng, tạo đúng một shipment `MOCK` trong transaction khi bàn giao và dừng tracking tại `HANDED_OFF`.

T33 phải mô phỏng đúng hình dạng của một tích hợp hãng vận chuyển thật nhưng không liên hệ hãng hoặc dịch vụ bản đồ thật. Change đi qua pricing, checkout, seller handoff, một carrier local chạy tách biệt, dispatch bất đồng bộ, callback có chữ ký, đồng bộ vòng đời đơn, projection buyer/seller, một cổng carrier riêng dùng chung đăng nhập, hai ranh giới sở hữu PostgreSQL và UI responsive. Các order snapshot `mock-v1` và shipment legacy phải tiếp tục đọc được và không được thay đổi dữ liệu tài chính.

## Mục tiêu / Ngoài phạm vi

**Mục tiêu:**

- Thiết lập ranh giới adapter quote/register/track không phụ thuộc provider và được một Demo Carrier local sử dụng qua HTTP.
- Bảo đảm cách tính phí theo khoảng cách có tính quyết định, do server làm chủ, giải thích được và không phụ thuộc geocoding công khai.
- Tách seller handoff khỏi tình trạng sẵn sàng của carrier bằng dispatch bền vững và idempotent.
- Đồng bộ sự kiện bên ngoài có chữ ký đúng một lần vào một trạng thái shipment và vòng đời đơn hiện có.
- Cung cấp console demo local an toàn mà không trao quyền carrier cho actor marketplace thông thường.
- Giữ nguyên mọi tổng tiền và snapshot lịch sử đã commit trong khi bổ sung hành vi mới có version.

**Ngoài phạm vi:**

- Đặt đơn với hãng thật, nhãn vận chuyển, phân công tài xế, GPS, tối ưu tuyến đường, đặt lịch lấy hàng, thanh toán carrier hoặc liên hệ người nhận.
- Bật cổng operations mô phỏng `/carrier` trên production.
- Nhiều kiện cho một shop order, chia fulfillment, giao một phần, cross-docking hoặc ngày hẹn giao lại.
- Tự động nhập lại tồn kho sau khi kiện chưa giao được hoàn về shop.
- Thay thế luồng shipment hoàn hàng của buyer trong T29 hoặc dùng trạng thái hoàn hàng outbound cho return sau giao hàng.
- Cam kết khoảng cách mô phỏng bằng tuyến đường thật hoặc biểu phí thương mại của carrier.

## Quyết định

### 1. Chạy Demo Carrier như một workspace service local cô lập

Thêm `apps/demo-carrier`, một NestJS service nhỏ có Prisma schema và PostgreSQL database riêng (`shopee_clone_demo_carrier`) trong Docker Compose. Service sở hữu các bản ghi quote, shipment, operation command, event và command idempotency mang dáng dấp hệ thống bên ngoài. Marketplace chỉ sở hữu projection shipment đã chuẩn hóa, trạng thái dispatch, callback receipt và tác động lên order.

Marketplace giao tiếp qua transport contract có version trong `packages/contracts`; không marketplace service nào import persistence hoặc domain service của Demo Carrier. Demo Carrier không cần mạng công khai và không được khởi động hoặc định tuyến như dependency production. UI operations vẫn nằm trong ứng dụng Next.js hiện có dưới route group riêng `/carrier` và chỉ tiếp cận carrier qua các marketplace proxy endpoint được `CARRIER_OPERATOR` bảo vệ.

Local service contract dùng `POST /internal/v1/quotes`, `POST /internal/v1/shipments`, `GET /internal/v1/shipments`, `GET /internal/v1/shipments/:shipmentReference` và `POST /internal/v1/shipments/:shipmentReference/actions`. Mọi route đều được service authentication bảo vệ và không bao giờ được browser code gọi trực tiếp.

Phương án đặt bảng carrier trong marketplace database bị loại vì dùng chung transaction sẽ che mất hành vi lỗi, retry, signature và reconciliation mà T33 cần kiểm thử. Carrier in-memory bị loại vì không thể chứng minh idempotency hoặc recovery sau restart.

### 2. Dùng location snapshot tổng hợp cấp quận/huyện có tính quyết định

Tạo một tài nguyên Demo Carrier được sinh sẵn, có version và không phụ thuộc framework, gồm:

- 63 định danh tỉnh legacy hiện có và các điểm neo tỉnh gần đúng, ổn định;
- 696 định danh quận/huyện legacy hiện có cùng alias;
- một điểm tổng hợp cho mỗi quận/huyện, được tạo có tính quyết định bên trong bán kính giới hạn quanh điểm neo tỉnh;
- version snapshot và digest được test xác minh.

Marketplace chuẩn hóa province và district của pickup/delivery thành code trước khi gọi carrier. Carrier chỉ nhận code, không nhận tên, số điện thoại, phường/xã hoặc address line. Nếu không xác định duy nhất được district, quote của shop bị chặn; không có fallback “vùng không rõ” với phí rẻ hơn. Cặp địa chỉ cùng district dùng ước tính local có version và mức tối thiểu 3 km.

Với `demo-distance-v1`, Demo Carrier tính khoảng cách Haversine giữa các điểm đã commit, nhân `1.25`, làm tròn lên thành kilometer nguyên, áp dụng tối thiểu 3 km và từ chối kết quả vượt 2.000 km. Số thực chỉ được dùng cho ước tính địa lý; mọi phép tính tiền dùng số nguyên đã kiểm tra.

Gọi Nominatim/Google Maps lúc chạy bị loại vì cần credential, làm lộ riêng tư, chịu rate limit, khiến test không ổn định và phụ thuộc mạng. Chỉ dùng centroid tỉnh bị loại vì mọi chuyến trong cùng một tỉnh sẽ có cùng khoảng cách.

### 3. Version hóa biểu phí khoảng cách và khối lượng chính xác

Demo Carrier sở hữu `demo-distance-v1` với bảng dịch vụ và giá khai báo trong `distance-based-demo-shipping/spec.md`. Kết quả trả về gồm:

- định danh provider và mô phỏng;
- version phép tính và location snapshot;
- định danh location pickup/delivery chuẩn cùng mức độ phân giải;
- kilometer đường thẳng và quãng đường tính phí;
- service, khối lượng, khoảng thời gian giao;
- các thành phần base, near-distance, long-distance, weight và tổng tiền VND nguyên.

Near-distance block áp dụng cho mỗi 5 km bắt đầu vượt 5 km đến 50 km. Long-distance block áp dụng cho mỗi 100 km bắt đầu vượt 50 km. Extra-weight block áp dụng cho mỗi 500 g bắt đầu vượt 500 g. Shared contract guard xác minh phương trình chính xác thay vì tin mù quáng vào tổng tiền carrier.

`PricingQuoteService` hiện có vẫn tải commerce snapshot nhất quán, có thẩm quyền và gom một shipment cho mỗi shop, nhưng ủy quyền phần shipping qua `CarrierQuotePort`. Cart quote, checkout preview và checkout confirmation dùng cùng port; confirmation tính lại rồi lưu response được chấp nhận vào `ShopOrder.shippingSnapshot`. Browser không tự tính khoảng cách hoặc tiền.

Sửa trực tiếp `mock-v1` bị loại vì contract guard, test và order snapshot lịch sử phải tiếp tục diễn giải được. Lưu cart quote tạm thời bị loại vì checkout đã có ranh giới fingerprint/tính lại và biểu phí Demo Carrier có tính quyết định.

### 4. Mở rộng strict shared contracts mà không làm hỏng snapshot lịch sử

Dùng discriminated shipping union theo `provider` và `version`:

- legacy `{ provider: "MOCK", version: "mock-v1", ... }` tiếp tục đọc được;
- mới `{ provider: "DEMO_CARRIER", version: "demo-distance-v1", ... }` chứa thành phần khoảng cách.

Response checkout và pricing chuyển sang outer version mới, còn projector order lịch sử tiếp tục chấp nhận cả hai biến thể snapshot. Projection shipment mới cho seller/buyer cũng chấp nhận shipment lịch sử `MOCK/HANDED_OFF` ở chế độ chỉ đọc và shipment tracking `DEMO_CARRIER` mới.

Object lỏng với field khoảng cách tùy chọn bị loại vì có thể trộn công thức legacy và mới hoặc âm thầm thiếu invariant. Viết lại JSON snapshot legacy bị loại vì sẽ thay đổi bằng chứng đã commit.

### 5. Biến seller handoff thành local transaction cộng durable outbox

Giữ endpoint seller action hiện tại cùng semantics ETag/idempotency. Transaction `HAND_OFF` vẫn lock `ShopOrder` thuộc sở hữu và fulfillment, rồi thực hiện nguyên tử:

1. chuyển fulfillment sang `HANDED_OFF` và order sang `SHIPPING`;
2. tạo đúng một shipment `DEMO_CARRIER` ở `REGISTRATION_PENDING` với tracking code công khai `DEMO-...` có tính quyết định và version 0;
3. thêm sự kiện shipment, fulfillment và order ban đầu;
4. tạo đúng một `CarrierDispatchOutbox` chỉ chứa các shipment fact bất biến, có giới hạn.

Tracking code được sinh từ order reference và danh tính idempotency của seller handoff nên xuất hiện ngay và ổn định khi replay. Outbox dispatcher claim các dòng đến hạn theo batch nhỏ bằng PostgreSQL `FOR UPDATE SKIP LOCKED`, ghi lease/attempt, commit việc claim, gọi Demo Carrier bên ngoài transaction, sau đó áp dụng strict response trong transaction thứ hai ngắn. Shipment reference được dùng làm carrier idempotency identity.

Gọi Demo Carrier bên trong seller transaction bị loại vì HTTP chậm hoặc mất response sẽ giữ lock và để lại external side effect không xác định. Chỉ chuyển order sang `SHIPPING` sau khi remote chấp nhận bị loại vì seller đã hoàn thành local handoff; outage phải được thể hiện là registration pending chứ không hoàn tác business action.

### 6. Giới hạn retry, failure và manual recovery

Dispatch dùng exponential backoff có jitter, delay tối đa, ngân sách số lần tự động hữu hạn, `nextAttemptAt`, claim lease ngắn và recovery lease bị bỏ dở. Các nhóm response an toàn:

- success hoặc equivalent replay: áp dụng remote identity và `CREATED` đúng một lần;
- timeout/5xx tạm thời: lên lịch bounded attempt tiếp theo;
- schema/idempotency conflict cuối cùng: đánh dấu `REGISTRATION_FAILED` và giữ mã vận hành đã làm sạch;
- hết lượt lỗi tạm thời: đánh dấu `REGISTRATION_FAILED` nhưng giữ nguyên shipment và lịch sử outbox.

Hành động retry của carrier operator có thể yêu cầu một lần thử khác bằng cách tạo dispatch cycle mới cho cùng shipment identity; không thể tạo shipment mới. Metric cung cấp queue depth, tuổi của mục đến hạn cũ nhất, số lần thử, success, temporary failure, conflict và callback outcome mà không gắn nhãn shipment/customer.

Retry vô hạn bị loại vì record lỗi có thể quay vòng mãi. Hoàn tác seller handoff hoặc tạo giả carrier acceptance sau khi hết lượt bị loại vì đều mô tả sai external state đã commit.

### 7. Xác thực service call và callback bằng HMAC có timestamp

Internal request marketplace-to-carrier dùng `X-Demo-Carrier-Timestamp`, `X-Demo-Carrier-Key-Id` và `X-Demo-Carrier-Signature`. Callback từ Demo Carrier dùng các header tương ứng. Signature v1 là HMAC-SHA256 trên:

```text
<unix-seconds>.<HTTP-method>.<path>.<raw-body-bytes>
```

Quá trình xác minh dùng raw body chính xác, constant-time digest comparison, active key ID, cửa sổ thời gian năm phút, giới hạn kích thước body, JSON content type và strict payload contract. Secret đến từ local environment/CI secret injection, không bao giờ từ file repository hoặc mã browser. Previous key ID có thể được chấp nhận khi rotate local, còn sự kiện mới chỉ dùng active key.

User-session authentication bị loại cho service callback vì không có browser user. Static bearer token không ký request bị loại vì không phát hiện body bị sửa hoặc giới hạn replay của request bị thu thập.

### 8. Tách callback receipt khỏi tracking event có hiệu lực

Marketplace persistence bổ sung:

- shipment provider, normalized status, version, external ID, timestamp registered/delivered/returned/last-update;
- `SellerOrderShipmentEvent` bất biến có hiệu lực với previous/result status, shipment version, external event ID, public reason, carrier occurrence time và marketplace receipt time;
- `CarrierCallbackReceipt` theo `(provider, externalEventId)` với payload digest, outcome giới hạn (`APPLIED`, `DUPLICATE`, `STALE`, `CONFLICT`, `REJECTED`) và liên kết an toàn;
- `CarrierDispatchOutbox` với attempt, lease, lần thử tiếp theo, result và safe error code.

Event ID/digest trùng hoàn toàn sẽ replay acknowledgement đã lưu. Dùng lại event ID với digest khác sẽ conflict. Transition hợp lệ về chữ ký nhưng stale chỉ lưu receipt outcome, không tạo timeline event có hiệu lực. Event có hiệu lực được sắp theo shipment version; UI hiển thị carrier occurrence time và chỉ thêm receipt time khi cần giải thích độ trễ.

Lưu mọi retry thành tracking event bị loại vì timeline buyer/seller sẽ bị trùng. Bỏ callback stale/conflict mà không có receipt bị loại vì operator không thể giải thích reconciliation.

### 9. Đồng bộ shipment và order state trong cùng transaction

Đồ thị trạng thái Demo Carrier chuẩn hóa được định nghĩa trong `external-shipment-tracking/spec.md`. Callback reconciliation mở một transaction, lock shipment, xác minh current version/state rồi lock order liên quan để thực hiện tác động terminal. Không command nào sau handoff được lock cùng cặp theo thứ tự ngược lại.

Carrier state chưa terminal giữ `ShopOrder.status = SHIPPING`. `DELIVERED` tạo nguyên tử shipment `DELIVERED`, shipment event, order `DELIVERED`, order version tăng một lần và system order timeline event. `RETURNED` của kiện chưa giao tạo nguyên tử shipment `RETURNED`, order `CANCELLED` và reason `CARRIER_RETURNED_UNDELIVERED`.

Carrier return không tự động khôi phục inventory. Kiện hàng đã được hoàn lại về mặt mô phỏng nhưng tình trạng chưa được đánh giá; seller inventory adjustment vẫn phải rõ ràng và có audit. Luồng này cũng không đi vào aggregate return/refund sau giao hàng của T29, vốn chỉ bắt đầu từ order đã delivered.

Ánh xạ outbound return vào giá trị order `RETURNED` hiện có bị loại vì giá trị đó đại diện cho buyer return sau giao hàng. Giữ carrier return terminal mãi dưới trạng thái tổng quát `SHIPPING` bị loại vì list/detail sẽ không bao giờ kết thúc. Thêm một order enum tổng quát khác bị loại trong change này vì `CANCELLED` kèm reason ổn định đã diễn đạt kết quả cuối chưa giao được.

### 10. Dùng chung authentication với role và route group riêng cho carrier

Mở rộng RBAC role enum và assignment hiện có bằng `CARRIER_OPERATOR`, seed một tài khoản operator local có tính quyết định và cho phép user nhiều role giữ nguyên mọi role hiện có. Shared login, refresh, logout, session revocation, CSRF/Origin protection và account status rule vẫn là nguồn có thẩm quyền. Khi người chưa đăng nhập mở carrier URL được bảo vệ, hệ thống giữ return target cùng origin đã xác minh; sau login chỉ quay lại đó nếu role vẫn còn.

Thêm route Next.js chỉ dành cho local/test `/carrier`, `/carrier/shipments` và `/carrier/shipments/[trackingCode]` với Carrier Portal layout riêng thay vì storefront, Seller Center hoặc admin chrome. Dashboard và các trang gọi marketplace endpoint:

- `GET /api/v1/carrier/operations/dashboard`
- `GET /api/v1/carrier/operations/shipments`
- `GET /api/v1/carrier/operations/shipments/:trackingCode`
- `POST /api/v1/carrier/operations/shipments/:trackingCode/actions`

Mọi endpoint yêu cầu `CARRIER_OPERATOR`, DTO chính xác, response private no-store và non-production execution profile; mutation còn yêu cầu browser Origin protection, ETag và UUID idempotency key. API proxy command có giới hạn tới Demo Carrier bằng service HMAC, sau đó chỉ chờ direct callback acknowledgement trong khoảng ngắn có giới hạn; nếu synchronization vẫn pending, trả `202` cùng operation reference có thể refresh thay vì báo thành công giả.

Dashboard count và attention list được tính từ safe normalized marketplace shipment projection. Search/filter/cursor state nằm trong URL để list context tồn tại qua refresh và điều hướng detail. List response bỏ name, phone number, full address line, payment data và callback internal; detail chỉ thêm shop identity, pickup/delivery area, service, distance, weight, fee, state và effective event cần cho mô phỏng.

Command hợp lệ được suy ra từ state: `ADVANCE`, `FAIL_DELIVERY`, `RETRY_DELIVERY`, `START_RETURN`, `ADVANCE_RETURN` và `RETRY_REGISTRATION`. Service không bao giờ nhận target state tùy ý. Delivery failure dùng reason có kiểm soát; chỉ note nội bộ có giới hạn đi cùng `OTHER`, và note đó không bao giờ vào projection buyer/seller.

Cho browser gọi thẳng Demo Carrier bị loại vì sẽ lộ service credential và carrier authority. Dùng lại `ADMIN` hoặc `SELLER` bị loại vì quản trị marketplace và sở hữu order không đồng nghĩa carrier-operator authority. Tạo thêm website khác bị loại vì user đã chọn một route group `/carrier` và dùng chung authentication/session system.

### 11. Triển khai fast demo mode như một chuỗi browser có thể hủy

“Chạy nhanh hành trình thành công” gọi lặp lại cùng one-step carrier-operator action với idempotency key mới chỉ sau khi quan sát được authoritative state của bước trước. `AbortController`, kiểm tra component còn mounted/page còn visible và thao tác pause rõ ràng sẽ dừng call tương lai. Conflict hoặc error dừng chuỗi và refresh detail.

Không thêm endpoint server `SKIP_TO_DELIVERED` hoặc background automation bền vững. Cách này giữ mọi callback trung gian có chữ ký cùng reconciliation path trong phạm vi kiểm thử, và rời trang sẽ tự nhiên dừng trình diễn.

### 12. Mở rộng projection buyer/seller và refresh mà không tạo kênh realtime mới

Mở rộng contract buyer và seller order detail bằng discriminated tracking projection. Buyer vẫn được giới hạn theo owner; seller vẫn được giới hạn theo active-approved-shop owner. Cả hai dùng cùng normalized event row nhưng áp dụng nhãn phù hợp role. Queue response chỉ chứa safe current-state summary và không có thông tin liên hệ người nhận.

Order detail đang hiển thị poll theo interval vừa phải, refresh ngay khi focus/reconnect, pause khi hidden, hủy request bị thay thế và xác minh toàn response trước khi thay. Timeline tuân thủ UI/UX đã duyệt: tự hiện event mới khi đang gần newest region; nếu không thì giữ vị trí đọc và hiện “Có cập nhật mới”. Cách này tránh thêm hạ tầng WebSocket/SSE chỉ cho tracking demo tần suất thấp.

### 13. Dùng contracts, test hai database và hành trình UI làm release gate

Kiểm thử được chia lớp:

- bảng test thuần cho location normalization, snapshot digest, Haversine/road factor, band boundary, weight block, checked money và cả hai state machine;
- shared contract test cho exact request/response union, signature, ETag, cursor, idempotency và Problem Details;
- Demo Carrier PostgreSQL test cho quote determinism, command idempotency, state race, event emission và persistence qua restart;
- marketplace PostgreSQL test cho migration/backfill, outbox claim/lease recovery, lost response, callback duplicate/digest conflict, stale event, terminal race, atomic order reconciliation và rollback injection;
- adapter contract test chạy marketplace với Demo Carrier local qua HTTP;
- web component test cho quote invalidation, fee detail, tracking refresh/scroll, quyền carrier role, layout/dashboard/list/detail riêng, dialog, fast-mode pause và trạng thái responsive/accessibility;
- `test:e2e:demo-carrier:quick` ở 360/768/1440 cho checkout quote → COD order → seller handoff → carrier operator cập nhật state → buyer delivered tracking, cộng một fixture delivery-failed/return.

Các focused regression checkout, seller-order, buyer-order và homepage vẫn là gate cuối; test không bao giờ gọi internet công khai.

## Rủi ro / Đánh đổi

- **[Khoảng cách tổng hợp có thể bị hiểu là tuyến đường thật]** → Gắn nhãn gần đúng và mô phỏng ở mọi nơi, hiển thị version location/rate, tránh câu chữ maps/GPS và không tái sử dụng làm cam kết carrier thật.
- **[Một local service và database riêng làm setup phức tạp hơn]** → Thêm một Docker Compose profile với health check, migration/seed có tính quyết định, hướng dẫn khởi động một lệnh và focused test orchestration.
- **[Carrier chấp nhận đăng ký nhưng response bị mất]** → Dùng external idempotency ổn định, durable outbox, strict response identity check và replay trước khi tạo replacement intent.
- **[Outbox worker có thể claim cùng một dòng đến hạn]** → Dùng lease ngắn cộng `FOR UPDATE SKIP LOCKED`, hoàn thành lease có điều kiện, batch giới hạn và test recovery lease bị bỏ dở.
- **[Xác minh callback có chữ ký có thể lỗi sau body parsing hoặc do lệch đồng hồ]** → Giữ raw byte có giới hạn trước khi parse JSON, constant-time compare, dùng UTC, chấp nhận cửa sổ năm phút và test boundary/skew.
- **[Callback đến trễ có thể kéo tracking lùi]** → Xác minh theo current shipment version/state, lưu stale receipt riêng và chỉ thêm forward transition có hiệu lực.
- **[Callback delivered và returned có thể race]** → Luôn lock shipment rồi order và chỉ cho một terminal transition cùng order event tương ứng commit.
- **[Carrier return hủy order mà không tự restock]** → Dùng lifecycle reason riêng, giữ sold inventory đến khi seller kiểm tra/adjust rõ ràng và nêu giới hạn trong seller copy cùng test.
- **[Field quote mới có thể làm hỏng reader snapshot cũ]** → Dùng strict provider/version union, giữ projector và fixture legacy, không viết lại JSON hoặc total `mock-v1` đã commit.
- **[Carrier portal có thể làm lộ dữ liệu riêng tư hoặc trao quyền qua marketplace role khác]** → Yêu cầu `CARRIER_OPERATOR` riêng trên mọi page/API, giữ tổ hợp role deny-by-default, proxy qua marketplace authorization, bỏ contact/address/payment detail, dùng no-store và trả unavailable trên production.
- **[Polling làm tăng lưu lượng đọc]** → Chỉ poll detail page đang visible theo interval vừa phải, pause khi hidden, refresh khi focus/reconnect và hủy request bị thay thế.

## Kế hoạch migration

1. Thêm transport/snapshot union dùng chung và demo-location resource được sinh sẵn cùng test digest có tính quyết định, đồng thời giữ mọi contract hiện có hợp lệ.
2. Thêm Demo Carrier app, migration/seed cho database cô lập, internal HMAC middleware, endpoint quote/register/read/action và health check local Compose.
3. Chạy marketplace migration dạng additive cho provider/status mới, shipment version/external timestamp, field effective event, callback receipt, dispatch outbox, constraint và index. Giữ dòng `MOCK/HANDED_OFF` làm dữ liệu lịch sử chỉ đọc; không viết lại order snapshot hoặc tổng tiền.
4. Deploy marketplace carrier contract, adapter, outbox dispatcher, callback endpoint và observability. Xác minh registration replay, lease recovery, signature rejection, stale callback và terminal race trước khi chuyển pricing.
5. Chuyển phép tính cart/checkout mới sang `demo-distance-v1`, cập nhật immutable order writing/projector và giữ reader quote legacy.
6. Thêm role/seed assignment `CARRIER_OPERATOR`, deploy tracking UI buyer/seller và local `/carrier` portal, sau đó chạy contract, migration, integration hai database, responsive component và focused E2E gate.
7. Rollback sẽ tắt lựa chọn quote mới và `/carrier` portal trước, dừng claim dispatch mới nhưng giữ nguyên dữ liệu role, shipment, outbox, receipt và event dạng additive. Có thể khôi phục `mock-v1` cho preview mới trong khi snapshot `demo-distance-v1` đã commit và lịch sử tracking terminal vẫn đọc được. Không xóa audit row của carrier hoặc marketplace trong rollback thông thường.
