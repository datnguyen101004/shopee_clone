## Bối cảnh

Xem `proposal.md` về lý do và phạm vi. Trải nghiệm đã thống nhất nằm tại `../../../docs/ui-ux/t35-implement-sku-flash-sale.md`. Đây là bản Việt hóa tương ứng của `design.md`.

Repository đã có `MarketplaceCampaign`, `SellerCampaignProduct.discountBasisPoints` ở cấp sản phẩm, `ProductPromotionReservation` chống trùng lịch khuyến mãi và `ScheduledDiscountService` dùng chung cho catalog/báo giá. Reservation khuyến mãi đó là ràng buộc lịch, không phải tồn kho hay suất giữ cho người mua. `CheckoutService.confirmCod` đã dùng transaction serializable, idempotency, giữ/tiêu thụ tồn kho và tiêu thụ voucher. Luồng Buyer hủy đơn và Seller từ chối đã hoàn tồn kho qua nghiệp vụ đơn hàng. Mở rộng các đường này thay vì tạo checkout hoặc sổ tồn kho thứ hai.

Nền tảng campaign và change tách CMS đã hoàn tất là các phần phụ thuộc. Một số checkbox campaign cũ hơn code hiện tại; khi implement cần kiểm chứng endpoint và hành vi thực tế, không làm lại chỉ dựa vào checkbox. Hiện chưa có quota Flash Sale bền vững và quyền mua một lần ở cấp sản phẩm.

## Mục tiêu / Ngoài phạm vi

**Mục tiêu:** chia công việc FE/BE với cùng hợp đồng dữ liệu; bảo đảm quota, tồn kho, quyền mua và hoàn tác COD nhất quán trong giao dịch; giữ trạng thái hết suất cho tới khi bổ sung hoặc kết thúc.

**Ngoài phạm vi:** CDN/private ingress production, FIFO nghiêm ngặt, nghiệm thu nhiều instance, cam kết sức tải production, JWT key rotation, giữ suất chờ thanh toán cho Flash Sale, phục hồi Redis/mất cache, đối soát sau sự cố, triển khai production/cloud, đa region/phân phối Redis Cluster, quảng cáo, ML/data pipeline và thay đổi trả hàng sau giao. Hoàn tác lệnh thông thường và idempotency vẫn thuộc phạm vi. Người dùng đã loại bỏ thanh tiến độ bán cho Buyer trong T35 gốc. Không tuyên bố đã đáp ứng tiêu chí phục hồi cache của issue gốc.

## Các quyết định

### 1. Một modular monolith và hai phần công việc

Dùng NestJS/TypeScript + Prisma/PostgreSQL, Redis standalone local với Lua script có version và Redis client phù hợp repository, worker theo quy ước hiện có, cùng Next.js/React. BE sở hữu hợp đồng trong `packages/contracts`, schema, service, script và API/integration test. FE sở hữu giao diện Seller/Buyer và kiểm thử tương ứng. `tasks.md` có đúng hai phần BE và FE, kèm phụ thuộc.

Lịch campaign và vị trí hiển thị do domain hiện tại quản lý. Thêm phần xử lý Flash Sale để pricing, inventory, checkout, cancellation và campaign cùng sử dụng; pricing quyết định giá cuối cùng, inventory sở hữu số lượng vật lý. Giữ các module nghiệp vụ cùng nhau; control plane SQS/Lambda ở mục 10 là ranh giới admission riêng, không phải service order/inventory riêng. Chỉ PostgreSQL sẽ bỏ hướng Redis allocation của T35; chỉ Redis sẽ mất nguồn dữ liệu bền vững.

### 2. Định danh SKU, tiền, quota và quyền mua

Các bản ghi bổ sung được đề xuất; tên cuối có thể thay khi implement nhưng giữ nguyên ý nghĩa:

| Bản ghi | Trường và ràng buộc |
| --- | --- |
| `FlashSaleSku` | id, campaignId, sellerParticipationId, productId, variantId, referencePriceMinor, salePriceMinor, allocatedQuantity, remainingQuantity, netConsumedQuantity, version, managementEpoch, endedAt, endedReason; duy nhất campaignId/variantId |
| `FlashSaleBuyerClaim` | campaignId, buyerId, productId, variantId, purchaseId, orderLineId, createdAt; duy nhất campaignId/buyerId/productId; giữ sau hủy đơn |
| `FlashSaleConsumption` | orderLineId duy nhất, flashSaleSkuId, quantity=1, giá sale chụp tại lúc đặt, reversedAt, reversalDestination (`FLASH_SALE` hoặc `NORMAL`); mỗi consumption chỉ hoàn tác một lần |
| Lệnh/nhật ký Flash Sale | actor, scope, UUID key, digest yêu cầu chuẩn hóa, response, version trước/sau và thay đổi quota; tận dụng hạ tầng command/audit hiện có nếu tương thích |
| Projection outbox | eventId, sequence/version theo SKU, managementEpoch, token lệnh, delta admission, snapshot công khai tuyệt đối, trạng thái lần xử lý; ghi cùng transaction nghiệp vụ |

Tiền dùng đơn vị nhỏ nhất dạng số nguyên hiện có. Khi đăng ký, chụp giá sale cố định và giá tham chiếu của từng SKU, kiểm tra mức giảm tối thiểu campaign (mặc định Flash Sale hiện tại 10%). Giới hạn hiện tại 20 sản phẩm/seller được đếm theo sản phẩm riêng biệt, không theo số dòng SKU. Trước hạn đăng ký, giá được sửa theo chính sách hiện có; sau hạn đó giá cố định. Sửa riêng quota vẫn được phép đến startsAt. Thay giá gốc không được làm sai mức giảm đã công bố; từ chối thay đổi giá gốc không tương thích đến khi kết thúc tham gia.

Đặt `availablePhysical = quantityOnHand - quantityReserved` theo inventory hiện có. `remainingQuantity` là quota sale chưa bán; `allocatedQuantity` là tổng quota đã cấp, được thay trước giờ mở và tăng khi bổ sung từ hết suất; `netConsumedQuantity` đếm đơn vị sale chưa bị hoàn tác. Các đơn vị trả về kho thường được theo dõi trong reversal, không mặc định allocated=remaining+netConsumed sau kết thúc. Đơn bị hủy không đồng nghĩa đã thanh toán; tạo đơn COD không đánh dấu đã thu tiền.

Bảo vệ tồn kho bằng `availablePhysical >= sum(remaining protected allocations)` của từng SKU. Đăng ký/bổ sung quota không trừ tồn kho vật lý. Tạo giữ hàng thường, điều chỉnh kho và giữ lại hàng cho đơn online phải trừ phần quota đã bảo vệ khi kiểm tra khả dụng. Xác nhận sale loại chính allocation của nó khỏi ràng buộc hàng thường, đồng thời giảm cả tồn kho và quota. Hàng đã giữ cho đơn online cũ nằm ngoài availablePhysical, không được cấp lại cho Flash Sale.

Bản đầu bảo vệ tồn kho theo cách thận trọng: tính cả allocation tương lai đã chấp nhận đến khi hủy/kết thúc, không dùng cùng lượng hàng cho nhiều allocation tương lai mà chưa chứng minh đủ. Giữ ràng buộc trùng lịch promotion hiện có. Không áp dụng mức giảm cấp sản phẩm sang các SKU không tham gia.

### 3. Trạng thái suy ra, kết thúc được lưu rõ ràng

Lưu dấu kết thúc và số lượng; tính trạng thái từ công bố/hủy campaign cùng giờ database mới nhất:

| Trạng thái | Điều kiện | Thao tác Seller / kết quả Buyer |
| --- | --- | --- |
| `UPCOMING` | SKU đã đăng ký hợp lệ, now < startsAt | Sửa quota trong giới hạn; giá thường và phần hàng thường chưa được bảo vệ |
| `ACTIVE` | startsAt <= now < endsAt, chưa kết thúc, remaining > 0 | Khóa quota/giá; giá sale, nhãn sale, số lượng mua=1, COD |
| `SOLD_OUT` | Cùng khoảng thời gian, chưa kết thúc, remaining=0 | Bổ sung hoặc kết thúc SKU; bỏ nhãn sale của SKU, hết hàng, không mua giá thường |
| `ENDED` | Seller kết thúc, campaign bị hủy, hoặc now >= endsAt | Giá thường hiện hành/hàng khả dụng thường; không mở lại trong cùng campaign |

Quota ban đầu phải dương. Sửa trước giờ mở thay quota bằng số nguyên dương; bỏ đăng ký qua luồng rút hiện có, không ngầm coi sửa về 0 là rút. Bổ sung từ hết suất nhận `additionalQuantity > 0`, phải đủ hàng khả dụng và giữ nguyên giá/định danh quyền mua. Kết thúc tác động một SKU, đòi quota=0 trong thời gian hoạt động và không kết thúc SKU khác. Khi campaign hết giờ, phần backing còn lại được giải phóng về mặt hiệu lực; worker có thể ghi sổ sau nhưng tính đúng không chờ scheduler. Cache/index cũ không kéo dài thời gian sale.

### 4. Cấp suất trước database ở phase cao điểm — quan trọng

Tách snapshot đọc công khai khỏi trạng thái cấp quota. Đường đọc là L1 trong bộ nhớ -> L2 Redis -> nạp PostgreSQL có kiểm soát. Sau xác minh token waiting room ở ingress (mục 10), đường ghi COD là xác thực/giới hạn tần suất -> kiểm tra sơ bộ L1 -> Redis cấp suất nguyên tử -> transaction PostgreSQL. Cache L1 báo còn hàng không được bỏ qua Redis; L1 hết hàng cũ không được chặn suất vừa bổ sung lâu dài: làm mới qua Redis theo giới hạn độ tươi. Không trừ quota hoặc lưu quyền mua authoritative trong bộ nhớ từng instance.

Một Lua call ngắn có version cấp suất cho toàn bộ dòng sale trên Redis standalone. Key gồm bộ đếm campaign+SKU, quyền mua campaign+buyer+product, token operation+attempt và ngân sách số checkout đồng thời dùng chung. Truyền mọi key tường minh, kiểm tra mọi dòng trước khi ghi; lỗi runtime script không tự rollback giao dịch. [Ngữ nghĩa Redis scripting](https://redis.io/docs/latest/develop/programmability/eval-intro/)

1. Kiểm tra auth/origin và cấu trúc yêu cầu bằng xác thực hiện có. Giới hạn theo Buyer, tần suất chung và số checkout đang xử lý; hết khả năng nhận thì trả 429/Retry-After, không cấp quota hay xếp hàng vô hạn. Cho phép truy vấn auth/idempotency có giới hạn; cam kết là request bị loại không lấy khóa allocation hoặc mở transaction checkout, không phải mọi request đều không có SQL.
2. Giải quyết idempotency trước khi cấp mới: kết quả đã commit trong cache được trả lại; cùng key đang xử lý trả hướng dẫn chờ/thử lại. Trạng thái lệnh thiếu hoặc chưa rõ cần tra đơn bền vững có giới hạn theo định danh lệnh trước khi cấp lại. Không biến retry đơn thành công thành hết suất vì quota hiện tại đã bằng 0. Giới hạn tần suất tra cứu lặp.
3. Redis kiểm tra giờ/management epoch campaign, quota admission và quyền mua cấp product; lấy slot xử lý cùng token tạm, giảm khả dụng admission nguyên tử chỉ khi mọi dòng hợp lệ. Loại trước khóa allocation PostgreSQL nếu thiếu quota, đã dùng quyền, hết chương trình hoặc quá tải. Token chứa SKU/product/campaign do server xác định, số lượng, digest, attempt id và management epoch; không phải reservation hiển thị cho người mua và không tin trường client.
4. Chỉ request được nhận mới vào transaction PostgreSQL serializable có giới hạn hiện có. Tái dùng khóa lệnh/giỏ, campaign tương thích, advisory lock quyền mua product, allocation và inventory theo thứ tự ổn định ở mọi đường liên quan. Sau chờ khóa dùng clock_timestamp(), kiểm tra token/management epoch và quota/kho/claim/giá/voucher trong DB, rồi ghi đơn, claim, consumption, quota, kho và outbox cùng nhau. Reserve+consume hiện có chỉ là nội bộ transaction COD. [Khóa PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html)
5. Retry database thông thường dùng lại token mà không trừ quota thêm. Lần thử đã abort chắc chắn trả đúng token trước khi lần mới xin token khác. Kiểm tra thời gian cuối dưới khóa phải còn trong khung sale; Redis nhận trước endsAt không giữ quyền mua nếu chờ quá giờ. Transaction được chấp nhận ở lần kiểm tra cuối có thể commit ngay sau endsAt.
6. Sau commit, hoàn tất token mà không trừ quota sale lần hai, giữ buyer claim, trả slot đồng thời và cache kết quả replay. Rollback chắc chắn thì compare-and-release đúng quota, quyền tạm và slot của token đó. Commit chưa rõ phải tra đơn bền vững trước; timeout hoặc TTL token không tự trả đơn vị có thể đã commit. Deadline token chặn nhận/commit trễ nhưng không cho phép trả stock chưa rõ. Lệnh chưa giải quyết giữ capacity thận trọng; tự phục hồi orphan/crash vẫn hoãn.

Duy trì hai biểu diễn Redis riêng: snapshot công khai (trạng thái tuyệt đối+version) và bộ đếm/token admission (khả dụng tạm). Nạp cache công khai không được khởi tạo hoặc ghi đè bộ đếm admission đang chạy. Chỉ khởi tạo admission lúc công bố/đăng ký lần đầu có kiểm soát; mất trạng thái admission đang chạy thì trả unavailable, không lấy số DB chưa phối hợp để cấp lại.

Outbox thông thường chứa event id, thứ tự theo SKU, management epoch, token lệnh, delta admission và snapshot công khai tuyệt đối. Áp dụng event admission một lần theo thứ tự liên tục từng SKU (giữ lại/thử lại khi thiếu event); hoàn tất sale không trừ admission thêm, bổ sung/hoàn suất chỉ cộng delta đã commit, kết thúc đóng admission, rollback trả theo token. Không gán thẳng remaining DB lên bộ đếm còn chứa admission đang xử lý. Snapshot công khai chỉ nhận version mới hơn; chỉ phát invalidation L1 sau khi snapshot L2 tương ứng đã được cập nhật. Đây là xử lý lệnh thông thường, không phải dựng lại sau sự cố.

Seller bổ sung/kết thúc và admin hủy cập nhật trạng thái bền vững cùng management epoch dưới khóa hiện có. Trước khi event admission được áp dụng, token epoch cũ có thể đến PostgreSQL nhưng bị chặn và bù an toàn; sau kết thúc, trả token cũ không được mở lại admission. Bổ sung và claim mới chờ thay đổi management đã commit cập nhật Redis. Thao tác Seller khi hết suất vẫn dựa vào remaining DB, không dựa vào hết capacity tạm; khi capacity admission tạm hết nhưng quota bền vững còn, trả bận/thử lại thay vì coi Seller đã có thể kết thúc.

Redis và PostgreSQL không chung transaction. Cập nhật có điều kiện và unique constraint DB vẫn là lớp cuối kể cả admission cũ. Giao thức đưa request thua thông thường ra trước khóa PostgreSQL, đồng thời giữ checkout đồng bộ và có giới hạn. Không thêm queue thực thi đơn nền hoặc cam kết mua được ngay sau cấp quota; mục 10 thêm hàng đợi người dùng trước ingress nghiệp vụ.

### 5. Hủy đơn và race bổ sung quota — quan trọng

Mở rộng transaction hủy/từ chối dùng chung, không thêm endpoint hoàn kho riêng. Khóa participation gốc và consumption theo cùng thứ tự với thao tác Seller. Luồng inventory hiện có hoàn hàng đúng một lần; hook Flash Sale không cộng tồn kho vật lý lần nữa. Với consumption chưa hoàn tác, chỉ hoàn quota nếu participation gốc chưa endedAt, campaign chưa hủy và giờ mới sau khóa còn trong khoảng gốc. `SOLD_OUT` vẫn thỏa. Ngược lại ghi đích NORMAL và để quota đóng. Ghi reversed, cập nhật tiêu thụ ròng/version công khai, phát outbox trong cùng transaction. Bản đầu giữ buyer claim với mọi bên hủy đơn đã tạo thành công; tạo đơn thất bại chưa từng có claim.

Hủy đơn thắng trước làm quota dương và thao tác kết thúc/bổ sung từ hết suất bị conflict. Kết thúc thắng trước thì hủy đơn chỉ hoàn kho thường. Hủy sau bổ sung cộng suất bị hủy vào remaining; đồng thời trả đúng đơn vị vật lý nên backing vẫn hợp lệ. Không hoàn suất vào campaign mới của cùng SKU. Giữ quyền hủy đơn hiện tại; không mở rộng trả hàng sau giao.

### 6. Một hợp đồng giá và khả dụng — quan trọng

Mở rộng pricing trung tâm với kết quả biến thể phân loại `NORMAL`, `FLASH_SALE_ACTIVE`, `FLASH_SALE_SOLD_OUT`, gồm campaign/participation, evaluatedAt, endsAt, stateVersion, priceSource, effectivePriceMinor, canPurchase, allowedPaymentMethods và lý do theo Buyer khi đăng nhập. Hợp đồng riêng Seller có thêm quota/kho. Hợp đồng sale công khai không trả tồn kho dư và quota chính xác; chỉ ẩn khi render là chưa đủ.

SKU SOLD_OUT trả canPurchase=false và không có offer sale có thể mua; nếu hợp đồng hiện tại bắt buộc giá thì dùng giá tham chiếu/hiển thị được đánh dấu không khả dụng. Không rơi xuống scheduled discount thường. SKU kết thúc quay về bộ tính giá thường; giữ giá nền và các ưu đãi thường hợp lệ độc lập. Giá đại diện card và nhãn lấy từ biến thể có thể mua. Không boost Flash Sale cho SKU thường chỉ vì sản phẩm cha từng tham gia. Hydration dùng snapshot công khai có giới hạn độ tươi ở mục 9 cho cache/index; checkout kiểm tra lại authoritative. Giữ ý nghĩa sort theo giá.

Giữ cách xếp hạng có giới hạn hiện tại, không viết ranking engine mới. Card, detail, cart, quote, homepage dùng cùng metadata sale. Dùng L1/L2, giới hạn tuổi snapshot gốc và cả mốc startsAt/endsAt ở mục 9; invalidate có version khi quota/kết thúc đổi. Không cache buyer claim trong response công khai dùng chung. FE tải mới theo polling từng phase, focus và mốc countdown ở mục 9; không cần thêm websocket.

Ngưỡng voucher dùng giá hàng sau giảm theo SKU rồi áp dụng quy tắc cộng dồn/làm tròn hiện có. Checkout hỗn hợp có một dòng sale thì toàn purchase chỉ COD. Chặn tạo intent online và retry khi đánh giá lại sẽ mua dòng sale; đơn online giá thường cũ có hold hợp lệ tiếp tục theo snapshot bất biến. Báo giá cũ yêu cầu preview mới; không ngầm đổi giá, số lượng, SKU hoặc phương thức.

### 7. Hợp đồng API và kiểm thử bắt buộc

Mọi đường dưới đây có tiền tố `/api/v1`. Endpoint đề xuất mới đánh dấu NEW; giữ auth, origin, ownership, ETag, validation và Problem Details hiện có. Tiền nguyên theo đơn vị nhỏ nhất; số lượng nguyên dương an toàn. Lệnh Seller cần UUID `Idempotency-Key`, `version`, digest chuẩn hóa. Danh tính Buyer lấy từ auth.

| Endpoint | Request / response bổ sung | Ca kiểm thử |
| --- | --- | --- |
| NEW `GET /campaigns/:campaignId/flash-sale/status?variantIds=...` | 1–50 SKU id khác nhau trong campaign; serverTime, mốc giờ, trạng thái/version/giá/canPurchase công khai | Batch qua cache; id sai; rate limit; không lộ số riêng; chuyển giờ; đo độ tươi |
| NEW `PUT /seller/campaigns/:campaignId/flash-sale/skus` | `{version, items:[{variantId,salePriceMinor,quota}]}`; response đăng ký nguyên tử có SKU id, version, giá, quota, trạng thái | Quyền Seller; giới hạn số product; sở hữu SKU; trùng; giá; quota bằng kho; hết hạn đăng ký; replay |
| NEW `PATCH /seller/campaigns/:campaignId/flash-sale/skus/:variantId/quota` | `{version, quota}` -> snapshot SKU mới | Trước startsAt kể cả đã hết hạn đăng ký; số dương; backing; version cũ; chặn sửa đang chạy |
| NEW `POST /seller/campaigns/:campaignId/flash-sale/skus/:variantId/replenish` | `{version, additionalQuantity}` -> snapshot SKU mới | Chỉ đang diễn ra và quota=0; backing; giữ giá/claim; race hủy/kết thúc |
| NEW `POST /seller/campaigns/:campaignId/flash-sale/skus/:variantId/end` | `{version}` -> snapshot kết thúc | Chỉ đang diễn ra và quota=0; replay; tách SKU khác; chặn mở lại |
| `GET /seller/campaigns/:campaignId` | Thêm dòng SKU, kho, quota, quyền thao tác | Tách shop; UPCOMING/ACTIVE/SOLD_OUT/ENDED; không bịa tổng số |
| `GET /homepage`, `GET /campaigns/:campaignId`, `GET /catalog/products`, `GET /catalog/products/:productId` | Metadata sale, giá đại diện, khả dụng; không trả số sale chính xác công khai | SKU cùng product; hết suất bỏ nhãn; bổ sung/hoàn suất khôi phục; kết thúc/hết giờ; cache/index cũ |
| `POST /cart/quote`, `POST /checkout/preview` | Giữ dòng hàng/địa chỉ/voucher; thêm COD readiness, nguồn sale, dữ liệu fingerprint | Không đổi quota; ngưỡng voucher sau sale; SKU thường; auth; báo giá đổi |
| `POST /checkout/cod` | Confirmation hiện có + If-Match + Idempotency-Key; purchase chứa snapshot sale | Tranh suất cuối; giới hạn product qua SKU; quantity>1; rollback voucher; ranh giới giờ; replay |
| `POST /checkout/online-payments`, `POST /payments/:paymentReference/retry` | Request hiện có; thêm guard hiệu lực sale | Chặn sale trước intent/hold; hàng thường và đơn thường cũ hợp lệ |
| `POST /account/orders/:orderReference/cancel` | Body/ETag đơn hiện có; response phản ánh hoàn tác | Quyền Buyer; hoàn một lần; hết suất còn tham gia so với đã kết thúc; giữ claim; campaign cũ |
| `POST /seller/orders/:orderReference/actions` với `REJECT` | Body action/ETag hiện có; dùng chung hoàn tác | Quyền Seller; từ chối hợp lệ; không hoàn hàng vật lý hai lần |
| Endpoint admin hủy campaign và chỉnh inventory hiện có | Giữ lệnh hiện tại, thêm kiểm tra participation/backing | Race hủy campaign; giải phóng khả dụng thường; không giảm kho dưới backing |

Định nghĩa lỗi `FLASH_SALE_SOLD_OUT`, `FLASH_SALE_LIMIT_REACHED`, `FLASH_SALE_COD_ONLY`, `FLASH_SALE_QUOTA_LOCKED`, `FLASH_SALE_ENDED`, `FLASH_SALE_STOCK_INSUFFICIENT` cùng lỗi stale/idempotency/quote hiện có. Thêm `FLASH_SALE_BUSY` trả 429 và Retry-After khi vượt tần suất/số xử lý đồng thời. Dùng quy ước 400/401/403/404/409; admission chưa rõ trả 503, không tự chuyển sang mua giá thường. Đây là từ chối tối thiểu, không phải tính năng phục hồi Redis.

### 8. Bàn giao FE và BE

BE công bố contracts và fixtures cho mọi trạng thái, lỗi giới hạn mua và giỏ hỗn hợp COD trước. FE sau đó làm đăng ký/quản lý Seller và Buyer song song với BE implementation. Tái sử dụng Seller xanh/trắng và storefront Buyer; UI spec sở hữu layout, feedback, accessibility, motion. Admin chỉ cần preview tương thích loại Flash Sale/vị trí đặt, không thiết kế lại authoring hay ghép lại CMS banner.

Trước nghiệm thu tích hợp, chạy concurrency với Redis và PostgreSQL local thật. Dùng Jest/Supertest cho BE và contract test, Vitest/Testing Library cho FE, Playwright cho luồng liên màn mobile/tablet/desktop cuối cùng. Load harness tái lập được ghi môi trường, mức đồng thời, số đơn thành công, quota, kho, claims, latency; đạt khi bất biến đúng, không đặt mục tiêu throughput chưa có căn cứ. Lỗi kiểm thử quota/checkout/claim/cancellation chặn bàn giao.

### 9. Ba phase traffic và thứ tự đọc L1/L2

L1 là cache LRU có giới hạn dung lượng trong từng NestJS instance; L2 là Redis dùng chung. Chỉ cache dữ liệu SKU/product công khai bằng key chuẩn hóa chứa campaign/SKU và version biểu diễn. Không đưa buyer claim, báo giá cá nhân hay dữ liệu Seller vào response công khai dùng chung. Giới hạn batch, số key và bộ nhớ. Refresh toàn trang và SSR phải tái dùng cache công khai cho sale/card hydration, không đọc lại từng SKU sale từ PostgreSQL; phần trang liên quan xác thực vẫn có thể dùng DB riêng.

Khởi đầu TTL L1 0,5–1 giây, tuổi tối đa snapshot công khai 2 giây tính từ lần đọc nguồn authoritative ban đầu. Chép từ L2 lên L1 phải giữ tuổi gốc, không tính lại từ đầu. Snapshot outbox giữ thời điểm commit/đánh giá gốc; giao trễ không làm mới tuổi dữ liệu cũ. Version không đổi đã hết hạn có thể được xác thực lại bằng lượt đọc DB mới có guard, nhưng version cũ không được ghi đè version mới. Hạn hiệu lực không vượt startsAt hoặc endsAt; server tính chuyển trạng thái theo thời gian. Định danh trạng thái theo giờ gồm phase suy ra cùng version thay đổi dữ liệu. Outbox cập nhật snapshot L2 mới rồi phát invalidation đến mọi L1 qua Redis Pub/Sub nội bộ; nếu lỡ thông báo thì giới hạn tuổi gốc vẫn áp dụng. Cách này tính đến [Redis Pub/Sub chỉ giao tối đa một lần](https://redis.io/docs/latest/develop/pubsub/#delivery-semantics). Version fence ngăn lần nạp cũ đang chạy ghi lại dữ liệu đã invalidated. Không phục vụ stale-while-revalidate vượt giới hạn này hoặc ranh giới sale.

Cache công khai miss dùng single-flight trong process và lease nạp ngắn theo key trên Redis, giới hạn thời gian chờ và số truy vấn nạp DB đồng thời. Chỉ bên giữ lease đọc PostgreSQL; request khác dùng kết quả hoặc nhận phản hồi thử lại, không cùng đổ xuống DB. Jitter hết hạn không kéo dài hiệu lực tối đa. Cơ chế cache đọc không dựng lại admission đang chạy. Prewarm metadata và khởi tạo admission có kiểm soát khi công bố, làm nóng lại metadata công khai gần startsAt; admission kiểm tra giờ server để không mở sớm. L1 từng instance ấm dần theo lượt đọc.

| Phase | Hành vi FE | Hành vi BE |
| --- | --- | --- |
| 1: Trước giờ mở | Countdown tại máy theo độ lệch giờ server; tải trạng thái khi trang hiện mỗi khoảng ngẫu nhiên 10–15 giây; một lần trong 0–500 ms sau startsAt rồi theo nhịp phase 2 | Prewarm; lượt đọc lặp/refresh trang qua L1/L2; cache hết hạn đúng mốc và gom lượt nạp để tránh đồng loạt truy vấn DB |
| 2: Cao điểm đang bán | Tải trạng thái sale đang hiển thị mỗi khoảng ngẫu nhiên 3–5 giây; chặn submit lặp; tuân Retry-After, giữ idempotency key khi thử lại cùng nội dung checkout | L1/L2 hấp thụ lượt đọc; giới hạn theo Buyer/toàn hệ thống và admission Redis nguyên tử chặn số checkout toàn cục trước transaction allocation PostgreSQL |
| 3: Hết suất nhưng chưa kết thúc | Hết hàng, bỏ nhãn sale của SKU; tiếp tục kiểm tra mỗi khoảng ngẫu nhiên 3–5 giây khi trang hiện để thấy suất bổ sung/hoàn lại | Cache SOLD_OUT; bổ sung/hoàn suất đã commit cập nhật snapshot công khai có version và delta admission; kết thúc tường minh đưa về bán thường |

Mỗi poller tối đa một request đang chạy, gộp SKU đang hiển thị và loại trùng, dừng khi tab ẩn, tải mới có jitter khi quay lại, backoff khi lỗi/429 và ngừng polling sale khi participation/campaign đã kết thúc. Không tự đặt đơn khi suất trở lại. Không cần WebSocket/SSE cho trình duyệt; Redis Pub/Sub chỉ phục vụ invalidation nội bộ.

Thêm endpoint công khai nhẹ theo batch: GET /campaigns/:campaignId/flash-sale/status?variantIds=... (1–50 id khác nhau thuộc campaign). Trả serverTime, startsAt, endsAt và trạng thái lifecycle, stateVersion, giá công khai, canPurchase của từng SKU. canPurchase chỉ là khả dụng chung, không phải bảo đảm mua được hay kết quả quyền mua cá nhân. Không trả quota chính xác/kho riêng. Tạo serverTime khi ráp response, không cache một giá trị đồng hồ cũ. Polling không tải lại toàn catalog hoặc báo giá giỏ.

Trong hoạt động bình thường, snapshot công khai BE cũ tối đa 2 giây; trang đang hiện và mạng tốt có mục tiêu nghiệm thu phản ánh bổ sung/kết thúc/hoàn suất đã commit trong 8 giây (2 giây tuổi snapshot + tối đa 5 giây đến poll kế tiếp + 1 giây request/render). Phải đo mục tiêu này; tab ẩn, lỗi mạng và backoff quá tải nằm ngoài mốc. Checkout luôn kiểm tra authoritative kể cả trong khoảng trễ hiển thị. Response thao tác Seller hiển thị kết quả đã commit ngay.

Kiểm thử cả ba phase trên một API instance của POC: cache lạnh/ấm, refresh toàn trang đồng thời, chuyển mốc giờ, L1 cũ sau bổ sung, lỡ invalidation, cache fill công khai sai thứ tự, polling hết suất, 429 và COD cao điểm. Ghi tỷ lệ hit L1/L2, số lượt nạp công khai từ DB, số transaction checkout PostgreSQL, lượt nhận/từ chối, đỉnh in-flight, latency và độ trễ hiển thị. Request thua thông thường vì quota/quyền mua/quá tải không vào transaction allocation; chưa công bố năng lực throughput trước khi đo.

### 10. Waiting room LocalStack và pool admission Redis (thiết kế POC đã chốt)

Kiến trúc: Browser -> Waiting Room UI tĩnh (vai trò CDN/edge, phục vụ local cho POC) -> Admission/Queue API dùng Lambda và SQS Standard trong LocalStack -> trạng thái admission Redis. Browser poll control plane để nhận token rồi gọi trực tiếp Backend kèm token. Backend kiểm admission trước nghiệp vụ checkout được bảo vệ. Message là ticket xin lượt, không phải job tạo đơn nền. Nghiệm thu cần một NestJS API, PostgreSQL và Redis standalone; CDN production, private origin, proxy gateway admission, HA và triển khai nhiều instance ngoài phạm vi.

Dùng SQS Standard theo lựa chọn của người dùng, không dùng FIFO: message có thể lặp hoặc đến khác thứ tự. Không hứa vị trí chính xác hoặc thứ tự đến trước được vào trước. Join dùng Buyer/gate đã xác thực, Idempotency-Key riêng và digest nội dung; retry/nhiều tab dùng lại một ticket còn hiệu lực. Cùng key khác nội dung trả conflict. Lambda chống lặp theo ticket ID, không phụ thuộc message ID. Message lặp không tạo thêm lease hay đơn. Xác nhận đơn giữ Idempotency-Key và digest riêng với join.

Redis lưu ticket, liên kết Buyer/session, token ngẫu nhiên, deadline và capacity dùng chung. Pool có 20 chỗ lease, không phải 20 chuỗi token tái sử dụng. Cấp lượt nguyên tử kiểm ticket còn WAITING và pool còn chỗ, gắn token ngẫu nhiên bảo mật mới với Buyer/session/gate/ticket và ghi lease 300 giây kể từ lúc cấp. State token lưu Redis với TTL này. Không dùng JWT/chữ ký/issuer/key rotation. Message cấp lượt lặp dùng kết quả đã ghi, không gia hạn deadline. Nếu mất response đầu tiên, Buyer vẫn nhận lại token qua status có xác thực trong thời hạn gốc.

Cả 20 chỗ đã dùng thì Buyer tiếp tục WAITING, không cấp token. Giữ ticket để SQS/Lambda xử lý sau; không acknowledge làm mất ticket chưa được cấp. Visibility/redelivery dùng backoff có giới hạn, không busy loop; nhịp cụ thể là tuning local, không phải cam kết thời gian được vào. Chỉ acknowledge cấp lượt sau khi kết quả đã được lưu; message cũ/đóng/lặp không tạo lease mới. Lỗi publish khi join phải retry được cùng ticket/key, không báo join thành công rồi bỏ mất ticket. Polling chỉ đọc trạng thái, không tự cấp lượt hoặc gọi checkout/order/PostgreSQL. Giữ giới hạn số ticket, thời hạn chờ và polling 5–10 giây có jitter của UX hiện có; đây là cấu hình tuning, không phải tốc độ cấp lượt.

Khi bật bảo vệ, chỉ giỏ có dòng Flash Sale do server xác định, gồm giỏ hỗn hợp, cần admission. Phân loại theo giỏ đã chọn của Buyer và metadata sale có thẩm quyền, không tin cờ client. Cho phép đọc tối thiểu để phân loại; Buyer đang chờ không gọi preview lặp. Giỏ toàn hàng thường bỏ qua gate. Preview Flash Sale kiểm token nhưng không lấy slot xác nhận. Quy tắc COD-only vẫn chặn thanh toán online cho dòng sale; route online không trở thành đường vòng.

Mỗi request được bảo vệ kiểm token ngẫu nhiên với state Redis còn sống, Buyer/session đăng nhập, gate/scope và deadline server. Không cache quyết định cho qua. Truyền bằng cookie cùng origin HttpOnly SameSite, Secure khi dùng HTTPS; cấu hình transport local rõ ràng, không lộ token qua URL/localStorage hoặc yêu cầu sao chép tay. Status riêng tư và no-store. Thiếu/hết hạn trả 428; sai token/identity trả 403; không kiểm được Redis trả 503 và không fallback quota/token sang memory mỗi process. Đây là hành vi khi lỗi, không phải phục hồi Redis.

Có đúng hai capacity traffic: tối đa 20 lease Buyer và tối đa 5 request xác nhận đơn Flash Sale đang xử lý. Ngân sách thứ hai lấy nguyên tử ở Redis trước allocation/tạo đơn, không phải số request/giây và không áp dụng preview. Tích hợp quota admission với trần 5 confirmation này, không giữ trần hiệu dụng 100 slot riêng. Hết 5 slot trả 429/Retry-After trước khi cấp quota; Buyer giữ lease và chủ động retry cùng key đơn. Command trùng đang xử lý không chạy thêm lần nữa. Tra/replay kết quả đã commit không tạo đơn mới.

Chỉ trả lease đúng một lần khi tạo đơn thành công hoặc hết 300 giây. Preview, lỗi checkout xác định, hết hàng/đổi quote, đóng tab và rời trang không trả sớm. Có thể hủy ticket WAITING nhưng không được trả lease ADMITTED qua DELETE ticket cũ. Không tự gia hạn. Hết lease cần chu kỳ admission mới với ticket/key mới; message muộn của chu kỳ cũ không tạo lại lease. Thu hồi capacity hết hạn dựa vào deadline lưu rõ ràng và thao tác nguyên tử; chỉ để key token tự mất không được làm rò hoặc trả trùng slot. Thành công trả đúng lease ID gắn với command; kết quả đến muộn không thu hồi lease mới hơn.

Slot xác nhận chỉ trả một lần khi xử lý xong hoặc xác nhận đã dừng, dù thành công/thất bại. Mất kết nối hoặc hết lease không chứng minh backend đã dừng. Quota-attempt token vẫn là nội bộ theo mục 4; trả lease hay hết token không hoàn quota sản phẩm. Kết quả commit chưa rõ phải được xác minh trước bù. Buyer mất response thành công dùng endpoint tra kết quả theo key đơn gốc, kể cả lease đã trả. Seller bổ sung chỉ thêm quota sản phẩm, không reset pool, ticket chờ, hạn token hoặc claim đã mua. Được vào không giữ SKU/đảm bảo mua. Mốc campaign/giá vẫn áp dụng; hết sale yêu cầu xem lại giá.

API dưới /api/v1: control plane POST /admission/checkout/tickets (Idempotency-Key join), GET /admission/checkout/status (ticket thuộc Buyer, WAITING/ADMITTED/EXPIRED/CLOSED và deadline; cấp cookie); DELETE /admission/checkout/ticket chỉ hủy ticket chưa được cấp. Backend GET /admission/checkout/results/:idempotencyKey chỉ tra command đã có theo quyền. Kiểm thử preview/COD, giỏ thường bỏ gate, giỏ hỗn hợp qua gate và chặn online sale hiện có. Giữ 401 auth, 409 cùng key khác nội dung; không đổi quá tải admission thành token invalid.

Nghiệm thu POC dùng LocalStack SQS/Lambda với Redis/PostgreSQL thật: 21 Buyer có tối đa 20 lease, người còn lại chờ; 6 xác nhận khác nhau đồng thời chỉ nhận tối đa 5; preview không chiếm slot; message lặp/đảo thứ tự, join đồng thời và retry cùng key không nhân ticket/lease/đơn; thành công và hết hạn chỉ trả lease một lần; lỗi/đóng tab không trả; sau trả capacity người chờ có thể được cấp. Kiểm token/session sai, hết hạn giữa xử lý, mất response/tra kết quả, giỏ thường bỏ gate và hết hàng/bổ sung/hủy. Ghi số đếm và latency local, không cam kết tải production hoặc yêu cầu hai gateway/hai API instance.


## Rủi ro / Đánh đổi

- [Redis và DB không commit cùng nhau] -> DB là nguồn cuối; bù theo attempt và phát sự kiện thông thường có version; thừa nhận admission không khả dụng khi chưa rõ kết quả. Phục hồi outage/mất cache được hoãn, không tự thêm vào phạm vi.
- [Tranh chấp SKU nóng giữa request đã được nhận] -> Admission trước DB, giới hạn đồng thời dùng chung, script ngắn, thứ tự khóa ổn định, retry hữu hạn, đo ba phase trên nhiều instance. Bản đầu ưu tiên đúng dữ liệu hơn throughput tối đa.
- [Hoàn kho hai lần hoặc mất backing] -> Hoàn vật lý đúng một lần qua inventory, bảo vệ đường giữ hàng thường và một reversal marker bền vững cho mỗi dòng đơn.
- [Nhầm hết suất với kết thúc] -> endedAt riêng với trạng thái quota suy ra; kiểm thử race hủy/kết thúc/bổ sung.
- [Giảm giá legacy lan sang SKU thường] -> FLASH_SALE đi qua resolver SKU, chặn entry thiếu quota, giữ các loại khác và CMS tách biệt.
- [Không trả lại quyền mua sau hủy] -> Hiển thị quy tắc người dùng đã duyệt ở checkout; áp dụng nhất quán và test riêng với hoàn quota.

## Kế hoạch migration

1. Thêm schema, constraint, index, Redis local và hợp đồng có version. Không tự thao tác production. Seed rõ sắp chạy, đang chạy, hết suất, kết thúc, SKU cùng product; không đổi lịch sử đơn.
2. Thêm `FLASH_SALE_SKU_ENABLED` mặc định false. Triển khai inventory backing guard và đọc reversal trước khi bật ghi; flag homepage hiện có điều khiển vị trí hiển thị, không quyết định tính đúng giá.
3. Kiểm kê đăng ký Flash Sale legacy. Yêu cầu đăng ký SKU/giá/quota tường minh; giữ dòng cũ để audit nhưng loại khỏi đường giá SKU đã bật. Tận dụng admin/ownership participation hiện có. Không lấy toàn bộ kho làm quota mặc định.
4. Bật local sau khi schema/API/FE thống nhất, khởi tạo admission lần đầu có kiểm soát, prewarm cache công khai và kiểm thử liên quan đạt. Nạp cache đọc không được reset admission đang chạy. Refresh search projection bị ảnh hưởng và kiểm tra hydration. Không đánh dấu tiêu chí recovery T35 đã xong hoặc tự sửa GitHub.
5. Rollback là dừng admission/đăng ký mới nhưng giữ bản ghi đơn/claim/reversal và inventory guard cho participation chưa xong. Giữ chặn sold-out đến khi kết thúc có kiểm soát/hết giờ; không fallback sang checkout giảm giá legacy. Đơn đã xác nhận và hủy vẫn được hỗ trợ. Không down-migration phá dữ liệu khi còn tham chiếu.

## Câu hỏi có thể quyết định sau

Chỉ còn tuning không đổi nghiệp vụ: chọn Redis image/client local được hỗ trợ và pin version khi BE setup; đo contention và điều chỉnh cache/polling trong giới hạn độ tươi, mốc giờ đã chốt ở mục 9. Các việc này không đổi lifecycle đã thống nhất hoặc cách chia task FE/BE.
