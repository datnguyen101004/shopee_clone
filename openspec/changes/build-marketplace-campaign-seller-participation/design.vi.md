## Bối cảnh

Xem `proposal.md` để biết động cơ sản phẩm và các capability spec để biết hành vi bắt buộc. Repository là modular monolith dùng TypeScript: Next.js App Router trong `apps/web`, NestJS REST trong `apps/api`, Prisma/PostgreSQL là nguồn dữ liệu chuẩn, và contract không phụ thuộc framework nằm trong `packages/contracts`.

Catalog hiện có `HomepageModule` và `HomepageBanner` để trình bày nội dung, nhưng banner chưa có vòng đời chiến dịch riêng. Khuyến mãi theo lịch do seller tài trợ dùng `ShopDiscountCampaign` và `ShopDiscountProduct`; `ScheduledDiscountService` là nơi duy nhất áp dụng giá. Hệ thống thông báo đã có nhóm tùy chọn `PROMOTIONS`, bản ghi inbox chống trùng, lần gửi email và retry giới hạn. Search dùng projection Elasticsearch có version, hydrate lại từ PostgreSQL, scoring input có version và đường fallback. Danh sách/chi tiết sản phẩm seller đã tồn tại nhưng mới trả về ít thông tin vận hành.

Thiết kế phải giữ giá do server quyết định, khoảng thời gian UTC nửa mở, tiền ở số nguyên đơn vị nhỏ nhất, ID không tiết lộ quyền sở hữu, phân trang ổn định, lỗi Problem Details và mô hình deploy AWS hiện tại. Không thêm hạ tầng managed mới.

## Mục tiêu / Không thuộc phạm vi

**Mục tiêu:**

- Thêm aggregate một chiến dịch/một banner có transaction, lịch có audit và ID banner public ổn định. Banner là identity hiển thị của chiến dịch trên homepage.
- Trang chủ liệt kê mọi banner của chiến dịch đang chạy (`ACTIVE`) và mỗi lần kích hoạt đi tới `/banner/:bannerId`.
- Phần copy buyer do admin soạn chỉ gồm tiêu đề và nội dung; ảnh thẻ homepage là tùy chọn.
- Cho seller đủ điều kiện tự nguyện quyết định trong thời hạn và gửi sản phẩm sở hữu cùng mức giảm hợp lệ.
- Chặn một sản phẩm bị trùng thời gian giữa khuyến mãi shop và chiến dịch nền tảng ở tầng database.
- Tái sử dụng ranh giới module giá, thông báo, search, recommendation, phân quyền và sản phẩm seller.
- Giữ lợi ích xếp hạng có giới hạn, giải thích được, theo thời gian và không vượt tầng độ liên quan hay ghi đè cách sắp xếp rõ ràng.
- Trả tóm tắt chiến dịch cùng sản phẩm seller mà không tạo truy vấn N+1 hoặc response không giới hạn.

**Không thuộc phạm vi:**

- Đấu giá vị trí chiến dịch, quảng cáo trả phí, phí seller, quyết toán hoặc ngân sách chiến dịch.
- Admin duyệt thủ công từng đăng ký seller sau khi dữ liệu đã đạt điều kiện công bố.
- Đăng ký theo từng variant; seller chọn product và mức giảm áp dụng cho mọi variant active hợp lệ.
- Ghi giá chiến dịch có thể thay đổi trực tiếp vào variant hoặc sửa snapshot đơn hàng cũ.
- Cam kết vị trí search cố định hoặc lộ trọng số cá nhân hóa cho seller.
- Thêm Redis, tách campaign service riêng hoặc thêm scheduler bên ngoài.
- CMS banner độc lập, nguồn Markdown, CTA/destination riêng, hoặc endpoint public thứ hai `GET /api/v1/banners/:bannerId`.

## Quyết định

### 1. Thêm campaign aggregate và giữ lại `HomepageBanner`

Tạo model `MarketplaceCampaign` chứa mốc publish/cancel, `announceAt`, `enrollmentStartsAt`, `enrollmentEndsAt`, `startsAt`, `endsAt` loại trừ, `minimumDiscountBasisPoints`, `version` và audit timestamps. Category tùy chọn nằm trong `MarketplaceCampaignCategory`.

Mở rộng `HomepageBanner` bằng `campaignId` bắt buộc và unique, `contentJson` có định dạng giới hạn và các field hiển thị hiện có. Tạo chiến dịch thì tạo banner trong cùng transaction. Banner là identity hiển thị của chiến dịch: tiêu đề và nội dung là copy dành cho buyer; ảnh/alt là media tùy chọn cho thẻ homepage. `destinationPath` luôn là `/banner/:bannerId` và không phải đích điều hướng do admin sửa. `HomepageBanner.id` tiếp tục là ID public chuẩn cho `/banner/:bannerId`.

Module campaign-banner trên homepage là danh sách suy ra từ các chiến dịch đang chạy, không phải CMS chọn banner riêng. Nó gồm mọi chiến dịch đã publish, chưa cancel, lifecycle `ACTIVE`, sắp theo `sortOrder` của banner. Chiến dịch announced, đang enrollment, scheduled, ended hoặc cancelled không xuất hiện trên danh sách đó, dù trang chi tiết `/banner/:bannerId` vẫn đọc được sau lúc announce. Admin không cần bước “tạo banner homepage” thứ hai để chiến dịch đang chạy hiện ra.

Nội dung campaign được lưu thành tài liệu block có version và allow-list thay vì HTML tùy ý hay nguồn Markdown. DTO chuẩn hóa heading, paragraph, list, link và media được hỗ trợ; renderer escape text, chỉ chấp nhận link cùng origin và media marketplace đáng tin cậy. Admin có thể chỉnh sửa mà không tạo lỗ hổng stored XSS.

Phương án đã cân nhắc: thay `HomepageBanner` sẽ nhân đôi tích hợp homepage và làm migration khó hơn; đặt toàn bộ field campaign vào banner sẽ trộn vòng đời với phần trình bày và làm quan hệ participation mơ hồ; giữ CMS banner độc lập với CTA sẽ khiến thẻ homepage trỏ ra ngoài chiến dịch của nó.

### 2. Suy ra vòng đời từ thời gian database

Lưu `publishedAt` và `cancelledAt`; suy ra `DRAFT`, `ANNOUNCED`, `ENROLLMENT_OPEN`, `SCHEDULED`, `ACTIVE`, `ENDED` hoặc `CANCELLED` từ các mốc đó và một database timestamp dùng chung trong transaction. Mọi kiểm tra giá và mutation dùng cùng thời gian database của transaction. Khoảng enrollment và event đều là nửa mở.

Worker lịch campaign chỉ xử lý side effect như invitation và reminder. Read, pricing và ranking không phụ thuộc cron cập nhật cột status. Participation đã join được trả về là `LOCKED` khi enrollment đóng, còn decision và product đã lưu không đổi.

Phương án đã cân nhắc: lưu từng status phát sinh theo thời gian sẽ khiến worker chậm hoặc retry lỗi làm UI và giá sai.

### 3. Mô hình hóa riêng quyết định seller và sản phẩm

Thêm `SellerCampaignParticipation`, unique theo `(campaignId, shopId)`, gồm decision đã lưu (`UNRESPONDED`, `JOINED`, `DECLINED`, `WITHDRAWN`), `version`, thời điểm phản hồi và quan hệ tới product đã gửi. Thêm `SellerCampaignProduct`, unique theo `(participationId, productId)`, gồm basis point giảm giá, thời điểm chấp nhận và metadata validation giới hạn phục vụ hỗ trợ.

Khi phát thông báo campaign, hệ thống tạo row `UNRESPONDED` cho từng seller đang đủ điều kiện trước khi gửi invitation. Seller đủ điều kiện tìm thấy campaign sau đó có thể tạo row này atomically lúc phản hồi. Join và revise thay thế toàn bộ tập product của seller trong một serializable transaction. Chưa có đồng ý tham gia nếu decision lưu chưa phải `JOINED`.

API kiểm tra quyền sở hữu shop, trạng thái seller/shop, lifecycle và moderation của product, category, active variant, an toàn giá và khoảng discount ngay trong transaction. ID product của shop khác trả lỗi không cho phép dò tồn tại. Validation tự động là đủ; báo cáo admin chỉ để quan sát.

Phương án đã cân nhắc: lưu status trực tiếp trên product không biểu diễn được decline/withdrawal, không version hóa một phản hồi seller thống nhất và không hỗ trợ một notification mỗi seller.

### 4. Chặn trùng khoảng giảm giá bằng reservation dùng chung

Thêm `ProductPromotionReservation`, mỗi row đại diện một product và một nguồn giảm giá theo lịch, gồm loại nguồn (`SHOP_CAMPAIGN` hoặc `MARKETPLACE_CAMPAIGN`), source ID, `[startsAt, endsAt)` và trạng thái enabled. PostgreSQL GiST exclusion constraint dùng `btree_gist` từ chối các khoảng enabled bị chồng trên cùng product. Prisma migration dùng raw SQL để tạo extension và constraint; repository chuyển lỗi constraint thành lỗi xung đột promotion theo product.

Cả lệnh shop promotion và platform participation đều ghi reservation trong cùng transaction với source. Disable, archive, withdraw hoặc cancel source sẽ disable reservation. Cập nhật lịch thay reservation trong transaction. Cách này đóng race theo cả hai chiều, kể cả tạo shop promotion sau khi đã join platform campaign. Các product trong `ShopDiscountCampaign` enabled hiện có được backfill trước khi bật constraint.

Phương án đã cân nhắc: chỉ query xung đột trong application vẫn có thể cùng lúc vượt qua; advisory lock giảm race nhưng khiến tính đúng phụ thuộc mọi write path tương lai cùng tuân thủ quy ước.

### 5. Mở rộng bộ giải giá trung tâm bằng nguồn có kiểu

`ScheduledDiscountService` tiếp tục là nơi duy nhất giải scheduled product discount. Service đọc reservation active và chi tiết nguồn tương ứng, kiểm tra trạng thái hiện tại và trả loại nguồn, campaign ID, discount, giá gốc/giá hiệu lực và thời điểm đánh giá. Vì reservation cấm overlap nên không cần chọn giữa hai campaign cạnh tranh. Service tính số nguyên cho mọi variant active hợp lệ và về giá gốc nếu giá tính ra không an toàn.

Catalog card, campaign detail, cart quote, checkout, search projection và tạo order đều dùng resolver này. Checkout đánh giá lại trong transaction hiện có. Order line giữ snapshot giá/nguồn bất biến; cancel campaign sau đó chỉ ảnh hưởng lần tính tương lai.

Phương án đã cân nhắc: tính giá campaign riêng ở mỗi controller sẽ làm cart, checkout, catalog và search không nhất quán.

### 6. Dùng command có version, idempotency và audit giới hạn

Tạo `MarketplaceCampaignCommand`, khóa theo `(actorId, idempotencyKey)`, gồm command scope, request digest và response replay giới hạn. Admin create/publish/cancel và seller response/withdraw dùng model này. Update DTO yêu cầu version hiện tại của aggregate hoặc participation; stale write và tái sử dụng key với input khác trả Problem Details `409`.

Tạo `MarketplaceCampaignAudit` cho mutation lifecycle/content đặc quyền và chuyển decision của seller. Chỉ lưu actor, resource, action, thời gian, reason code, version thay đổi và allow-list metadata nhỏ; không chép toàn bộ formatted content, signed URL hoặc payload product seller.

Phương án đã cân nhắc: chỉ dựa vào hành vi retry HTTP có thể tạo side effect trùng và không khôi phục an toàn khi mất response.

### 7. Tái sử dụng notification engine với lịch quét claim từ database

Thêm notification type `CAMPAIGN_ANNOUNCED` và `CAMPAIGN_ENROLLMENT_REMINDER`, ánh xạ sang `PROMOTIONS`. Script xử lý lịch campaign chọn due work theo batch giới hạn bằng `FOR UPDATE SKIP LOCKED`, tạo participation cho seller đủ điều kiện và gọi notification service hiện có. Deduplication key gồm campaign ID, publication version, seller ID và loại event.

Mốc reminder được cấu hình tương đối với `enrollmentEndsAt`. Trước khi gửi, worker kiểm tra lại `UNRESPONDED`, điều kiện seller và enrollment còn mở. In-app/email tiếp tục tôn trọng preference và retry độc lập. Deep link tới `/seller/campaigns/:campaignId`; route đích kiểm tra lại quyền và eligibility.

Phương án đã cân nhắc: tạo notification ngay trong request publish khiến thời gian request tăng theo số seller và không xử lý tự nhiên `announceAt` trong tương lai.

### 8. Thêm REST contract thuộc đúng capability

Thêm DTO và shared contract cho các endpoint:

- Public: `GET /api/v1/campaigns/by-banner/:bannerId` trả tiêu đề, nội dung, metadata type và sản phẩm active phân trang cursor; `GET /api/v1/homepage` trả mọi banner chiến dịch đang chạy. Không có `GET /api/v1/banners/:bannerId`.
- Admin: `GET|POST /api/v1/admin/campaigns`, `GET|PATCH /api/v1/admin/campaigns/:campaignId`, `POST /api/v1/admin/campaigns/preview`, `POST /api/v1/admin/campaigns/:campaignId/publish`, `POST /api/v1/admin/campaigns/:campaignId/cancel`, `GET /api/v1/admin/campaigns/:campaignId/participations`.
- Seller: `GET /api/v1/seller/campaigns`, `GET /api/v1/seller/campaigns/:campaignId`, `PUT /api/v1/seller/campaigns/:campaignId/participation` cho join/revise/decline và `POST /api/v1/seller/campaigns/:campaignId/participation/withdraw`.
- Seller products: mở rộng `GET /api/v1/seller/products` với filter `campaignId`/campaign state và mở rộng `GET /api/v1/seller/products/:productId` với campaign detail theo nhóm.

Mutation dùng quy ước idempotency header hiện tại và version trong body. Mọi endpoint dùng DTO nghiêm ngặt, role/shop guard, cursor ổn định và Problem Details. Public lookup trả cùng một `404` đã làm sạch cho banner ID sai, không tồn tại, draft hoặc chưa announce.

Phương án đã cân nhắc: mở rộng endpoint admin homepage chung sẽ ghép campaign economics và seller participation vào module chỉ dành cho trình bày.

### 9. Tạo seller-product summary giới hạn trong repository query

Repository danh sách product seller lấy product/media/category/state, aggregate giá variant và inventory, join rating/sales summary, rồi lấy shop promotion và platform campaign active/upcoming bằng các batch query giới hạn. Service tạo đúng một row mỗi product, trả tối đa hai campaign chip cùng `additionalCampaignCount`, và giữ cursor ổn định hiện có. Filter campaign được áp dụng trong SQL trước pagination.

Product detail dùng query lịch sử campaign giới hạn riêng, nhóm active, upcoming/locked và historical. Giá preview chỉ trả sau khi dùng resolver trung tâm; không trả search weight nội bộ hoặc dữ liệu buyer profile.

Phương án đã cân nhắc: load campaign theo từng product dễ viết nhưng tạo N+1 và pagination không ổn định khi join nhân bản row.

### 10. Thêm campaign feature có giới hạn vào search và recommendation

Tăng version của search projection và scoring. Project `marketplace_campaign_id`, `campaign_starts_at`, `campaign_ends_at`, `campaign_discount_basis_points`, `campaign_eligible` do server xác định từ participation được chấp nhận và sellability hiện tại. Script theo thời điểm request yêu cầu eligibility và `[startsAt, endsAt)`, nên document stale đóng góp bằng 0 sau mốc kết thúc.

Với relevance search, tính lexical tier tách khỏi score trong tier và sort theo `(lexicalTier DESC, withinTierScore DESC, productId ASC)`. Score trong tier cộng lexical score, chất lượng cơ bản, personalization hợp lệ và campaign term không âm bị chặn bởi `CAMPAIGN_RANKING_BOOST_MAX`. Term ban đầu gồm trọng số cố định nhỏ cộng phần độ sâu discount đã chuẩn hóa và giới hạn. Product campaign vì vậy thắng khi các yếu tố khác tương đương nhưng không vượt lexical tier. Các sort price, sold, newest không dùng campaign score làm tiêu chí chính.

Daily recommendation cá nhân hóa thêm cùng product feature có version và giới hạn trước bước diversity shop/category hiện có. Guest/cold-start có thể dùng phần baseline cố định. PostgreSQL fallback chỉ thêm campaign term khi fallback hiện có xác định được cùng relevance tier; nếu không thì giữ thứ tự hiện tại.

Offline evaluation bổ sung metric exposure sản phẩm campaign, đảo lexical tier, vi phạm explicit sort, sellability, concentration, latency và relevance. Bất kỳ vi phạm tier, explicit sort hay sellability đều chặn rollout. Cấu hình cho phép hạ weight về 0 mà không rollback code.

Phương án đã cân nhắc: nhân toàn bộ search score có thể đưa kết quả yếu vượt exact match và khó giới hạn ảnh hưởng campaign.

### 11. Render route Next.js riêng theo vai trò từ shared contract

Thêm `/banner/[bannerId]`, `/admin/campaigns`, `/admin/campaigns/[campaignId]`, `/seller/campaigns`, `/seller/campaigns/[campaignId]`. Server component tải view đầu tiên đã kiểm tra quyền; client component để admin chọn type và thấy importance featured/normal cùng rule suy ra từ policy, không lộ ranking weight. Copy buyer trên form admin là tiêu đề và nội dung, kèm media thẻ tùy chọn. Client cũng xử lý seller chọn product, version conflict, giữ input lỗi, dialog xác nhận và cursor. Component danh sách/chi tiết product seller hiện có dùng contract mở rộng. Carousel campaign-banner trên homepage render mọi banner chiến dịch đang chạy từ homepage aggregate, không bịa destination thứ hai.

Frontend tuân theo spec UI/UX tiếng Việt ở `docs/ui-ux/build-marketplace-campaign-seller-participation.md`: table desktop, card mobile, thao tác bàn phím, status không chỉ dựa màu, hiển thị UTC theo locale, trạng thái loading/empty/error/stale và không overflow tài liệu tại viewport mục tiêu.

Phương án đã cân nhắc: một màn campaign dùng chung sẽ trộn quyền admin economics, seller participation và nội dung public.

### 12. Kiểm thử ranh giới domain và flow end-to-end

Unit test bao phủ mốc lifecycle, validation formatted content, số học discount, chuyển participation, giới hạn scoring và nhóm status. PostgreSQL integration test bao phủ migration/backfill, exclusion conflict trong lệnh seller/platform đồng thời, replay version/idempotency, enrollment cutoff theo thời gian transaction, ownership isolation, notification claim và đánh giá lại giá. Contract test kiểm tra OpenAPI/shared type. Component/Playwright test bao phủ flow chính admin publish, seller join/decline/revise/withdraw, campaign trên product, banner public và responsive.

Fixture ranking gồm product tương đương, exact so với fuzzy, explicit sort, index entry stale/expired và áp lực diversity. Metric vận hành đo notification lag, lỗi validation participation, xung đột reservation, số lần áp giá campaign, reindex lag và campaign exposure; label metric không chứa ID product/seller.

## Rủi ro / Đánh đổi

- [Exclusion constraint làm migration và write path phức tạp hơn] -> Backfill ở chế độ validation, dừng migration nếu có overlap, chỉ bật constraint sau khi sửa và integration test cả hai promotion module.
- [Seller có thể mất eligibility sau khi đăng ký] -> Đánh giá lại sellability/source ở read, pricing, indexing, cart và checkout; giữ lịch sử participation nhưng tắt giá/boost.
- [Notification sweep có thể trễ] -> Claim batch nhỏ có retry, theo dõi due-work lag và giữ lifecycle/pricing độc lập với delivery.
- [Campaign join làm seller-product query nặng hơn] -> Filter trước pagination, dùng bounded aggregate query và index hỗ trợ, giới hạn summary và đo query plan với dữ liệu đại diện.
- [Metadata search index có thể stale] -> Đánh giá thời gian trong scoring script, hydrate PostgreSQL, phát incremental projection event, giữ reconcile/full reindex và zero-weight kill switch.
- [Discount boost có thể làm người dùng thấy kết quả kém liên quan] -> Tách lexical tier, giới hạn term trong tier, giữ explicit sort/diversity và bắt buộc offline release gate.
- [Formatted campaign content mở rộng bề mặt XSS] -> Lưu block allow-list có version, kiểm tra link/media, escape khi render và cấm raw HTML.

## Kế hoạch migration

1. Thêm enum/table/relation, `HomepageBanner.campaignId` nullable, index, command/audit table và `ProductPromotionReservation` bằng additive migration.
2. Bật `btree_gist`, backfill reservation cho seller campaign enabled, phát hiện/báo overlap hiện có rồi thêm exclusion constraint.
3. Tạo campaign draft với default an toàn cho banner campaign hiện có, nối từng banner, sau đó chuyển `campaignId` thành required/unique khi xác minh xong. Homepage public giữ hành vi hiện có đến khi bật feature flag.
4. Deploy API read path, contract, reservation write cho seller promotion hiện có, central pricing tương thích hai nguồn và campaign module phía sau feature flag tắt.
5. Deploy web route và contract seller-product mở rộng, chạy notification worker ở chế độ chỉ đo dry-run và build version search index mới.
6. Bật admin authoring, sau đó invitation/participation seller, rồi campaign active public. Chỉ alias-swap search index sau khi ranking gate đạt; bắt đầu campaign boost ở 0 rồi tăng tới giá trị giới hạn đã duyệt.
7. Chỉ bỏ compatibility read sau khi toàn bộ banner và promotion reservation reconcile thành công.

Rollback sẽ tắt publish/invitation campaign, đặt campaign ranking weight về 0, trả search alias về version cũ và giữ nguyên dữ liệu additive. Có thể dừng giá campaign active bằng feature flag/cancel mà không xóa participation hay lịch sử order. Không rollback schema sau khi đã ghi dữ liệu campaign; dùng forward migration để sửa lỗi.
