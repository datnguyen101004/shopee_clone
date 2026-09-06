# Flow E2E chiến dịch sàn

## Registry và nguyên tắc

`MarketplaceCampaignType` là registry do server sở hữu. Ba loại mặc định là `STANDARD` và `CHEAPEST_DEALS` với importance `NORMAL`, cùng `FLASH_SALE` với importance `FEATURED`. Khi publish, policy/presentation/order/importance/ranking profile được snapshot vào campaign để registry cập nhật về sau không làm thay đổi chiến dịch đã phát hành; sau khi publish, loại và các trường kinh tế liên quan không được đổi. Mọi boost nằm trong global cap của profile.

## Admin

1. Admin mở `/admin/campaigns`, gọi `GET /api/v1/admin/campaign-types` và chọn một type đang bật.
2. Admin nhập nội dung banner, lịch `announceAt → enrollmentStartsAt → enrollmentEndsAt → startsAt → endsAt`; `POST /api/v1/admin/campaigns/preview` chỉ validate và trả block đã chuẩn hóa.
3. `POST /api/v1/admin/campaigns` tạo campaign và banner trong một transaction. Banner giữ UUID ổn định, nội dung lưu JSON block allow-list và link chỉ cho phép same-origin.
4. `POST /api/v1/admin/campaigns/:id/publish` kiểm tra optimistic version, ghi command/audit và đưa campaign vào lịch quét thông báo. Worker chỉ fan-out cho shop đủ điều kiện; `POST .../cancel` vô hiệu reservation trong cùng transaction.

## Seller

1. Seller mở `/seller/campaigns`; API chỉ trả chiến dịch publishable và shop đang hoạt động.
2. Seller xem `/seller/campaigns/:campaignId`, thấy type, importance, điều kiện, sản phẩm thuộc shop và conflict hiện có.
3. Trong thời gian enrollment, `PUT /api/v1/seller/campaigns/:id/participation` nhận toàn bộ product set. JOINED tạo `SellerCampaignProduct` và reservation; DECLINED xóa/disable reservation. Header `Idempotency-Key` cho phép retry an toàn.
4. Seller có thể revise bằng cùng endpoint hoặc `POST .../participation/withdraw` trước cutoff; cả hai mutation đều yêu cầu `Idempotency-Key` UUID. Product ID luôn được kiểm tra theo shop owner scope.
5. `/seller/products/:productId` hiển thị nhóm campaign active, upcoming/locked và history kèm type, phần trăm giảm và deep link.

## Buyer, giá và homepage

1. Homepage chỉ đặt banner campaign đã publish, đã announce, module đang active và có content hợp lệ. Banner dẫn tới `/banner/:bannerId`.
2. `GET /api/v1/campaigns/by-banner/:bannerId` trả nội dung sanitized, lifecycle và sản phẩm đã joined/locked. Sản phẩm không còn sellable bị loại khỏi response.
3. `ScheduledDiscountService` đọc shared `ProductPromotionReservation` bằng cửa sổ nửa kín `[startsAt, endsAt)`. Giá campaign chỉ là projection, không sửa giá base của variant; catalog, homepage và detail dùng cùng resolver.

## Search và recommendation

Projection Elasticsearch ghi campaign id/type, importance, policy/ranking version, bounds và `campaign_rank` (`0` không campaign, `1` NORMAL, `2` FEATURED). Relevance search chỉ thêm bounded factor; personalized script cộng tối đa `0.08` theo tier, vì vậy Flash Sale đứng trên NORMAL trong các kết quả tương đương nhưng không vượt global cap hay phá explicit sort.

## Notification và vận hành

Scheduler mỗi 5 phút quét tối đa 50 campaign due, materialize seller chưa phản hồi và gửi in-app/email qua notification outbox. Announcement và reminder có deduplication key ổn định; preference email không ngăn in-app. Lifecycle vẫn do DB clock quyết định nếu worker trễ.

## PostgreSQL/RDS

Migration `20260904120000_add_marketplace_campaigns` là additive, bật `btree_gist`, chuyển banner cũ thành campaign STANDARD draft có content plain-text và kiểm tra mọi banner đã có campaign duy nhất. Migration cũng backfill reservation của shop promotion và dừng với product/window cụ thể nếu legacy overlap. Exclusion constraint trên product và `tstzrange` ngăn một sản phẩm tham gia hai promotion overlap. Trên Amazon RDS, triển khai bằng role có quyền cài extension `btree_gist`, chạy `prisma migrate deploy`, sau đó chạy seed registry/lifecycle fixtures và kiểm tra search reindex.
